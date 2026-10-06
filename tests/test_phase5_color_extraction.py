"""
Unit and integration tests for Phase 5:
- Exact dominant color extraction with Pillow (MEDIANCUT, 48x48 thumbnail)
- Perceptual HSL Hue classification (8 chromatic families + monochrome)
- POST /api/albums/repair-all-palettes endpoint validation and metadata preservation
"""

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
    """Verify Pillow MEDIANCUT extracts pure red from a solid red image."""
    red_img = Image.new("RGB", (100, 100), color=(254, 0, 0))
    palette = extract_dominant_colors_from_pil(red_img, num_colors=4)
    assert len(palette) >= 1
    assert palette[0] == "#fe0000"
    assert classify_color_hue(palette[0]) == "red"


def test_pillow_dominant_color_pure_blue():
    """Verify Pillow MEDIANCUT extracts pure blue from a solid blue image."""
    blue_img = Image.new("RGB", (100, 100), color=(0, 0, 254))
    palette = extract_dominant_colors_from_pil(blue_img, num_colors=4)
    assert len(palette) >= 1
    assert palette[0] == "#0000fe"
    assert classify_color_hue(palette[0]) == "blue"


def test_hsl_chromatic_classification_all_8_families():
    """Test all 8 chromatic families and monochrome in HSL perceptual space."""
    test_cases = [
        ("#facc15", "yellow"),
        ("#f97316", "orange"),
        ("#dc2626", "red"),
        ("#10b981", "green"),
        ("#06b6d4", "cyan"),
        ("#3b82f6", "blue"),
        ("#8b5cf6", "purple"),
        ("#ec4899", "pink"),
        ("#1e293b", "monochrome"),  # dark slate
        ("#ffffff", "monochrome"),  # pure white
        ("#000000", "monochrome"),  # pure black
    ]
    for hex_code, expected_family in test_cases:
        family = classify_color_hue(hex_code)
        assert family == expected_family, f"Expected {expected_family} for {hex_code}, got {family}"


def test_matches_palette_perceptual():
    """Test perceptual fuzzy matching between palettes and target tones."""
    blue_palette = ["#1d4ed8", "#3b82f6", "#60a5fa", "#1e293b"]
    assert matches_palette_perceptual(blue_palette, "#3b82f6")  # Blue matches blue
    assert not matches_palette_perceptual(blue_palette, "#dc2626")  # Blue does not match red
    assert not matches_palette_perceptual(blue_palette, "#10b981")  # Blue does not match green

    yellow_palette = ["#facc15", "#eab308", "#ca8a04", "#713f12"]
    assert matches_palette_perceptual(yellow_palette, "#facc15")
    assert not matches_palette_perceptual(yellow_palette, "#8b5cf6")


def test_repair_all_palettes_preserves_metadata(monkeypatch):
    """
    Test POST /api/albums/repair-all-palettes:
    - Scans albums where color_palette is None
    - Calculates real dominant colors
    - Strictly preserves metadata (created_at, updated_at, title, folder, etc.)
    """
    temp_dir = tempfile.mkdtemp()
    try:
        # Create a sample local image in temp_dir
        sample_img_dir = os.path.join(temp_dir, "test_album")
        os.makedirs(sample_img_dir, exist_ok=True)
        img_file = os.path.join(sample_img_dir, "photo1.jpg")
        img_obj = Image.new("RGB", (64, 64), color=(250, 204, 21))  # Yellow
        img_obj.save(img_file, format="JPEG")

        # Create sample album JSON with color_palette: null
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

        # Monkeypatch ALBUMS_DIR in server.py
        import src.server.server as srv
        monkeypatch.setattr(srv, "ALBUMS_DIR", temp_dir)

        client = TestClient(app)
        response = client.post("/api/albums/repair-all-palettes?limit=10")
        assert response.status_code == 200
        res_data = response.json()
        assert res_data["success"] is True
        assert res_data["repaired_albums"] >= 1
        assert res_data["repaired_images"] >= 1

        # Verify disk persistence & metadata integrity
        with open(album_json_path, "r", encoding="utf-8") as f:
            repaired_data = json.load(f)

        assert repaired_data["album_id"] == "test_album_p5"
        assert repaired_data["title"] == "Álbum de Teste Fase 5"
        assert repaired_data["created_at"] == "2026-05-10 14:00:00 UTC"
        assert repaired_data["updated_at"] == "2026-05-10 14:00:00 UTC"
        assert repaired_data["folder"] == "Viagens"
        assert repaired_data["tags"] == ["ferias", "praia"]

        # Assert color_palette was populated with real colors
        img_palette = repaired_data["images"][0]["color_palette"]
        assert isinstance(img_palette, list)
        assert len(img_palette) > 0
        assert img_palette[0].startswith("#")
        # Color should be classified as yellow
        assert classify_color_hue(img_palette[0]) == "yellow"

        # Assert cover_color_palette was also synchronized
        cover_pal = repaired_data.get("cover_color_palette")
        assert isinstance(cover_pal, list)
        assert len(cover_pal) > 0
        assert classify_color_hue(cover_pal[0]) == "yellow"

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_hex_to_rgb_supports_alpha_and_shorthand():
    """Verify hex_to_rgb handles 8-char RGBA, 4-char, 3-char and 6-char hex codes."""
    # 8-char hex with alpha
    assert hex_to_rgb("#3b82f655") == (59, 130, 246)
    # 6-char standard hex
    assert hex_to_rgb("#3b82f6") == (59, 130, 246)
    # 3-char shorthand
    assert hex_to_rgb("#f00") == (255, 0, 0)
    # 4-char shorthand with alpha
    assert hex_to_rgb("#f00f") == (255, 0, 0)
    # Invalid length
    assert hex_to_rgb("#invalid") == (0, 0, 0)


def test_pillow_corrupted_bytes_returns_clean_result():
    """Corrupted bytes with fallback=False should return empty list rather than fake palette."""
    corrupted_data = b"NOT_A_VALID_IMAGE_STREAM_12345"
    assert extract_dominant_colors_from_bytes(corrupted_data, fallback=False) == []
    # Empty data
    assert extract_dominant_colors_from_bytes(b"", fallback=False) == []


def test_pillow_handles_transparency_and_grayscale():
    """Pillow quantization must cleanly handle transparency (RGBA) and grayscale (L) modes."""
    # Grayscale image
    gray_img = Image.new("L", (50, 50), color=128)
    gray_pal = extract_dominant_colors_from_pil(gray_img, num_colors=2)
    assert len(gray_pal) >= 1
    assert gray_pal[0] == "#808080"
    assert classify_color_hue(gray_pal[0]) == "monochrome"

    # RGBA image with transparent green overlaid on white
    rgba_img = Image.new("RGBA", (50, 50), color=(0, 200, 0, 255))
    rgba_pal = extract_dominant_colors_from_pil(rgba_img, num_colors=2)
    assert len(rgba_pal) >= 1
    assert classify_color_hue(rgba_pal[0]) == "green"


def test_spatial_sampling_geometric_regions_portrait_and_landscape():
    """Verify that get_spatial_sampling_region correctly segments portrait, landscape and square."""
    # Portrait 100x200
    w, h = 100, 200
    assert get_spatial_sampling_region(50, 80, w, h) == 1   # Center top (inner)
    assert get_spatial_sampling_region(50, 120, w, h) == 2  # Center bottom (inner)
    assert get_spatial_sampling_region(40, 100, w, h) == 3  # Center left (inner)
    assert get_spatial_sampling_region(60, 100, w, h) == 4  # Center right (inner)
    assert get_spatial_sampling_region(50, 10, w, h) == 5   # Periphery top (outer)
    assert get_spatial_sampling_region(50, 190, w, h) == 6  # Periphery bottom (outer)
    assert get_spatial_sampling_region(5, 100, w, h) == 7   # Periphery left (outer)
    assert get_spatial_sampling_region(95, 100, w, h) == 8  # Periphery right (outer)

    # Landscape 200x100
    w, h = 200, 100
    assert get_spatial_sampling_region(100, 40, w, h) == 1  # Center top (inner)
    assert get_spatial_sampling_region(100, 60, w, h) == 2  # Center bottom (inner)
    assert get_spatial_sampling_region(80, 50, w, h) == 3   # Center left (inner)
    assert get_spatial_sampling_region(120, 50, w, h) == 4  # Center right (inner)
    assert get_spatial_sampling_region(100, 5, w, h) == 5   # Periphery top (outer)
    assert get_spatial_sampling_region(100, 95, w, h) == 6  # Periphery bottom (outer)
    assert get_spatial_sampling_region(10, 50, w, h) == 7   # Periphery left (outer)
    assert get_spatial_sampling_region(190, 50, w, h) == 8  # Periphery right (outer)


def test_spatial_sampling_8_regions_exact_recovery():
    """Verify that synthetic image with 8 distinct region colors is recovered with exact RGB values."""
    palette_map = {
        1: (255, 0, 0),      # Região 1: Vermelho puro
        2: (0, 255, 0),      # Região 2: Verde puro
        3: (0, 0, 255),      # Região 3: Azul puro
        4: (255, 255, 0),    # Região 4: Amarelo puro
        5: (0, 255, 255),    # Região 5: Ciano puro
        6: (255, 0, 255),    # Região 6: Magenta puro
        7: (255, 255, 255),  # Região 7: Branco puro
        8: (0, 0, 0),        # Região 8: Preto puro
    }
    w, h = 160, 120
    img = Image.new("RGB", (w, h))
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            reg = get_spatial_sampling_region(x, y, w, h)
            pixels[x, y] = palette_map[reg]

    pal = extract_dominant_colors_from_pil(img, num_colors=8, size=(160, 120))
    assert len(pal) == 8
    expected_hex = [
        "#ff0000", "#00ff00", "#0000ff", "#ffff00",
        "#00ffff", "#ff00ff", "#ffffff", "#000000"
    ]
    assert pal == expected_hex


def test_sand_earth_tones_strictly_isolated_from_yellow():
    """Verify that sand/earth tones (#d4a373) are categorized as earth and do not match yellow (#facc15)."""
    assert classify_color_hue("#d4a373") == "earth"
    assert classify_color_hue("#facc15") == "yellow"

    sand_palette = ["#d4a373", "#38bdf8", "#1e293b"]
    # Sand beach palette must NOT match yellow
    assert not matches_palette_perceptual(sand_palette, "#facc15")
    # But it must match earth
    assert matches_palette_perceptual(sand_palette, "#d4a373")
    # Real yellow palette must match yellow
    yellow_palette = ["#facc15", "#18181b"]
    assert matches_palette_perceptual(yellow_palette, "#facc15")



