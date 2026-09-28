import os
import io
import json
import uuid
import zipfile
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional
import httpx
from fastapi.responses import FileResponse
from fastapi.background import BackgroundTasks

logger = logging.getLogger("safe_downloader")

def _sanitize_filename(name: str) -> str:
    import re
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = re.sub(r'\s+', "_", clean).strip("_")
    return clean[:60] or "album"

def _format_image_filename(pattern: Optional[str], a_name: str, idx: int, img: Any, ext: str) -> str:
    if pattern and pattern.strip():
        res_str = f"{getattr(img, 'width', 0)}x{getattr(img, 'height', 0)}" if (getattr(img, 'width', 0) and getattr(img, 'height', 0)) else "original"
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        fname = pattern.replace("{album}", a_name)\
                       .replace("{index}", f"{idx+1:02d}")\
                       .replace("{res}", res_str)\
                       .replace("{date}", date_str)
        clean = _sanitize_filename(fname)
        if not clean.lower().endswith(f".{ext.lower()}"):
            clean = f"{clean}.{ext}"
        return clean
    return f"{idx+1:02d}_{a_name}.{ext}"

def _strip_exif_data(raw_bytes: bytes, ext: str) -> bytes:
    if not raw_bytes:
        return raw_bytes
    try:
        from PIL import Image
        with Image.open(io.BytesIO(raw_bytes)) as pil_img:
            out = io.BytesIO()
            fmt = pil_img.format or ("JPEG" if ext in ("jpg", "jpeg") else ext.upper())
            clean_img = Image.new(pil_img.mode, pil_img.size)
            clean_img.putdata(list(pil_img.getdata()))
            clean_img.save(out, format=fmt)
            return out.getvalue()
    except Exception as e:
        logger.warning(f"Failed to strip EXIF: {e}")
        return raw_bytes

class SafeDownloader:
    """
    Downloads images and streams them directly to a temporary zip file on disk,
    eliminating RAM exhaustion issues associated with large albums.
    """
    def __init__(self, temp_dir: str = "./data/temp_zips"):
        self.temp_dir = temp_dir
        os.makedirs(self.temp_dir, exist_ok=True)

    async def create_safe_zip(self, album: Any, remove_exif: bool, naming_pattern: Optional[str]) -> str:
        album_name = _sanitize_filename(getattr(album, "original_title", None) or getattr(album, "title", None) or "album")
        unique_id = uuid.uuid4().hex[:8]
        zip_path = os.path.join(self.temp_dir, f"{album_name}_{unique_id}.zip")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": getattr(album, "source_page", "")
        }

        semaphore = asyncio.Semaphore(5)

        # Thread-safe zip writing queue
        write_queue = asyncio.Queue()

        async def download_worker(client: httpx.AsyncClient, img: Any, idx: int):
            target_url = getattr(img, "original_url", None) or getattr(img, "thumbnail_url", None)
            if not target_url:
                return
            ext = getattr(img, "format", "jpg")
            orig_u = str(target_url).lower().split("?")[0]
            if getattr(img, "media_type", "") == "gif" or getattr(img, "is_animated", False) or orig_u.endswith(".gif"):
                ext = "gif"
            elif orig_u.endswith(".webp") or ext == "webp":
                ext = "webp"
            elif not ext or len(ext) > 5:
                ext = "jpg"
            img_filename = _format_image_filename(naming_pattern, album_name, idx, img, ext)

            is_video = getattr(img, "media_type", "") == "video" or ext.lower() in ("mp4", "webm", "mov", "mkv") or "phncdn.com" in target_url.lower()
            async with semaphore:
                try:
                    if is_video:
                        from .resilient_downloader import download_video_resilient
                        tmp_vid = os.path.join(self.temp_dir, f"tmp_vid_{unique_id}_{idx}.mp4")
                        src_page = getattr(album, "source_page", None) or getattr(img, "source_page", None) or target_url
                        await download_video_resilient(
                            url=target_url,
                            target_path=tmp_vid,
                            clean_title=img_filename,
                            referer=src_page
                        )
                        if os.path.exists(tmp_vid):
                            with open(tmp_vid, "rb") as f:
                                content = f.read()
                            try:
                                os.remove(tmp_vid)
                            except Exception:
                                pass
                            await write_queue.put((img_filename, content))
                    else:
                        res = await client.get(target_url, headers=headers, timeout=45.0)
                        if res.status_code == 200:
                            content = res.content
                            if remove_exif:
                                content = await asyncio.to_thread(_strip_exif_data, content, ext)
                            await write_queue.put((img_filename, content))
                except Exception as err:
                    logger.warning(f"Failed to download item {target_url}: {err}")

        # Task to write to zip file synchronously in a background thread
        def zip_writer_sync():
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
                while True:
                    # Synchronous blocking get is NOT good here if called from async, 
                    # but we will just consume the queue asynchronously and write to thread
                    pass

        # Let's do it simpler without a dedicated thread loop to avoid complexity
        async def zip_consumer():
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
                while True:
                    item = await write_queue.get()
                    if item is None:
                        # Add metadata
                        try:
                            meta_json = json.dumps(album.model_dump(), indent=2, ensure_ascii=False)
                            zip_file.writestr("metadata.json", meta_json)
                        except Exception:
                            pass
                        break
                    
                    filename, data = item
                    # Writing to zip file might block the event loop slightly, but it's much better than holding all in RAM
                    zip_file.writestr(filename, data)
                    write_queue.task_done()

        async with httpx.AsyncClient(follow_redirects=True) as client:
            consumer_task = asyncio.create_task(zip_consumer())
            
            tasks = [download_worker(client, img, i) for i, img in enumerate(album.images)]
            await asyncio.gather(*tasks)
            
            # Signal consumer to close
            await write_queue.put(None)
            await consumer_task

        return zip_path

    async def create_safe_unified_zip(self, albums: list[Any], remove_exif: bool = True, naming_pattern: Optional[str] = None) -> str:
        unique_id = uuid.uuid4().hex[:8]
        zip_path = os.path.join(self.temp_dir, f"colecao_albuns_{unique_id}.zip")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }

        semaphore = asyncio.Semaphore(6)
        write_queue = asyncio.Queue()
        used_folder_names = set()

        async def download_worker(client: httpx.AsyncClient, img: Any, idx: int, album_name: str, folder_name: str, referer: str):
            target_url = getattr(img, "original_url", None) or getattr(img, "thumbnail_url", None)
            if not target_url:
                return
            ext = getattr(img, "format", "jpg")
            if not ext or len(ext) > 5:
                ext = "jpg"
            img_filename = _format_image_filename(naming_pattern, album_name, idx, img, ext)
            full_zip_path = f"{folder_name}/{img_filename}"

            req_headers = {**headers}
            target_low = target_url.lower()
            if "pvvstream" in target_low or "nmcorp.video" in target_low:
                req_headers["Referer"] = "https://nmcorp.video/"
                req_headers["Origin"] = "https://nmcorp.video"
            elif "phncdn.com" in target_low or "pornhub.com" in target_low:
                req_headers["Referer"] = "https://www.pornhub.com/"
                req_headers["Origin"] = "https://www.pornhub.com"
            elif referer:
                req_headers["Referer"] = referer

            async with semaphore:
                try:
                    res = await client.get(target_url, headers=req_headers, timeout=45.0)
                    if res.status_code == 200:
                        content = res.content
                        if remove_exif:
                            content = await asyncio.to_thread(_strip_exif_data, content, ext)
                        await write_queue.put((full_zip_path, content))
                except Exception as err:
                    logger.warning(f"Failed to download image {target_url} for unified zip: {err}")

        async def zip_consumer():
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
                while True:
                    item = await write_queue.get()
                    if item is None:
                        break
                    filename, data = item
                    zip_file.writestr(filename, data)
                    write_queue.task_done()

        async with httpx.AsyncClient(follow_redirects=True) as client:
            consumer_task = asyncio.create_task(zip_consumer())

            tasks = []
            for a_idx, album in enumerate(albums):
                raw_name = _sanitize_filename(getattr(album, "original_title", None) or getattr(album, "title", None) or f"album_{a_idx+1}")
                folder_name = raw_name
                counter = 2
                while folder_name.lower() in used_folder_names:
                    folder_name = f"{raw_name}_{counter}"
                    counter += 1
                used_folder_names.add(folder_name.lower())

                # Put metadata inside album folder
                try:
                    meta_json = json.dumps(album.model_dump(), indent=2, ensure_ascii=False)
                    await write_queue.put((f"{folder_name}/metadata.json", meta_json.encode("utf-8")))
                except Exception:
                    pass

                referer = getattr(album, "source_page", "")
                images = getattr(album, "images", []) or []
                for i, img in enumerate(images):
                    tasks.append(download_worker(client, img, i, raw_name, folder_name, referer))

            if tasks:
                await asyncio.gather(*tasks)

            await write_queue.put(None)
            await consumer_task

        return zip_path

    def delete_temp_file(self, file_path: str):
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Cleaned up temp zip: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to delete temp zip {file_path}: {e}")

safe_downloader = SafeDownloader()
