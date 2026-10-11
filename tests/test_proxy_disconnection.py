import pytest
import uuid
import asyncio
import io
from PIL import Image
from unittest.mock import AsyncMock, patch
from starlette.datastructures import Headers
from src.server.server import proxy_image, _IMAGE_CACHE_DIR

def _make_test_jpeg(width=800, height=600):
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color="blue").save(buf, format="JPEG")
    return buf.getvalue()

@pytest.mark.asyncio
async def test_proxy_image_coalescing_single_remote_fetch():
    """
    Test that concurrent requests for the exact same remote URL result in
    EXACTLY ONE remote HTTP GET call, with all concurrent callers receiving
    the same valid response without redundant downloads.
    """
    mock_request = AsyncMock()
    mock_request.headers = Headers()
    mock_request.is_disconnected.return_value = False

    real_jpeg = _make_test_jpeg(800, 600)
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.content = real_jpeg
    mock_response.headers = {"content-type": "image/jpeg", "etag": '"test-etag-1"'}

    mock_client = AsyncMock()
    # Simulate realistic network delay so concurrent requests overlap in-flight
    async def slow_get(*args, **kwargs):
        await asyncio.sleep(0.08)
        return mock_response

    mock_client.get.side_effect = slow_get

    unique_url = f"https://cdn.example.com/{uuid.uuid4()}.jpg"

    with patch("src.server.server.get_image_proxy_client", return_value=mock_client):
        # Fire 5 concurrent requests simultaneously for the exact same image
        results = await asyncio.gather(
            proxy_image(request=mock_request, url=unique_url),
            proxy_image(request=mock_request, url=unique_url),
            proxy_image(request=mock_request, url=unique_url, w=360),
            proxy_image(request=mock_request, url=unique_url, w=360),
            proxy_image(request=mock_request, url=unique_url),
        )

    # Remote client.get must have been invoked EXACTLY ONCE!
    assert mock_client.get.call_count == 1, f"Expected 1 remote call, got {mock_client.get.call_count}"

    # All 5 callers must receive HTTP 200
    for resp in results:
        assert resp.status_code == 200
        assert len(resp.body) > 0

    # Sequential follow-up call must be a pure cache HIT (0 additional remote calls)
    with patch("src.server.server.get_image_proxy_client", return_value=mock_client):
        follow_up = await proxy_image(request=mock_request, url=unique_url)
        assert follow_up.status_code == 200
        assert follow_up.headers.get("X-Cache-Status") == "HIT"
        assert mock_client.get.call_count == 1


@pytest.mark.asyncio
async def test_proxy_image_disk_cache_reuse():
    """
    Test that once an image is downloaded and cached on disk,
    any subsequent request serves directly from disk cache without network,
    and thumbnails are generated from the cached original with 0 remote calls.
    """
    mock_request = AsyncMock()
    mock_request.headers = Headers()
    mock_request.is_disconnected.return_value = False

    real_jpeg = _make_test_jpeg(1000, 800)
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.content = real_jpeg
    mock_response.headers = {"content-type": "image/jpeg", "etag": '"test-etag-2"'}

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_response

    unique_url = f"https://cdn.example.com/{uuid.uuid4()}.jpg"

    with patch("src.server.server.get_image_proxy_client", return_value=mock_client):
        resp1 = await proxy_image(request=mock_request, url=unique_url)
        assert resp1.status_code == 200
        assert resp1.headers.get("X-Cache-Status") == "MISS"
        assert mock_client.get.call_count == 1

        # Second call: must be HIT, 0 extra remote calls
        resp2 = await proxy_image(request=mock_request, url=unique_url)
        assert resp2.status_code == 200
        assert resp2.headers.get("X-Cache-Status") == "HIT"
        assert mock_client.get.call_count == 1

        # Third call: request thumbnail, must be generated from cache, 0 extra remote calls
        resp3 = await proxy_image(request=mock_request, url=unique_url, w=360)
        assert resp3.status_code == 200
        assert resp3.headers.get("X-Cache-Status") == "HIT-GENERATED-THUMB"
        assert mock_client.get.call_count == 1

        # Fourth call: thumbnail is now on disk, must be HIT-THUMB, 0 extra remote calls
        resp4 = await proxy_image(request=mock_request, url=unique_url, w=360)
        assert resp4.status_code == 200
        assert resp4.headers.get("X-Cache-Status") == "HIT-THUMB"
        assert mock_client.get.call_count == 1
