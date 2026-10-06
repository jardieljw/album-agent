import os
import json
import pytest
from datetime import datetime, timezone
from src.core.models import Album, AlbumImage
from src.server import server

def test_album_model_timestamps():
    alb = Album(
        album_id="test_alb_1",
        title="Test Album",
        original_title="Test Album",
        source_page="https://example.com/gallery",
        created_at="2026-01-01 12:00:00 UTC",
        updated_at="2026-01-01 12:00:00 UTC"
    )
    assert alb.created_at == "2026-01-01 12:00:00 UTC"
    assert alb.updated_at == "2026-01-01 12:00:00 UTC"

def test_save_and_load_album_timestamps(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "ALBUMS_DIR", str(tmp_path))
    monkeypatch.setattr(server, "_completed_albums", {})

    alb = Album(
        album_id="sess_test_100",
        title="Session Test 100",
        original_title="Session Test 100",
        source_page="https://example.com/gallery/100",
        images=[
            AlbumImage(
                id="img_1",
                position=1,
                original_url="https://example.com/img1.jpg",
                thumbnail_url="https://example.com/thumb1.jpg"
            )
        ]
    )

    # Save initial album
    server._save_album_to_disk("sess_test_100", alb)
    fpath = os.path.join(str(tmp_path), "sess_test_100.json")
    assert os.path.exists(fpath)

    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert "created_at" in data
    assert "updated_at" in data
    initial_created = data["created_at"]
    initial_updated = data["updated_at"]

    # Verify reload
    server._completed_albums.clear()
    server._load_albums_from_disk()
    loaded = server._completed_albums["sess_test_100"]
    assert loaded.created_at == initial_created
    assert loaded.updated_at == initial_updated

    # Emulate set cover - updated_at changes but created_at remains immutable
    new_cover = "https://example.com/new_cover.jpg"
    loaded.cover_image_url = new_cover
    new_ts = "2026-02-01 15:30:00 UTC"
    loaded.updated_at = new_ts
    loaded.metadata["updated_at"] = new_ts
    server._save_album_to_disk("sess_test_100", loaded)

    with open(fpath, "r", encoding="utf-8") as f:
        data_after = json.load(f)
    assert data_after["created_at"] == initial_created, "created_at must be strictly immutable"
    assert data_after["updated_at"] == new_ts, "updated_at must reflect recent modification"


def test_legacy_album_backfill_persisted(tmp_path, monkeypatch):
    """Verify legacy albums without created_at receive immutable ctime timestamp persisted to disk."""
    monkeypatch.setattr(server, "ALBUMS_DIR", str(tmp_path))
    monkeypatch.setattr(server, "_completed_albums", {})

    legacy_data = {
        "album_id": "legacy_alb_99",
        "title": "Legacy Album 99",
        "original_title": "Legacy Album 99",
        "source_page": "https://example.com/legacy/99",
        "images": [
            {
                "id": "leg_1",
                "position": 1,
                "original_url": "https://example.com/leg1.jpg",
                "thumbnail_url": "https://example.com/leg1_thumb.jpg"
            }
        ],
        "metadata": {}
    }
    fpath = os.path.join(str(tmp_path), "legacy_alb_99.json")
    with open(fpath, "w", encoding="utf-8") as f:
        json.dump(legacy_data, f)

    server._load_albums_from_disk()
    loaded = server._completed_albums["legacy_alb_99"]
    assert loaded.created_at is not None
    assert loaded.updated_at is not None

    # Verify disk was updated with backfilled created_at
    with open(fpath, "r", encoding="utf-8") as f:
        on_disk = json.load(f)
    assert on_disk.get("created_at") == loaded.created_at
    assert on_disk.get("updated_at") == loaded.updated_at


@pytest.mark.asyncio
async def test_toggle_album_favorite_persistence(tmp_path, monkeypatch):
    """Verify toggle_album_favorite toggles and persists favorite status on disk without altering created_at."""
    monkeypatch.setattr(server, "ALBUMS_DIR", str(tmp_path))
    monkeypatch.setattr(server, "_completed_albums", {})

    alb = Album(
        album_id="fav_test_1",
        title="Fav Test Album",
        original_title="Fav Test Album",
        source_page="https://example.com/fav/1",
        created_at="2026-03-01 10:00:00 UTC",
        updated_at="2026-03-01 10:00:00 UTC",
        images=[]
    )
    server._save_album_to_disk("fav_test_1", alb)
    server._completed_albums["fav_test_1"] = alb

    # Toggle to favorite
    res = await server.toggle_album_favorite("fav_test_1")
    assert res["status"] == "ok"
    assert res["is_favorite"] is True

    fpath = os.path.join(str(tmp_path), "fav_test_1.json")
    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data.get("is_favorite") is True
    assert data.get("created_at") == "2026-03-01 10:00:00 UTC"

    # Toggle back to unfavorite
    res2 = await server.toggle_album_favorite("fav_test_1")
    assert res2["is_favorite"] is False
    with open(fpath, "r", encoding="utf-8") as f:
        data2 = json.load(f)
    assert data2.get("is_favorite") is False
    assert data2.get("created_at") == "2026-03-01 10:00:00 UTC"

