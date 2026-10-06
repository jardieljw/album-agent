"""
Core Color Extractor and Perceptual HSL Harmony Engine.
Uses Pillow (PIL.Image.Quantize.MEDIANCUT) on fast 48x48 thumbnails.
Provides perceptual Hue categorization for 8 chromatic families + monochrome.
"""

import io
import os
from typing import List, Tuple, Optional
from PIL import Image


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """Converts RGB integers (0-255) to lowercase #rrggbb string."""
    r_c = max(0, min(255, int(r)))
    g_c = max(0, min(255, int(g)))
    b_c = max(0, min(255, int(b)))
    return f"#{r_c:02x}{g_c:02x}{b_c:02x}".lower()


def hex_to_rgb(hex_code: str) -> Tuple[int, int, int]:
    """Converts #rrggbb, #rgba, #rrggbbaa, or #rgb to (r, g, b) tuple."""
    clean = hex_code.lstrip("#").strip()
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    elif len(clean) == 8:
        clean = clean[:6]
    elif len(clean) == 4:
        clean = "".join([c * 2 for c in clean[:3]])
    if len(clean) != 6:
        return (0, 0, 0)
    try:
        return (
            int(clean[0:2], 16),
            int(clean[2:4], 16),
            int(clean[4:6], 16)
        )
    except ValueError:
        return (0, 0, 0)


def rgb_to_hsl(r: int, g: int, b: int) -> Tuple[float, float, float]:
    """
    Converts RGB (0-255) to HSL:
    - h: 0.0 to 360.0 degrees
    - s: 0.0 to 1.0 saturation
    - l: 0.0 to 1.0 lightness
    """
    r_n = r / 255.0
    g_n = g / 255.0
    b_n = b / 255.0
    c_max = max(r_n, g_n, b_n)
    c_min = min(r_n, g_n, b_n)
    delta = c_max - c_min

    l = (c_max + c_min) / 2.0
    if delta == 0:
        h = 0.0
        s = 0.0
    else:
        s = delta / (1.0 - abs(2.0 * l - 1.0)) if (1.0 - abs(2.0 * l - 1.0)) != 0 else 0.0
        if c_max == r_n:
            h = 60.0 * (((g_n - b_n) / delta) % 6)
        elif c_max == g_n:
            h = 60.0 * (((b_n - r_n) / delta) + 2)
        else:
            h = 60.0 * (((r_n - g_n) / delta) + 4)

    return round(h % 360.0, 1), round(s, 3), round(l, 3)


def classify_color_hue(hex_code: str) -> str:
    """
    Classifies a hex color into one of 8 chromatic families or monochrome:
    - yellow: 40° <= h < 70°
    - orange: 15° <= h < 40°
    - red: h >= 345° or h < 15°
    - green: 70° <= h < 165°
    - cyan: 165° <= h < 195°
    - blue: 195° <= h < 255°
    - purple: 255° <= h < 310°
    - pink: 310° <= h < 345°
    - monochrome: low saturation or extreme lightness
    """
    r, g, b = hex_to_rgb(hex_code)
    h, s, l = rgb_to_hsl(r, g, b)

    if s < 0.16 or l < 0.11 or l > 0.94 or (l < 0.22 and s < 0.35):
        return "monochrome"

    # Earth, Sand, Beige, Brown family (Hue 18-45 with moderate/low saturation or deep lightness)
    if (18 <= h < 45 and s < 0.72) or (15 <= h < 52 and (l < 0.45 and s < 0.75)):
        return "earth"

    # Strict Yellow: authentic vibrant yellow (not sand, not beige)
    if 45 <= h < 70 and s >= 0.35 and l >= 0.35:
        return "yellow"

    if 15 <= h < 45:
        return "orange"
    if h >= 345 or h < 15:
        return "red"
    if 70 <= h < 165:
        return "green"
    if 165 <= h < 195:
        return "cyan"
    if 195 <= h < 255:
        return "blue"
    if 255 <= h < 310:
        return "purple"
    if 310 <= h < 345:
        return "pink"
    return "monochrome"


def color_perceptual_distance(rgb1: Tuple[int, int, int], rgb2: Tuple[int, int, int]) -> float:
    """Calculates perceptual color difference using redmean formula."""
    r1, g1, b1 = rgb1
    r2, g2, b2 = rgb2
    r_bar = (r1 + r2) / 2.0
    dr = r1 - r2
    dg = g1 - g2
    db = b1 - b2
    dist_sq = (2.0 + r_bar / 256.0) * (dr ** 2) + 4.0 * (dg ** 2) + (2.0 + (255.0 - r_bar) / 256.0) * (db ** 2)
    return dist_sq ** 0.5


def get_spatial_sampling_region(x: float, y: float, w: float, h: float, s: float = 0.55) -> int:
    """
    Classifies a pixel coordinate (x, y) into one of 8 spatial sampling regions:
    - 1 to 4: Regiões Internas (Centro da imagem)
      1: Centro Superior
      2: Centro Inferior
      3: Centro Esquerdo
      4: Centro Direito
    - 5 to 8: Regiões Externas (Ao redor do centro / Periferia)
      5: Periferia Superior
      6: Periferia Inferior
      7: Periferia Esquerda
      8: Periferia Direita
    """
    if w <= 0 or h <= 0:
        return 1
    u = (x - w / 2.0) / (w / 2.0)
    v = (y - h / 2.0) / (h / 2.0)
    if abs(v) >= abs(u):
        if v < 0:
            return 1 if abs(v) <= s else 5
        else:
            return 2 if abs(v) <= s else 6
    else:
        if u < 0:
            return 3 if abs(u) <= s else 7
        else:
            return 4 if abs(u) <= s else 8


def extract_dominant_colors_from_pil(
    img: Image.Image,
    num_colors: int = 8,
    size: Optional[Tuple[int, int]] = None,
    fallback: bool = True
) -> List[str]:
    """
    Extracts authentic dominant colors using 8 spatial sampling zones:
    - Regions 1 to 4: Internal core (Top, Bottom, Left, Right)
    - Regions 5 to 8: External periphery (Top, Bottom, Left, Right)
    Calculates the exact average RGB of all pixels in each geometric zone.
    """
    default_palette = ["#3b82f6", "#10b981", "#facc15", "#1e293b", "#ec4899", "#8b5cf6", "#f97316", "#06b6d4"] if fallback else []
    try:
        # 1. Normalize image mode to RGB, cleanly compositing alpha channels
        has_alpha = False
        alpha_mask = None
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            has_alpha = True
            rgba = img.convert("RGBA")
            alpha_mask = rgba.split()[3]
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(rgba.convert("RGB"), mask=alpha_mask)
            rgb_img = bg
        else:
            rgb_img = img.convert("RGB")

        # 2. Resample preserving aspect ratio for uniform spatial sampling
        orig_w, orig_h = rgb_img.size
        if orig_w <= 0 or orig_h <= 0:
            return default_palette

        if size is not None:
            target_w, target_h = size
        else:
            base_dim = 160
            if orig_w >= orig_h:
                target_w = base_dim
                target_h = max(32, int(round(base_dim * orig_h / orig_w)))
            else:
                target_h = base_dim
                target_w = max(32, int(round(base_dim * orig_w / orig_h)))

        resample_method = getattr(Image.Resampling, "BILINEAR", Image.BILINEAR)
        thumb = rgb_img.resize((target_w, target_h), resample=resample_method)
        thumb_alpha = None
        if has_alpha and alpha_mask is not None:
            thumb_alpha = alpha_mask.resize((target_w, target_h), resample=resample_method)

        # 3. Accumulate RGB sum and pixel count for each of the 8 regions
        sum_r = [0] * 8
        sum_g = [0] * 8
        sum_b = [0] * 8
        counts = [0] * 8

        thumb_rgb = thumb.convert("RGB")
        pixels = thumb_rgb.load()
        alpha_pixels = thumb_alpha.load() if thumb_alpha is not None else None

        for y in range(target_h):
            for x in range(target_w):
                if alpha_pixels is not None and alpha_pixels[x, y] < 64:
                    continue  # Ignore transparent pixels
                region = get_spatial_sampling_region(x, y, target_w, target_h, s=0.55)
                idx = region - 1
                r, g, b = pixels[x, y]
                sum_r[idx] += r
                sum_g[idx] += g
                sum_b[idx] += b
                counts[idx] += 1

        # 4. Formulate the 8 sampling dominant colors
        hex_colors = []
        overall_count = sum(counts)
        overall_r = (sum(sum_r) // overall_count) if overall_count > 0 else 128
        overall_g = (sum(sum_g) // overall_count) if overall_count > 0 else 128
        overall_b = (sum(sum_b) // overall_count) if overall_count > 0 else 128
        overall_hex = rgb_to_hex(overall_r, overall_g, overall_b)

        for i in range(8):
            if counts[i] > 0:
                avg_r = int(round(sum_r[i] / counts[i]))
                avg_g = int(round(sum_g[i] / counts[i]))
                avg_b = int(round(sum_b[i] / counts[i]))
                hex_colors.append(rgb_to_hex(avg_r, avg_g, avg_b))
            else:
                hex_colors.append(overall_hex)

        return hex_colors[:num_colors] if hex_colors else default_palette
    except Exception:
        return default_palette


def extract_dominant_colors_from_bytes(data: bytes, num_colors: int = 8, fallback: bool = True) -> List[str]:
    """Loads image bytes and extracts dominant colors."""
    default_palette = ["#3b82f6", "#10b981", "#facc15", "#1e293b", "#ec4899", "#8b5cf6", "#f97316", "#06b6d4"] if fallback else []
    if not data:
        return default_palette
    try:
        with Image.open(io.BytesIO(data)) as im:
            return extract_dominant_colors_from_pil(im, num_colors=num_colors, fallback=fallback)
    except Exception:
        return default_palette


def extract_dominant_colors_from_path(file_path: str, num_colors: int = 8, fallback: bool = True) -> List[str]:
    """Reads local file from disk and extracts dominant colors."""
    default_palette = ["#3b82f6", "#10b981", "#facc15", "#1e293b", "#ec4899", "#8b5cf6", "#f97316", "#06b6d4"] if fallback else []
    if not os.path.exists(file_path):
        return default_palette
    try:
        with Image.open(file_path) as im:
            return extract_dominant_colors_from_pil(im, num_colors=num_colors, fallback=fallback)
    except Exception:
        return default_palette


def matches_palette_perceptual(palette: List[str], target_color: str) -> bool:
    """Checks whether any color in palette matches the target color's chromatic family or HSL proximity."""
    if not palette:
        return False
    target_family = classify_color_hue(target_color)
    target_r, target_g, target_b = hex_to_rgb(target_color)
    target_h, target_s, target_l = rgb_to_hsl(target_r, target_g, target_b)

    for color in palette:
        color_family = classify_color_hue(color)

        # Strict boundary: earth/sand tones must NEVER match pure yellow
        if target_family == "yellow" and color_family == "earth":
            continue
        if target_family == "earth" and color_family == "yellow":
            continue

        if color_family == target_family:
            return True
        r, g, b = hex_to_rgb(color)
        h, s, l = rgb_to_hsl(r, g, b)
        # Circular hue difference
        hue_diff = min(abs(h - target_h), 360 - abs(h - target_h))
        if hue_diff <= 25.0 and s >= 0.18 and target_s >= 0.18:
            return True

    return False
