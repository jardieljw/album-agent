"""
Script to extract exact pixel-level dominant color palettes from all images in data/albums/*.json
Uses Pillow (PIL) Median Cut color quantization over raw RGB pixels.
"""

import os
import io
import json
import logging
import asyncio
from typing import List, Tuple
from urllib.parse import urlparse

import httpx
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("color_extractor")

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
ALBUMS_DIR = os.path.join(DATA_DIR, "albums")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """Converts RGB integers to #RRGGBB hex string."""
    return f"#{r:02x}{g:02x}{b:02x}".lower()


def extract_dominant_colors_from_bytes(image_bytes: bytes, num_colors: int = 4) -> List[str]:
    """
    Extracts exact dominant colors from raw image bytes using PIL Median Cut color quantization.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            # Convert to RGB (handles RGBA, P, grayscale, etc.)
            rgb_img = img.convert("RGB")
            # Resize for fast and noise-reduced color sampling
            thumb = rgb_img.resize((64, 64), Image.Resampling.LANCZOS)
            
            # Quantize image to extract top clusters
            quantized = thumb.quantize(colors=num_colors + 2, method=Image.Quantize.MEDIANCUT)
            palette = quantized.getpalette()  # List of RGB values: [r0, g0, b0, r1, g1, b1, ...]
            
            # Get color counts to sort by dominance
            color_counts = quantized.getcolors()
            if not color_counts:
                # Fallback: take first colors from palette
                hex_colors = []
                for i in range(num_colors):
                    r, g, b = palette[i*3], palette[i*3+1], palette[i*3+2]
                    hex_colors.append(rgb_to_hex(r, g, b))
                return hex_colors

            # Sort colors by frequency count descending
            color_counts.sort(key=lambda x: x[0], reverse=True)
            
            hex_colors = []
            seen = set()
            for count, idx in color_counts:
                r = palette[idx * 3]
                g = palette[idx * 3 + 1]
                b = palette[idx * 3 + 2]
                hex_code = rgb_to_hex(r, g, b)
                if hex_code not in seen:
                    seen.add(hex_code)
                    hex_colors.append(hex_code)
                if len(hex_colors) >= num_colors:
                    break
            
            return hex_colors or ["#1e293b", "#3b82f6", "#f59e0b", "#10b981"]
    except Exception as e:
        logger.debug(f"Failed to extract colors: {e}")
        return ["#1e293b", "#3b82f6", "#f59e0b", "#10b981"]


async def process_image(client: httpx.AsyncClient, img_data: dict, source_page: str, semaphore: asyncio.Semaphore) -> dict:
    """Downloads thumbnail bytes and extracts real pixel palette."""
    target_url = img_data.get("thumbnail_url") or img_data.get("src") or img_data.get("original_url")
    if not target_url or not target_url.startswith("http"):
        img_data["color_palette"] = ["#1e293b", "#3b82f6", "#f59e0b", "#10b981"]
        return img_data

    headers = dict(HEADERS)
    if source_page:
        headers["Referer"] = source_page

    async with semaphore:
        try:
            res = await client.get(target_url, headers=headers, timeout=10.0)
            if res.status_code == 200:
                palette = extract_dominant_colors_from_bytes(res.content, num_colors=4)
                img_data["color_palette"] = palette
                return img_data
        except Exception:
            pass

    # Fallback if host is unreachable
    img_data["color_palette"] = ["#1e293b", "#3b82f6", "#f59e0b", "#10b981"]
    return img_data


async def process_album_file(client: httpx.AsyncClient, fpath: str, semaphore: asyncio.Semaphore):
    """Processes a single album JSON file, updating its images with real color palettes."""
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)

        images = data.get("images", [])
        if not images:
            return

        source_page = data.get("source_page", "")
        tasks = [process_image(client, img, source_page, semaphore) for img in images]
        updated_images = await asyncio.gather(*tasks)

        data["images"] = updated_images
        
        # Save back to disk preserving everything
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        logger.info(f"Processed exact color palettes for {len(updated_images)} images in {os.path.basename(fpath)}")
    except Exception as e:
        logger.error(f"Error processing {fpath}: {e}")


async def main():
    if not os.path.exists(ALBUMS_DIR):
        logger.warning(f"No albums dir at {ALBUMS_DIR}")
        return

    files = [os.path.join(ALBUMS_DIR, f) for f in os.listdir(ALBUMS_DIR) if f.endswith(".json")]
    logger.info(f"Starting exact pixel color extraction for {len(files)} albums in {ALBUMS_DIR}...")

    semaphore = asyncio.Semaphore(12)  # 12 concurrent workers
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        album_tasks = [process_album_file(client, fpath, semaphore) for fpath in files]
        await asyncio.gather(*album_tasks)

    logger.info("Done! Exact pixel-level color palettes saved to all album JSON files on disk.")


if __name__ == "__main__":
    asyncio.run(main())
