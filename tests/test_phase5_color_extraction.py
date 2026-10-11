import io
import json
import os
import shutil
import tempfile
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from src.core.color_extractor import (
    rgb_to_hex,
    hex_to_rgb,
    rgb_to_hsl,
    classify_color_hue,
    get_spatial_sampling_region,
    extract_dominant_colors_from_pil,
    extract_dominant_colors_from_bytes,
    matches_palette_perceptual,
)
from src.server.server import app, ALBUMS_DIR


def test_pillow_dominant_color_pure_red():
    red_img = Image.new("RGB", (100, 100), color=(254, 0, 0))
    palette = extract_dominant_colors_from_pil(red_img, num_colors=4)
    assert len(palette) >= 1
    assert palette[0] == "#fe0000"
    assert classify_color_hue(palette[0]) == "red"


def test_pillow_dominant_color_pure_blue():
    blue_img = Image.new("RGB", (100, 100), color=(0, 0, 254))
    palette = extract_dominant_colors_from_pil(blue_img, num_colors=4)
    assert len(palette) >= 1
    assert palette[0] == "#0000fe"
    assert classify_color_hue(palette[0]) == "blue"


def test_hsl_chromatic_classification_all_8_families():
    test_cases = [
        ("#facc15", "yellow"),
        ("#f97316", "orange"),
        ("#dc2626", "red"),
        ("#10b981", "green"),
        ("#06b6d4", "cyan"),
        ("#3b82f6", "blue"),
        ("#8b5cf6", "purple"),
        ("#ec4899", "pink"),
        ("#1e293b", "monochrome"),
        ("#ffffff", "monochrome"),
        ("#000000", "monochrome"),
    ]
    for hex_code, expected_family in test_cases:
        family = classify_color_hue(hex_code)
        assert family == expected_family, f"Expected {expected_family} for {hex_code}, got {family}"


def test_matches_palette_perceptual():
    blue_palette = ["#1d4ed8", "#3b82f6", "#60a5fa", "#1e293b"]
    assert matches_palette_perceptual(blue_palette, "#3b82f6")
    assert not matches_palette_perceptual(blue_palette, "#dc2626")
    assert not matches_palette_perceptual(blue_palette, "#10b981")

    yellow_palette = ["#facc15", "#eab308", "#ca8a04", "#713f12"]
    assert matches_palette_perceptual(yellow_palette, "#facc15")
    assert not matches_palette_perceptual(yellow_palette, "#8b5cf6")


def test_repair_all_palettes_preserves_metadata(monkeypatch):
    temp_dir = tempfile.mkdtemp()
    try:
        sample_img_dir = os.path.join(temp_dir, "test_album")
        os.makedirs(sample_img_dir, exist_ok=True)
        img_file = os.path.join(sample_img_dir, "photo1.jpg")
        img_obj = Image.new("RGB", (64, 64), color=(250, 204, 21))
        img_obj.save(img_file, format="JPEG")

        album_id = "test_album_p5"
        album_json_path = os.path.join(temp_dir, f"{album_id}.json")
        original_metadata = {
            "album_id": album_id,
            "title": "Álbum de Teste Fase 5",
            "original_title": "Original Title P5",
            "source_page": "https://example.com/gallery",
            "created_at": "2026-05-10 14:00:00 UTC",
            "updated_at": "2026-05-10 14:00:00 UTC",
            "folder": "Viagens",
            "tags": ["ferias", "praia"],
            "images": [
                {
                    "position": 1,
                    "thumbnail_url": f"local://albums/test_album/photo1.jpg",
                    "original_url": f"local://albums/test_album/photo1.jpg",
                    "width": 64,
                    "height": 64,
                    "format": "jpg",
                    "color_palette": None,
                }
            ]
        }
        with open(album_json_path, "w", encoding="utf-8") as f:
            json.dump(original_metadata, f, indent=2)

        import src.server.server as srv
        monkeypatch.setattr(srv, "ALBUMS_DIR", temp_dir)

        client = TestClient(app)
        response = client.post("/api/albums/repair-all-palettes?limit=10")
        assert response.status_code == 200
        res_data = response.json()
        assert res_data["success"] is True
        assert res_data["repaired_albums"] >= 1
        assert res_data["repaired_images"] >= 1

        with open(album_json_path, "r", encoding="utf-8") as f:
            repaired_data = json.load(f)

        assert repaired_data["album_id"] == "test_album_p5"
        assert repaired_data["title"] == "Álbum de Teste Fase 5"
        assert repaired_data["created_at"] == "2026-05-10 14:00:00 UTC"
        assert repaired_data["updated_at"] == "2026-05-10 14:00:00 UTC"
        assert repaired_data["folder"] == "Viagens"
        assert repaired_data["tags"] == ["ferias", "praia"]

        img_palette = repaired_data["images"][0]["color_palette"]
        assert isinstance(img_palette, list)
        assert len(img_palette) > 0
        assert img_palette[0].startswith("#")
        assert classify_color_hue(img_palette[0]) == "yellow"

        cover_pal = repaired_data.get("cover_color_palette")
        assert isinstance(cover_pal, list)
        assert len(cover_pal) > 0
        assert classify_color_hue(cover_pal[0]) == "yellow"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
