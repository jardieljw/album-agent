"""
Verification script for Pornhub streaming, HTTP Range 206 proxy, auto-renewal, and metadata sync.
Tests against FastAPI app using AsyncClient(transport=ASGITransport(app=app)).
"""
import os
import sys
import json
import asyncio
import httpx
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from src.server.server import app, _completed_albums, ALBUMS_DIR
from src.core.models import Album, AlbumImage

TARGET_URL = "https://pt.pornhub.com/view_video.php?viewkey=ph6283b12064abb"

async def run_verifications():
    transport = ASGITransport(app=app)
    results = {}

    async with AsyncClient(transport=transport, base_url="http://test", timeout=60.0) as client:
        print("\n--- 1. Extract fresh stream URLs for test video via yt-dlp ---")
        import yt_dlp
        ydl_opts = {
            "quiet": True,
            "skip_download": True,
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://www.pornhub.com/",
                "Origin": "https://www.pornhub.com"
            }
        }
        info = await asyncio.to_thread(lambda: yt_dlp.YoutubeDL(ydl_opts).extract_info(TARGET_URL, download=False))
        formats = [f for f in info.get("formats", []) if f.get("ext") == "mp4" and not str(f.get("format_id", "")).startswith("hls")]
        
        f1080 = next((f for f in formats if f.get("height") == 1080), None)
        f720 = next((f for f in formats if f.get("height") == 720), None)
        f480 = next((f for f in formats if f.get("height") == 480), None)
        f240 = next((f for f in formats if f.get("height") == 240), None)
        
        assert f1080 and f720 and f480 and f240, "All 4 resolutions must be present"
        print(f"Extracted 4 resolutions: 1080p={f1080['height']}p, 720p={f720['height']}p, 480p={f480['height']}p, 240p={f240['height']}p")
        results["extraction_4_qualities"] = True

        test_stream_url = f1080["url"]

        print("\n--- 2. Test /api/proxy-video-stream OPTIONS preflight ---")
        res_opt = await client.options(f"/api/proxy-video-stream?url={httpx.URL(test_stream_url)}")
        print(f"OPTIONS status: {res_opt.status_code}")
        assert res_opt.status_code == 200
        assert res_opt.headers.get("access-control-allow-origin") == "*"
        assert "Content-Range" in res_opt.headers.get("access-control-expose-headers", "")
        results["proxy_options"] = True

        print("\n--- 3. Test /api/proxy-video-stream HEAD metadata probe ---")
        res_head = await client.head(f"/api/proxy-video-stream?url={httpx.URL(test_stream_url)}&referer={httpx.URL(TARGET_URL)}")
        print(f"HEAD status: {res_head.status_code}")
        print(f"HEAD Content-Length: {res_head.headers.get('content-length')}")
        print(f"HEAD Content-Type: {res_head.headers.get('content-type')}")
        print(f"HEAD Accept-Ranges: {res_head.headers.get('accept-ranges')}")
        print(f"HEAD CORS: {res_head.headers.get('access-control-allow-origin')}")
        assert res_head.status_code == 200
        assert int(res_head.headers.get("content-length", 0)) > 0
        assert "video" in res_head.headers.get("content-type", "")
        assert res_head.headers.get("access-control-allow-origin") == "*"
        results["proxy_head"] = True

        print("\n--- 4. Test /api/proxy-video-stream GET with HTTP Range 206 (bytes=0-1000) ---")
        res_range = await client.get(
            f"/api/proxy-video-stream?url={httpx.URL(test_stream_url)}&referer={httpx.URL(TARGET_URL)}",
            headers={"Range": "bytes=0-1000"}
        )
        print(f"GET Range status: {res_range.status_code}")
        print(f"Content-Range: {res_range.headers.get('content-range')}")
        print(f"Content-Length: {res_range.headers.get('content-length')}")
        print(f"Bytes received: {len(res_range.content)}")
        assert res_range.status_code == 206
        assert len(res_range.content) == 1001
        assert "bytes 0-1000/" in res_range.headers.get("content-range", "")
        assert res_range.headers.get("access-control-allow-origin") == "*"
        results["proxy_range_206"] = True

        print("\n--- 5. Test /api/proxy-video-stream with download=true ---")
        res_dl = await client.get(
            f"/api/proxy-video-stream?url={httpx.URL(test_stream_url)}&download=true&filename=my_savannah_video",
            headers={"Range": "bytes=0-500"}
        )
        print(f"Download status: {res_dl.status_code}")
        print(f"Content-Disposition: {res_dl.headers.get('content-disposition')}")
        assert res_dl.status_code in (200, 206)
        assert 'attachment; filename="my_savannah_video.mp4"' in res_dl.headers.get("content-disposition", "")
        results["proxy_download"] = True

        print("\n--- 6. Test automatic re-resolution of expired stream URL ---")
        # Create an expired stream URL (modified token/expired validto)
        expired_url = "https://ev.phncdn.com/videos/202205/17/408254721/1080P_4000K_408254721.mp4?validfrom=1652814890&validto=1652822090&invalid=token"
        res_auto = await client.get(
            f"/api/proxy-video-stream?url={httpx.URL(expired_url)}&referer={httpx.URL(TARGET_URL)}",
            headers={"Range": "bytes=0-500"}
        )
        print(f"Auto re-resolution status: {res_auto.status_code}")
        print(f"Auto re-resolution Content-Range: {res_auto.headers.get('content-range')}")
        print(f"Bytes received: {len(res_auto.content)}")
        assert res_auto.status_code == 206
        assert len(res_auto.content) == 501
        results["auto_re_resolution"] = True

        print("\n--- 7. Test /api/albums/{session_id}/refresh-streams for all 4 qualities ---")
        test_session_id = "test_pornhub_album_123"
        test_album = Album(
            album_id=test_session_id,
            original_title="Savannah Bond Test Album",
            id=test_session_id,
            title="Savannah Bond Test Album",
            url=TARGET_URL,
            source_page=TARGET_URL,
            cover_image="",
            images=[
                AlbumImage(
                    position=1,
                    candidate_id="ph_stream_1",
                    thumbnail_url="https://ci.phncdn.com/test.jpg",
                    original_url="https://ev.phncdn.com/videos/expired_1080p.mp4",
                    video_stream_url="https://ev.phncdn.com/videos/expired_1080p.mp4",
                    media_type="video",
                    title="Savannah Video (1080p HD)",
                    width=1920,
                    height=1080,
                    file_size=0,
                    source_page=TARGET_URL
                ),
                AlbumImage(
                    position=2,
                    candidate_id="ph_stream_2",
                    thumbnail_url="https://ci.phncdn.com/test.jpg",
                    original_url="https://ev.phncdn.com/videos/expired_720p.mp4",
                    video_stream_url="https://ev.phncdn.com/videos/expired_720p.mp4",
                    media_type="video",
                    title="Savannah Video (720p HD)",
                    width=1280,
                    height=720,
                    file_size=0,
                    source_page=TARGET_URL
                ),
                AlbumImage(
                    position=3,
                    candidate_id="ph_stream_3",
                    thumbnail_url="https://ci.phncdn.com/test.jpg",
                    original_url="https://ev.phncdn.com/videos/expired_480p.mp4",
                    video_stream_url="https://ev.phncdn.com/videos/expired_480p.mp4",
                    media_type="video",
                    title="Savannah Video (480p)",
                    width=854,
                    height=480,
                    file_size=0,
                    source_page=TARGET_URL
                ),
                AlbumImage(
                    position=4,
                    candidate_id="ph_stream_4",
                    thumbnail_url="https://ci.phncdn.com/test.jpg",
                    original_url="https://ev.phncdn.com/videos/expired_240p.mp4",
                    video_stream_url="https://ev.phncdn.com/videos/expired_240p.mp4",
                    media_type="video",
                    title="Savannah Video (240p)",
                    width=426,
                    height=240,
                    file_size=0,
                    source_page=TARGET_URL
                ),
            ]
        )
        _completed_albums[test_session_id] = test_album
        test_album_file = os.path.join(ALBUMS_DIR, f"{test_session_id}.json")
        with open(test_album_file, "w", encoding="utf-8") as fp:
            fp.write(test_album.model_dump_json(indent=2))

        res_ref = await client.post(f"/api/albums/{test_session_id}/refresh-streams")
        print(f"Refresh streams response: {res_ref.status_code}, data={res_ref.json()}")
        assert res_ref.status_code == 200
        ref_data = res_ref.json()
        assert ref_data["success"] is True
        assert ref_data["refreshed"] == 4

        # Verify disk persistence and updated fields
        with open(test_album_file, "r", encoding="utf-8") as fp:
            disk_album = json.load(fp)

        print("\nVerifying updated album in disk JSON:")
        for idx, img in enumerate(disk_album["images"]):
            print(f"  [{img['candidate_id']}] {img['height']}p -> {img['video_stream_url'][:65]}... (size: {img['file_size']} bytes)")
            assert "expired" not in img["video_stream_url"]
            assert img["video_stream_url"].startswith("http")
            assert img["file_size"] > 0
        results["refresh_streams_4_qualities"] = True

        print("\n--- 8. Test /api/albums/{session_id}/sync-metadata ---")
        res_sync = await client.post(f"/api/albums/{test_session_id}/sync-metadata")
        print(f"Sync metadata response: {res_sync.status_code}")
        assert res_sync.status_code == 200
        sync_data = res_sync.json()
        assert sync_data["total_images"] == 4
        results["sync_metadata"] = True

        print("\n--- 9. Test /api/albums/{session_id}/refresh-stream/{candidate_id} ---")
        res_single = await client.post(f"/api/albums/{test_session_id}/refresh-stream/ph_stream_1")
        print(f"Refresh single response: {res_single.status_code}, data={res_single.json()}")
        assert res_single.status_code == 200
        assert res_single.json()["success"] is True
        results["refresh_single_stream"] = True

        # Cleanup test album
        if os.path.exists(test_album_file):
            try:
                os.remove(test_album_file)
            except Exception:
                pass
        if test_session_id in _completed_albums:
            del _completed_albums[test_session_id]

    print("\n================ ALL VERIFICATIONS PASSED ================")
    for k, v in results.items():
        print(f"  [PASS] {k}: {v}")
    return results

if __name__ == "__main__":
    asyncio.run(run_verifications())
