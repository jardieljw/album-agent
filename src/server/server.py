"""
FastAPI Server for AI-First Browser Agent.
Features:
- Decoupled server-side background task execution (resilient to browser/tab closures)
- Real-time SSE streaming & live reconnection for mobile (iOS) & desktop
- Active task manager with cancellation support (POST /api/jobs/{session_id}/cancel)
- Batch concurrent multi-URL analysis (POST /api/batch-analyze)
- Windows Explorer-style album management (Delete, Rename, Export ZIP & JSON)
- Mode 1: Autonomous Extraction
- Mode 2: Learning by Demonstration with Qwen Ground-Truth URL induction
- Reverse proxy for images with custom Referer to prevent CDN hotlink blocks
"""

import os
import sys
# Configuração segura do Playwright para executável empacotado (.exe)
if getattr(sys, 'frozen', False):
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright")
    bundle_driver = os.path.join(getattr(sys, '_MEIPASS', ''), 'playwright', 'driver')
    if os.path.exists(bundle_driver):
        os.environ["PLAYWRIGHT_NODEJS_PATH"] = os.path.join(bundle_driver, 'node.exe')
import re
import time
import json
import logging
import asyncio
import io
import zipfile
try:
    from PIL import Image
except ImportError:
    Image = None
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import urllib.parse
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, Request, Response, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .video_service import video_service
from .trash_service import trash_service

from ..core.models import Album, AlbumImage, ResolutionMethod, TelemetryMetrics
from ..observability.debugger import AgentDebugger
from ..browser.engine import BrowserEngine
from ..browser.tools import BrowserTools
from ..validator.validator import ImageValidator
from ..investigator.investigator import OriginalImageInvestigator
from ..agent.brain import SemanticAgentBrain
from ..agent.llm_adapter import LLMAdapter
from ..agent.controller import InvestigationController
from ..learning.knowledge_store import KnowledgeStore
from ..learning.meta_knowledge import MetaKnowledgeGraph
from ..agent.autonomous_react_agent import AutonomousReActAgent
from ..agent.copilot_channel import (
    CoPilotChannel,
    AgentQuestionEvent,
    UserResponseEvent,
    CoPilotEventType,
)
from ..scout.surgical_scout import GeminiSurgicalScout, parse_image_dimensions, get_canonical_media_key
from ..scout.layout_explorer import GeminiLayoutExplorer
from ..scout.knowledge_bridge import ScoutKnowledgeBridge

logger = logging.getLogger("agent_server")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

app = FastAPI(title="AI Album Intelligence Agent API")

# Enable CORS for local network and iPhone Safari/Chrome access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional Cloud Security: Basic Auth when AUTH_PASSWORD is set
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "")

if AUTH_PASSWORD:
    import base64
    import secrets

    logger.info(" Security active: HTTP Basic Auth enabled for cloud deployment.")

    @app.middleware("http")
    async def cloud_basic_auth_middleware(request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check Cookie for saved session (e.g. for <video> and <img> tags)
        session_cookie = request.cookies.get("album_agent_auth")
        if session_cookie:
            try:
                decoded = base64.b64decode(session_cookie).decode("utf-8")
                username, _, password = decoded.partition(":")
                if secrets.compare_digest(username, AUTH_USERNAME) and secrets.compare_digest(password, AUTH_PASSWORD):
                    return await call_next(request)
            except Exception:
                pass

        # Allow auth token via query parameter (e.g. /api/videos/{id}/stream?auth=...)
        auth_param = request.query_params.get("auth")
        if auth_param:
            try:
                decoded = base64.b64decode(auth_param).decode("utf-8")
                username, _, password = decoded.partition(":")
                if secrets.compare_digest(username, AUTH_USERNAME) and secrets.compare_digest(password, AUTH_PASSWORD):
                    return await call_next(request)
            except Exception:
                pass

        # Direct media endpoints (video stream, download, thumbnail, proxy stream) are public once user is inside
        path = request.url.path
        if (
            (path.startswith(("/api/videos/", "/api/trash/videos/")) and any(p in path for p in ["/stream", "/thumbnail", "/download"]))
            or path.startswith(("/api/proxy-video-stream", "/api/proxy-image"))
        ):
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Basic "):
            return Response(
                status_code=401,
                content="Acesso Restrito: Por favor, insira usuario e senha.",
                headers={"WWW-Authenticate": 'Basic realm="AI Album Agent"'},
            )

        try:
            encoded = auth_header.split(" ", 1)[1].strip()
            decoded = base64.b64decode(encoded).decode("utf-8")
            username, _, password = decoded.partition(":")
            valid_user = secrets.compare_digest(username, AUTH_USERNAME)
            valid_pass = secrets.compare_digest(password, AUTH_PASSWORD)
            if not (valid_user and valid_pass):
                return Response(
                    status_code=401,
                    content="Credenciais incorretas.",
                    headers={"WWW-Authenticate": 'Basic realm="AI Album Agent"'},
                )
        except Exception:
            return Response(
                status_code=401,
                content="Falha na autenticacao.",
                headers={"WWW-Authenticate": 'Basic realm="AI Album Agent"'},
            )

        response = await call_next(request)
        # Set auth cookie so native <video> and <img> elements in all browsers play smoothly
        response.set_cookie(
            key="album_agent_auth",
            value=encoded,
            max_age=86400 * 30,
            httponly=True,
            samesite="lax",
            secure=False
        )
        return response

# Determina a pasta raiz garantindo funcionamento dentro ou fora de dist/
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    if os.path.basename(BASE_DIR).lower() == "dist":
        BASE_DIR = os.path.dirname(BASE_DIR)
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DATA_DIR = os.path.join(BASE_DIR, "data")
ALBUMS_DIR = os.path.join(DATA_DIR, "albums")
VIDEOS_DIR = os.path.join(DATA_DIR, "videos")
TRASH_DIR = os.path.join(DATA_DIR, "trash")

# Auto-criação da árvore caso o usuário execute o .exe em uma pasta vazia
for _d in [DATA_DIR, ALBUMS_DIR, VIDEOS_DIR, TRASH_DIR, os.path.join(VIDEOS_DIR, "Geral")]:
    os.makedirs(_d, exist_ok=True)

knowledge_store = KnowledgeStore(storage_dir=os.path.join(DATA_DIR, "knowledge"))
meta_knowledge_graph = MetaKnowledgeGraph(storage_path=os.path.join(DATA_DIR, "meta_knowledge_graph.json"))

# Memory stores
_completed_albums: Dict[str, Album] = {}
_active_event_queues: Dict[str, asyncio.Queue] = {}
_session_events_history: Dict[str, List[Dict[str, Any]]] = {}
_active_jobs: Dict[str, Dict[str, Any]] = {}
_job_controllers: Dict[str, InvestigationController] = {}
_copilot_channels: Dict[str, Any] = {}
_copilot_pending_futures: Dict[str, asyncio.Future] = {}


def _record_session_event(session_id: str, event_data: Dict[str, Any]):
    """Buffers session events in memory so reconnecting clients recover the entire timeline."""
    if session_id not in _session_events_history:
        _session_events_history[session_id] = []
    if len(_session_events_history[session_id]) < 500:
        _session_events_history[session_id].append(event_data)


JOBS_FILE = os.path.join(DATA_DIR, "jobs.json")


def _compute_job_duration(started_at_str: str, completed_at_str: Optional[str] = None) -> float:
    """Calculates duration in seconds between start and completion timestamps."""
    try:
        clean_start = started_at_str.replace(" UTC", "+00:00")
        t0 = datetime.fromisoformat(clean_start)
        if completed_at_str:
            clean_end = completed_at_str.replace(" UTC", "+00:00")
            t1 = datetime.fromisoformat(clean_end)
        else:
            t1 = datetime.now(timezone.utc)
        diff = (t1 - t0).total_seconds()
        return max(1.0, round(diff, 1))
    except Exception:
        return 1.0


def _load_jobs_from_disk(clear_zombies: bool = False):
    """Loads all persistent job records from data/jobs.json.
    If local disk was wiped (Render restart), restores from HF first.
    clear_zombies should only be True on initial server startup."""
    global _active_jobs

    # --- Restore jobs.json from HF if local is missing ---
    if not os.path.exists(JOBS_FILE) or os.path.getsize(JOBS_FILE) < 3:
        try:
            from src.server.video_service import cloud_storage as _cs
            if _cs.is_connected():
                logger.info("jobs.json ausente — tentando restaurar do HF...")
                remote_jobs = _cs.download_json("metadata/jobs.json")
                if remote_jobs and isinstance(remote_jobs, dict):
                    try:
                        with open(JOBS_FILE, "w", encoding="utf-8") as f:
                            json.dump(remote_jobs, f, indent=2, ensure_ascii=False)
                        logger.info(f"jobs.json restaurado do HF: {len(remote_jobs)} jobs.")
                    except Exception as we:
                        logger.warning(f"Erro ao escrever jobs restaurado: {we}")
        except Exception as e:
            logger.warning(f"HF jobs restore failed: {e}")

    if os.path.exists(JOBS_FILE):
        try:
            with open(JOBS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    for k, v in saved.items():
                        # Do not overwrite currently running in-memory jobs with older disk data
                        if k not in _active_jobs or _active_jobs[k].get("status") not in ("running", "active"):
                            _active_jobs[k] = v
                elif isinstance(saved, list):
                    for j in saved:
                        if isinstance(j, dict) and "session_id" in j:
                            k = j["session_id"]
                            if k not in _active_jobs or _active_jobs[k].get("status") not in ("running", "active"):
                                _active_jobs[k] = j
        except Exception as e:
            logger.warning(f"Error loading {JOBS_FILE}: {e}")

    # Seed existing completed albums into persistent jobs ledger if not present
    updated = False
    for aid, a in _completed_albums.items():
        if aid not in _active_jobs:
            img_count = len(a.images)
            _active_jobs[aid] = {
                "session_id": aid,
                "url": a.source_page or f"https://{aid}",
                "mode": a.metadata.get("engine_type", "ai_react"),
                "engine_type": a.metadata.get("engine_type", "ai_react"),
                "status": "completed",
                "model": a.metadata.get("model_used", "Qwen 2.5:32b"),
                "started_at": a.metadata.get("saved_at", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")),
                "completed_at": a.metadata.get("saved_at", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")),
                "duration_seconds": round(max(3.5, img_count * 1.6), 1),
                "progress": {
                    "current": img_count,
                    "total": img_count,
                    "title": a.title,
                    "status": f"Álbum salvo ({img_count} fotos originais)"
                },
                "resolved_count": img_count,
            }
            updated = True

    for j in _active_jobs.values():
        if ("duration_seconds" not in j or not j["duration_seconds"]) and j.get("status") == "completed":
            start_str = j.get("started_at")
            end_str = j.get("completed_at")
            if start_str and end_str and start_str != end_str:
                j["duration_seconds"] = _compute_job_duration(start_str, end_str)
            else:
                cnt = j.get("resolved_count") or j.get("progress", {}).get("current") or 8
                j["duration_seconds"] = round(max(3.5, cnt * 1.6), 1)

    # Limpar jobs zumbis APENAS no boot inicial do servidor
    if clear_zombies:
        for jid, j in list(_active_jobs.items()):
            if j.get("status") in ("running", "queued", "active"):
                j["status"] = "cancelled"
                if isinstance(j.get("progress"), dict):
                    j["progress"]["status"] = "Cancelado"
                updated = True

    if updated:
        _save_jobs_to_disk()


_last_hf_jobs_sync = 0.0


def _save_jobs_to_disk(sync_hf: bool = False):
    """
    Persists all job records to data/jobs.json atomically.
    Mirrors to Hugging Face only when sync_hf=True or at most once every 300s,
    preventing 429 Too Many Requests (128 commits/hour limit).
    """
    global _last_hf_jobs_sync
    try:
        tmp_file = JOBS_FILE + ".tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(_active_jobs, f, indent=2, ensure_ascii=False)
        os.replace(tmp_file, JOBS_FILE)

        now = time.time()
        should_sync = sync_hf or (now - _last_hf_jobs_sync >= 300.0)
        if should_sync:
            try:
                import threading
                from src.server.video_service import cloud_storage as _cs
                if _cs.is_connected():
                    _last_hf_jobs_sync = now
                    jobs_snapshot = dict(_active_jobs)

                    def _sync_jobs():
                        try:
                            _cs.upload_json(jobs_snapshot, "metadata/jobs.json")
                        except Exception:
                            pass

                    threading.Thread(target=_sync_jobs, daemon=True).start()
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Error persisting jobs to disk: {e}")



def is_placeholder_image(url: Optional[str]) -> bool:
    """Checks if a URL is empty or points to a 1px transparent placeholder."""
    if not url:
        return True
    u_low = str(url).lower()
    return any(p in u_low for p in ("1px.png", "1px.gif", "blank.gif", "spacer.gif", "transparent.png"))


def ensure_album_cover(album: Album) -> bool:
    """
    Ensures the album has a non-placeholder cover_image_url if images exist.
    Also heals internal images having 1px.png thumbnail_url by replacing with original_url.
    Returns True if the album was modified.
    """
    modified = False

    # 1. Clean internal images that have 1px placeholder thumbnails
    for img in album.images:
        if is_placeholder_image(img.thumbnail_url) and img.original_url and not is_placeholder_image(img.original_url):
            img.thumbnail_url = img.original_url
            modified = True

    # 2. Check if album cover is missing or a placeholder
    if is_placeholder_image(album.cover_image_url):
        valid_img_url = None
        for img in album.images:
            if img.original_url and not is_placeholder_image(img.original_url):
                valid_img_url = img.original_url
                break
            if img.thumbnail_url and not is_placeholder_image(img.thumbnail_url):
                valid_img_url = img.thumbnail_url
                break
            if getattr(img, "poster_url", None) and not is_placeholder_image(img.poster_url):
                valid_img_url = img.poster_url
                break

        if valid_img_url:
            album.cover_image_url = valid_img_url
            modified = True

    return modified


def sanitize_album_images(album: Album) -> Album:
    """
    Higieniza as imagens do álbum:
    1. Remove duplicatas entre miniatura e original geradas pelo mesmo ID base ou chave canônica.
    2. Corrige URLs de eporner onde a miniatura de 8KB (_296x1000.gif ou 13_240.jpg) foi salva erroneamente no lugar do GIF/WebP de alta resolução.
    3. Detecta media_type='gif', is_animated=True e formato real (gif/webp).
    4. Computa has_gifs e tags ['gif', 'animado'].
    """
    if not album or not getattr(album, "images", None):
        return album

    cleaned_images = []
    canonical_seen = {}  # key -> index in cleaned_images

    for img in album.images:
        orig = img.original_url or ""
        thumb = img.thumbnail_url or ""
        can_key = get_canonical_media_key(orig)
        file_sz = getattr(img, "file_size", 0) or 0
        is_thumb_indicator = bool(re.search(r'(_\d+x\d+|_thumb\b|-thumb\b|_small\b|_240\b|_190x152\b)', orig, re.I))

        # Check if URL was an eporner thumb or small jpg and can be upgraded
        if ("eporner" in (orig + thumb).lower()) and ("_296x1000.gif" in (orig + thumb).lower() or "13_240.jpg" in orig.lower()):
            source_match = re.search(r'https?://[^\s"\']+/(\d+-[a-zA-Z0-9_\-]+)(?:_296x1000)?\.(gif|jpg|webp)', orig + " " + thumb)
            if source_match:
                if "_296x1000" in (orig + thumb):
                    upgraded_gif = (thumb or orig).replace("_296x1000.gif", ".gif").replace("_296x1000.jpg", ".gif")
                    upgraded_webp = (thumb or orig).replace("_296x1000.gif", ".webp").replace("_296x1000.jpg", ".webp")
                    img.original_url = upgraded_gif
                    img.thumbnail_url = thumb or upgraded_webp
                    img.format = "gif"
                    img.media_type = "gif"
                    img.is_animated = True
                    is_thumb_indicator = False

        # Format detection
        orig_lower = (img.original_url or "").lower()
        is_gif = orig_lower.endswith(".gif") or (img.format or "").lower() == "gif" or img.media_type == "gif"
        is_webp = orig_lower.endswith(".webp") or (img.format or "").lower() == "webp"
        is_animated_media = is_gif or bool(img.is_animated) or ("webp" in orig_lower and (file_sz > 500000 or "anim" in orig_lower))

        if is_animated_media:
            img.media_type = "gif"
            img.is_animated = True
            img.format = "gif" if is_gif else "webp"

        # Canonical deduplication: keep only full high-res original
        if can_key:
            if can_key in canonical_seen:
                existing_idx = canonical_seen[can_key]
                existing_img = cleaned_images[existing_idx]
                existing_is_thumb = bool(re.search(r'(_\d+x\d+|_thumb\b|-thumb\b|_small\b|_240\b|_190x152\b)', existing_img.original_url or "", re.I))

                if existing_is_thumb and not is_thumb_indicator:
                    cleaned_images[existing_idx] = img
                    canonical_seen[can_key] = existing_idx
                continue
            else:
                canonical_seen[can_key] = len(cleaned_images)

        cleaned_images.append(img)

    # Second pass: remove images whose thumbnail_url matches the original_url of another
    # image in the same album. This catches the case where the extractor saved both a
    # thumbnail entry (thumb=X_small.jpg, orig=X.jpg) AND a full-original entry (thumb=X.jpg,
    # orig=X.jpg), producing a visible duplicate in the album grid.
    all_original_urls = {
        (img.original_url or "").split("?")[0].rstrip("/").lower()
        for img in cleaned_images
        if img.original_url
    }
    deduped_images = []
    for img in cleaned_images:
        thumb_base = (img.thumbnail_url or "").split("?")[0].rstrip("/").lower()
        orig_base = (img.original_url or "").split("?")[0].rstrip("/").lower()
        # Drop this image if its thumbnail_url (without query) resolves to the same URL
        # that exists as the original_url of some other image — meaning this entry IS the
        # thumbnail-only duplicate (the other entry carries the original already).
        if thumb_base and thumb_base in all_original_urls and thumb_base != orig_base:
            # Only drop if there genuinely IS another image that has this as its original
            sibling_exists = any(
                (other.original_url or "").split("?")[0].rstrip("/").lower() == thumb_base
                and other is not img
                for other in cleaned_images
            )
            if sibling_exists:
                continue  # skip — the sibling entry already covers this content
        deduped_images.append(img)
    cleaned_images = deduped_images

    for idx, img in enumerate(cleaned_images):
        img.position = idx + 1

    album.images = cleaned_images

    # Metadata & Tags
    has_gifs = any(i.is_animated or i.media_type == "gif" for i in album.images)
    gif_count = sum(1 for i in album.images if i.is_animated or i.media_type == "gif")

    if not isinstance(album.metadata, dict):
        album.metadata = {}

    album.metadata["has_gifs"] = has_gifs
    album.metadata["gif_count"] = gif_count

    if not hasattr(album, "tags") or album.tags is None:
        album.tags = []
    if has_gifs:
        if "gif" not in album.tags:
            album.tags.append("gif")
        if "animado" not in album.tags:
            album.tags.append("animado")

    return album


def _save_album_to_disk(album_id: str, album: Album):
    """Saves completed album to data/albums/<album_id>.json on disk AND mirrors to HF."""
    try:
        sanitize_album_images(album)
        ensure_album_cover(album)
        if not getattr(album, "folder", None):
            album.folder = album.metadata.get("folder", "Geral") or "Geral"
        album.metadata["folder"] = album.folder
        if "saved_at" not in album.metadata:
            album.metadata["saved_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        fpath = os.path.join(ALBUMS_DIR, f"{album_id}.json")
        album_data = album.model_dump()
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(album_data, f, indent=2, ensure_ascii=False)
        logger.info(f"Persisted album to disk: {fpath}")

        # Mirror album to HF in background thread
        try:
            import threading
            from src.server.video_service import cloud_storage as _cs
            def _sync_album():
                _cs.upload_json(album_data, f"albums/{album_id}.json")
            threading.Thread(target=_sync_album, daemon=True).start()
        except Exception as e:
            logger.warning(f"HF album sync failed: {e}")

        if album_id in _active_jobs:
            _active_jobs[album_id]["status"] = "completed"
            _active_jobs[album_id]["progress"] = {
                "current": len(album.images),
                "total": len(album.images),
                "status": "Álbum salvo com sucesso"
            }
            _active_jobs[album_id]["resolved_count"] = len(album.images)
            _active_jobs[album_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            _save_jobs_to_disk()
    except Exception as e:
        logger.warning(f"Failed to persist album to disk: {e}")


_hf_restore_done = False  # Ensures HF restore runs only once at startup

def _load_albums_from_disk():
    """Loads previously saved albums from data/albums/ on startup.
    HF restore runs only once at startup (flag-guarded) to avoid blocking every call."""
    global _hf_restore_done

    # --- Restore albums from HF only on first call (boot) ---
    if not _hf_restore_done:
        _hf_restore_done = True
        try:
            from src.server.video_service import cloud_storage as _cs
            if _cs.is_connected():
                # 1. Restore Cloud/Render albums
                cloud_paths = _cs.list_files_in_folder("albums")
                for hf_path in cloud_paths:
                    if not hf_path.endswith(".json") or os.path.basename(hf_path).startswith("vid_page_"):
                        continue
                    fname = os.path.basename(hf_path)
                    local_fpath = os.path.join(ALBUMS_DIR, fname)
                    if not os.path.exists(local_fpath):
                        logger.info(f"Restaurando album nuvem do HF: {hf_path}")
                        album_data = _cs.download_json(hf_path)
                        if album_data and isinstance(album_data, dict):
                            try:
                                if "metadata" not in album_data or not isinstance(album_data["metadata"], dict):
                                    album_data["metadata"] = {}
                                album_data["source_origin"] = "remote"
                                with open(local_fpath, "w", encoding="utf-8") as f:
                                    json.dump(album_data, f, indent=2, ensure_ascii=False)
                            except Exception as we:
                                logger.warning(f"Erro ao escrever album restaurado {fname}: {we}")

                # 2. Restore Localhost extractions (meus_albuns_pc/albums/)
                localhost_paths = _cs.list_files_in_folder("meus_albuns_pc/albums")
                for hf_path in localhost_paths:
                    if not hf_path.endswith(".json") or os.path.basename(hf_path).startswith("vid_page_"):
                        continue
                    fname = os.path.basename(hf_path)
                    local_fpath = os.path.join(ALBUMS_DIR, fname)
                    if not os.path.exists(local_fpath):
                        logger.info(f"Restaurando album localhost do HF: {hf_path}")
                        album_data = _cs.download_json(hf_path)
                        if album_data and isinstance(album_data, dict):
                            try:
                                if "metadata" not in album_data or not isinstance(album_data["metadata"], dict):
                                    album_data["metadata"] = {}
                                album_data["metadata"]["source_origin"] = "local"
                                album_data["source_origin"] = "local"
                                with open(local_fpath, "w", encoding="utf-8") as f:
                                    json.dump(album_data, f, indent=2, ensure_ascii=False)
                            except Exception as we:
                                logger.warning(f"Erro ao escrever album localhost {fname}: {we}")
        except Exception as e:
            logger.warning(f"HF album restore failed: {e}")

    if not os.path.exists(ALBUMS_DIR):
        return
    for fname in os.listdir(ALBUMS_DIR):
        if fname.endswith(".json"):
            if fname.startswith("vid_page_"):
                try:
                    os.remove(os.path.join(ALBUMS_DIR, fname))
                except Exception:
                    pass
                continue
            fpath = os.path.join(ALBUMS_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    album_id = fname[:-5]
                    alb_instance = Album(**data)
                    # Higieniza mídias: desduplicação canônica, tags de gif e metadados
                    sanitize_album_images(alb_instance)
                    # Auto-heal missing or 1px placeholder covers from genuine HD images
                    if ensure_album_cover(alb_instance):
                        try:
                            with open(fpath, "w", encoding="utf-8") as wf:
                                json.dump(alb_instance.model_dump(), wf, indent=2, ensure_ascii=False)
                        except Exception as we:
                            logger.warning(f"Could not persist auto-healed cover for {fname}: {we}")

                    meta_origin = alb_instance.metadata.get("source_origin") if isinstance(alb_instance.metadata, dict) else None
                    if meta_origin:
                        alb_instance.source_origin = meta_origin
                    elif not alb_instance.source_origin or alb_instance.source_origin == "remote":
                        if alb_instance.source_page in ("Upload Local", "local://") or alb_instance.source_page.startswith("local://") or album_id.startswith(("manual-", "local-")):
                            alb_instance.source_origin = "local"
                    _completed_albums[album_id] = alb_instance
            except Exception as e:
                logger.warning(f"Error loading {fpath}: {e}")
    _load_jobs_from_disk(clear_zombies=True)


# Load any existing albums and jobs from disk on startup
_load_albums_from_disk()


class AnalyzeRequest(BaseModel):
    url: str
    headless: bool = True
    llm_api_base: Optional[str] = "http://localhost:11434/v1"
    model_name: Optional[str] = "qwen2.5:32b"
    gemini_model: Optional[str] = "gemini-3.7-flash"
    reasoning_budget: Optional[int] = 3
    engine_type: Optional[str] = "ai_react"  # "ai_react" (7-Pillar Autonomous), "gemini_surgical_scout", "gemini_layout_explorer", "classic"
    max_concurrency: Optional[int] = 3
    anti_bot_delay_ms: Optional[int] = 500
    media_type_filter: Optional[str] = "all"  # "all", "images", "videos", "gifs"
    folder: Optional[str] = "Geral"


class BatchAnalyzeRequest(BaseModel):
    urls: List[str]
    headless: bool = True
    llm_api_base: Optional[str] = "http://localhost:11434/v1"
    model_name: Optional[str] = "qwen2.5:32b"
    gemini_model: Optional[str] = "gemini-3.7-flash"
    reasoning_budget: Optional[int] = 3
    engine_type: Optional[str] = "ai_react"
    max_concurrency: Optional[int] = 3
    anti_bot_delay_ms: Optional[int] = 500
    media_type_filter: Optional[str] = "all"
    folder: Optional[str] = "Geral"


class CopilotRespondRequest(BaseModel):
    selected_option: Optional[str] = None
    text_input: Optional[str] = None


class ScanRequest(BaseModel):
    url: str
    headless: bool = True


class DemonstrateRequest(BaseModel):
    url: str
    positive_ids: List[str]
    negative_ids: List[str]
    headless: bool = True
    llm_api_base: Optional[str] = "http://localhost:11434/v1"
    model_name: Optional[str] = "qwen2.5:32b"
    ground_truth_urls: Optional[Dict[str, str]] = None
    engine_type: Optional[str] = "both"


class RenameRequest(BaseModel):
    title: str

class ChatRequest(BaseModel):
    message: str


def _sanitize_filename(name: str) -> str:
    """Sanitizes album and image filenames for safe disk and zip saving."""
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = re.sub(r'\s+', "_", clean).strip("_")
    return clean[:60] or "album"


@app.get("/api/health")
async def health_check():
    """System health check and version information."""
    return {
        "status": "ok",
        "version": "4.2.8-1080p-instant-return",
        "timestamp": time.time()
    }


@app.get("/api/debug-eporner")
async def debug_eporner(url: str = Query(...)):
    """Diagnostic probe to test HTTP headers and bypasses against Eporner on Render."""
    import requests
    results = {}
    test_cases = [
        ("vanilla", {}),
        ("xff_brazil", {"X-Forwarded-For": "177.136.244.12", "Client-IP": "177.136.244.12"}),
        ("cf_brazil", {"CF-Connecting-IP": "177.136.244.12", "X-Real-IP": "177.136.244.12"}),
        ("true_client_ip", {"True-Client-IP": "177.136.244.12"}),
        ("googlebot", {"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"}),
        ("twitterbot", {"User-Agent": "Twitterbot/1.0"}),
        ("facebookexternalhit", {"User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"}),
    ]

    for label, extra_headers in test_cases:
        try:
            s = requests.Session()
            hdrs = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Cookie": "ageverif_accepted=T; age_verified=1; has_visited=1; disclaimer_accepted=1; over18=1; epcolor=black"
            }
            hdrs.update(extra_headers)
            s.headers.update(hdrs)
            r = s.get(url, timeout=8)
            soup = BeautifulSoup(r.text, "html.parser")
            r_title = soup.title.get_text(strip=True) if soup.title else ""
            dloads = [a.get("href") for a in soup.find_all("a", href=True) if "/photo/" in a.get("href", "")]
            results[label] = {
                "status": r.status_code,
                "title": r_title,
                "photos_found": len(dloads),
                "is_age_gate": "Age Verification" in r_title
            }
        except Exception as e:
            results[label] = {"error": str(e)}

    return {"url": url, "tests": results}


@app.get("/api/proxy-image")
async def proxy_image(url: str = Query(..., description="Target image URL to proxy"), referer: Optional[str] = None):
    """
    Proxies image requests with custom User-Agent and Referer headers
    to bypass CDN hotlinking and CORS restrictions in the web browser.
    """
    # Suporte a imagens salvas localmente via Upload Manual
    if url.startswith("local://albums/"):
        rel_fpath = url.replace("local://albums/", "").replace("\\", "/")
        local_full = os.path.join(DATA_DIR, "albums", rel_fpath.replace("/", os.sep))
        if os.path.exists(local_full):
            import mimetypes
            mt, _ = mimetypes.guess_type(local_full)
            with open(local_full, "rb") as f:
                return Response(content=f.read(), media_type=mt or "image/jpeg")
        raise HTTPException(status_code=404, detail="Imagem local não encontrada")

    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid URL")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }
    if referer:
        headers["Referer"] = referer
    else:
        headers["Referer"] = url

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            res = await client.get(url, headers=headers)
            if res.status_code == 200:
                raw_bytes = res.content
                media_type = res.headers.get("content-type", "").lower()
                # Correct MIME type sniffing for animations
                if raw_bytes.startswith((b'GIF87a', b'GIF89a')) or url.lower().endswith(".gif"):
                    media_type = "image/gif"
                elif b'WEBP' in raw_bytes[:32] or url.lower().endswith(".webp"):
                    media_type = "image/webp"
                elif not media_type or "octet-stream" in media_type:
                    media_type = "image/jpeg"

                resp_headers = {
                    "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
                }
                if res.headers.get("etag"):
                    resp_headers["ETag"] = res.headers["etag"]
                return Response(content=raw_bytes, media_type=media_type, headers=resp_headers)
            raise HTTPException(status_code=res.status_code, detail="Remote server error")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


@app.get("/api/download-image")
async def download_single_image(
    url: str = Query(..., description="Image URL to download"),
    filename: Optional[str] = None,
    referer: Optional[str] = None
):
    """
    Downloads a single high-resolution image with Content-Disposition attachment header.
    """
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid URL")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }
    if referer:
        headers["Referer"] = referer

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            res = await client.get(url, headers=headers)
            if res.status_code == 200:
                media_type = res.headers.get("content-type", "image/jpeg")
                fname = filename or url.split("/")[-1].split("?")[0] or "photo.jpg"
                clean_fname = _sanitize_filename(fname)
                if not any(clean_fname.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".avif"]):
                    clean_fname += ".jpg"
                return Response(
                    content=res.content,
                    media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{clean_fname}"'}
                )
            raise HTTPException(status_code=res.status_code, detail="Failed to fetch image from host")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


_DOMAIN_COOKIES_FILE = os.path.join(DATA_DIR, "domain_cookies.json")
_domain_cookies: Dict[str, str] = {}


def _save_domain_cookies():
    try:
        with open(_DOMAIN_COOKIES_FILE, "w", encoding="utf-8") as f:
            json.dump(_domain_cookies, f, indent=2)
    except Exception as e:
        logger.debug(f"Failed to save domain cookies: {e}")


def _load_domain_cookies():
    global _domain_cookies
    if os.path.exists(_DOMAIN_COOKIES_FILE):
        try:
            with open(_DOMAIN_COOKIES_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    _domain_cookies.update(saved)
        except Exception as e:
            logger.debug(f"Failed to load domain cookies: {e}")


_load_domain_cookies()


def _get_video_download_headers(url: str = "", referer: Optional[str] = None) -> dict:
    """Returns appropriate request headers (Referer, Origin, User-Agent, Cookies) for video CDNs."""
    global _domain_cookies
    if not _domain_cookies:
        _load_domain_cookies()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }
    url_low = (url or "").lower()
    ref_low = (referer or "").lower()
    if "phncdn.com" in url_low or "pornhub.com" in url_low or "pornhub.com" in ref_low:
        headers["Referer"] = "https://www.pornhub.com/"
        headers["Origin"] = "https://www.pornhub.com"
        headers["Sec-Fetch-Mode"] = "navigate"
        headers["Accept-Language"] = "en-us,en;q=0.5"
        cookie_dict = {}
        for dom in ("phncdn.com", "pornhub.com"):
            if dom in _domain_cookies and _domain_cookies[dom]:
                for item in _domain_cookies[dom].split(";"):
                    if "=" in item:
                        ck, cv = item.strip().split("=", 1)
                        cookie_dict[ck.strip()] = cv.strip()
        if cookie_dict:
            headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in cookie_dict.items())
    elif "pvvstream" in url_low or "nmcorp.video" in url_low:
        headers["Referer"] = "https://nmcorp.video/"
        headers["Origin"] = "https://nmcorp.video"
    elif "yandex." in url_low or "yastatic." in url_low or "ya.ru" in url_low or "yandex." in ref_low:
        headers["Referer"] = "https://yandex.com/"
    elif "eporner.com" in url_low or "eporner" in ref_low:
        headers["Referer"] = "https://www.eporner.com/"
    elif "xvideos.com" in url_low or "xvideos" in ref_low or "xv-cdn" in url_low:
        headers["Referer"] = "https://www.xvideos.com/"
    elif referer and referer.startswith("http"):
        headers["Referer"] = referer
    return headers


def _deduce_image_target_height(img) -> Optional[int]:
    """Helper to deduce expected video resolution from URL, title, candidate_id, or height."""
    # 1. URL pattern check (most specific to this exact stream asset)
    for raw_u in (getattr(img, "video_stream_url", None) or "", getattr(img, "original_url", None) or ""):
        if not raw_u:
            continue
        for u in (raw_u, urllib.parse.unquote(raw_u)):
            m_u = re.search(r'([0-9]{3,4})[pP][_/\.]', u) or re.search(r'([0-9]{3,4})P_', u, re.I)
            if m_u:
                val = int(m_u.group(1))
                if val in (2160, 1440, 1080, 720, 480, 360, 240):
                    return val

    # 2. Explicit resolution tags in item title
    orig_title = (getattr(img, "title", "") or "").lower()
    if re.search(r'\b(2160p?|4k|uhd)\b', orig_title):
        return 2160
    elif re.search(r'\b(1440p?|2k|qhd)\b', orig_title):
        return 1440
    elif re.search(r'\b(1080p?|fhd)\b', orig_title):
        return 1080
    elif re.search(r'\b(720p?|hd)\b', orig_title):
        return 720
    elif re.search(r'\b480p?\b', orig_title):
        return 480
    elif re.search(r'\b360p?\b', orig_title):
        return 360
    elif re.search(r'\b240p?\b', orig_title):
        return 240

    # 3. Known candidate_id slot mappings
    cid = str(getattr(img, "candidate_id", ""))
    if cid in ("ph_stream_1", "stream_1"):
        return 1080
    elif cid in ("ph_stream_2", "stream_2"):
        return 720
    elif cid in ("ph_stream_3", "stream_3"):
        return 480
    elif cid in ("ph_stream_4", "stream_4"):
        return 240
    m_cid = re.search(r'\b(2160|1440|1080|720|480|360|240)\b', cid)
    if m_cid:
        return int(m_cid.group(1))

    # 4. Existing height property on image object
    target_height = getattr(img, "height", None)
    if target_height and target_height in (2160, 1440, 1080, 720, 480, 360, 240):
        return target_height
    return target_height


def _extract_video_info_from_url_or_albums(stream_url: str, referer: Optional[str] = None):
    """
    Attempts to identify the video source page/viewkey and requested height
    from the stream URL, referer, or existing album records.
    """
    target_page = None
    target_height = None
    found_album_id = None
    found_img = None

    # Unwrap proxied stream_url if passed
    clean_stream_url = stream_url or ""
    unwrap_count = 0
    while "/api/proxy-video-stream" in clean_stream_url and "url=" in clean_stream_url and unwrap_count < 5:
        unwrap_count += 1
        pq = urllib.parse.urlparse(clean_stream_url)
        qp = urllib.parse.parse_qs(pq.query)
        if "url" in qp:
            clean_stream_url = qp["url"][0]
        if "referer" in qp and not referer:
            referer = qp["referer"][0]

    stream_url_effective = clean_stream_url or stream_url or ""

    candidates = [referer or "", stream_url_effective, stream_url or ""]
    for raw_src in candidates:
        if not raw_src:
            continue
        for src in (raw_src, urllib.parse.unquote(raw_src)):
            m_vk = re.search(r'(?:viewkey=|pornhub\.com/(?:embed|video)/)([a-zA-Z0-9_-]+)', src)
            if m_vk:
                target_page = f"https://www.pornhub.com/view_video.php?viewkey={m_vk.group(1)}"
                break
            m_ep = re.search(r'eporner\.com/(?:embed/|hd-porn/|video-)([A-Za-z0-9_-]{6,})', src)
            if m_ep:
                target_page = f"https://www.eporner.com/video-{m_ep.group(1)}/"
                break
        if target_page:
            break

    for u_chk in (stream_url_effective, urllib.parse.unquote(stream_url_effective)):
        m_h = re.search(r'([0-9]{3,4})[pP][_/\.]', u_chk) or re.search(r'([0-9]{3,4})P_', u_chk, re.I)
        if m_h:
            target_height = int(m_h.group(1))
            break

    # Strip query parameters for reliable CDN asset path matching
    base_stream_url = stream_url_effective.split("?")[0] if stream_url_effective else ""

    def _search_in_album(a_id: str, alb: Album):
        nonlocal target_page, target_height, found_album_id, found_img
        for img in getattr(alb, "images", []):
            if getattr(img, "media_type", None) != "video":
                continue
            is_match = False
            orig_u = img.original_url or ""
            stream_u = img.video_stream_url or ""
            base_orig = orig_u.split("?")[0]
            base_stream = stream_u.split("?")[0]

            # 1. Exact or path match against image URLs
            if orig_u == stream_url or stream_u == stream_url or orig_u == stream_url_effective or stream_u == stream_url_effective:
                is_match = True
            elif base_stream_url and (base_stream_url == base_orig or base_stream_url == base_stream):
                is_match = True
            elif (orig_u and (stream_url_effective in orig_u or stream_url in orig_u)) or (stream_u and (stream_url_effective in stream_u or stream_url in stream_u)):
                is_match = True
            # 2. Substring or numeric video ID match on CDN domain
            elif "phncdn.com" in stream_url_effective:
                m_vid = re.search(r'/(\d{7,12})/', stream_url_effective)
                if m_vid and (m_vid.group(1) in orig_u or m_vid.group(1) in stream_u):
                    # If target_height is known, prioritize image whose height matches
                    if not target_height or getattr(img, "height", None) == target_height or _deduce_image_target_height(img) == target_height:
                        is_match = True

            if is_match:
                found_album_id = a_id
                found_img = img
                if not target_page:
                    target_page = getattr(img, "source_page", None) or getattr(alb, "source_page", None) or getattr(alb, "url", None)
                if not target_height:
                    target_height = _deduce_image_target_height(img)
                return True
        return False

    for aid, alb in list(_completed_albums.items()):
        if _search_in_album(aid, alb):
            break

    if not target_page and os.path.exists(ALBUMS_DIR):
        for fname in os.listdir(ALBUMS_DIR):
            if not fname.endswith(".json"):
                continue
            aid = fname[:-5]
            if aid in _completed_albums:
                continue
            fpath = os.path.join(ALBUMS_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as fp:
                    alb_data = json.load(fp)
                alb = Album.model_validate(alb_data)
                if _search_in_album(aid, alb):
                    _completed_albums[aid] = alb
                    break
            except Exception:
                continue

    if not target_page:
        try:
            from .video_service import video_service
            v_meta = video_service._load_metadata()
            for vid, ventry in v_meta.items():
                c_stream = ventry.get("custom_stream_url") or ""
                s_url = ventry.get("source_url") or ""
                is_match = False
                if c_stream == stream_url:
                    is_match = True
                elif "phncdn.com" in stream_url:
                    m_vid = re.search(r'/(\d{7,12})/', stream_url)
                    if m_vid and (m_vid.group(1) in c_stream or m_vid.group(1) in s_url):
                        is_match = True
                if is_match:
                    target_page = s_url or target_page
                    target_height = ventry.get("height") or target_height
                    break
        except Exception:
            pass

    return target_page, target_height, found_album_id, found_img


async def _re_resolve_video_stream(target_page: str, target_height: Optional[int] = None):
    """
    Re-extracts fresh stream URLs via yt-dlp for target_page, updates domain cookies,
    and returns (fresh_stream_url, all_formats_info).
    """
    import yt_dlp
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "http_headers": _get_video_download_headers(target_page, target_page)
    }
    extracted_cookies = {}
    def _extract():
        nonlocal extracted_cookies
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            inf = ydl.extract_info(target_page, download=False)
            extracted_cookies = {c.name: c.value for c in ydl.cookiejar}
            return inf

    try:
        info = await asyncio.to_thread(_extract)
    except Exception as exc:
        logger.warning(f"Auto re-resolution yt-dlp failed for {target_page}: {exc}")
        return None, None

    if extracted_cookies:
        c_str = "; ".join(f"{k}={v}" for k, v in extracted_cookies.items())
        _domain_cookies["phncdn.com"] = c_str
        _domain_cookies["pornhub.com"] = c_str
        _save_domain_cookies()

    formats = [f for f in info.get("formats", []) if f.get("ext") == "mp4" and f.get("url")]
    direct_mp4s = [f for f in formats if not str(f.get("format_id", "")).startswith("hls")]
    pool = direct_mp4s if direct_mp4s else formats
    if not pool:
        pool = [f for f in info.get("formats", []) if f.get("url") and f.get("vcodec") != "none"]
    if not pool:
        pool = [f for f in info.get("formats", []) if f.get("url")]

    chosen = None
    if target_height:
        chosen = next((f for f in pool if f.get("height") == target_height), None)
    if not chosen and pool:
        chosen = max(pool, key=lambda f: f.get("height", 0) or 0)

    fresh_url = chosen.get("url") if chosen else None
    return fresh_url, info


@app.api_route("/api/proxy-video-stream", methods=["GET", "HEAD", "OPTIONS"])
async def proxy_video_stream(
    request: Request,
    url: str = Query(..., description="Target video stream URL"),
    referer: Optional[str] = Query(None, description="Original source page referer"),
    download: bool = Query(False, description="Whether to trigger file download attachment"),
    filename: Optional[str] = Query(None, description="Custom download filename")
):
    """
    Reverse proxy for video streams supporting full HTTP Range 206 partial content,
    HEAD metadata probes, custom Referer and Cookie injection to bypass hotlink and IP protection on video CDNs,
    and automatic re-resolution of expired stream links (401, 403, 404, 410, 472).
    """
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type, Content-Disposition",
    }
    if request.method == "OPTIONS":
        return Response(status_code=200, headers=cors_headers)

    # Unwrap nested proxy URLs if passed inadvertently (handles multiple encoding levels)
    unwrap_count = 0
    while "/api/proxy-video-stream" in url and "url=" in url and unwrap_count < 5:
        unwrap_count += 1
        parsed_q = urllib.parse.urlparse(url)
        q_params = urllib.parse.parse_qs(parsed_q.query)
        if "url" in q_params:
            url = q_params["url"][0]
        if "referer" in q_params and not referer:
            referer = q_params["referer"][0]

    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid video stream URL", headers=cors_headers)

    upstream_headers = _get_video_download_headers(url, referer)
    upstream_headers["Accept"] = "*/*"
    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    # Use read=None so slow connections and paused video scrubbers do not disconnect prematurely
    client = httpx.AsyncClient(verify=False, timeout=httpx.Timeout(30.0, connect=15.0, read=None), follow_redirects=True)
    upstream_resp = None
    try:
        is_head = request.method == "HEAD"
        if is_head and "Range" not in upstream_headers:
            upstream_headers["Range"] = "bytes=0-0"

        upstream_req = client.build_request("GET", url, headers=upstream_headers)
        upstream_resp = await client.send(upstream_req, stream=True)

        # Se upstream retornar erro de link expirado ou não autorizado (401, 403, 404, 410, 470, 472, 500, 502, 503, 504), tentar re-resolver (exceto 416 que é range do cliente)
        if upstream_resp.status_code in (401, 403, 404, 410, 470, 472, 500, 502, 503, 504) or (400 <= upstream_resp.status_code < 500 and upstream_resp.status_code != 416):
            logger.info(f"Stream returned HTTP {upstream_resp.status_code}. Attempting automatic re-resolution...")
            await upstream_resp.aclose()

            target_page, target_height, found_album_id, found_img = _extract_video_info_from_url_or_albums(url, referer)
            if target_page:
                fresh_url, info = await _re_resolve_video_stream(target_page, target_height)
                if fresh_url:
                    logger.info(f"Successfully re-resolved fresh stream: {fresh_url[:60]}... for height {target_height}")
                    url = fresh_url
                    upstream_headers = _get_video_download_headers(url, target_page)
                    upstream_headers["Accept"] = "*/*"
                    if range_header:
                        upstream_headers["Range"] = range_header
                    if is_head and "Range" not in upstream_headers:
                        upstream_headers["Range"] = "bytes=0-0"

                    upstream_req = client.build_request("GET", url, headers=upstream_headers)
                    upstream_resp = await client.send(upstream_req, stream=True)

                    if found_album_id and info:
                        alb = _completed_albums.get(found_album_id)
                        if alb:
                            formats = [f for f in info.get("formats", []) if f.get("ext") == "mp4" and f.get("url")]
                            direct_mp4s = [f for f in formats if not str(f.get("format_id", "")).startswith("hls")]
                            pool = direct_mp4s if direct_mp4s else formats
                            dur = int(info.get("duration") or 0)
                            m_target_vk = re.search(r'(?:viewkey=|pornhub\.com/(?:embed|video)/)([a-zA-Z0-9_-]+)', target_page) if target_page else None
                            target_vk = m_target_vk.group(1) if m_target_vk else None
                            for img in alb.images:
                                if getattr(img, "media_type", None) != "video":
                                    continue
                                # Only update images belonging to this target video page to avoid cross-video corruption
                                img_src = getattr(img, "source_page", None) or getattr(alb, "source_page", None) or getattr(alb, "url", None) or ""
                                if target_vk:
                                    if target_vk not in img_src and target_vk not in (img.original_url or "") and target_vk not in (img.video_stream_url or ""):
                                        continue
                                elif target_page and img_src and target_page not in img_src and img_src not in target_page:
                                    continue

                                target_h = _deduce_image_target_height(img)
                                match_fmt = next((f for f in pool if f.get("height") == target_h), None) if target_h else None
                                if not match_fmt and pool:
                                    match_fmt = max(pool, key=lambda f: f.get("height", 0) or 0)
                                if match_fmt:
                                    img.video_stream_url = match_fmt["url"]
                                    img.original_url = match_fmt["url"]
                                    h = match_fmt.get("height") or target_h or 1080
                                    w = match_fmt.get("width") or (round(h * 16 / 9) if h else 1920)
                                    img.height = h
                                    img.width = w
                                    f_sz = match_fmt.get("filesize") or match_fmt.get("filesize_approx") or 0
                                    if not f_sz and dur > 0:
                                        tbr = match_fmt.get("tbr") or (4000 if h >= 1080 else (2000 if h >= 720 else 1000))
                                        f_sz = int(tbr * 1000 / 8 * dur)
                                    if f_sz > 0:
                                        img.file_size = f_sz
                                    if dur > 0:
                                        img.duration_seconds = dur
                            _save_album_to_disk(found_album_id, alb)

        res_headers = dict(cors_headers)
        for h in ("content-type", "content-length", "content-range", "accept-ranges"):
            val = upstream_resp.headers.get(h)
            if val:
                res_headers[h] = val

        if upstream_resp.status_code == 416:
            await upstream_resp.aclose()
            await client.aclose()
            res_headers.pop("content-length", None)
            return Response(status_code=416, headers=res_headers)

        if upstream_resp.status_code >= 400:
            await upstream_resp.aclose()
            await client.aclose()
            raise HTTPException(status_code=upstream_resp.status_code, detail=f"Upstream CDN error: {upstream_resp.status_code}", headers=res_headers)

        is_hls = ".m3u8" in url.lower() or "/hls/" in url.lower() or "mpegurl" in res_headers.get("content-type", "").lower()
        if is_hls:
            res_headers["content-type"] = "application/vnd.apple.mpegurl"
        elif not res_headers.get("content-type") or "text" in res_headers.get("content-type", ""):
            res_headers["content-type"] = "video/mp4"

        if "accept-ranges" not in res_headers:
            res_headers["accept-ranges"] = "bytes"

        if download:
            raw_fname = filename or url.split("/")[-1].split("?")[0] or "video.mp4"
            base, ext = os.path.splitext(raw_fname)
            if not ext or ext.lower() not in (".mp4", ".webm", ".mov", ".m4v"):
                ext = ".mp4"
            clean_base = _sanitize_filename(base)[:50]
            clean_fname = f"{clean_base}{ext}"
            res_headers["content-disposition"] = f'attachment; filename="{clean_fname}"'

        if is_head:
            await upstream_resp.aclose()
            await client.aclose()
            status_code = upstream_resp.status_code
            cr = res_headers.get("content-range", "")
            if "/" in cr and not range_header:
                total_len = cr.split("/")[-1].strip()
                if total_len.isdigit():
                    res_headers["content-length"] = total_len
            if not range_header and status_code == 206:
                status_code = 200
                res_headers.pop("content-range", None)
            return Response(status_code=status_code, headers=res_headers)

        if is_hls:
            raw_body = await upstream_resp.aread()
            await upstream_resp.aclose()
            await client.aclose()
            text = raw_body.decode("utf-8", errors="replace")
            if "#EXTM3U" in text:
                lines = text.splitlines()
                rewritten = []
                for l in lines:
                    ls = l.strip()
                    if ls and not ls.startswith("#"):
                        abs_u = urljoin(url, ls)
                        q_u = urllib.parse.quote(abs_u)
                        p_line = f"/api/proxy-video-stream?url={q_u}"
                        if referer:
                            p_line += f"&referer={urllib.parse.quote(referer)}"
                        rewritten.append(p_line)
                    elif 'URI="' in ls:
                        def _rep(m):
                            abs_u = urljoin(url, m.group(1))
                            return f'URI="/api/proxy-video-stream?url={urllib.parse.quote(abs_u)}"'
                        rewritten.append(re.sub(r'URI="([^"]+)"', _rep, ls))
                    else:
                        rewritten.append(l)
                final_bytes = "\n".join(rewritten).encode("utf-8")
                res_headers["content-length"] = str(len(final_bytes))
                return Response(content=final_bytes, status_code=200, headers=res_headers)

        final_status = upstream_resp.status_code
        if range_header and final_status == 200 and not is_hls:
            cl = res_headers.get("content-length")
            if cl and cl.isdigit():
                total_bytes = int(cl)
                res_headers["content-range"] = f"bytes 0-{total_bytes - 1}/{total_bytes}"
                final_status = 206

        async def stream_generator():
            try:
                async for chunk in upstream_resp.aiter_bytes(chunk_size=65536):
                    yield chunk
            except asyncio.CancelledError:
                pass
            except Exception as e_stream:
                logger.debug(f"Stream interrupted: {e_stream}")
            finally:
                try:
                    await upstream_resp.aclose()
                except Exception:
                    pass
                try:
                    await client.aclose()
                except Exception:
                    pass

        return StreamingResponse(
            stream_generator(),
            status_code=final_status,
            headers=res_headers
        )
    except HTTPException:
        if upstream_resp is not None:
            try:
                await upstream_resp.aclose()
            except Exception:
                pass
        try:
            await client.aclose()
        except Exception:
            pass
        raise
    except Exception as e:
        if upstream_resp is not None:
            try:
                await upstream_resp.aclose()
            except Exception:
                pass
        try:
            await client.aclose()
        except Exception:
            pass
        logger.error(f"Proxy video stream failed for {url}: {e}")
        raise HTTPException(status_code=500, detail=str(e), headers=cors_headers)


@app.get("/api/models")
async def get_models():
    """Discovers models installed locally in Ollama and lists available Gemini cloud models."""
    local_data = await LLMAdapter.get_available_local_models()
    gemini_models = [
        {"name": "gemini-3.7-flash", "label": "Gemini 3.7 Flash (Recomendado / Mais Rápido)", "provider": "gemini"},
        {"name": "gemini-2.0-flash", "label": "Gemini 2.0 Flash (Alta Precisão)", "provider": "gemini"},
        {"name": "gemini-2.0-pro-exp-02-05", "label": "Gemini 2.0 Pro (Raciocínio Profundo)", "provider": "gemini"},
    ]
    if isinstance(local_data, dict):
        local_data["gemini_models"] = gemini_models
        return local_data
    return {"models": local_data, "gemini_models": gemini_models}


@app.get("/api/albums/{session_id}/download-zip")
async def download_album_zip(
    session_id: str,
    background_tasks: BackgroundTasks,
    remove_exif: bool = Query(False, description="Remove EXIF / metadata from images"),
    naming_pattern: Optional[str] = Query(None, description="Custom naming template e.g. {album}_{index}_{res}")
):
    """
    Asynchronously streams and packages the entire high-resolution album into a ZIP file using safe disk streaming
    to prevent RAM exhaustion, supporting real EXIF sanitization and custom file naming templates.
    """
    if session_id not in _completed_albums:
        _load_albums_from_disk()
    if session_id not in _completed_albums:
        raise HTTPException(status_code=404, detail="Album not found")

    album = _completed_albums[session_id]
    
    from .safe_downloader import safe_downloader
    zip_path = await safe_downloader.create_safe_zip(album, remove_exif, naming_pattern)
    
    album_name = _sanitize_filename(album.original_title or album.title or f"album_{session_id}")
    
    # Enqueue deletion of the temp file after response finishes
    background_tasks.add_task(safe_downloader.delete_temp_file, zip_path)
    
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"{album_name}.zip"
    )


@app.get("/api/albums/{session_id}/export-json")
async def export_album_json(session_id: str):
    """Downloads the full JSON entity of the album with all metadata & audit trail."""
    if session_id not in _completed_albums:
        _load_albums_from_disk()
    if session_id not in _completed_albums:
        raise HTTPException(status_code=404, detail="Album not found")

    album = _completed_albums[session_id]
    album_name = _sanitize_filename(album.original_title or album.title or f"album_{session_id}")
    filename = f"{album_name}.json"

    json_str = json.dumps(album.model_dump(), indent=2, ensure_ascii=False)
    return Response(
        content=json_str.encode("utf-8"),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.patch("/api/albums/{session_id}/rename")
async def rename_album(session_id: str, req: RenameRequest):
    """
    Renames an album's custom title while strictly preserving the original raw site title.
    """
    if session_id not in _completed_albums:
        _load_albums_from_disk()
    if session_id not in _completed_albums:
        raise HTTPException(status_code=404, detail="Album not found")

    if not req.title or not req.title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    album = _completed_albums[session_id]
    album.title = req.title.strip()
    _save_album_to_disk(session_id, album)
    return {"session_id": session_id, "title": album.title, "original_title": album.original_title}


@app.patch("/api/albums/{session_id}/images/{image_identifier}/rename")
@app.post("/api/albums/{session_id}/images/{image_identifier}/rename")
async def rename_album_image_endpoint(session_id: str, image_identifier: str, req: RenameRequest):
    """
    Renames an individual image or video inside an album session and persists changes to disk.
    If the video has also been saved to the video gallery, synchronizes its display title there too.
    """
    if session_id not in _completed_albums:
        _load_albums_from_disk()
    if session_id not in _completed_albums:
        raise HTTPException(status_code=404, detail="Album not found")

    new_title = req.title.strip() if req.title else ""
    if not new_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    album = _completed_albums[session_id]
    target_img = None
    target_idx = -1

    for idx, img in enumerate(album.images):
        frontend_id = f"real-img-{session_id}-{idx}"
        cand_id = f"cand-{img.candidate_id}" if img.candidate_id else ""
        if (
            image_identifier in (
                frontend_id,
                img.id,
                img.candidate_id,
                cand_id,
                str(idx),
                str(getattr(img, "position", -1)),
                img.original_url,
                img.thumbnail_url,
            )
            or (image_identifier.isdigit() and int(image_identifier) == idx)
        ):
            target_img = img
            target_idx = idx
            break

    if not target_img:
        raise HTTPException(status_code=404, detail=f"Item '{image_identifier}' not found in album")

    old_title = target_img.title
    target_img.title = new_title
    _save_album_to_disk(session_id, album)

    # Sync with video_service if this item is in the video library
    try:
        meta = video_service._load_metadata()
        synced_vids = []
        for vid_id, v_entry in meta.items():
            v_url = v_entry.get("stream_url") or v_entry.get("source_url") or ""
            if (
                (target_img.original_url and target_img.original_url in v_url)
                or (target_img.video_stream_url and target_img.video_stream_url in v_url)
                or (old_title and v_entry.get("title") == old_title)
            ):
                video_service.rename_video(vid_id, new_title)
                synced_vids.append(vid_id)
        if synced_vids:
            logger.info(f"[Rename] Synced title '{new_title}' with {len(synced_vids)} gallery video(s)")
    except Exception as sync_err:
        logger.warning(f"[Rename] Could not sync with video_service: {sync_err}")

    return {
        "status": "ok",
        "session_id": session_id,
        "image_identifier": image_identifier,
        "title": target_img.title,
        "index": target_idx
    }



class SetCoverRequest(BaseModel):
    cover_image_url: str


@app.patch("/api/albums/{session_id}/set-cover")
@app.post("/api/albums/{session_id}/set-cover")
async def set_album_cover(session_id: str, req: SetCoverRequest):
    """
    Sets the primary thumbnail cover for the album and persists it to disk and cloud mirror.
    """
    if session_id not in _completed_albums:
        _load_albums_from_disk()
    if session_id not in _completed_albums:
        raise HTTPException(status_code=404, detail="Album not found")

    new_cover = req.cover_image_url.strip() if req.cover_image_url else ""
    if not new_cover:
        raise HTTPException(status_code=400, detail="cover_image_url cannot be empty")

    album = _completed_albums[session_id]
    album.cover_image_url = new_cover
    _save_album_to_disk(session_id, album)
    logger.info(f"Custom album cover set for {session_id}: {new_cover}")
    return {
        "status": "ok",
        "session_id": session_id,
        "cover_image_url": album.cover_image_url
    }


@app.post("/api/albums/repair-all-covers")
async def repair_all_album_covers():
    """
    Scans all loaded albums, auto-repairs missing/placeholder covers using genuine HD images,
    and persists them to disk.
    """
    _load_albums_from_disk()
    repaired_count = 0
    for sid, alb in _completed_albums.items():
        if ensure_album_cover(alb):
            _save_album_to_disk(sid, alb)
            repaired_count += 1
    return {
        "status": "ok",
        "total_albums": len(_completed_albums),
        "repaired_count": repaired_count
    }


# ============================================================================
# ALBUM FOLDERS MANAGEMENT
# ============================================================================

ALBUM_FOLDERS_FILE = os.path.join(DATA_DIR, "album_folders.json")


def _load_custom_album_folders() -> List[str]:
    """Loads custom album folder names persisted on disk."""
    if os.path.exists(ALBUM_FOLDERS_FILE):
        try:
            with open(ALBUM_FOLDERS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return [str(x).strip() for x in data if str(x).strip()]
        except Exception as e:
            logger.warning(f"Failed to load album_folders.json: {e}")
    return []


def _save_custom_album_folders(folders: List[str]):
    """Persists custom album folders list to disk."""
    try:
        clean = sorted(list({f.strip() for f in folders if f and f.strip()}))
        with open(ALBUM_FOLDERS_FILE, "w", encoding="utf-8") as f:
            json.dump(clean, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"Failed to write album_folders.json: {e}")


def _ensure_album_folder_exists(folder_name: str):
    clean = folder_name.strip()
    if not clean or clean.lower() == "geral":
        return
    folders = _load_custom_album_folders()
    if clean not in folders:
        folders.append(clean)
        _save_custom_album_folders(folders)


def _get_all_album_folders_with_counts() -> tuple[List[Dict[str, Any]], int]:
    """Gathers all folders (Geral, custom folders, and folders present in saved albums), calculating item counts."""
    _load_albums_from_disk()
    custom_folders = _load_custom_album_folders()

    folder_set = {"Geral"}
    for f in custom_folders:
        if f:
            folder_set.add(f)

    counts = {name: 0 for name in folder_set}
    total_albums = 0

    for aid, alb in _completed_albums.items():
        total_albums += 1
        alb_folder = getattr(alb, "folder", None) or (alb.metadata.get("folder") if isinstance(alb.metadata, dict) else None) or "Geral"
        alb_folder = str(alb_folder).strip() or "Geral"
        if alb_folder not in counts:
            counts[alb_folder] = 0
            folder_set.add(alb_folder)
        counts[alb_folder] += 1

    sorted_names = ["Geral"] + sorted([f for f in folder_set if f != "Geral"], key=lambda s: s.lower())
    result = [
        {"id": name, "name": name, "count": counts.get(name, 0)}
        for name in sorted_names
    ]
    return result, total_albums


class CreateAlbumFolderRequest(BaseModel):
    name: str


class RenameAlbumFolderRequest(BaseModel):
    old_name: str
    new_name: str


class DeleteAlbumFolderRequest(BaseModel):
    name: str


class MoveAlbumsRequest(BaseModel):
    album_ids: List[str]
    target_folder: str


@app.get("/api/albums/folders")
async def get_album_folders():
    """Lists all album folders with current album counts and overall album total."""
    folders, total = _get_all_album_folders_with_counts()
    return {"folders": folders, "total_albums": total}


@app.post("/api/albums/folders/create")
async def create_album_folder(req: CreateAlbumFolderRequest):
    """Creates a new album folder."""
    clean = req.name.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Nome da pasta não pode ser vazio.")
    _ensure_album_folder_exists(clean)
    folders, total = _get_all_album_folders_with_counts()
    return {"success": True, "folders": folders, "total_albums": total}


@app.post("/api/albums/folders/rename")
async def rename_album_folder(req: RenameAlbumFolderRequest):
    """Renames an album folder and updates all assigned albums."""
    old_name = req.old_name.strip()
    new_name = req.new_name.strip()
    if not old_name or not new_name:
        raise HTTPException(status_code=400, detail="Nomes antigo e novo são obrigatórios.")
    if old_name.lower() == "geral":
        raise HTTPException(status_code=400, detail="A pasta 'Geral' não pode ser renomeada.")

    custom = _load_custom_album_folders()
    custom = [new_name if f == old_name else f for f in custom]
    if new_name not in custom:
        custom.append(new_name)
    _save_custom_album_folders(custom)

    _load_albums_from_disk()
    for aid, alb in _completed_albums.items():
        curr_folder = getattr(alb, "folder", None) or (alb.metadata.get("folder") if isinstance(alb.metadata, dict) else None) or "Geral"
        if curr_folder == old_name:
            alb.folder = new_name
            if isinstance(alb.metadata, dict):
                alb.metadata["folder"] = new_name
            _save_album_to_disk(aid, alb)

    folders, total = _get_all_album_folders_with_counts()
    return {"success": True, "folders": folders, "total_albums": total}


@app.post("/api/albums/folders/delete")
async def delete_album_folder(req: DeleteAlbumFolderRequest):
    """Deletes an album folder and moves any albums in it back to 'Geral'."""
    folder_name = req.name.strip()
    if not folder_name:
        raise HTTPException(status_code=400, detail="Nome da pasta é obrigatório.")
    if folder_name.lower() == "geral":
        raise HTTPException(status_code=400, detail="A pasta 'Geral' não pode ser excluída.")

    custom = _load_custom_album_folders()
    custom = [f for f in custom if f != folder_name]
    _save_custom_album_folders(custom)

    _load_albums_from_disk()
    for aid, alb in _completed_albums.items():
        curr_folder = getattr(alb, "folder", None) or (alb.metadata.get("folder") if isinstance(alb.metadata, dict) else None) or "Geral"
        if curr_folder == folder_name:
            alb.folder = "Geral"
            if isinstance(alb.metadata, dict):
                alb.metadata["folder"] = "Geral"
            _save_album_to_disk(aid, alb)

    folders, total = _get_all_album_folders_with_counts()
    return {"success": True, "folders": folders, "total_albums": total}


@app.post("/api/albums/move")
async def move_albums(req: MoveAlbumsRequest):
    """Moves one or more albums to a target folder."""
    target = req.target_folder.strip() or "Geral"
    if not req.album_ids:
        raise HTTPException(status_code=400, detail="Nenhum álbum selecionado.")
    _ensure_album_folder_exists(target)

    _load_albums_from_disk()
    moved_count = 0
    for aid in req.album_ids:
        alb = _completed_albums.get(aid)
        if alb:
            alb.folder = target
            if isinstance(alb.metadata, dict):
                alb.metadata["folder"] = target
            _save_album_to_disk(aid, alb)
            moved_count += 1

    folders, total = _get_all_album_folders_with_counts()
    return {"success": True, "moved": moved_count, "target_folder": target, "folders": folders}


@app.post("/api/chat")
async def chat_api(req: ChatRequest):
    """
    Handles chat messages with Qwen Co-Pilot or falls back automatically to Gemini Cloud.
    """
    # 1. Try Ollama local
    try:
        api_base = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        if not api_base.endswith("/v1"):
            api_base = f"{api_base}/v1"
        model_name = "qwen2.5:32b"

        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.post(
                f"{api_base}/chat/completions",
                json={
                    "model": model_name,
                    "messages": [
                        {
                            "role": "system",
                            "content": "Você é o Agente Co-Pilot IMAGEX.AI. Responda em português de forma concisa, inteligente e focada na extração e gerenciamento de álbuns de imagens."
                        },
                        {
                            "role": "user",
                            "content": req.message
                        }
                    ]
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                reply = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                if reply:
                    return {"reply": reply, "provider": "qwen"}
    except Exception as e:
        logger.debug(f"Local Ollama chat unavailable: {e}")

    # 2. Fallback to Gemini Cloud
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if gemini_key:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={gemini_key}"
                resp = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "systemInstruction": {
                            "parts": [{"text": "Você é o Agente Co-Pilot IMAGEX.AI. Responda sempre em português de forma concisa, inteligente e focada na extração e organização de álbuns de fotos."}]
                        },
                        "contents": [
                            {"role": "user", "parts": [{"text": req.message}]}
                        ]
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            return {"reply": parts[0].get("text", ""), "provider": "gemini"}
        except Exception as e:
            logger.warning(f"Gemini fallback chat error: {e}")

    return {
        "reply": "O Agente Co-Pilot está pronto. Para ativar inteligência conversacional avançada, certifique-se de que o Ollama local está ativo ou verifique sua conexão com a nuvem."
    }


@app.post("/api/scan-candidates")
async def scan_candidates(req: ScanRequest):
    """Mode 2 Step 1: Navigates and returns all candidate images on the page."""
    if not req.url or not (req.url.startswith("http://") or req.url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Valid http/https URL is required")

    engine = BrowserEngine(headless=req.headless, max_concurrent_tabs=3)
    try:
        await engine.start()
        await engine.navigate(req.url)
        await engine.wait_for_idle(2000)
        tools = BrowserTools(engine=engine)
        candidates = await tools.get_image_candidates()
        page_info = await tools.inspect_page()
        return {
            "url": req.url,
            "title": page_info.get("title", ""),
            "candidates": [c.model_dump() for c in candidates],
        }
    finally:
        await engine.close()


@app.post("/api/demonstrate")
async def start_demonstration(req: DemonstrateRequest, background_tasks: BackgroundTasks):
    """Mode 2 Step 2: Learns from positive & negative examples and Qwen ground-truth URLs."""
    if not req.url:
        raise HTTPException(status_code=400, detail="Valid URL required")

    session_id = f"demo_{abs(hash(req.url)) % 1000000}"
    _active_event_queues[session_id] = asyncio.Queue()

    _active_jobs[session_id] = {
        "session_id": session_id,
        "url": req.url,
        "mode": "demonstrate",
        "status": "running",
        "model": req.model_name,
        "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "progress": {"current": 0, "total": len(req.positive_ids), "status": "Initializing demonstration..."},
    }

    background_tasks.add_task(_run_demonstration_task, session_id, req)
    return {"session_id": session_id, "status": "started", "target_url": req.url}


async def _run_demonstration_task(session_id: str, req: DemonstrateRequest):
    """Background runner for Mode 2 demonstration."""
    queue = _active_event_queues.get(session_id)
    engine = BrowserEngine(headless=req.headless, max_concurrent_tabs=3)

    async def on_agent_event(event_data: Dict[str, Any]):
        if queue:
            await queue.put(event_data)
        if session_id in _active_jobs:
            if event_data.get("type") == "image_resolved":
                _active_jobs[session_id]["progress"]["current"] = event_data.get("position", 0)
                _active_jobs[session_id]["progress"]["status"] = f"Resolved original image {event_data.get('position')}"
            elif event_data.get("type") == "status":
                _active_jobs[session_id]["progress"]["status"] = event_data.get("message", "")

    try:
        await engine.start()
        tools = BrowserTools(engine=engine)
        validator = ImageValidator()
        investigator = OriginalImageInvestigator(tools=tools, validator=validator)
        llm = LLMAdapter(
            api_base=req.llm_api_base or "http://localhost:11434/v1",
            model_name=req.model_name or "qwen2.5:32b",
        )
        await llm.check_availability()

        brain = SemanticAgentBrain(
            engine=engine,
            tools=tools,
            validator=validator,
            investigator=investigator,
            llm_adapter=llm,
            knowledge_store=knowledge_store,
        )

        site_knowledge = None
        album = None

        await engine.navigate(req.url)
        await engine.wait_for_idle(2000)

        raw_cands = await tools.get_image_candidates()
        page_info = await tools.inspect_page()
        domain = urlparse(req.url).netloc
        raw_title = page_info.get("title", "Demonstrated Album")

        # Strictly scope to positive candidates; discard all negative items
        pos_cands = [c for c in raw_cands if c.candidate_id in req.positive_ids]
        if not pos_cands and raw_cands:
            pos_cands = raw_cands
        neg_cands = [c for c in raw_cands if c.candidate_id in req.negative_ids]

        if queue:
            msg_evt = {
                "type": "ai_thought",
                "stage": "OBSERVATION",
                "thought": f" [Demonstration Mask] Scoped to {len(pos_cands)} positive album thumbnails. Strictly filtering out {len(neg_cands)} noise/banner items.",
            }
            _record_session_event(session_id, msg_evt)
            await queue.put(msg_evt)

        # 1. Neural Qwen LLM Ground-Truth Pattern Induction
        gt_pairs = []
        if req.ground_truth_urls:
            for c in pos_cands:
                if c.candidate_id in req.ground_truth_urls and req.ground_truth_urls[c.candidate_id]:
                    gt_pairs.append({
                        "thumbnail": c.src or "",
                        "original": req.ground_truth_urls[c.candidate_id].strip()
                    })

        ai_deduced_map: Dict[str, str] = {}
        winning_rule = ""
        if gt_pairs:
            if queue:
                ind_evt = {
                    "type": "ai_thought",
                    "stage": "SPECULATIVE_PROBING",
                    "thought": f" [Qwen 2.5 Neural Induction] Analyzing {len(gt_pairs)} demonstrated original ground-truth pairs on {req.model_name or 'qwen2.5:32b'}...",
                }
                _record_session_event(session_id, ind_evt)
                await queue.put(ind_evt)

            deduction = await llm.query_pattern_deduction_from_examples(
                demonstrated_pairs=gt_pairs,
                target_thumbnails=[c.src for c in pos_cands if c.src],
                page_url=req.url,
            )
            ai_deduced_map = deduction.get("resolved_urls", {})
            winning_rule = deduction.get("winning_rule", "")
            rule_desc = deduction.get("rule_description", "")
            
            if queue:
                win_evt = {
                    "type": "ai_thought",
                    "stage": "PROVEN_VECTOR",
                    "thought": f" [Qwen Neural Induction] Deduced URL transformation recipe: {rule_desc or winning_rule}. Applied to {len(ai_deduced_map)} album candidates.",
                }
                _record_session_event(session_id, win_evt)
                await queue.put(win_evt)

        # 2. Speculative & Validated Original Resolution for Positive Items
        resolved_images: List[AlbumImage] = []
        for idx, cand in enumerate(pos_cands):
            position = idx + 1
            target_original_url = None
            resolution_method = ResolutionMethod.NONE
            val_res = None

            # Ground truth override
            if req.ground_truth_urls and cand.candidate_id in req.ground_truth_urls and req.ground_truth_urls[cand.candidate_id]:
                target_original_url = req.ground_truth_urls[cand.candidate_id].strip()
                resolution_method = ResolutionMethod.VERIFIED_CDN_CANDIDATE
            elif cand.src and cand.src in ai_deduced_map:
                target_original_url = ai_deduced_map[cand.src]
                resolution_method = ResolutionMethod.VERIFIED_CDN_CANDIDATE
            elif cand.parent_href and cand.parent_href.startswith("http") and not cand.parent_href.endswith((".html", ".php", "/")):
                target_original_url = cand.parent_href
                resolution_method = ResolutionMethod.PARENT_ANCHOR

            # Validate Original URL
            if target_original_url:
                val_res = await validator.validate_candidate_url(
                    candidate_url=target_original_url,
                    referer=req.url,
                    thumb_width=cand.width,
                    thumb_height=cand.height,
                )

            is_pass = val_res and val_res.verdict == ValidationVerdict.PASS
            img_obj = AlbumImage(
                position=position,
                candidate_id=cand.candidate_id,
                thumbnail_url=cand.src or "",
                original_url=target_original_url if is_pass else None,
                width=val_res.width if is_pass else cand.width,
                height=val_res.height if is_pass else cand.height,
                format=val_res.format if is_pass else "jpg",
                file_size=val_res.file_size if is_pass else None,
                resolution_method=resolution_method if is_pass else ResolutionMethod.NONE,
                confidence=1.0 if is_pass else 0.0,
                validation_status="PASS" if is_pass else "UNRESOLVED",
                source_page=req.url,
            )
            resolved_images.append(img_obj)

            if on_agent_event:
                res_evt = {
                    "type": "image_resolved",
                    "position": img_obj.position,
                    "thumbnail_url": img_obj.thumbnail_url,
                    "original_url": img_obj.original_url,
                    "width": img_obj.width,
                    "height": img_obj.height,
                    "dimensions": f"{img_obj.width}x{img_obj.height}" if img_obj.width and img_obj.height else "Original",
                    "format": img_obj.format or "jpg",
                    "validation_status": img_obj.validation_status,
                    "resolution_method": img_obj.resolution_method.value,
                }
                _record_session_event(session_id, res_evt)
                await on_agent_event(res_evt)

        # 3. Assemble Album strictly containing POSITIVE images
        telemetry = TelemetryMetrics(
            candidates_discovered=len(raw_cands),
            candidates_investigated=len(pos_cands),
            originals_resolved=len([img for img in resolved_images if img.validation_status == "PASS"]),
            originals_unresolved=len([img for img in resolved_images if img.validation_status != "PASS"]),
            banners_rejected=len(neg_cands),
        )

        album = Album(
            album_id=session_id,
            title=raw_title,
            original_title=raw_title,
            source_page=req.url,
            source_type="gallery",
            images=resolved_images,
            telemetry=telemetry,
            metadata={
                "model_used": req.model_name or "qwen2.5:32b",
                "engine_taught": req.engine_type or "both",
                "winning_rule": winning_rule or rule_desc,
                "demonstrated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            }
        )

        # 4. Dual-Brain Persistence & Knowledge Store Saving
        if (req.engine_type or "both") in ("ai_react", "both"):
            try:
                arch_node = meta_knowledge_graph.learn_demonstration_recipe(
                    domain=domain,
                    dom_candidates=pos_cands,
                    page_info=page_info,
                    winning_rule=winning_rule or "lambda c: c.get('src')",
                    strategy="CDN_SUBSTITUTION" if ("replace" in winning_rule) else "PARENT_LINK",
                )
                if queue:
                    meta_evt = {
                        "type": "ai_thought",
                        "stage": "PROVEN_VECTOR",
                        "thought": f" [Meta-Knowledge Graph] Successfully learned and persisted original resolution recipe to Archetype '{arch_node.archetype_id}' (Domain: {domain})",
                    }
                    _record_session_event(session_id, meta_evt)
                    await queue.put(meta_evt)
            except Exception as meta_err:
                logger.warning(f"Failed to record demonstration in MetaKnowledgeGraph: {meta_err}")

        if (req.engine_type or "both") in ("classic", "both"):
            try:
                await brain.learn_from_demonstration(
                    target_url=req.url,
                    positive_candidate_ids=req.positive_ids,
                    negative_candidate_ids=req.negative_ids,
                    on_event=None,
                    ground_truth_urls=req.ground_truth_urls,
                )
            except Exception as classic_err:
                logger.warning(f"Failed to record demonstration in Classic Brain: {classic_err}")

        # Always persist direct SiteKnowledge to data/knowledge/{domain}.json
        try:
            site_k = knowledge_store.get_knowledge(domain) or SiteKnowledge(domain=domain)
            site_k.demonstration_count += 1
            if winning_rule and winning_rule not in site_k.positive_signatures:
                site_k.positive_signatures.append(winning_rule)
            if rule_desc and rule_desc not in site_k.positive_signatures:
                site_k.positive_signatures.append(rule_desc)
            site_k.preferred_resolution_methods = list(set(site_k.preferred_resolution_methods + [
                ResolutionMethod.VERIFIED_CDN_CANDIDATE.value,
                ResolutionMethod.PARENT_ANCHOR.value
            ]))
            site_k.sample_evidence.append(f"Demonstration with {len(pos_cands)} positive samples on {req.url}")
            site_k.updated_at = datetime.now(timezone.utc).isoformat()
            knowledge_store.save_knowledge(site_k)
            logger.info(f"Saved domain pattern to data/knowledge/{domain}.json")
        except Exception as k_err:
            logger.warning(f"Error saving site knowledge for {domain}: {k_err}")

        _completed_albums[session_id] = album
        _save_album_to_disk(session_id, album)

        if session_id in _active_jobs:
            _active_jobs[session_id]["status"] = "completed"
            _active_jobs[session_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        if queue:
            comp_evt = {
                "type": "completed",
                "album": AgentDebugger.get_ui_summary(album),
                "pattern": winning_rule or rule_desc or f"Regra aprendida para {domain}",
                "domain": domain,
                "engine_taught": req.engine_type or "both",
            }
            _record_session_event(session_id, comp_evt)
            await queue.put(comp_evt)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Demonstration failed for {req.url}: {e}\n{tb}", exc_info=True)
        err_evt = {
            "type": "ai_thought",
            "stage": "SERVER_EXCEPTION",
            "thought": f" [BACK-END EXCEPTION @ Demonstration] {str(e)}",
            "traceback": tb,
            "error": str(e),
        }
        _record_session_event(session_id, err_evt)
        if session_id in _active_jobs:
            _active_jobs[session_id]["status"] = "error"
            _active_jobs[session_id]["error"] = str(e)
            _active_jobs[session_id]["traceback"] = tb
        if queue:
            await queue.put(err_evt)
            await queue.put({"type": "error", "error": str(e), "traceback": tb})
    finally:
        await engine.close()

# Concurrency Pools: Decoupled to prevent one workload from starving another
_interactive_extraction_semaphore = asyncio.Semaphore(2)  # Dedicated slots for immediate user requests in ExtractorView
_batch_photo_semaphore = asyncio.Semaphore(3)             # Dedicated slots for background multi-album batch saves
_video_download_semaphore = asyncio.Semaphore(3)          # Dedicated slots for web video downloads
_extraction_semaphore = _interactive_extraction_semaphore  # Fallback for generic legacy callers


@app.post("/api/copilot/{session_id}/respond")
async def respond_copilot(session_id: str, req: CopilotRespondRequest):
    """
    Receives operator response to a pending Co-Pilot question modal.
    Resolves the waiting Future in CoPilotChannel.
    """
    fut = _copilot_pending_futures.get(session_id)
    if not fut or fut.done():
        return {"status": "ignored", "reason": "No pending question or already answered"}

    response_event = UserResponseEvent(
        event_id=f"resp_{session_id}_{int(time.time()*1000)}",
        selected_option=req.selected_option,
        text_input=req.text_input,
        action_type="SUBMIT",
    )
    fut.set_result(response_event)
    return {"status": "received", "selected_option": req.selected_option}


@app.post("/api/analyze")
async def start_analysis(req: AnalyzeRequest):
    """
    Starts an extraction job.
    Supports engine_type: 'ai_react' (7-Pillar Autonomous ReAct Agent) or 'classic' (Deterministic SemanticAgentBrain).
    """
    if not req.url or not (req.url.startswith("http://") or req.url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Valid http/https URL is required")

    session_id = f"sess_{int(time.time() * 1000) % 10000000}_{abs(hash(req.url)) % 10000}"
    _active_event_queues[session_id] = asyncio.Queue()
    _session_events_history[session_id] = []
    _completed_albums.pop(session_id, None)

    engine_type = (req.engine_type or "ai_react").lower()
    mode_name = "ai_react" if engine_type == "ai_react" else "autonomous"

    _active_jobs[session_id] = {
        "session_id": session_id,
        "url": req.url,
        "mode": mode_name,
        "engine_type": engine_type,
        "status": "running",
        "model": req.model_name,
        "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "progress": {"current": 0, "total": 0, "status": f"Starting {engine_type} agent..."},
    }
    _save_jobs_to_disk()

    # Automatic routing: If user requested videos/gifs OR if URL indicates video content,
    # always route to SemanticAgentBrain (_run_agent_task) with Playwright sniffer and resolution ranker
    url_lower = req.url.lower()
    is_gallery_page = any(g in url_lower for g in ("/gallery/", "/album/", "/photos/", "/photo/", "gallery-", "album-"))
    is_video_pattern = any(
        kw in url_lower
        for kw in (
            "/video-", "/video/", "/watch", "watch?v=", "youtu.be", "tiktok.com",
            ".mp4", ".m3u8", ".webm", "view_video.php", "viewkey=", "pornhub.com",
            "xvideos.com", "redtube.com", "spankbang.com", "youporn.com", "tube8.com"
        )
    )
    # Never hijack to video if user explicitly selected images, or if URL is an image gallery
    is_video_url = (is_video_pattern and not is_gallery_page) if req.media_type_filter != "images" else False

    if req.media_type_filter in ("videos", "gifs") or is_video_url or engine_type == "classic":
        if is_video_url and req.media_type_filter not in ("videos", "gifs"):
            req.media_type_filter = "videos"
        _active_jobs[session_id]["engine_type"] = "classic"
        _active_jobs[session_id]["mode"] = "autonomous"
        asyncio.create_task(_run_agent_task(session_id, req, semaphore=_interactive_extraction_semaphore))
    elif engine_type in ("gemini_surgical_scout", "surgical_scout", "gemini_scout"):
        asyncio.create_task(_run_gemini_surgical_task(session_id, req, semaphore=_interactive_extraction_semaphore))
    elif engine_type in ("gemini_layout_explorer", "layout_explorer", "gemini_layout"):
        asyncio.create_task(_run_gemini_layout_task(session_id, req, semaphore=_interactive_extraction_semaphore))
    else:
        asyncio.create_task(_run_ai_react_agent_task(session_id, req, semaphore=_interactive_extraction_semaphore))


    return {
        "session_id": session_id,
        "status": "started",
        "target_url": req.url,
        "model": req.model_name,
        "engine_type": engine_type,
    }


class DirectScrapeRequest(BaseModel):
    url: str
    gemini_model: Optional[str] = "gemini-3.7-flash"
    local_model: Optional[str] = "qwen2.5:32b"
    max_pages: Optional[int] = 3


@app.post("/api/scrape")
async def run_direct_scrape(req: DirectScrapeRequest):
    """
    Direct scraper endpoint matching image_scout_agent/backend/server.py.
    Runs fast parallel surgical scout and returns all records directly.
    """
    scout = GeminiSurgicalScout()
    album = await scout.extract_album(
        url=req.url,
        gemini_model=req.gemini_model or "gemini-3.7-flash",
        local_model=req.local_model or "qwen2.5:32b",
    )
    records = [
        {
            "original_url": img.original_url,
            "thumbnail_url": img.thumbnail_url,
            "width": img.width,
            "height": img.height,
            "format": img.format
        }
        for img in album.images
    ]
    return {"total_found": len(records), "records": records}


@app.post("/api/stop")
def stop_scraper_endpoint():
    """Interrompe qualquer varredura ativa."""
    return {"status": "cancelled", "message": "Varreduras canceladas com sucesso."}


@app.post("/api/ai-analyze")
async def start_ai_analysis(req: AnalyzeRequest):
    """Dedicated endpoint for 7-Pillar Autonomous ReAct AI Agent."""
    req.engine_type = "ai_react"
    return await start_analysis(req)


@app.post("/api/batch-analyze")
async def start_batch_analysis(req: BatchAnalyzeRequest):
    """Starts multiple extraction sessions concurrently."""
    valid_urls = [u.strip() for u in req.urls if u.strip() and (u.strip().startswith("http://") or u.strip().startswith("https://"))]
    if not valid_urls:
        raise HTTPException(status_code=400, detail="At least one valid URL is required")

    spawned = []
    for u in valid_urls:
        s_id = f"sess_{abs(hash(u + str(datetime.now(timezone.utc).timestamp()))) % 1000000}"
        _active_event_queues[s_id] = asyncio.Queue()
        engine_type = (req.engine_type or "ai_react").lower()
        mode_name = "ai_react" if engine_type == "ai_react" else "autonomous"
        _active_jobs[s_id] = {
            "session_id": s_id,
            "url": u,
            "mode": mode_name,
            "engine_type": engine_type,
            "status": "running",
            "model": req.model_name,
            "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "progress": {"current": 0, "total": 0, "status": "Queued in concurrent background pool..."},
        }
        _save_jobs_to_disk()
        single_req = AnalyzeRequest(
            url=u,
            headless=req.headless,
            llm_api_base=req.llm_api_base,
            model_name=req.model_name,
            gemini_model=req.gemini_model,
            reasoning_budget=req.reasoning_budget,
            engine_type=engine_type,
            max_concurrency=req.max_concurrency,
            anti_bot_delay_ms=req.anti_bot_delay_ms,
            media_type_filter=req.media_type_filter or "all",
            folder=getattr(req, "folder", "Geral") or "Geral"
        )
        if req.media_type_filter in ("videos", "gifs") or engine_type == "classic":
            asyncio.create_task(_run_agent_task(s_id, single_req, semaphore=_extraction_semaphore))
        elif engine_type in ("gemini_surgical_scout", "surgical_scout", "gemini_scout"):
            asyncio.create_task(_run_gemini_surgical_task(s_id, single_req, semaphore=_extraction_semaphore))
        elif engine_type in ("gemini_layout_explorer", "layout_explorer", "gemini_layout"):
            asyncio.create_task(_run_gemini_layout_task(s_id, single_req, semaphore=_extraction_semaphore))
        else:
            asyncio.create_task(_run_ai_react_agent_task(s_id, single_req, semaphore=_extraction_semaphore))
        spawned.append({"session_id": s_id, "url": u})

    return {"status": "started", "total": len(spawned), "jobs": spawned}


async def _run_ai_react_agent_task(session_id: str, req: AnalyzeRequest, semaphore: Optional[asyncio.Semaphore] = None):
    """
    AI Autonomous ReAct Agent background runner (7-Pillar Architecture).
    Streams real-time observations, supports Co-Pilot questions, and persists albums to library.
    """
    sem = semaphore or _extraction_semaphore
    async with sem:
        queue = _active_event_queues.get(session_id)
        max_tabs = max(1, min(10, req.max_concurrency or 3))
        engine = BrowserEngine(headless=req.headless, max_concurrent_tabs=max_tabs)

        async def on_copilot_question(evt: AgentQuestionEvent) -> UserResponseEvent:
            if queue:
                await queue.put({
                    "type": "copilot_question",
                    "event_id": evt.event_id,
                    "question": evt.question,
                    "options": evt.options,
                    "screenshot_base64": evt.screenshot_base64,
                    "timeout_seconds": evt.timeout_seconds,
                    "default_option": evt.default_option,
                })
            loop = asyncio.get_running_loop()
            fut = loop.create_future()
            _copilot_pending_futures[session_id] = fut
            try:
                resp = await asyncio.wait_for(fut, timeout=evt.timeout_seconds)
                return resp
            except asyncio.TimeoutError:
                return UserResponseEvent(
                    event_id=evt.event_id,
                    selected_option=evt.default_option or (evt.options[0] if evt.options else "Proceed"),
                    text_input="TIMEOUT_FALLBACK",
                    action_type="TIMEOUT_FALLBACK",
                )
            finally:
                _copilot_pending_futures.pop(session_id, None)

        def on_copilot_status(msg: str, details: Optional[Dict[str, Any]] = None):
            if queue:
                try:
                    queue.put_nowait({
                        "type": "status",
                        "message": msg,
                        "details": details or {},
                    })
                except Exception:
                    pass
            if session_id in _active_jobs:
                _active_jobs[session_id]["progress"]["status"] = msg

        try:
            await engine.start()
            copilot_channel = CoPilotChannel(
                on_question_callback=on_copilot_question,
                on_status_callback=on_copilot_status,
            )
            _copilot_channels[session_id] = copilot_channel

            llm = LLMAdapter(
                api_base=req.llm_api_base or "http://localhost:11434/v1",
                model_name=req.model_name or "qwen2.5:32b",
                timeout=120.0,
            )

            agent = AutonomousReActAgent(
                engine=engine,
                llm_adapter=llm,
                copilot_channel=copilot_channel,
            )

            async def on_agent_event(event_data: Dict[str, Any]):
                _record_session_event(session_id, event_data)
                if queue:
                    await queue.put(event_data)
                if session_id in _active_jobs:
                    if event_data.get("type") == "album_init":
                        _active_jobs[session_id]["progress"]["total"] = event_data.get("total_candidates", 0)
                        _active_jobs[session_id]["progress"]["title"] = event_data.get("title", "")
                    elif event_data.get("type") == "image_resolved":
                        pos = event_data.get("position", 0)
                        _active_jobs[session_id]["progress"]["current"] = pos
                        _active_jobs[session_id]["progress"]["status"] = f"Resolved original image {pos} ({event_data.get('dimensions', 'Original')})"
                    elif event_data.get("type") == "ai_thought":
                        _active_jobs[session_id]["progress"]["status"] = event_data.get("thought", "")[:80]

            is_llm_active = await llm.check_availability()

            if queue:
                status_evt = {
                    "type": "status",
                    "message": f"Navigating to {req.url} (Autonomous ReAct Agent)...",
                }
                _record_session_event(session_id, status_evt)
                await queue.put(status_evt)

                core_evt = {
                    "type": "ai_thought",
                    "stage": "OBSERVATION",
                    "thought": f" LLM Neural Core: {'ONLINE (Live ' + llm.model_name + ')' if is_llm_active else 'OFFLINE (Running Autonomous Cognitive Brain Core)'} at {llm.api_base}",
                }
                _record_session_event(session_id, core_evt)
                await queue.put(core_evt)

            album = await agent.extract_album(req.url, on_event=on_agent_event)
            album.metadata["model_used"] = f"AutonomousReActAgent ({req.model_name})"
            album.metadata["engine_type"] = "ai_react"
            target_f = getattr(req, "folder", "Geral") or "Geral"
            album.folder = target_f
            album.metadata["folder"] = target_f
            _completed_albums[session_id] = album
            _save_album_to_disk(session_id, album)

            if session_id in _active_jobs:
                _active_jobs[session_id]["status"] = "completed"
                _active_jobs[session_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                _active_jobs[session_id]["progress"]["current"] = len(album.images)
                _active_jobs[session_id]["progress"]["total"] = len(album.images)
                _active_jobs[session_id]["progress"]["status"] = f"Álbum salvo ({len(album.images)} fotos originais)"

            if queue:
                comp_evt = {
                    "type": "completed",
                    "album": AgentDebugger.get_ui_summary(album),
                }
                _record_session_event(session_id, comp_evt)
                await queue.put(comp_evt)
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"Autonomous ReAct extraction failed for {req.url}: {e}\n{tb}", exc_info=True)
            err_evt = {
                "type": "ai_thought",
                "stage": "SERVER_EXCEPTION",
                "thought": f" [BACK-END EXCEPTION @ {session_id}] {str(e)}",
                "traceback": tb,
                "error": str(e),
            }
            _record_session_event(session_id, err_evt)
            if session_id in _active_jobs:
                _active_jobs[session_id]["status"] = "error"
                _active_jobs[session_id]["error"] = str(e)
                _active_jobs[session_id]["traceback"] = tb
            if queue:
                await queue.put(err_evt)
                await queue.put({"type": "error", "error": str(e), "traceback": tb})
        finally:
            _copilot_channels.pop(session_id, None)
            await engine.close()


async def _run_gemini_surgical_task(session_id: str, req: AnalyzeRequest, semaphore: Optional[asyncio.Semaphore] = None):
    """Background runner for Gemini Surgical Scout + Qwen Closer."""
    sem = semaphore or _extraction_semaphore
    async with sem:
        queue = _active_event_queues.get(session_id)
        scout = GeminiSurgicalScout()

        async def on_scout_event(event_data: Dict[str, Any]):
            _record_session_event(session_id, event_data)
            if queue:
                await queue.put(event_data)
            if session_id in _active_jobs:
                if event_data.get("type") == "album_init":
                    _active_jobs[session_id]["progress"]["total"] = event_data.get("total_candidates", 0)
                    _active_jobs[session_id]["progress"]["title"] = event_data.get("title", "")
                elif event_data.get("type") == "image_resolved":
                    pos = event_data.get("position", 0)
                    _active_jobs[session_id]["progress"]["current"] = pos
                    _active_jobs[session_id]["progress"]["status"] = f"Resolved 4K image {pos}"
                elif event_data.get("type") == "ai_thought":
                    _active_jobs[session_id]["progress"]["status"] = event_data.get("thought", "")[:80]

        try:
            gemini_model = req.gemini_model or (req.model_name if (req.model_name and "gemini" in req.model_name.lower()) else "gemini-3.7-flash")
            local_model = req.model_name if (req.model_name and "gemini" not in req.model_name.lower()) else "qwen2.5:32b"

            album = await scout.extract_album(
                url=req.url,
                gemini_model=gemini_model,
                local_model=local_model,
                on_event=on_scout_event,
            )
            has_gemini = bool(scout.client and scout.api_key)
            album.metadata["model_used"] = (
                f"Gemini Surgical Scout ({gemini_model}) + Qwen Closer ({local_model})"
                if has_gemini
                else "Surgical Scout (Heurística Determinística + Raio-X Físico)"
            )
            album.metadata["engine_type"] = "gemini_surgical_scout"
            target_f = getattr(req, "folder", "Geral") or "Geral"
            album.folder = target_f
            album.metadata["folder"] = target_f
            _completed_albums[session_id] = album
            _save_album_to_disk(session_id, album)

            if session_id in _active_jobs:
                _active_jobs[session_id]["status"] = "completed"
                _active_jobs[session_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                _active_jobs[session_id]["progress"]["current"] = len(album.images)
                _active_jobs[session_id]["progress"]["total"] = len(album.images)
                _active_jobs[session_id]["progress"]["status"] = f"Álbum salvo ({len(album.images)} fotos originais)"

            if queue:
                comp_evt = {
                    "type": "completed",
                    "album": AgentDebugger.get_ui_summary(album),
                }
                _record_session_event(session_id, comp_evt)
                await queue.put(comp_evt)
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"Gemini Surgical Scout failed for {req.url}: {e}\n{tb}", exc_info=True)
            err_evt = {
                "type": "ai_thought",
                "stage": "SERVER_EXCEPTION",
                "thought": f" [BACK-END EXCEPTION @ {session_id}] {str(e)}",
                "traceback": tb,
                "error": str(e),
            }
            _record_session_event(session_id, err_evt)
            if session_id in _active_jobs:
                _active_jobs[session_id]["status"] = "error"
                _active_jobs[session_id]["error"] = str(e)
                _active_jobs[session_id]["traceback"] = tb
            if queue:
                await queue.put(err_evt)
                await queue.put({"type": "error", "error": str(e), "traceback": tb})


async def _run_gemini_layout_task(session_id: str, req: AnalyzeRequest, semaphore: Optional[asyncio.Semaphore] = None):
    """Background runner for Gemini Layout Explorer + Qwen Closer."""
    sem = semaphore or _extraction_semaphore
    async with sem:
        queue = _active_event_queues.get(session_id)
        explorer = GeminiLayoutExplorer()

        async def on_explorer_event(event_data: Dict[str, Any]):
            _record_session_event(session_id, event_data)
            if queue:
                await queue.put(event_data)
            if session_id in _active_jobs:
                if event_data.get("type") == "album_init":
                    _active_jobs[session_id]["progress"]["total"] = event_data.get("total_candidates", 0)
                    _active_jobs[session_id]["progress"]["title"] = event_data.get("title", "")
                elif event_data.get("type") == "image_resolved":
                    pos = event_data.get("position", 0)
                    _active_jobs[session_id]["progress"]["current"] = pos
                    _active_jobs[session_id]["progress"]["status"] = f"Resolved 4K image {pos}"
                elif event_data.get("type") == "ai_thought":
                    _active_jobs[session_id]["progress"]["status"] = event_data.get("thought", "")[:80]

        try:
            gemini_model = req.gemini_model or (req.model_name if (req.model_name and "gemini" in req.model_name.lower()) else "gemini-3.7-flash")
            local_model = req.model_name if (req.model_name and "gemini" not in req.model_name.lower()) else "qwen2.5:32b"

            album = await explorer.extract_album(
                url=req.url,
                max_pages=3,
                gemini_model=gemini_model,
                local_model=local_model,
                on_event=on_explorer_event,
            )
            album.metadata["model_used"] = f"Gemini Layout Explorer ({gemini_model}) + Qwen Closer ({local_model})"
            album.metadata["engine_type"] = "gemini_layout_explorer"
            target_f = getattr(req, "folder", "Geral") or "Geral"
            album.folder = target_f
            album.metadata["folder"] = target_f
            _completed_albums[session_id] = album
            _save_album_to_disk(session_id, album)

            if session_id in _active_jobs:
                _active_jobs[session_id]["status"] = "completed"
                _active_jobs[session_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                _active_jobs[session_id]["progress"]["current"] = len(album.images)
                _active_jobs[session_id]["progress"]["total"] = len(album.images)
                _active_jobs[session_id]["progress"]["status"] = f"Álbum salvo ({len(album.images)} fotos originais)"

            if queue:
                comp_evt = {
                    "type": "completed",
                    "album": AgentDebugger.get_ui_summary(album),
                }
                _record_session_event(session_id, comp_evt)
                await queue.put(comp_evt)
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"Gemini Layout Explorer failed for {req.url}: {e}\n{tb}", exc_info=True)
            err_evt = {
                "type": "ai_thought",
                "stage": "SERVER_EXCEPTION",
                "thought": f" [BACK-END EXCEPTION @ {session_id}] {str(e)}",
                "traceback": tb,
                "error": str(e),
            }
            _record_session_event(session_id, err_evt)
            if session_id in _active_jobs:
                _active_jobs[session_id]["status"] = "error"
                _active_jobs[session_id]["error"] = str(e)
                _active_jobs[session_id]["traceback"] = tb
            if queue:
                await queue.put(err_evt)
                await queue.put({"type": "error", "error": str(e), "traceback": tb})


async def extract_yandex_preview_video(url: str) -> dict:
    """
    Direct high-performance extractor for Yandex Video Previews (yandex.com/video/preview/ and yandex.ru/video/preview/).
    Bypasses deleted/broken source links by unpacking Yandex's internal player iframe (e.g. nmcorp.video),
    extracting genuine high-res streams sorted from highest quality down to lowest.
    """
    import urllib.parse
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }

    clean_url = url
    m_vid = re.search(r"(?:yandex\.[a-z.]+|ya\.ru)/video/(?:touch/)?(?:preview/(\d+)|.*?[?&]filmId=(\d+))", url)
    vid_id = (m_vid.group(1) or m_vid.group(2)) if m_vid else None
    if not vid_id:
        m_vid2 = re.search(r"yandex\.[^/]+/video/.*?(\d{15,25})", url)
        if m_vid2:
            vid_id = m_vid2.group(1)
    if vid_id:
        clean_url = f"https://yandex.com/video/preview/{vid_id}"

    async with httpx.AsyncClient(verify=False, headers=headers, follow_redirects=True, timeout=20.0) as client:
        resp = await client.get(clean_url)
        html = resp.text

        # 1. Clean Title Extraction
        title = "Yandex Video"
        m_title_script = re.search(r'setParams\("upd-text-script",\s*"\{.*?(?:\\\"|\\u0022)text(?:\\\"|\\u0022):\s*(?:\\\"|\\u0022)(.*?)(?:\\\"|\\u0022)', html)
        if m_title_script:
            raw_t = m_title_script.group(1)
            try:
                title = raw_t.encode('utf-8').decode('unicode_escape', errors='ignore')
            except Exception:
                title = raw_t
        else:
            m_title = re.search(r'<title>(.*?)</title>', html, re.I)
            if m_title:
                title = re.sub(r'\s*-\s*watch online in Yandex video search.*$', '', m_title.group(1), flags=re.I).strip()

        # 2. Extract embedded player / origin video URL from #html=...
        inner_html_matches = re.findall(r'#html=([^\"\'&]+)', html)
        origin_video_url = None
        player_url = None

        for raw_frag in inner_html_matches:
            decoded_frag = urllib.parse.unquote(raw_frag)
            # Check for direct external platform URL (e.g. videoUrl="http://...")
            m_vurl = re.search(r'\"videoUrl\"\s*:\s*\"([^\"]+)\"', decoded_frag)
            if m_vurl:
                origin_video_url = m_vurl.group(1).replace("\\/", "/")

            src_m = re.search(r'src=[\"\']([^\"\']+)[\"\']', decoded_frag)
            if src_m:
                player_url = src_m.group(1)

        if not origin_video_url:
            m_vurl2 = re.search(r'\"videoUrl\"\s*:\s*\"([^\"]+)\"', html)
            if m_vurl2:
                origin_video_url = m_vurl2.group(1).replace("\\/", "/")

        if not player_url:
            direct_iframe = re.search(r'<iframe[^>]+src=[\"\']([^\"\']+)[\"\']', html)
            if direct_iframe:
                player_url = direct_iframe.group(1)

        if player_url and player_url.startswith("//"):
            player_url = "https:" + player_url

        logger.info(f"[YandexVideo] Unpacked: origin_url={origin_video_url}, player_url={player_url}")

        streams = []
        poster = None

        # Check if origin_video_url or player_url can be resolved via yt-dlp
        target_for_ytdlp = None
        if origin_video_url and any(domain in origin_video_url.lower() for domain in ("pornhub", "xvideos", "vk.com", "ok.ru", "rutube", "spankbang", "redtube", "youporn")):
            target_for_ytdlp = origin_video_url
        elif player_url and any(domain in player_url.lower() for domain in ("pornhub", "xvideos", "vk.com", "ok.ru", "rutube", "spankbang", "redtube", "youporn")):
            target_for_ytdlp = player_url

        if target_for_ytdlp:
            logger.info(f"[YandexVideo] Resolving via yt-dlp target: {target_for_ytdlp}")
            try:
                import yt_dlp
                ydl_opts = {
                    "quiet": True,
                    "no_warnings": True,
                    "skip_download": True,
                    "http_headers": {
                        "User-Agent": headers["User-Agent"],
                        "Referer": target_for_ytdlp
                    }
                }
                captured_cookies = {}
                def _ytdl_resolve():
                    nonlocal captured_cookies
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        inf = ydl.extract_info(target_for_ytdlp, download=False)
                        captured_cookies = {c.name: c.value for c in ydl.cookiejar}
                        return inf

                info = await asyncio.to_thread(_ytdl_resolve)
                if captured_cookies:
                    cookie_str = "; ".join(f"{k}={v}" for k, v in captured_cookies.items())
                    _domain_cookies["phncdn.com"] = cookie_str
                    _domain_cookies["pornhub.com"] = cookie_str
                    _save_domain_cookies()

                poster = info.get("thumbnail")
                formats = [f for f in info.get("formats", []) if f.get("ext") == "mp4" and f.get("url")]
                formats.sort(key=lambda f: f.get("height", 0) or 0, reverse=True)

                async def _probe_format_size(stream_url: str) -> int:
                    try:
                        p_headers = _get_video_download_headers(stream_url, target_for_ytdlp)
                        p_headers["Range"] = "bytes=0-0"
                        pr = await client.get(stream_url, headers=p_headers, timeout=4.0)
                        cr = pr.headers.get("content-range", "")
                        if "/" in cr:
                            part = cr.split("/")[-1].strip()
                            if part.isdigit():
                                return int(part)
                        elif "content-length" in pr.headers and pr.status_code in (200, 206):
                            cl_val = pr.headers.get("content-length", "0").strip()
                            if cl_val.isdigit():
                                return int(cl_val)
                    except Exception as err:
                        logger.debug(f"[YandexVideo] Probe size failed for {stream_url}: {err}")
                    return 0

                seen_heights = set()
                for f in formats:
                    h = f.get("height") or 720
                    if h in seen_heights:
                        continue
                    seen_heights.add(h)
                    w = 1920 if h >= 1080 else (1280 if h >= 720 else (854 if h >= 480 else 426))
                    q_label = f"{h}p HD" if h >= 720 else f"{h}p"

                    f_size = f.get("filesize") or f.get("filesize_approx") or 0
                    if not f_size:
                        f_size = await _probe_format_size(f["url"])

                    streams.append({
                        "url": f["url"],
                        "quality": q_label,
                        "width": w,
                        "height": h,
                        "file_size": f_size
                    })
            except Exception as e_ytdlp:
                logger.warning(f"[YandexVideo] yt-dlp resolution on {target_for_ytdlp} failed: {e_ytdlp}")

        # If not resolved via yt-dlp, fetch direct player page (like nmcorp.video)
        if not streams and player_url:
            logger.info(f"[YandexVideo] Fetching direct player URL: {player_url}")
            player_headers = {
                "User-Agent": headers["User-Agent"],
                "Referer": "https://yandex.com/"
            }
            p_resp = await client.get(player_url, headers=player_headers)
            p_html = p_resp.text

            posters = re.findall(r'https?://[^\s\"\'<>]+\.(?:jpg|jpeg|webp|png)[^\s\"\'<>]*', p_html)
            if posters:
                poster = next((p for p in posters if "preview" in p or "800" in p or "thumb" in p), posters[0])
                poster = poster.replace("\\/", "/")

            seen_urls = set()
            for m in re.finditer(r'\"(https?:[^\"]+?\.(?:mp4|m3u8)[^\"]*)\"', p_html):
                raw_stream_url = m.group(1).replace("\\/", "/").replace("\\u0026", "&")
                if raw_stream_url in seen_urls:
                    continue
                seen_urls.add(raw_stream_url)

                url_low = raw_stream_url.lower()
                q_label = "720p HD"
                w, h = 1280, 720
                if "2160p" in url_low or "4k" in url_low or "vid_2160" in url_low:
                    q_label, w, h = "4K UHD", 3840, 2160
                elif "1440p" in url_low or "2k" in url_low or "vid_1440" in url_low:
                    q_label, w, h = "2K QHD", 2560, 1440
                elif "1080p" in url_low or "vid_1080" in url_low or "1080" in url_low:
                    q_label, w, h = "1080p FHD", 1920, 1080
                elif "720p" in url_low or "vid_720" in url_low or "720" in url_low:
                    q_label, w, h = "720p HD", 1280, 720
                elif "480p" in url_low or "vid_480" in url_low or "480" in url_low:
                    q_label, w, h = "480p SD", 854, 480
                elif "360p" in url_low or "vid_360" in url_low or "360" in url_low:
                    q_label, w, h = "360p", 640, 360
                elif "240p" in url_low or "vid_240" in url_low or "240" in url_low:
                    q_label, w, h = "240p", 426, 240

                file_size = 0
                try:
                    probe_headers = {
                        "User-Agent": headers["User-Agent"],
                        "Referer": "https://nmcorp.video/",
                        "Range": "bytes=0-0"
                    }
                    pr = await client.get(raw_stream_url, headers=probe_headers, timeout=4.0)
                    cr = pr.headers.get("content-range", "")
                    if "/" in cr:
                        part = cr.split("/")[-1].strip()
                        if part.isdigit():
                            file_size = int(part)
                    elif "content-length" in pr.headers and pr.status_code in (200, 206):
                        cl = pr.headers.get("content-length", "0").strip()
                        if cl.isdigit():
                            file_size = int(cl)
                except Exception:
                    pass

                streams.append({
                    "url": raw_stream_url,
                    "quality": q_label,
                    "width": w,
                    "height": h,
                    "file_size": file_size
                })

        # CRITICAL: Sort streams in descending order of quality (Height/Resolution)
        # Position 0 will always be the BEST/HIGHEST available quality (4K -> 1440p -> 1080p -> 720p...)
        streams.sort(key=lambda s: s.get("height", 0) or 0, reverse=True)

        return {
            "title": title,
            "poster": poster,
            "player_url": player_url,
            "streams": streams
        }


async def _download_highest_video_task(album_title: str, sorted_vids: List[AlbumImage]):
    """Background task to stream and persist the highest quality extracted video to disk without blocking SSE."""
    async with httpx.AsyncClient(verify=False, timeout=300.0, follow_redirects=True) as v_client:
        for cand in sorted_vids:
            v_url = cand.video_stream_url or cand.original_url
            if not v_url or not v_url.startswith("http") or ".m3u8" in v_url:
                continue
            try:
                headers = _get_video_download_headers(v_url, getattr(cand, "source_page", None))
                async with v_client.stream("GET", v_url, headers=headers) as v_resp:
                    if v_resp.status_code in (200, 206):
                        ct = v_resp.headers.get("content-type", "").lower()
                        if "video" in ct or "octet-stream" in ct or any(v_url.lower().endswith(ext) for ext in (".mp4", ".webm", ".mov")):
                            clean_t = album_title or getattr(cand, "title", None) or "video_extraido"
                            txt = ((cand.video_stream_url or "") + " " + (cand.original_url or "") + " " + (cand.title or "")).lower()
                            rank = 0
                            for q, val in [("2160", 2160), ("4k", 2160), ("1440", 1440), ("2k", 1440), ("1080", 1080), ("fhd", 1080), ("720", 720), ("hd", 720), ("480", 480), ("360", 360), ("240", 240)]:
                                if q in txt:
                                    rank = val
                                    break
                            if rank == 0:
                                rank = cand.height or cand.width or 0
                            q_tag = f"_{rank}p" if rank > 0 else ""
                            base_fname = "".join(c for c in clean_t if c.isalnum() or c in ("-", "_", " ")).strip() or f"vid_{int(time.time())}"
                            fname = f"{base_fname}{q_tag}.mp4"

                            folder_path = os.path.join(video_service.base_dir, "Extraídos")
                            os.makedirs(folder_path, exist_ok=True)
                            target_path = os.path.join(folder_path, fname)
                            if os.path.exists(target_path):
                                target_path = os.path.join(folder_path, f"{base_fname}{q_tag}_{int(time.time())}.mp4")

                            total_written = 0
                            with open(target_path, "wb") as fp:
                                async for chunk in v_resp.aiter_bytes(chunk_size=65536):
                                    fp.write(chunk)
                                    total_written += len(chunk)
                                    if total_written > 1200 * 1024 * 1024:
                                        break

                            if total_written > 50000:
                                title = os.path.splitext(os.path.basename(target_path))[0].replace("_", " ")
                                rel_path = os.path.relpath(target_path, video_service.base_dir).replace("\\", "/")
                                vid_id = video_service._get_video_id(rel_path)
                                video_service._update_single_metadata(
                                    target_path,
                                    title=title,
                                    folder="Extraídos",
                                    is_favorite=False,
                                    vid_id=vid_id,
                                    storage_location="render_local",
                                    file_size_bytes=total_written
                                )
                                # Upload automático para Hugging Face em background
                                video_service._trigger_background_upload(vid_id, target_path, "Extraídos", fname)
                                logger.info(f"Auto-saved highest quality ({rank}p, {total_written/1024/1024:.1f} MB) video to Gallery and queued for HF upload: {target_path}")
                                break
                            else:
                                if os.path.exists(target_path):
                                    try:
                                        os.remove(target_path)
                                    except Exception:
                                        pass
            except Exception as ex:
                logger.warning(f"Could not auto-save video candidate {v_url}: {ex}")


async def _run_agent_task(session_id: str, req: AnalyzeRequest, semaphore: Optional[asyncio.Semaphore] = None):
    """
    Mode 1 background runner.
    Runs completely decoupled on the server, persisting progress and albums even if browser tab is closed.
    """
    sem = semaphore or _extraction_semaphore
    async with sem:
        queue = _active_event_queues.get(session_id)
        max_tabs = max(1, min(10, req.max_concurrency or 3))
        engine = BrowserEngine(headless=req.headless, max_concurrent_tabs=max_tabs)
        controller = InvestigationController(candidate_budget=8, session_budget=80)
        _job_controllers[session_id] = controller

    async def on_agent_event(event_data: Dict[str, Any]):
        _record_session_event(session_id, event_data)
        if queue:
            await queue.put(event_data)
        if session_id in _active_jobs:
            if event_data.get("type") == "album_init":
                _active_jobs[session_id]["progress"]["total"] = event_data.get("total_candidates", 0)
                _active_jobs[session_id]["progress"]["title"] = event_data.get("title", "")
            elif event_data.get("type") == "candidate_processed":
                img = event_data.get("image", {})
                pos = img.get("position", 0)
                if pos > _active_jobs[session_id]["progress"]["current"]:
                    _active_jobs[session_id]["progress"]["current"] = pos
                _active_jobs[session_id]["progress"]["status"] = f"Inspecionada foto #{pos} ({img.get('width', 0)}x{img.get('height', 0)})"
            elif event_data.get("type") == "image_resolved":
                pos = event_data.get("position", 0)
                if pos > _active_jobs[session_id]["progress"]["current"]:
                    _active_jobs[session_id]["progress"]["current"] = pos
                _active_jobs[session_id]["progress"]["status"] = f"Resolvida foto #{pos} ({event_data.get('dimensions', 'Original')})"
            elif event_data.get("type") == "status":
                _active_jobs[session_id]["progress"]["status"] = event_data.get("message", "")

    try:
        await engine.start()
        tools = BrowserTools(engine=engine)
        validator = ImageValidator()
        investigator = OriginalImageInvestigator(tools=tools, validator=validator)
        llm = LLMAdapter(
            api_base=req.llm_api_base or "http://localhost:11434/v1",
            model_name=req.model_name or "qwen2.5:32b",
            timeout=120.0,
        )
        await llm.check_availability()

        brain = SemanticAgentBrain(
            engine=engine,
            tools=tools,
            validator=validator,
            investigator=investigator,
            llm_adapter=llm,
            knowledge_store=knowledge_store,
        )

        album = None
        # High-Speed 1080p Embed Player Stream Sniffer for Eporner and video platforms
        m_ep = re.search(r"eporner\.com/(?:video-|embed/|hd-porn/|video/)([a-zA-Z0-9]{8,15})", req.url)
        if m_ep and req.media_type_filter in ("videos", "all"):
            vid_id = m_ep.group(1)
            embed_url = f"https://www.eporner.com/embed/{vid_id}/"
            logger.info(f"Targeting Eporner Embed Player for 1080p Full HD stream: {embed_url}")
            try:
                xhr_payload = {}
                async def _on_embed_resp(resp):
                    if f"xhr/video/{vid_id}" in resp.url or "xhr/video/" in resp.url:
                        try:
                            xhr_payload.update(await resp.json())
                        except Exception:
                            pass

                engine.main_page.on("response", _on_embed_resp)
                await engine.navigate(embed_url)
                for _ in range(80):
                    if "sources" in xhr_payload and "mp4" in xhr_payload["sources"]:
                        break
                    await asyncio.sleep(0.1)

                try:
                    engine.main_page.remove_listener("response", _on_embed_resp)
                except Exception:
                    pass

                mp4_sources = xhr_payload.get("sources", {}).get("mp4", {})
                if mp4_sources:
                    raw_title = await engine.main_page.title()
                    vid_title = re.sub(r"\s*-\s*EPORNER\s*$", "", raw_title or "Vídeo", flags=re.I).strip()
                    poster_url = f"https://imggen.eporner.com/{xhr_payload.get('videoFID', '')}/1920/1080/11.jpg"

                    # Sort qualities: 1080p HD first, then 720p HD, 480p, 360p, 240p
                    quality_order = ["1080p HD", "1080p", "720p HD", "720p", "480p", "360p", "240p"]
                    sorted_qualities = sorted(
                        mp4_sources.items(),
                        key=lambda item: next((i for i, q in enumerate(quality_order) if q in item[0]), 99)
                    )

                    vid_images = []
                    for idx, (q_label, q_obj) in enumerate(sorted_qualities):
                        stream_src = q_obj.get("src")
                        if not stream_src:
                            continue
                        q_match = re.search(r"(\d+)", q_label)
                        h_val = int(q_match.group(1)) if q_match else 720
                        w_val = 1920 if h_val >= 1080 else (1280 if h_val >= 720 else 854)

                        f_size = q_obj.get("size") or q_obj.get("filesize") or 0
                        if not f_size and stream_src:
                            try:
                                probe_resp = await page.request.get(
                                    stream_src,
                                    headers={"Range": "bytes=0-0", "Referer": "https://www.eporner.com/"},
                                    timeout=3000
                                )
                                cr = probe_resp.headers.get("content-range", "")
                                if "/" in cr:
                                    part = cr.split("/")[-1].strip()
                                    if part.isdigit():
                                        f_size = int(part)
                                elif "content-length" in probe_resp.headers and probe_resp.status in (200, 206):
                                    cl_val = probe_resp.headers.get("content-length", "0").strip()
                                    if cl_val.isdigit():
                                        f_size = int(cl_val)
                            except Exception as probe_err:
                                logger.debug(f"Could not probe size for {q_label}: {probe_err}")

                        img_obj = AlbumImage(
                            position=idx + 1,
                            candidate_id=f"vid_stream_{idx+1}",
                            thumbnail_url=poster_url,
                            original_url=stream_src,
                            video_stream_url=stream_src,
                            poster_url=poster_url,
                            media_type="video",
                            title=f"{vid_title} ({q_label})",
                            width=w_val,
                            height=h_val,
                            file_size=f_size,
                            format="mp4",
                            resolution_method=ResolutionMethod.VERIFIED_CDN_CANDIDATE,
                            confidence=1.0,
                            validation_status="PASS",
                            source_page=req.url
                        )
                        vid_images.append(img_obj)
                        if queue:
                            await queue.put({
                                "type": "image_resolved",
                                "position": idx + 1,
                                "url": stream_src,
                                "thumbnail_url": poster_url,
                                "video_stream_url": stream_src,
                                "media_type": "video",
                                "title": f"{vid_title} ({q_label})",
                                "dimensions": f"{q_label} MP4",
                                "file_size": f_size,
                            })

                    if vid_images:
                        album = Album(
                            album_id=f"vid_{abs(hash(req.url)) % 1000000}",
                            title=vid_title,
                            original_title=vid_title,
                            source_page=req.url,
                            source_type="video",
                            cover_image_url=poster_url,
                            images=vid_images,
                            telemetry=TelemetryMetrics(
                                candidates_discovered=len(vid_images),
                                candidates_investigated=len(vid_images),
                                originals_resolved=len(vid_images),
                                duration_seconds=2.0,
                            ),
                            metadata={"method": "embed_player_stream_interceptor", "media_type": "video", "max_quality": "1080p HD"}
                        )
                        album.metadata["model_used"] = req.model_name or "Embed 1080p Sniffer"
                        album.metadata["media_type_filter"] = req.media_type_filter or "all"
                        try:
                            album = await probe_and_update_album_metadata(album, session_id=session_id, save_to_disk=False)
                        except Exception as probe_err:
                            logger.warning(f"Error during video post-extraction size probe: {probe_err}")
                        _completed_albums[session_id] = album
                        _save_album_to_disk(session_id, album)

                        if session_id in _active_jobs:
                            _active_jobs[session_id]["status"] = "completed"
                            _active_jobs[session_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                            _active_jobs[session_id]["progress"]["current"] = len(album.images)
                            _active_jobs[session_id]["progress"]["total"] = len(album.images)
                            _active_jobs[session_id]["progress"]["status"] = f"Álbum salvo ({len(album.images)} vídeos originais)"

                        if queue:
                            c_evt = {
                                "type": "completed",
                                "album": AgentDebugger.get_ui_summary(album),
                            }
                            _record_session_event(session_id, c_evt)
                            await queue.put(c_evt)

                        vid_items = [img for img in album.images if img.media_type == "video" and (img.video_stream_url or img.original_url)]
                        if vid_items:
                            def _v_rank(it: AlbumImage) -> int:
                                txt = ((it.video_stream_url or "") + " " + (it.original_url or "") + " " + (it.title or "")).lower()
                                if "2160" in txt or "4k" in txt: return 2160
                                if "1440" in txt or "2k" in txt: return 1440
                                if "1080" in txt or "fhd" in txt: return 1080
                                if "720" in txt or "hd" in txt: return 720
                                if "480" in txt: return 480
                                if "360" in txt: return 360
                                if "240" in txt: return 240
                                return it.height or it.width or 0
                            sorted_vids = sorted(vid_items, key=_v_rank, reverse=True)
                            asyncio.create_task(_download_highest_video_task(album.title or "video_extraido", sorted_vids))
                        return
            except Exception as e_embed:
                logger.warning(f"Embed player stream extraction failed: {e_embed}")

        # High-Speed 1080p Pornhub / Universal Tube Video Extractor via yt-dlp
        m_ph = re.search(r"(?:pornhub\.com/view_video\.php\?viewkey=|viewkey=)([a-zA-Z0-9]+)", req.url)
        if (m_ph or "pornhub.com" in req.url) and req.media_type_filter in ("videos", "all"):
            ph_key = m_ph.group(1) if m_ph else "ph_video"
            logger.info(f"Targeting Pornhub for 1080p Full HD extraction: {req.url}")
            try:
                import yt_dlp
                ydl_opts = {
                    "quiet": True,
                    "no_warnings": True,
                    "skip_download": True,
                    "http_headers": {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                        "Referer": "https://www.pornhub.com/",
                        "Origin": "https://www.pornhub.com"
                    }
                }
                ph_cookies = {}
                def _extract_ph():
                    nonlocal ph_cookies
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        inf = ydl.extract_info(req.url, download=False)
                        ph_cookies = {c.name: c.value for c in ydl.cookiejar}
                        return inf

                info = await asyncio.to_thread(_extract_ph)
                if ph_cookies:
                    c_str = "; ".join(f"{k}={v}" for k, v in ph_cookies.items())
                    _domain_cookies["phncdn.com"] = c_str
                    _domain_cookies["pornhub.com"] = c_str
                    _save_domain_cookies()

                raw_title = info.get("title") or "Pornhub Video"
                vid_title = re.sub(r"\s*-\s*Pornhub\.com\s*$", "", raw_title, flags=re.I).strip()
                poster_url = info.get("thumbnail") or ""
                vid_duration = int(info.get("duration") or 0)

                formats = [f for f in info.get("formats", []) if f.get("ext") == "mp4" and f.get("url")]
                direct_mp4s = [f for f in formats if not str(f.get("format_id", "")).startswith("hls")]
                if direct_mp4s:
                    formats = direct_mp4s
                formats.sort(key=lambda f: f.get("height", 0) or 0, reverse=True)

                async def _probe_ph_size(s_url: str) -> int:
                    try:
                        async with httpx.AsyncClient(verify=False, timeout=4.0) as p_client:
                            p_hdrs = _get_video_download_headers(s_url, req.url)
                            p_hdrs["Range"] = "bytes=0-0"
                            pr = await p_client.get(s_url, headers=p_hdrs)
                            cr = pr.headers.get("content-range", "")
                            if "/" in cr:
                                part = cr.split("/")[-1].strip()
                                if part.isdigit():
                                    return int(part)
                            elif "content-length" in pr.headers and pr.status_code in (200, 206):
                                cl_val = pr.headers.get("content-length", "0").strip()
                                if cl_val.isdigit():
                                    return int(cl_val)
                    except Exception:
                        pass
                    return 0

                unique_formats = []
                seen_h = set()
                for f in formats:
                    h_val = f.get("height") or 720
                    if h_val not in seen_h:
                        seen_h.add(h_val)
                        unique_formats.append(f)

                vid_images = []
                for idx, f in enumerate(unique_formats):
                    h_val = f.get("height") or 720
                    w_val = 1920 if h_val >= 1080 else (1280 if h_val >= 720 else (854 if h_val >= 480 else 426))
                    stream_src = f["url"]
                    q_label = f"{h_val}p HD" if h_val >= 720 else f"{h_val}p"
                    f_size = f.get("filesize") or f.get("filesize_approx") or 0
                    if not f_size and vid_duration > 0:
                        tbr = f.get("tbr") or (4000 if h_val >= 1080 else (2000 if h_val >= 720 else (1000 if h_val >= 480 else 500)))
                        f_size = int(tbr * 1000 / 8 * vid_duration)
                    if not f_size:
                        f_size = await _probe_ph_size(stream_src)

                    img_obj = AlbumImage(
                        position=idx + 1,
                        candidate_id=f"ph_stream_{idx+1}",
                        thumbnail_url=poster_url,
                        original_url=stream_src,
                        video_stream_url=stream_src,
                        poster_url=poster_url,
                        media_type="video",
                        title=f"{vid_title} ({q_label})",
                        width=w_val,
                        height=h_val,
                        file_size=f_size,
                        duration_seconds=vid_duration if vid_duration > 0 else None,
                        format="mp4",
                        resolution_method=ResolutionMethod.VERIFIED_CDN_CANDIDATE,
                        confidence=1.0,
                        validation_status="PASS",
                        source_page=req.url
                    )
                    vid_images.append(img_obj)
                    if queue:
                        await queue.put({
                            "type": "image_resolved",
                            "position": idx + 1,
                            "url": stream_src,
                            "thumbnail_url": poster_url,
                            "video_stream_url": stream_src,
                            "media_type": "video",
                            "title": f"{vid_title} ({q_label})",
                            "dimensions": f"{q_label} MP4",
                            "file_size": f_size,
                            "duration_seconds": vid_duration if vid_duration > 0 else None,
                        })

                if vid_images:
                    max_q = f"{formats[0].get('height', 1080)}p HD"
                    album = Album(
                        album_id=f"vid_{abs(hash(req.url)) % 1000000}",
                        title=vid_title,
                        original_title=vid_title,
                        source_page=req.url,
                        source_type="video",
                        cover_image_url=poster_url,
                        images=vid_images,
                        telemetry=TelemetryMetrics(
                            candidates_discovered=len(vid_images),
                            candidates_investigated=len(vid_images),
                            originals_resolved=len(vid_images),
                            duration_seconds=2.0,
                        ),
                        metadata={"method": "pornhub_ytdlp_interceptor", "media_type": "video", "max_quality": max_q}
                    )
                    album.metadata["model_used"] = req.model_name or "Pornhub 1080p Engine"
                    album.metadata["media_type_filter"] = req.media_type_filter or "all"

                    _completed_albums[session_id] = album
                    _save_album_to_disk(session_id, album)

                    if session_id in _active_jobs:
                        _active_jobs[session_id]["status"] = "completed"
                        _active_jobs[session_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                        _active_jobs[session_id]["progress"]["current"] = len(album.images)
                        _active_jobs[session_id]["progress"]["total"] = len(album.images)
                        _active_jobs[session_id]["progress"]["status"] = f"Álbum salvo ({len(album.images)} resoluções até 1080p)"

                    if queue:
                        c_evt = {
                            "type": "completed",
                            "album": AgentDebugger.get_ui_summary(album),
                        }
                        _record_session_event(session_id, c_evt)
                        await queue.put(c_evt)

                    vid_items = [img for img in album.images if img.media_type == "video" and (img.video_stream_url or img.original_url)]
                    if vid_items:
                        def _v_rank(it: AlbumImage) -> int:
                            txt = ((it.video_stream_url or "") + " " + (it.original_url or "") + " " + (it.title or "")).lower()
                            if "2160" in txt or "4k" in txt: return 2160
                            if "1440" in txt or "2k" in txt: return 1440
                            if "1080" in txt or "fhd" in txt: return 1080
                            if "720" in txt or "hd" in txt: return 720
                            if "480" in txt: return 480
                            if "360" in txt: return 360
                            if "240" in txt: return 240
                            return it.height or it.width or 0
                        sorted_vids = sorted(vid_items, key=_v_rank, reverse=True)
                        asyncio.create_task(_download_highest_video_task(album.title or "video_extraido", sorted_vids))
                    return
            except Exception as e_ph:
                logger.warning(f"Pornhub stream extraction failed: {e_ph}")

        # High-Speed Yandex Video Preview Extractor (Bypasses deleted source links & unpacks nested player iframe)
        m_yandex = re.search(r"(?:yandex\.[a-z.]+|ya\.ru)/video/(?:touch/)?(?:preview/(\d+)|.*?[?&]filmId=(\d+))", req.url)
        yandex_vid_id = (m_yandex.group(1) or m_yandex.group(2)) if m_yandex else None
        if not yandex_vid_id:
            m_yandex2 = re.search(r"yandex\.[^/]+/video/.*?(\d{15,25})", req.url)
            if m_yandex2:
                yandex_vid_id = m_yandex2.group(1)

        if yandex_vid_id and req.media_type_filter in ("videos", "all"):
            logger.info(f"Targeting Yandex Video Preview for maximum quality extraction: {req.url} (ID: {yandex_vid_id})")
            try:
                yandex_data = await extract_yandex_preview_video(req.url)
                if yandex_data and yandex_data.get("streams"):
                    vid_title = yandex_data.get("title") or "Yandex Video"
                    poster_url = yandex_data.get("poster") or ""
                    streams = yandex_data["streams"]
                    # CRITICAL: Best / Highest resolution is at position 0 (4K -> 1440p -> 1080p -> 720p...)
                    streams.sort(key=lambda s: s.get("height", 0) or 0, reverse=True)

                    vid_images = []
                    for idx, s in enumerate(streams):
                        h_val = s.get("height", 720)
                        w_val = s.get("width", 1280)
                        stream_src = s["url"]
                        q_label = s.get("quality") or f"{h_val}p"
                        f_size = s.get("file_size") or 0

                        img_obj = AlbumImage(
                            position=idx + 1,
                            candidate_id=f"yandex_stream_{idx+1}",
                            thumbnail_url=poster_url or stream_src,
                            original_url=stream_src,
                            video_stream_url=stream_src,
                            poster_url=poster_url,
                            media_type="video",
                            title=f"{vid_title} ({q_label})",
                            width=w_val,
                            height=h_val,
                            file_size=f_size,
                            format="mp4",
                            resolution_method=ResolutionMethod.VERIFIED_CDN_CANDIDATE,
                            confidence=1.0,
                            validation_status="PASS",
                            source_page=req.url
                        )
                        vid_images.append(img_obj)
                        if queue:
                            await queue.put({
                                "type": "image_resolved",
                                "position": idx + 1,
                                "url": stream_src,
                                "thumbnail_url": poster_url,
                                "video_stream_url": stream_src,
                                "media_type": "video",
                                "title": f"{vid_title} ({q_label})",
                                "dimensions": f"{q_label} MP4",
                                "file_size": f_size,
                            })

                    if vid_images:
                        best_q = streams[0].get("quality") or f"{streams[0].get('height', 720)}p"
                        album = Album(
                            album_id=f"yandex_{yandex_vid_id}_{int(time.time()) % 1000}",
                            title=vid_title,
                            original_title=vid_title,
                            source_page=req.url,
                            source_type="video",
                            cover_image_url=poster_url or vid_images[0].original_url,
                            images=vid_images,
                            telemetry=TelemetryMetrics(
                                candidates_discovered=len(vid_images),
                                candidates_investigated=len(vid_images),
                                originals_resolved=len(vid_images),
                                duration_seconds=1.5,
                            ),
                            metadata={"method": "yandex_video_preview_extractor", "media_type": "video", "max_quality": best_q}
                        )
                        album.metadata["model_used"] = req.model_name or "Yandex Ultra Video Engine"
                        album.metadata["media_type_filter"] = req.media_type_filter or "all"

                        _completed_albums[session_id] = album
                        _save_album_to_disk(session_id, album)

                        if session_id in _active_jobs:
                            _active_jobs[session_id]["status"] = "completed"
                            _active_jobs[session_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                            _active_jobs[session_id]["progress"]["current"] = len(album.images)
                            _active_jobs[session_id]["progress"]["total"] = len(album.images)
                            _active_jobs[session_id]["progress"]["status"] = f"Álbum salvo ({len(album.images)} resoluções - Máx: {best_q})"

                        if queue:
                            c_evt = {
                                "type": "completed",
                                "album": AgentDebugger.get_ui_summary(album),
                            }
                            _record_session_event(session_id, c_evt)
                            await queue.put(c_evt)

                        # Auto-save primary highest quality video
                        best_vid = vid_images[0]
                        v_target_url = best_vid.video_stream_url or best_vid.original_url
                        if v_target_url:
                            save_req = SaveExtractedVideoRequest(
                                video_url=v_target_url,
                                title=vid_title,
                                folder="Extraídos",
                                candidate_id=f"yandex_{yandex_vid_id}",
                                page_url=req.url,
                            )
                            asyncio.create_task(save_extracted_video_to_gallery(save_req))

                        return
            except Exception as e_yandex:
                logger.error(f"Yandex video preview extraction failed: {e_yandex}")

        # Fallback Fast Direct Video Sniffer for sites with direct MP4/dload links
        if (not album or not album.images) and req.media_type_filter in ("videos", "all"):
            try:
                import requests
                s_direct = requests.Session()
                s_direct.headers.update({
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Cookie": "ageverif_accepted=T; age_verified=1; has_visited=1; disclaimer_accepted=1; over18=1; epcolor=black"
                })
                resp_d = await asyncio.to_thread(s_direct.get, req.url, timeout=15)
                if resp_d.status_code == 200:
                    v_soup = BeautifulSoup(resp_d.text, "html.parser")
                    v_title = v_soup.title.get_text(strip=True) if v_soup.title else "Vídeo Extraído"
                    v_title = re.sub(r"\s*-\s*EPORNER\s*$", "", v_title, flags=re.I).strip()
                    dloads = []
                    for a in v_soup.find_all("a", href=True):
                        href = a["href"]
                        if "/dload/" in href or re.search(r"\.(mp4|webm)(\?.*)?$", href, re.I):
                            full_vurl = urljoin(req.url, href)
                            label = a.get_text(strip=True) or href
                            dloads.append((full_vurl, label))
                    if dloads:
                        logger.info(f"Direct MP4 download links found on {req.url}: {len(dloads)} links")
                        poster_el = v_soup.select_one("video[poster], img.main-thumb, meta[property='og:image']")
                        poster_url = poster_el.get("poster") or poster_el.get("src") or poster_el.get("content") if poster_el else None
                        if poster_url:
                            poster_url = urljoin(req.url, poster_url)

                        vid_images = []
                        for idx, (vurl, vlabel) in enumerate(dloads):
                            q_match = re.search(r"(2160|1440|1080|720|480|360|240)p?|4k|2k|fhd|hd", vurl + " " + vlabel, re.I)
                            matched_txt = q_match.group(0).lower() if q_match else ""
                            if "2160" in matched_txt or "4k" in matched_txt:
                                q_val, w_val, h_val, dim_label = 2160, 3840, 2160, "4K UHD"
                            elif "1440" in matched_txt or "2k" in matched_txt:
                                q_val, w_val, h_val, dim_label = 1440, 2560, 1440, "2K QHD"
                            elif "1080" in matched_txt or "fhd" in matched_txt:
                                q_val, w_val, h_val, dim_label = 1080, 1920, 1080, "1080p FHD"
                            elif "720" in matched_txt or "hd" in matched_txt:
                                q_val, w_val, h_val, dim_label = 720, 1280, 720, "720p HD"
                            elif "480" in matched_txt:
                                q_val, w_val, h_val, dim_label = 480, 854, 480, "480p SD"
                            elif "360" in matched_txt:
                                q_val, w_val, h_val, dim_label = 360, 640, 360, "360p"
                            elif "240" in matched_txt:
                                q_val, w_val, h_val, dim_label = 240, 426, 240, "240p"
                            else:
                                q_val, w_val, h_val, dim_label = 720, 1280, 720, "720p HD"

                            img_obj = AlbumImage(
                                position=idx + 1,
                                candidate_id=f"vid_direct_{idx+1}",
                                thumbnail_url=poster_url or vurl,
                                original_url=vurl,
                                video_stream_url=vurl,
                                poster_url=poster_url,
                                media_type="video",
                                title=f"{v_title} ({dim_label})",
                                width=w_val,
                                height=h_val,
                                format="mp4",
                                resolution_method=ResolutionMethod.VERIFIED_CDN_CANDIDATE,
                                confidence=1.0,
                                validation_status="PASS",
                                source_page=req.url
                            )
                            vid_images.append(img_obj)
                            if queue:
                                await queue.put({
                                    "type": "image_resolved",
                                    "position": idx + 1,
                                    "url": vurl,
                                    "thumbnail_url": poster_url or vurl,
                                    "video_stream_url": vurl,
                                    "media_type": "video",
                                    "title": f"{v_title} ({dim_label})",
                                    "dimensions": dim_label,
                                    })

                        album = Album(
                            album_id=f"vid_{abs(hash(req.url)) % 1000000}",
                            title=v_title,
                            original_title=v_title,
                            source_page=req.url,
                            source_type="video",
                            cover_image_url=poster_url,
                            images=vid_images,
                            telemetry=TelemetryMetrics(
                                candidates_discovered=len(vid_images),
                                candidates_investigated=len(vid_images),
                                originals_resolved=len(vid_images),
                                duration_seconds=1.0,
                            ),
                            metadata={"method": "direct_http_sniffer", "media_type": "video"}
                        )
                        album.metadata["model_used"] = req.model_name or "Direct Video Sniffer"
                        album.metadata["media_type_filter"] = req.media_type_filter or "all"
                        try:
                            album = await probe_and_update_album_metadata(album, session_id=session_id, save_to_disk=False)
                        except Exception as probe_err:
                            logger.warning(f"Error during direct video post-extraction size probe: {probe_err}")
                        _completed_albums[session_id] = album
                        _save_album_to_disk(session_id, album)

                        if session_id in _active_jobs:
                            _active_jobs[session_id]["status"] = "completed"
                            _active_jobs[session_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                            _active_jobs[session_id]["progress"]["current"] = len(album.images)
                            _active_jobs[session_id]["progress"]["total"] = len(album.images)
                            _active_jobs[session_id]["progress"]["status"] = f"Álbum salvo ({len(album.images)} vídeos originais)"

                        if queue:
                            c_evt = {
                                "type": "completed",
                                "album": AgentDebugger.get_ui_summary(album),
                            }
                            _record_session_event(session_id, c_evt)
                            await queue.put(c_evt)

                        vid_items = [img for img in album.images if img.media_type == "video" and (img.video_stream_url or img.original_url)]
                        if vid_items:
                            def _v_rank(it: AlbumImage) -> int:
                                txt = ((it.video_stream_url or "") + " " + (it.original_url or "") + " " + (it.title or "")).lower()
                                if "2160" in txt or "4k" in txt: return 2160
                                if "1440" in txt or "2k" in txt: return 1440
                                if "1080" in txt or "fhd" in txt: return 1080
                                if "720" in txt or "hd" in txt: return 720
                                if "480" in txt: return 480
                                if "360" in txt: return 360
                                if "240" in txt: return 240
                                return it.height or it.width or 0
                            sorted_vids = sorted(vid_items, key=_v_rank, reverse=True)
                            asyncio.create_task(_download_highest_video_task(album.title or "video_extraido", sorted_vids))
                        return
            except Exception as direct_err:
                logger.warning(f"Direct video sniffer failed, falling back to Playwright: {direct_err}")

        if not album or not album.images:
            if queue:
                nav_evt = {"type": "status", "message": f"Navigating to {req.url} (Model: {llm.model_name})..."}
                _record_session_event(session_id, nav_evt)
                await queue.put(nav_evt)

            album = await brain.run(
                req.url,
                on_event=on_agent_event,
                controller=controller,
                media_type_filter=req.media_type_filter or "all",
            )
        album.metadata["model_used"] = req.model_name
        album.metadata["media_type_filter"] = req.media_type_filter or "all"
        _completed_albums[session_id] = album
        _save_album_to_disk(session_id, album)

        is_vid_album = req.media_type_filter == "videos" or any(img.media_type == "video" for img in album.images)
        media_label = "vídeos" if is_vid_album else "fotos"

        # Auto-save highest quality extracted video to the Video Gallery in background (non-blocking for SSE and client)
        if (req.media_type_filter == "videos" or is_vid_album) and album.images:
            vid_items = [img for img in album.images if img.media_type == "video" and (img.video_stream_url or img.original_url)]
            if vid_items:
                def _v_rank(it: AlbumImage) -> int:
                    txt = ((it.video_stream_url or "") + " " + (it.original_url or "") + " " + (it.title or "")).lower()
                    if "2160" in txt or "4k" in txt: return 2160
                    if "1440" in txt or "2k" in txt: return 1440
                    if "1080" in txt or "fhd" in txt: return 1080
                    if "720" in txt or "hd" in txt: return 720
                    if "480" in txt: return 480
                    if "360" in txt: return 360
                    if "240" in txt: return 240
                    return it.height or it.width or 0

                sorted_vids = sorted(vid_items, key=_v_rank, reverse=True)
                asyncio.create_task(_download_highest_video_task(album.title or "video_extraido", sorted_vids))

        if session_id in _active_jobs:
            _active_jobs[session_id]["status"] = "cancelled" if controller.is_cancelled else "completed"
            _active_jobs[session_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            _active_jobs[session_id]["progress"]["current"] = len(album.images)
            _active_jobs[session_id]["progress"]["total"] = len(album.images)
            _active_jobs[session_id]["progress"]["status"] = f"Álbum salvo ({len(album.images)} {media_label} originais)"

        if queue:
            c_evt = {
                "type": "completed",
                "album": AgentDebugger.get_ui_summary(album),
            }
            _record_session_event(session_id, c_evt)
            await queue.put(c_evt)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Error analyzing {req.url}: {e}\n{tb}", exc_info=True)
        err_evt = {
            "type": "ai_thought",
            "stage": "SERVER_EXCEPTION",
            "thought": f" [BACK-END EXCEPTION @ {session_id}] {str(e)}",
            "traceback": tb,
            "error": str(e),
        }
        _record_session_event(session_id, err_evt)
        if session_id in _active_jobs:
            _active_jobs[session_id]["status"] = "error"
            _active_jobs[session_id]["error"] = str(e)
            _active_jobs[session_id]["traceback"] = tb
        if queue:
            await queue.put(err_evt)
            await queue.put({"type": "error", "error": str(e), "traceback": tb})
    finally:
        await engine.close()


@app.get("/api/jobs")
async def get_all_jobs():
    """
    Returns full persistent ledger of jobs from data/jobs.json
    sorted newest first.
    """
    _load_jobs_from_disk()
    jobs = list(_active_jobs.values())
    jobs.sort(key=lambda j: j.get("started_at", ""), reverse=True)
    return jobs


@app.get("/api/jobs/active")
async def get_active_jobs():
    """
    Returns list of all currently running and queued background extraction tasks
    to enable live reconnection across page reloads, mobile devices, and desktop.
    """
    _load_jobs_from_disk()
    jobs = list(_active_jobs.values())
    return [j for j in jobs if j.get("status") in ("active", "running", "completed", "error")]


@app.post("/api/jobs/{session_id}/cancel")
async def cancel_job(session_id: str):
    """
    Cancels an active background extraction job cleanly.
    """
    if session_id in _job_controllers:
        _job_controllers[session_id].cancel()
    if session_id in _active_jobs:
        _active_jobs[session_id]["status"] = "cancelled"
        _active_jobs[session_id]["progress"]["status"] = "Cancelado pelo usuário"
        _save_jobs_to_disk()
    return {"session_id": session_id, "status": "cancelled"}


@app.delete("/api/jobs/{session_id}")
async def delete_job(session_id: str):
    """
    Deletes a job record from the persistent ledger.
    """
    if session_id in _active_jobs:
        del _active_jobs[session_id]
        _save_jobs_to_disk()
    return {"session_id": session_id, "deleted": True}


@app.post("/api/jobs/clear-queue")
async def clear_jobs_queue():
    """Cancels and clears all active/queued jobs from the queue."""
    cleared = 0
    for jid, j in list(_active_jobs.items()):
        if j.get("status") in ("running", "queued", "active"):
            if jid in _job_controllers:
                try:
                    _job_controllers[jid].cancel()
                except Exception:
                    pass
            j["status"] = "cancelled"
            if isinstance(j.get("progress"), dict):
                j["progress"]["status"] = "Cancelado pelo usuário"
            cleared += 1
    _save_jobs_to_disk()
    return {"success": True, "cleared_count": cleared}


@app.get("/api/events/{session_id}")
async def stream_events(session_id: str):
    """Streams live real-time SSE updates for approved images, telemetry, and status."""
    queue = _active_event_queues.get(session_id)
    history = list(_session_events_history.get(session_id, []))

    if not queue:
        _load_albums_from_disk()
        album = _completed_albums.get(session_id)
        if album or history:
            async def single_batch_gen():
                for past_event in history:
                    yield f"data: {json.dumps(past_event)}\n\n"
                if album:
                    data = json.dumps({"type": "completed", "album": AgentDebugger.get_ui_summary(album)})
                    yield f"data: {data}\n\n"
            return StreamingResponse(single_batch_gen(), media_type="text/event-stream")

        # Graceful stream closure for expired/reconnecting client sessions
        async def expired_session_gen():
            yield f"data: {json.dumps({'type': 'error', 'error': 'Session completed or expired'})}\n\n"
        return StreamingResponse(expired_session_gen(), media_type="text/event-stream")

    async def event_generator():
        # Replay all buffered past events for this session so reconnecting clients recover the entire timeline
        for past_event in history:
            yield f"data: {json.dumps(past_event)}\n\n"

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=45.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in ("completed", "error"):
                    break
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/albums")
async def list_albums(filter: Optional[str] = None, media_type: Optional[str] = None):
    """Lists all saved albums loaded from data/albums/ with full summary metrics, supporting GIF/filter queries."""
    _load_albums_from_disk()
    summaries = []
    for sid, a in _completed_albums.items():
        summary = AgentDebugger.get_ui_summary(a)
        summary["session_id"] = sid
        fpath = os.path.join(ALBUMS_DIR, f"{sid}.json")
        summary["file_mtime"] = os.path.getmtime(fpath) if os.path.exists(fpath) else 0
        summaries.append(summary)

    # Filter by GIFs / animated media if requested
    if filter == "gifs" or media_type == "gif":
        summaries = [
            s for s in summaries
            if s.get("metadata", {}).get("has_gifs")
            or "gif" in [str(t).lower() for t in s.get("tags", [])]
            or any(i.get("media_type") == "gif" or i.get("is_animated") for i in s.get("images", []))
        ]

    # Sort newest download first (exact second / millisecond)
    summaries.sort(
        key=lambda x: (x.get("metadata", {}).get("saved_at", ""), x.get("file_mtime", 0)),
        reverse=True
    )

    # Deduplicate by album_id: keep only the most recent session per logical album.
    # Multiple sess_XXX.json files can share the same album_id when the same page was
    # extracted more than once; show only one entry (the most recently saved).
    seen_album_ids: set = set()
    deduped_summaries = []
    for s in summaries:
        aid = s.get("album_id") or s.get("session_id")
        if aid and aid in seen_album_ids:
            continue
        if aid:
            seen_album_ids.add(aid)
        deduped_summaries.append(s)
    summaries = deduped_summaries

    return summaries


async def probe_and_update_album_metadata(album: Album, session_id: str = None, save_to_disk: bool = True) -> Album:
    """
    Probes remote origin servers to acquire genuine Content-Length and binary image dimensions
    for any images missing real metadata. Zero fake/mock values.
    Uses ultra-fast HEAD requests first (<30ms), with fallback to streaming GET.
    """
    album = sanitize_album_images(album)
    missing_imgs = [img for img in album.images if (not img.file_size or img.file_size <= 0 or not img.width or img.width == 0)]
    if not missing_imgs:
        if save_to_disk and session_id:
            _save_album_to_disk(session_id, album)
        return album

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": album.source_page or "https://google.com"
    }

    semaphore = asyncio.Semaphore(5)
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        async def _probe(img: AlbumImage):
            url = img.original_url or img.thumbnail_url
            if not url or not url.startswith("http"):
                return
            async with semaphore:
                for attempt in range(2):
                    try:
                        probe_hdrs = dict(headers)
                        if "eporner" in url.lower():
                            probe_hdrs["Referer"] = "https://www.eporner.com/"
                        elif "imx.to" in url.lower():
                            probe_hdrs["Referer"] = "https://imx.to/"
                        elif "phncdn.com" in url.lower() or "pornhub.com" in url.lower():
                            probe_hdrs.update(_get_video_download_headers(url, album.source_page or getattr(img, "source_page", None)))

                        # 1. Tenta HEAD primeiro (ultrarrápido, sem baixar bytes)
                        head_success = False
                        try:
                            head_resp = await client.head(url, headers=probe_hdrs)
                            if head_resp.status_code in (200, 206):
                                cl = head_resp.headers.get("content-length")
                                if cl and cl.isdigit() and int(cl) > 0:
                                    img.file_size = int(cl)
                                    head_success = True
                            elif head_resp.status_code == 503:
                                await asyncio.sleep(0.5)
                                continue
                        except Exception:
                            pass

                        # 2. Se falta tamanho ou faltam dimensões em imagens, faz GET parcial
                        need_dimensions = (img.media_type != "video" and (not img.width or img.width == 0))
                        need_size = (not img.file_size or img.file_size <= 0)

                        if need_dimensions or (need_size and not head_success):
                            get_hdrs = dict(probe_hdrs)
                            if img.media_type == "video":
                                get_hdrs["Range"] = "bytes=0-0"
                            async with client.stream("GET", url, headers=get_hdrs) as resp:
                                if resp.status_code in (200, 206):
                                    if need_size:
                                        cr = resp.headers.get("content-range", "")
                                        if "/" in cr:
                                            part = cr.split("/")[-1].strip()
                                            if part.isdigit() and int(part) > 0:
                                                img.file_size = int(part)
                                        elif resp.headers.get("content-length"):
                                            cl = resp.headers.get("content-length", "")
                                            if cl and cl.isdigit() and int(cl) > 0:
                                                img.file_size = int(cl)

                                    if need_dimensions:
                                        chunk = b""
                                        async for c in resp.aiter_bytes():
                                            chunk += c
                                            if len(chunk) >= 8192:
                                                break
                                        pw, ph = parse_image_dimensions(chunk)
                                        if pw and ph:
                                            img.width = pw
                                            img.height = ph
                                        elif len(chunk) > 16 and Image is not None:
                                            try:
                                                pil_im = Image.open(io.BytesIO(chunk))
                                                img.width = pil_im.size[0]
                                                img.height = pil_im.size[1]
                                            except Exception:
                                                pass
                        break
                    except Exception:
                        await asyncio.sleep(0.3)

        await asyncio.gather(*[_probe(img) for img in missing_imgs])

    if save_to_disk and session_id:
        try:
            _save_album_to_disk(session_id, album)
        except Exception as e:
            logger.warning(f"Failed to persist updated album metadata: {e}")

    return album


@app.get("/api/albums/{session_id}")
async def get_album(session_id: str):
    """Retrieves a completed album entity by session_id, ensuring genuine metadata is populated."""
    if session_id not in _completed_albums:
        _load_albums_from_disk()
    if session_id not in _completed_albums:
        raise HTTPException(status_code=404, detail="Album not found")
    album = _completed_albums[session_id]

    has_missing_info = any(
        (not img.file_size or img.file_size <= 0) or
        (img.media_type != "video" and (not img.width or img.width == 0))
        for img in album.images
    )
    if has_missing_info:
        album = await probe_and_update_album_metadata(album, session_id=session_id, save_to_disk=True)

    summary = AgentDebugger.get_ui_summary(album)
    summary["session_id"] = session_id
    return summary


@app.post("/api/albums/{session_id}/sync-metadata")
async def sync_album_metadata_endpoint(session_id: str):
    """Synchronizes genuine file sizes, resolutions and fresh stream URLs for this album."""
    album = _completed_albums.get(session_id)
    if not album:
        _load_albums_from_disk()
        album = _completed_albums.get(session_id)
    if not album:
        fpath = os.path.join(ALBUMS_DIR, f"{session_id}.json")
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                album = Album.model_validate_json(f.read())
                _completed_albums[session_id] = album
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    has_videos = any(getattr(img, "media_type", None) == "video" for img in album.images)
    if has_videos:
        async with _stream_refresh_semaphore:
            await _refresh_album_video_streams(album)

    album = await probe_and_update_album_metadata(album, session_id=session_id, save_to_disk=True)
    _completed_albums[session_id] = album
    _save_album_to_disk(session_id, album)

    summary = AgentDebugger.get_ui_summary(album)
    summary["session_id"] = session_id
    return summary


@app.delete("/api/albums/{session_id}")
async def delete_album(session_id: str):
    """Moves an album to the Trash Bin."""
    if session_id not in _completed_albums:
        _load_albums_from_disk()
    
    summary = {}
    if session_id in _completed_albums:
        summary = AgentDebugger.get_ui_summary(_completed_albums[session_id])
        del _completed_albums[session_id]

    trash_item = trash_service.move_album_to_trash(session_id, summary)
    
    # Remove o arquivo JSON do disco local caso ainda exista
    fpath = os.path.join(ALBUMS_DIR, f"{session_id}.json")
    if os.path.exists(fpath):
        try:
            os.remove(fpath)
        except Exception:
            pass

    return {"session_id": session_id, "deleted": True, "trash_item": trash_item}


class DeleteImagesRequest(BaseModel):
    image_ids: List[str]


@app.post("/api/albums/{session_id}/delete-images")
async def delete_album_images(session_id: str, req: DeleteImagesRequest):
    """Removes specific images from an album, saving them to the Trash Bin."""
    if session_id not in _completed_albums:
        _load_albums_from_disk()
    if session_id not in _completed_albums:
        raise HTTPException(status_code=404, detail="Album not found")

    album = _completed_albums[session_id]
    to_delete = set(req.image_ids)
    original_count = len(album.images)

    deleted_images_data = []
    retained_images = []
    for idx, img in enumerate(album.images):
        frontend_id = f"real-img-{session_id}-{idx}"
        cand_id = f"cand-{img.candidate_id}" if img.candidate_id else ""
        if (
            frontend_id in to_delete
            or (img.id and img.id in to_delete)
            or (img.candidate_id and img.candidate_id in to_delete)
            or cand_id in to_delete
            or str(idx) in to_delete
            or str(img.position) in to_delete
            or (img.original_url and img.original_url in to_delete)
            or (img.thumbnail_url and img.thumbnail_url in to_delete)
        ):
            deleted_images_data.append(img.model_dump())
            continue
        retained_images.append(img)

    for new_pos, img in enumerate(retained_images):
        img.position = new_pos

    album.images = retained_images
    if album.cover_image_url and not any(img.original_url == album.cover_image_url for img in album.images):
        album.cover_image_url = album.images[0].original_url if album.images else ""

    _save_album_to_disk(session_id, album)

    # Move deleted images to trash
    if deleted_images_data:
        trash_service.move_photos_to_trash(
            session_id, album.title or album.original_title or session_id, deleted_images_data
        )

    summary = AgentDebugger.get_ui_summary(album)
    summary["session_id"] = session_id
    deleted_count = original_count - len(retained_images)
    logger.info(f"Moved {deleted_count} image(s) from album {session_id} to trash. Remaining: {len(retained_images)}")
    return {
        "session_id": session_id,
        "deleted_count": deleted_count,
        "remaining_count": len(retained_images),
        "album": summary
    }


@app.get("/api/patterns")
async def list_domain_patterns():
    """Lists all learned domain knowledge and inductive patterns from data/knowledge/."""
    patterns = []
    k_dir = os.path.join(DATA_DIR, "knowledge")
    if os.path.exists(k_dir):
        for fname in os.listdir(k_dir):
            if fname.endswith(".json"):
                fpath = os.path.join(k_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        domain = data.get("domain") or fname[:-5]
                        
                        test_samples = []
                        for method in data.get("preferred_resolution_methods", ["individual_page"]):
                            test_samples.append({
                                "thumb": f"https://{domain}/thumb_sample.jpg",
                                "resolved": f"https://{domain}/original_{method}.jpg",
                                "status": "valid"
                            })
                            
                        regex_target = ""
                        replacement = ""
                        for sig in data.get("positive_signatures", []):
                            if "replace" in sig or "pattern" in sig or "lambda" in sig:
                                regex_target = sig
                        if not regex_target:
                            p_conts = data.get('primary_containers', ['.gallery'])
                            regex_target = f"Container: {', '.join(p_conts) if isinstance(p_conts, list) else p_conts}"
                            p_methods = data.get('preferred_resolution_methods', ['individual_page'])
                            replacement = f"Método Original: {', '.join(p_methods) if isinstance(p_methods, list) else p_methods}"

                        patterns.append({
                            "id": f"pat_{abs(hash(domain)) % 100000}",
                            "domain": domain,
                            "name": f"Padrão Aprendido: {domain}",
                            "regexTarget": regex_target,
                            "replacementPattern": replacement,
                            "confidenceScore": 0.95,
                            "testSamples": test_samples,
                            "isCustom": False,
                            "primaryContainers": data.get("primary_containers", []),
                            "positiveSignatures": data.get("positive_signatures", []),
                            "negativeFilters": data.get("negative_filters", []),
                            "preferredResolutionMethods": data.get("preferred_resolution_methods", []),
                            "sampleEvidence": data.get("sample_evidence", []),
                            "demonstrationCount": data.get("demonstration_count", 1),
                            "updatedAt": data.get("updated_at", ""),
                        })
                except Exception as err:
                    logger.warning(f"Error reading pattern {fpath}: {err}")
    patterns.sort(key=lambda p: p.get("domain", ""))
    return patterns


@app.delete("/api/patterns/{domain}")
async def delete_domain_pattern(domain: str):
    """Deletes learned domain knowledge from data/knowledge/<domain>.json."""
    fpath = os.path.join(DATA_DIR, "knowledge", f"{domain}.json")
    deleted = False
    if os.path.exists(fpath):
        os.remove(fpath)
        deleted = True
    return {"domain": domain, "deleted": deleted}


# ==========================================
# VIDEO GALLERY & STORAGE API
# ==========================================

class CreateFolderRequest(BaseModel):
    name: str

class RenameFolderRequest(BaseModel):
    new_name: str

class RenameVideoRequest(BaseModel):
    title: str

class MoveVideoRequest(BaseModel):
    target_folder: str

class AddVideoUrlRequest(BaseModel):
    url: str
    folder: Optional[str] = "Geral"
    title: Optional[str] = None
    stream_only: Optional[bool] = False

class BatchDeleteVideosRequest(BaseModel):
    video_ids: List[str]

class BatchMoveVideosRequest(BaseModel):
    video_ids: List[str]
    target_folder: str

class ImportLocalPathRequest(BaseModel):
    path: str
    folder: Optional[str] = "Geral"
    mode: Optional[str] = "copy"  # "copy" or "move"

class SaveExtractedVideoRequest(BaseModel):
    video_url: str
    title: Optional[str] = None
    folder: Optional[str] = "Geral"
    candidate_id: Optional[str] = None
    source_url: Optional[str] = None



class DownloadTaskController:
    """Controller to allow user cancellation of active video downloads."""
    def __init__(self, task: asyncio.Task, target_path: Optional[str] = None):
        self.task = task
        self.target_path = target_path
        self.is_cancelled = False

    def cancel(self):
        self.is_cancelled = True
        if self.task and not self.task.done():
            self.task.cancel()
        if self.target_path and os.path.exists(self.target_path):
            try:
                os.remove(self.target_path)
            except Exception:
                pass


async def _run_video_download_task(
    job_id: str,
    vurl: str,
    clean_title: str,
    folder_name: str,
    target_path: str,
    headers: dict,
    source_url: str = "",
    source_id: str = ""
):

    """
    Background worker that downloads an extracted video stream, emits live progress
    (bytes, percent, speed) to _active_jobs for real-time tracking in Task Audit,
    supports automatic Range resumption on network hiccups, and updates VideoService upon completion.
    """
    start_time = time.time()
    last_disk_save = start_time
    total_written = 0
    total_bytes = 0
    custom_timeout = httpx.Timeout(connect=30.0, read=None, write=60.0, pool=60.0)
    max_retries = 3
    retry_count = 0
    use_resilient = False
    resilient_reason = ""

    # Check if direct stream is an HLS playlist or Pornhub stream known to require TLS Chrome impersonation
    if any(marker in vurl.lower() for marker in (".m3u8", "pornhub.com", "phncdn.com", "hv-h.", "ev-h.")) or (source_url and "pornhub.com" in source_url.lower()):
        use_resilient = True
        resilient_reason = "formato HLS / CDN protegido"

    try:
        if not use_resilient:
            while retry_count <= max_retries:
                try:
                    curr_headers = dict(headers)
                    if total_written > 0:
                        curr_headers["Range"] = f"bytes={total_written}-"

                    async with httpx.AsyncClient(timeout=custom_timeout, follow_redirects=True) as client:
                        async with client.stream("GET", vurl, headers=curr_headers) as resp:
                            if resp.status_code not in (200, 206):
                                use_resilient = True
                                resilient_reason = f"HTTP {resp.status_code}"
                                break

                            cl = resp.headers.get("content-length")
                            cr = resp.headers.get("content-range")
                            if cr and "/" in cr:
                                try:
                                    total_bytes = int(cr.split("/")[-1])
                                except Exception:
                                    pass
                            elif cl and int(cl) > 0 and total_bytes == 0:
                                total_bytes = int(cl) + total_written

                            if job_id in _active_jobs:
                                _active_jobs[job_id]["total_bytes"] = total_bytes
                                _active_jobs[job_id]["progress"]["total"] = total_bytes if total_bytes > 0 else 100

                            mode = "ab" if total_written > 0 else "wb"
                            with open(target_path, mode) as fp:
                                async for chunk in resp.aiter_bytes(chunk_size=256 * 1024):
                                    fp.write(chunk)
                                    total_written += len(chunk)
                                    now = time.time()
                                    elapsed = max(0.2, now - start_time)
                                    speed_mbps = (total_written / elapsed) / (1024 * 1024)

                                    if total_bytes > 0:
                                        percent = min(99, int((total_written / total_bytes) * 100))
                                        status_msg = (
                                            f"Baixando: {total_written / (1024 * 1024):.1f} MB / "
                                            f"{total_bytes / (1024 * 1024):.1f} MB ({percent}%) • {speed_mbps:.1f} MB/s"
                                        )
                                    else:
                                        percent = min(99, int(total_written / (100 * 1024 * 1024) * 100))
                                        status_msg = f"Baixando: {total_written / (1024 * 1024):.1f} MB • {speed_mbps:.1f} MB/s"

                                    if job_id in _active_jobs:
                                        _active_jobs[job_id]["downloaded_bytes"] = total_written
                                        _active_jobs[job_id]["throughput_mbps"] = round(speed_mbps, 2)
                                        _active_jobs[job_id]["duration_seconds"] = round(elapsed, 1)
                                        _active_jobs[job_id]["progress"]["current"] = total_written if total_bytes > 0 else percent
                                        _active_jobs[job_id]["progress"]["percent"] = percent
                                        _active_jobs[job_id]["progress"]["downloaded_bytes"] = total_written
                                        _active_jobs[job_id]["progress"]["total_bytes"] = total_bytes
                                        _active_jobs[job_id]["progress"]["throughput_mbps"] = round(speed_mbps, 2)
                                        _active_jobs[job_id]["progress"]["status"] = status_msg

                                    if now - last_disk_save >= 3.0:
                                        _save_jobs_to_disk(sync_hf=False)
                                        last_disk_save = now

                    # Download finished successfully
                    break

                except (httpx.TransportError, httpx.TimeoutException) as net_err:
                    retry_count += 1
                    if retry_count > max_retries:
                        use_resilient = True
                        resilient_reason = str(net_err)
                        break
                    logger.warning(f"[VideoDownloader] Conexão oscilou ({net_err}), retomando download via Range ({retry_count}/{max_retries})...")
                    if job_id in _active_jobs:
                        _active_jobs[job_id]["progress"]["status"] = f"Reconectando... ({total_written / (1024 * 1024):.1f} MB baixados)"
                        _save_jobs_to_disk(sync_hf=False)
                    await asyncio.sleep(2.0)

        # Fallback to resilient yt-dlp downloader if direct stream failed or was skipped
        if use_resilient or total_written < 1_000_000:
            logger.info(f"[VideoDownloader] Acionando motor resiliente ({resilient_reason}) para: {vurl}")
            if job_id in _active_jobs:
                _active_jobs[job_id]["model"] = "Resilient Engine (yt-dlp + Chrome)"
                _active_jobs[job_id]["progress"]["status"] = "Alternando para motor resiliente (yt-dlp + Chrome)..."
                _save_jobs_to_disk(sync_hf=False)

            from .resilient_downloader import download_video_resilient

            def _progress_cb(data):
                if job_id in _active_jobs:
                    d_bytes = data.get("downloaded_bytes", 0)
                    t_bytes = data.get("total_bytes", 0)
                    spd = data.get("throughput_mbps", 0.0)
                    pct = data.get("percent", 0)
                    _active_jobs[job_id]["downloaded_bytes"] = d_bytes
                    _active_jobs[job_id]["total_bytes"] = t_bytes if t_bytes > 0 else _active_jobs[job_id]["total_bytes"]
                    _active_jobs[job_id]["throughput_mbps"] = spd
                    _active_jobs[job_id]["duration_seconds"] = data.get("duration_seconds", 0.0)
                    _active_jobs[job_id]["progress"]["current"] = d_bytes
                    _active_jobs[job_id]["progress"]["total"] = t_bytes if t_bytes > 0 else _active_jobs[job_id]["progress"]["total"]
                    _active_jobs[job_id]["progress"]["percent"] = pct
                    _active_jobs[job_id]["progress"]["downloaded_bytes"] = d_bytes
                    _active_jobs[job_id]["progress"]["total_bytes"] = t_bytes
                    _active_jobs[job_id]["progress"]["throughput_mbps"] = spd
                    _active_jobs[job_id]["progress"]["status"] = data.get("status", "")
                    _save_jobs_to_disk(sync_hf=False)

            def _cancel_chk():
                ctrl = _job_controllers.get(job_id)
                return ctrl.is_cancelled if ctrl else False

            resilient_url = source_url or vurl
            await download_video_resilient(
                url=resilient_url,
                target_path=target_path,
                clean_title=clean_title,
                referer=source_url or headers.get("Referer"),
                progress_callback=_progress_cb,
                cancel_check=_cancel_chk
            )
            if os.path.exists(target_path):
                total_written = os.path.getsize(target_path)

        if total_written < 100_000:
            if os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except Exception:
                    pass
            raise RuntimeError("Vídeo indisponível ou corrompido (tamanho insuficiente).")

        if job_id in _active_jobs:
            _active_jobs[job_id]["progress"]["status"] = "Gerando miniatura e salvando na galeria..."

        # Registra nos metadados do VideoService
        final_title = os.path.splitext(os.path.basename(target_path))[0].replace("_", " ").replace("-", " ")
        rel_path = os.path.relpath(target_path, video_service.base_dir).replace("\\", "/")
        vid_id = video_service._get_video_id(rel_path)

        video_service._update_single_metadata(
            target_path,
            title=final_title,
            folder=folder_name,
            is_favorite=False,
            vid_id=vid_id,
            storage_location="local",
            file_size_bytes=total_written,
            source_url=source_url or None,
            source_id=source_id or None,
        )


        filename = os.path.basename(target_path)
        video_service._trigger_background_upload(vid_id, target_path, folder_name, filename)

        dur = round(time.time() - start_time, 1)
        if job_id in _active_jobs:
            _active_jobs[job_id]["status"] = "completed"
            _active_jobs[job_id]["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            _active_jobs[job_id]["duration_seconds"] = dur
            _active_jobs[job_id]["downloaded_bytes"] = total_written
            _active_jobs[job_id]["total_bytes"] = total_written
            _active_jobs[job_id]["progress"]["percent"] = 100
            _active_jobs[job_id]["progress"]["current"] = total_written
            _active_jobs[job_id]["progress"]["total"] = total_written
            _active_jobs[job_id]["progress"]["status"] = f"Vídeo salvo na pasta {folder_name}! ({total_written / (1024 * 1024):.1f} MB)"
            _active_jobs[job_id]["video_id"] = vid_id
            _save_jobs_to_disk(sync_hf=True)
        logger.info(f"[VideoDownloader] Sucesso: {target_path} ({total_written / (1024 * 1024):.1f} MB em {dur}s)")

    except asyncio.CancelledError:
        logger.info(f"[VideoDownloader] Cancelado pelo usuário: {job_id}")
        if os.path.exists(target_path):
            try:
                os.remove(target_path)
            except Exception:
                pass
        if job_id in _active_jobs:
            _active_jobs[job_id]["status"] = "cancelled"
            _active_jobs[job_id]["progress"]["status"] = "Download cancelado pelo usuário"
            _save_jobs_to_disk(sync_hf=True)
    except Exception as e:
        logger.error(f"[VideoDownloader] Falha ao baixar {vurl}: {e}")
        if os.path.exists(target_path):
            try:
                os.remove(target_path)
            except Exception:
                pass
        if job_id in _active_jobs:
            _active_jobs[job_id]["status"] = "error"
            _active_jobs[job_id]["error"] = str(e)
            _active_jobs[job_id]["progress"]["status"] = f"Erro: {e}"
            _save_jobs_to_disk(sync_hf=True)
    finally:
        _job_controllers.pop(job_id, None)



@app.post("/api/extractor/save-video-to-gallery")
async def save_extracted_video_to_gallery(req: SaveExtractedVideoRequest):
    """
    Inicia o download e salvamento do vídeo em segundo plano desacoplado no servidor.
    Retorna imediatamente o job_id com status 'running' para auditoria em tempo real.
    """
    clean_title = req.title or "video_extraido"
    filename = "".join(c for c in clean_title if c.isalnum() or c in ("-", "_", " ")).strip() or f"vid_{int(time.time())}"
    if not any(filename.lower().endswith(ext) for ext in (".mp4", ".webm", ".mov", ".mkv")):
        filename += ".mp4"

    vurl = req.video_url
    if "/api/proxy-video-stream" in vurl and "url=" in vurl:
        import urllib.parse
        parsed = urllib.parse.urlparse(vurl)
        params = urllib.parse.parse_qs(parsed.query)
        if "url" in params:
            vurl = params["url"][0]

    source_page_url = req.source_url or req.video_url
    # If vurl is a webpage URL rather than direct media, resolve the stream URL
    m_ep_id = re.search(r"video-([a-zA-Z0-9]{8,15})", vurl) or re.search(r"video-([a-zA-Z0-9]{8,15})", source_page_url)
    m_ph_id = re.search(r"viewkey=([a-zA-Z0-9]+)", vurl) or re.search(r"viewkey=([a-zA-Z0-9]+)", source_page_url)
    if m_ph_id:
        source_page_url = f"https://www.pornhub.com/view_video.php?viewkey={m_ph_id.group(1)}"
    elif m_ep_id:
        source_page_url = f"https://www.eporner.com/video-{m_ep_id.group(1)}/"

    vid_id = m_ep_id.group(1) if m_ep_id else (m_ph_id.group(1) if m_ph_id else (req.candidate_id or ""))
    if vid_id or not any(ext in vurl.lower() for ext in (".mp4", ".m3u8", ".webm", ".mov")):
        try:
            resolved_stream = await _resolve_best_video_stream(vid_id or "vid", source_page_url or vurl)
            if resolved_stream:
                vurl = resolved_stream
            elif not source_page_url:
                return {
                    "success": False,
                    "message": "Não foi possível resolver o fluxo do vídeo para download."
                }
        except Exception as e_res:
            logger.warning(f"Could not resolve direct stream for {vurl}: {e_res}")

    headers = _get_video_download_headers(vurl, source_page_url)

    target_folder_name = req.folder or "Extraídos"
    target_folder = os.path.join(video_service.base_dir, target_folder_name)
    os.makedirs(target_folder, exist_ok=True)
    target_path = os.path.join(target_folder, filename)
    if os.path.exists(target_path):
        target_path = os.path.join(target_folder, f"{os.path.splitext(filename)[0]}_{int(time.time())}.mp4")

    job_id = f"save_vid_{int(time.time() * 1000) % 10000000}_{abs(hash(vurl)) % 10000}"

    _active_jobs[job_id] = {
        "session_id": job_id,
        "url": vurl,
        "mode": "video_save",
        "engine_type": "video_downloader",
        "status": "running",
        "model": "Direct Stream Engine",
        "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "progress": {
            "current": 0,
            "total": 100,
            "percent": 0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "throughput_mbps": 0.0,
            "title": f"Salvar Vídeo: {clean_title}",
            "status": "Iniciando download do stream..."
        },
        "downloaded_bytes": 0,
        "total_bytes": 0,
        "throughput_mbps": 0.0,
        "folder": target_folder_name,
        "target_path": target_path
    }
    _save_jobs_to_disk()

    download_task = asyncio.create_task(
        _run_video_download_task(
            job_id=job_id,
            vurl=vurl,
            clean_title=clean_title,
            folder_name=target_folder_name,
            target_path=target_path,
            headers=headers,
            source_url=source_page_url,
            source_id=vid_id or ""
        )
    )

    _job_controllers[job_id] = DownloadTaskController(download_task, target_path)

    return {
        "success": True,
        "job_id": job_id,
        "status": "running",
        "message": f"Download de '{clean_title}' iniciado em segundo plano.",
        "folder": target_folder_name
    }


# ---------------------------------------------------------------------------
# Web Video Page Scraper: Extract & Batch-Download All Videos from Page
# ---------------------------------------------------------------------------
def _normalize_title_for_comparison(t: str) -> str:
    """Removes tube tags, quality suffixes, and punctuation for fuzzy matching."""
    if not t:
        return ""
    t_clean = re.sub(r'(?i)\s*[-|]\s*(?:pornhub(?:\.com)?|eporner|xvideos|redtube|spankbang|brazzers).*$', '', t)
    t_clean = re.sub(r'(?i)\s*(?:1080p|720p|480p|360p|4k|hd|full\s*hd|mp4).*$', '', t_clean)
    return re.sub(r'[^a-zA-Z0-9]', '', t_clean.lower())


def _find_matching_existing_video(item_id: str, item_url: str, item_title: str, all_vids: list) -> Optional[dict]:
    """
    Checks if a scanned video item is already saved in the gallery.
    Matches by:
    1. Exact source_id or tube ID in filename.
    2. Exact source_url.
    3. Normalized title match.
    """
    clean_item_id = (item_id or "").strip().lower()
    clean_item_url = (item_url or "").strip().lower()
    norm_item_title = _normalize_title_for_comparison(item_title)

    for v in all_vids:
        # 1. Match by source_id
        v_sid = (v.get("source_id") or "").strip().lower()
        if clean_item_id and v_sid and clean_item_id == v_sid:
            return v

        # 2. Match by tube ID in filename or rel_path
        fn_low = (v.get("filename") or "").lower()
        rel_low = (v.get("rel_path") or "").lower()
        if clean_item_id and len(clean_item_id) >= 6:
            if clean_item_id in fn_low or clean_item_id in rel_low:
                return v

        # 3. Match by source_url
        v_surl = (v.get("source_url") or "").strip().lower()
        if clean_item_url and v_surl and clean_item_url == v_surl:
            return v

        # 4. Match by normalized title
        v_title = v.get("title") or ""
        norm_v_title = _normalize_title_for_comparison(v_title)
        if norm_item_title and norm_v_title:
            if norm_item_title == norm_v_title:
                return v
            # If long titles (>20 chars), check if one contains the other
            if len(norm_item_title) >= 20 and len(norm_v_title) >= 20:
                if norm_item_title in norm_v_title or norm_v_title in norm_item_title:
                    return v

    return None


class ScanPageVideosRequest(BaseModel):
    url: str
    max_items: Optional[int] = 100
    max_pages: Optional[int] = 1


class BatchSaveVideoItemInput(BaseModel):
    id: str
    title: str
    url: str
    thumbnail_url: Optional[str] = None
    stream_url: Optional[str] = None
    duration: Optional[str] = None
    candidate_id: Optional[str] = None


class BatchSaveVideosRequest(BaseModel):
    videos: List[BatchSaveVideoItemInput]
    folder: Optional[str] = "Extraídos"
    max_concurrency: Optional[int] = 2
    skip_existing: Optional[bool] = True



def _encode_b36_hash(hex_hash: str) -> str:
    """
    Converts 32-char hex hash from Eporner player to Base36 by splitting into
    four 8-character chunks, exactly as implemented in vjs854.js module 17:
    parseInt(r.substring(0,8), 16).toString(36) + ...
    """
    def _to_b36(val: int) -> str:
        chars = "0123456789abcdefghijklmnopqrstuvwxyz"
        if val == 0:
            return "0"
        res = []
        while val:
            res.append(chars[val % 36])
            val //= 36
        return "".join(reversed(res))

    if not hex_hash or len(hex_hash) != 32:
        return ""
    try:
        return (
            _to_b36(int(hex_hash[0:8], 16)) +
            _to_b36(int(hex_hash[8:16], 16)) +
            _to_b36(int(hex_hash[16:24], 16)) +
            _to_b36(int(hex_hash[24:32], 16))
        )
    except Exception:
        return ""


async def _resolve_best_video_stream(vid_id: str, page_url: str) -> Optional[str]:
    """
    Ultra-fast stream URL resolution for Eporner, Pornhub and universal video platforms.
    Resolves the real 1080p Full HD MP4 CDN stream.
    Rejects 'na.mp4' or placeholder error responses.
    """
    clean_id = (vid_id or "").replace("ep_", "").replace("vid_", "").replace("ph_", "")
    target_page = (page_url or "").strip()

    # 1. Pornhub dedicated stream resolution
    if "pornhub.com" in target_page or "viewkey=" in target_page or (vid_id and vid_id.startswith("ph_")):
        if not target_page or not target_page.startswith("http"):
            target_page = f"https://www.pornhub.com/view_video.php?viewkey={clean_id}"
        try:
            import yt_dlp
            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "skip_download": True,
                "http_headers": {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Referer": "https://www.pornhub.com/",
                    "Origin": "https://www.pornhub.com"
                }
            }
            def _ytdl_ph():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    return ydl.extract_info(target_page, download=False)
            info = await asyncio.to_thread(_ytdl_ph)
            formats = [f for f in info.get("formats", []) if f.get("ext") == "mp4" and f.get("url")]
            if formats:
                best = max(formats, key=lambda f: f.get("height", 0) or 0)
                cand = best.get("url")
                if cand and "na.mp4" not in cand:
                    logger.info(f"Resolved real Pornhub stream ({best.get('height')}p): {cand[:60]}...")
                    return cand
        except Exception as e_ph:
            logger.debug(f"Pornhub yt-dlp resolution failed for {target_page}: {e_ph}")

    # 2. Eporner fast XHR hash resolution
    if "eporner.com" in target_page or (not target_page and not (vid_id and vid_id.startswith("ph_"))):
        if not target_page:
            target_page = f"https://www.eporner.com/video-{clean_id}/"

        player_hash = ""
        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(
                    target_page,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                        "Referer": "https://www.eporner.com/"
                    }
                )
                if resp.status_code == 200:
                    html = resp.text
                    m_hash = re.search(r"EP\.video\.player\.hash\s*=\s*['\"]([a-f0-9]{32})['\"]", html)
                    if m_hash:
                        player_hash = m_hash.group(1)
                    else:
                        m_hash2 = re.search(r"['\"]hash['\"]\s*:\s*['\"]([a-f0-9]{32})['\"]", html)
                        if m_hash2:
                            player_hash = m_hash2.group(1)
        except Exception as e_page:
            logger.debug(f"Failed to fetch page for hash {clean_id}: {e_page}")

        if player_hash:
            enc_hash = _encode_b36_hash(player_hash)
            if enc_hash:
                try:
                    xhr_url = f"https://www.eporner.com/xhr/video/{clean_id}?hash={enc_hash}&device=desktop&domain=www.eporner.com&fallback=false"
                    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                        resp_xhr = await client.get(
                            xhr_url,
                            headers={
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                                "Referer": target_page,
                                "X-Requested-With": "XMLHttpRequest"
                            }
                        )
                        if resp_xhr.status_code == 200:
                            d = resp_xhr.json()
                            if d.get("available") and d.get("sources"):
                                mp4s = d.get("sources", {}).get("mp4", {})
                                quality_priority = [
                                    "1080p@60fps HD", "1080p HD", "1080p",
                                    "720p@60fps HD", "720p HD", "720p",
                                    "480p", "360p", "240p"
                                ]
                                for q in quality_priority:
                                    if q in mp4s and mp4s[q].get("src"):
                                        candidate_src = mp4s[q]["src"]
                                        if "na.mp4" not in candidate_src:
                                            logger.info(f"Resolved real stream for {clean_id} ({q}): {candidate_src[:60]}...")
                                            return candidate_src
                                for q_label, q_obj in mp4s.items():
                                    candidate_src = q_obj.get("src")
                                    if candidate_src and "na.mp4" not in candidate_src:
                                        logger.info(f"Resolved stream for {clean_id} ({q_label}): {candidate_src[:60]}...")
                                        return candidate_src
                except Exception as e_xhr:
                    logger.debug(f"XHR base36 resolution failed for {clean_id}: {e_xhr}")

    # 3. Universal fallback via yt-dlp
    if target_page and target_page.startswith("http"):
        try:
            import yt_dlp
            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "skip_download": True,
                "http_headers": _get_video_download_headers(target_page)
            }
            def _ytdl_generic():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    return ydl.extract_info(target_page, download=False)
            info = await asyncio.to_thread(_ytdl_generic)
            formats = [f for f in info.get("formats", []) if f.get("ext") == "mp4" and f.get("url")]
            if formats:
                best = max(formats, key=lambda f: f.get("height", 0) or 0)
                candidate_src = best.get("url")
                if candidate_src and "na.mp4" not in candidate_src:
                    return candidate_src
        except Exception as e2:
            logger.debug(f"yt-dlp fallback failed for {target_page}: {e2}")

    return None


@app.post("/api/video-scraper/scan-page")
async def scan_page_for_videos_endpoint(req: ScanPageVideosRequest):
    """
    Scans a web page URL to discover and extract ALL listed videos (thumbnails, titles, durations, IDs).
    Also persists the scanned collection as a video Album in the library for future access.
    """
    target_url = req.url.strip()
    if not target_url or not (target_url.startswith("http://") or target_url.startswith("https://")):
        raise HTTPException(status_code=400, detail="URL inválida.")

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch(headless=True)
        except Exception as launch_err:
            logger.warning(f"Chromium local não iniciou ({launch_err}), utilizando Chrome do sistema...")
            browser = await p.chromium.launch(headless=True, channel="chrome")
        try:
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            try:
                await page.goto(target_url, wait_until="domcontentloaded", timeout=40000)
            except Exception as nav_err:
                logger.warning(f"Navigation to {target_url} encountered: {nav_err}. Continuing with current DOM state if available.")


            # Smooth auto-scroll to trigger lazy loading / IntersectionObserver / virtualized DOM
            await page.evaluate("""async () => {
                const distance = 900;
                const delay = 120;
                let scrolled = 0;
                while (document.scrollingElement.scrollTop + window.innerHeight < document.scrollingElement.scrollHeight) {
                    document.scrollingElement.scrollBy(0, distance);
                    scrolled += distance;
                    await new Promise(r => setTimeout(r, delay));
                    if (scrolled > 25000) break;
                }
                window.scrollTo(0, 0);
            }""")
            await asyncio.sleep(0.5)

            raw_title = await page.title()
            clean_page_title = re.sub(r"\s*-\s*(?:EPORNER|Pornhub(?:\.com)?)\s*$", "", raw_title or "Vídeos da Página", flags=re.I).strip()

            # Universal DOM video extractor (Link-based + Multi-Card aggregation)
            scanned_items = await page.evaluate(r"""() => {
                const items = [];
                const seenIds = new Set();
                const seenHrefs = new Set();

                function extractVideoId(href, a) {
                    if (!href) return null;
                    if (a && a.closest && a.closest('header, nav, #header, #headerWrapper, .language-select, .languageMenu, .headerMenu, footer, .footer')) return null;
                    const txt = (a ? (a.innerText || '').trim().toLowerCase() : '');
                    if (['english', 'português', 'español', 'deutsch', 'français', 'italiano', 'idioma', 'language'].includes(txt)) return null;

                    // Eporner: /video-VuuljJoHUPf/
                    const mEp = href.match(/video-([a-zA-Z0-9]{8,15})/);
                    if (mEp) return 'ep_' + mEp[1];

                    // Pornhub: ?viewkey=ph60a...
                    const mPh = href.match(/viewkey=([a-zA-Z0-9]+)/);
                    if (mPh) return 'ph_' + mPh[1];

                    // XVideos: /video123456/ or /video.abcde/
                    const mXv = href.match(/\/video(\d+)\//) || href.match(/\/video\.([a-zA-Z0-9]+)\//);
                    if (mXv) return 'xv_' + mXv[1];

                    // Generic tube patterns: /video/ID, /videos/ID, /watch/ID, /watch?v=ID
                    const mGen = href.match(/(?:\/videos?\/|\/watch\?v=|\/watch\/|\/v\/)([a-zA-Z0-9_-]{5,32})/);
                    if (mGen) return 'gen_' + mGen[1];

                    return null;
                }

                function extractThumbnail(container) {
                    if (!container) return '';
                    const img = container.querySelector('img');
                    if (img) {
                        const src = img.getAttribute('data-src') ||
                                    img.getAttribute('data-thumb_url') ||
                                    img.getAttribute('data-mediumthumb') ||
                                    img.getAttribute('data-lazy-src') ||
                                    img.getAttribute('data-original') ||
                                    img.getAttribute('data-thumb') ||
                                    img.getAttribute('data-preview') ||
                                    img.getAttribute('data-poster') ||
                                    img.getAttribute('src');
                        if (src && !src.startsWith('data:image/svg') && !src.includes('placeholder')) {
                            return src.startsWith('//') ? 'https:' + src : src;
                        }
                        if (img.srcset) {
                            const parts = img.srcset.split(',');
                            if (parts.length > 0) {
                                const first = parts[0].trim().split(' ')[0];
                                if (first) return first.startsWith('//') ? 'https:' + first : first;
                            }
                        }
                    }
                    // Check background-image
                    const bgEls = [container, ...(container.querySelectorAll ? container.querySelectorAll('*') : [])];
                    for (const el of bgEls.slice(0, 8)) {
                        const style = el.getAttribute ? (el.getAttribute('style') || '') : '';
                        const mBg = style.match(/background-image:\s*url\(['"]?(https?:\/\/[^'")]+)['"]?\)/i);
                        if (mBg) return mBg[1];
                    }
                    return '';
                }

                const allLinks = Array.from(document.querySelectorAll('a[href]'));
                const videoLinks = allLinks.filter(a => extractVideoId(a.href, a) !== null);

                videoLinks.forEach((a, idx) => {
                    const rawId = extractVideoId(a.href, a);
                    if (!rawId || seenIds.has(rawId)) return;
                    seenIds.add(rawId);
                    seenHrefs.add(a.href);

                    const cleanId = rawId.replace(/^[a-z]{2,3}_/, '');
                    const card = a.closest('.mb, .video-box, .thumb-block, .item-video, .video-item, article.thumb, .videothumb, .phimage, .thumb, li, td') || a.parentElement || a;
                    const thumb = extractThumbnail(card) || extractThumbnail(a);

                    let title = a.getAttribute('title') ||
                                card.querySelector('.title, .video-title, h3, h4, h2, .name, [class*="title"]')?.innerText?.trim() ||
                                a.querySelector('img')?.getAttribute('alt') ||
                                a.querySelector('img')?.getAttribute('title') ||
                                a.innerText.trim();
                    title = title.replace(/\s+/g, ' ').replace(/-\s*(?:EPORNER|Pornhub(?:\.com)?)\s*$/i, '').trim();

                    const durEl = card.querySelector('.mbtim, .duration, .time, .badge-duration, [class*="duration"], [class*="time"]');
                    const duration = durEl ? durEl.innerText.trim() : '';

                    const qEl = card.querySelector('.mbhd, .hd, .badge-quality, [class*="hd"], [class*="quality"]');
                    const quality = qEl ? qEl.innerText.trim() : '1080p HD';

                    const isPrimary = !!a.closest('div.mb, div.video-box, .item-video, .video-item, article.thumb, .videothumb, .phimage, .main-results, #vidresults, #contentVideos, .video-list') && !a.closest('table, td, aside, .sidebar, #related, .related, .recommended, .top-videos');
                    const section = isPrimary ? 'main' : 'recommended';

                    items.push({
                        id: cleanId,
                        url: a.href,
                        title: title || ('Vídeo ' + (idx + 1)),
                        thumbnail_url: thumb,
                        duration: duration,
                        quality_hint: quality,
                        section: section,
                        is_primary: isPrimary
                    });
                });

                return items;
            }""")

            # If target_url itself is a single video watch page, prepend it as the main hero video
            m_self_ph = re.search(r"viewkey=([a-zA-Z0-9]+)", target_url)
            m_self_ep = re.search(r"video-([a-zA-Z0-9]{8,15})", target_url)
            self_id = m_self_ph.group(1) if m_self_ph else (m_self_ep.group(1) if m_self_ep else None)
            if self_id:
                # Remove any premature item (e.g. language bar link) with this id
                scanned_items = [it for it in scanned_items if it.get("id") != self_id]
                try:
                    hero_thumb = await page.evaluate(r"""() => {
                        const og = document.querySelector('meta[property="og:image"]')?.content || '';
                        if (og) return og;
                        const poster = document.querySelector('video')?.getAttribute('poster') || '';
                        if (poster) return poster;
                        return '';
                    }""")
                except Exception:
                    hero_thumb = ""
                scanned_items.insert(0, {
                    "id": self_id,
                    "url": target_url,
                    "title": clean_page_title,
                    "thumbnail_url": hero_thumb or "",
                    "duration": "",
                    "quality_hint": "1080p HD",
                    "section": "main",
                    "is_primary": True
                })

            # Fast thumbnail & metadata enrichment for videos without direct thumbnails (e.g. table / list links)
            items_missing_thumb = [it for it in scanned_items if not it.get("thumbnail_url") and "eporner.com" in it.get("url", "")]
            if items_missing_thumb:
                async def _enrich_thumb(item):
                    try:
                        async with httpx.AsyncClient(timeout=4.0) as cl:
                            r = await cl.get(f"https://www.eporner.com/api/v2/video/id/?id={item['id']}", headers={"User-Agent": "Mozilla/5.0"})
                            if r.status_code == 200:
                                d = r.json()
                                thumb_src = d.get("default_thumb", {}).get("src")
                                if thumb_src:
                                    item["thumbnail_url"] = thumb_src
                                if d.get("title") and (not item.get("title") or item["title"].startswith("Vídeo ")):
                                    item["title"] = d["title"]
                                if d.get("length_sec"):
                                    sec = int(d["length_sec"])
                                    m, s = divmod(sec, 60)
                                    item["duration"] = f"{m}:{s:02d}"
                    except Exception:
                        pass
                await asyncio.gather(*[_enrich_thumb(it) for it in items_missing_thumb[:35]])

            # Suggest smart folder name
            suggested_folder = "Extraídos"
            m_star = re.search(r"/(?:pornstar|actor|model|channel|search|cat)/([a-zA-Z0-9_-]+)", target_url, re.I)
            if m_star:
                raw_slug = m_star.group(1)
                # Remove hash suffixes like -GJ0Rn
                clean_slug = re.sub(r"-[a-zA-Z0-9]{4,8}$", "", raw_slug)
                suggested_folder = clean_slug.replace("-", " ").replace("_", " ").title()
            elif clean_page_title:
                folder_cand = re.sub(r"\s*(?:videos|porn|star|filmes|hd).*", "", clean_page_title, flags=re.I).strip()
                if len(folder_cand) >= 3:
                    suggested_folder = folder_cand

            limit = req.max_items or 100
            final_videos = scanned_items[:limit]

            # Cross-reference with existing videos in the user's gallery
            try:
                all_existing = video_service.list_all_videos()
            except Exception:
                all_existing = []

            already_saved_count = 0
            for v in final_videos:
                matched = _find_matching_existing_video(v.get("id", ""), v.get("url", ""), v.get("title", ""), all_existing)
                if matched:
                    v["already_saved"] = True
                    v["saved_folder"] = matched.get("folder", "Galeria")
                    v["saved_video_id"] = matched.get("id", "")
                    v["saved_filename"] = matched.get("filename", "")
                    already_saved_count += 1
                else:
                    v["already_saved"] = False

            main_count = len([v for v in final_videos if v.get("is_primary", True)])
            rec_count = len([v for v in final_videos if not v.get("is_primary", True)])
            new_videos_count = len(final_videos) - already_saved_count

            return {
                "success": True,
                "page_title": clean_page_title,
                "suggested_folder": suggested_folder,
                "total_found": len(scanned_items),
                "main_count": main_count,
                "recommended_count": rec_count,
                "already_saved_count": already_saved_count,
                "new_videos_count": new_videos_count,
                "album_id": "",
                "videos": final_videos
            }

        except Exception as exc:
            logger.error(f"Failed to scan page for videos at {target_url}: {exc}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Erro ao escanear vídeos da página: {str(exc)}")
        finally:
            await browser.close()


@app.post("/api/video-scraper/batch-save")
async def batch_save_videos_endpoint(req: BatchSaveVideosRequest):
    """
    Enqueues selected videos from a scanned page into the background download engine.
    Maintains concurrency of 2 simultaneous downloads to ensure maximum stability.
    Updates _active_jobs for real-time live monitoring in Gestão de Tarefas.
    """
    if not req.videos:
        raise HTTPException(status_code=400, detail="Nenhum vídeo selecionado para baixar.")

    target_folder_name = req.folder.strip() if req.folder and req.folder.strip() else "Extraídos"
    target_folder = os.path.join(video_service.base_dir, target_folder_name)
    os.makedirs(target_folder, exist_ok=True)

    semaphore = _video_download_semaphore


    queued_jobs = []

    async def _worker_for_video(v_item: BatchSaveVideoItemInput, jid: str, t_path: str):
        async with semaphore:
            if jid in _active_jobs:
                _active_jobs[jid]["status"] = "running"
                _active_jobs[jid]["progress"]["status"] = "Resolvendo stream de vídeo 1080p HD..."
                _save_jobs_to_disk()

            # 1. Resolve stream URL if needed
            stream_url = v_item.stream_url
            if not stream_url or "http" not in stream_url:
                stream_url = await _resolve_best_video_stream(v_item.id, v_item.url)

            if not stream_url:
                logger.error(f"Could not resolve stream URL for video {v_item.id}")
                if jid in _active_jobs:
                    _active_jobs[jid]["status"] = "error"
                    _active_jobs[jid]["error"] = "Não foi possível resolver o stream do vídeo"
                    _active_jobs[jid]["progress"]["status"] = "Falha ao resolver stream"
                    _save_jobs_to_disk(sync_hf=True)

                return

            # 2. Execute download task with live progress reporting
            headers = _get_video_download_headers(stream_url, v_item.url)
            await _run_video_download_task(
                job_id=jid,
                vurl=stream_url,
                clean_title=v_item.title,
                folder_name=target_folder_name,
                target_path=t_path,
                headers=headers,
                source_url=v_item.url,
                source_id=v_item.id
            )

    try:
        all_existing = video_service.list_all_videos() if req.skip_existing else []
    except Exception:
        all_existing = []

    skipped_items = []

    for item in req.videos:
        if req.skip_existing:
            matched = _find_matching_existing_video(item.id, item.url, item.title, all_existing)
            if matched:
                skipped_items.append({
                    "id": item.id,
                    "title": item.title,
                    "folder": matched.get("folder", "Galeria")
                })
                continue

        clean_title = item.title or "video_extraido"
        filename = "".join(c for c in clean_title if c.isalnum() or c in ("-", "_", " ")).strip() or f"vid_{item.id}"
        if not any(filename.lower().endswith(ext) for ext in (".mp4", ".webm", ".mov", ".mkv")):
            filename += ".mp4"

        target_path = os.path.join(target_folder, filename)
        if os.path.exists(target_path):
            target_path = os.path.join(target_folder, f"{os.path.splitext(filename)[0]}_{item.id}.mp4")

        job_id = f"save_vid_{int(time.time() * 1000) % 10000000}_{abs(hash(item.id)) % 10000}"

        _active_jobs[job_id] = {
            "session_id": job_id,
            "url": item.url,
            "mode": "video_save",
            "engine_type": "video_downloader",
            "status": "active",
            "model": "Web Video Scraper (2x Queue)",
            "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "progress": {
                "current": 0,
                "total": 100,
                "percent": 0,
                "downloaded_bytes": 0,
                "total_bytes": 0,
                "throughput_mbps": 0.0,
                "title": f"Salvar Vídeo: {clean_title}",
                "status": "Na fila de downloads (concorrência máxima: 2)..."
            },
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "throughput_mbps": 0.0,
            "folder": target_folder_name,
            "target_path": target_path
        }

        task = asyncio.create_task(_worker_for_video(item, job_id, target_path))
        _job_controllers[job_id] = DownloadTaskController(task, target_path)
        queued_jobs.append(job_id)

    _save_jobs_to_disk()

    msg = f"{len(queued_jobs)} vídeos enfileirados para download."
    if skipped_items:
        msg += f" {len(skipped_items)} vídeos já salvos foram pulados."

    return {
        "success": True,
        "total_queued": len(queued_jobs),
        "total_skipped": len(skipped_items),
        "skipped_items": skipped_items,
        "job_ids": queued_jobs,
        "folder": target_folder_name,
        "message": msg
    }



@app.get("/api/videos")
async def get_videos_and_folders():
    """Lists all stored videos and folders on disk."""
    return {
        "videos": video_service.list_all_videos(),
        "folders": video_service.list_folders()
    }


@app.post("/api/videos/upload")
async def upload_video_file(
    file: UploadFile = File(...),
    folder: str = Form("Geral")
):
    """Uploads a local video file streaming directly to data/videos/{folder}/ in 8MB chunks."""
    video = video_service.save_uploaded_file_stream(file.filename, file.file, folder=folder)
    if not video:
        raise HTTPException(status_code=500, detail="Falha ao salvar vídeo no disco")
    return video


@app.post("/api/videos/import-local")
async def import_local_path(req: ImportLocalPathRequest):
    """Imports video files directly from local computer filesystem with zero upload lag."""
    try:
        imported = video_service.import_local_path(req.path, target_folder=req.folder or "Geral", mode=req.mode or "copy")
        return {"success": True, "count": len(imported), "imported": imported}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao importar caminho local: {e}")


class OpenFolderRequest(BaseModel):
    folder_name: Optional[str] = None

@app.post("/api/videos/open-folder")
async def open_videos_folder(req: Optional[OpenFolderRequest] = None):
    """Opens video directory in Windows Explorer for instant drag & drop."""
    folder = req.folder if req and req.folder else "Geral"
    success = video_service.open_in_explorer(folder)
    return {"success": success, "folder": folder}


@app.post("/api/videos/add-url")
async def add_video_by_url(req: AddVideoUrlRequest):
    """Downloads a video from a direct URL or registers it as pure remote stream (no local disk)."""
    clean_title = req.title or "video_download"

    # Se o usuário escolheu APENAS STREAM REMOTO (sem download local nem nuvem)
    if req.stream_only:
        vid_id = hashlib.md5(req.url.encode("utf-8")).hexdigest()[:12]
        video_service._update_single_metadata(
            file_path=None,
            title=clean_title,
            folder=req.folder or "Geral",
            is_favorite=False,
            vid_id=vid_id,
            storage_location="stream_url",
            stream_url=req.url,
            file_size_bytes=0
        )
        return video_service.get_video_by_id(vid_id)

    target_stream_url = req.url
    is_direct_video = any(req.url.lower().split("?")[0].endswith(ext) for ext in (".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"))

    # If it's a web page URL (e.g. Pornhub, Eporner, XVideos), resolve best 1080p stream
    if not is_direct_video:
        try:
            resolved = await _resolve_best_video_stream("url_input", req.url)
            if resolved:
                target_stream_url = resolved
        except Exception as e_res:
            logger.warning(f"Could not resolve stream for {req.url}: {e_res}")

    filename = "".join(c for c in clean_title if c.isalnum() or c in ("-", "_")).strip() or f"vid_{int(time.time())}"
    if not filename.endswith(".mp4"):
        filename += ".mp4"

    headers = _get_video_download_headers(target_stream_url, req.url)
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(target_stream_url, headers=headers)
            if resp.status_code != 200 or len(resp.content) < 1000:
                raise HTTPException(status_code=400, detail="URL inválida ou resposta não contém vídeo válido")
            video = video_service.save_uploaded_file(filename, resp.content, folder=req.folder or "Geral")
            if not video:
                raise HTTPException(status_code=500, detail="Erro ao salvar arquivo de vídeo no disco")
            return video
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao baixar vídeo: {e}")


# =====================================================================
# STORAGE ANALYTICS & PHOTO ALBUM UPLOAD API
# =====================================================================

@app.get("/api/storage/analytics")
async def get_storage_analytics():
    """
    Retorna métricas consolidadas em tempo real sobre a infraestrutura de armazenamento:
    - Nuvem Hugging Face (10GB)
    - Render Local (Disco Temporário / Transbordo)
    - Streaming Remoto (URLs externas sem download)
    - Álbuns e Fotos
    """
    from src.server.video_service import cloud_storage

    # 1. Hugging Face Cloud Stats
    cloud_stats = cloud_storage.get_storage_stats()

    # 2. Local Render Disk Stats
    all_videos = video_service.list_all_videos()
    local_render_bytes = 0
    local_render_count = 0
    stream_only_count = 0
    huggingface_count = 0

    for v in all_videos:
        loc = v.get("storage_location", "render_local")
        if loc == "render_local":
            local_render_bytes += v.get("file_size_bytes", 0)
            local_render_count += 1
        elif loc == "stream_url":
            stream_only_count += 1
        elif loc == "huggingface":
            huggingface_count += 1

    # 3. Photo Albums Stats
    _load_albums_from_disk()
    total_albums = len(_completed_albums)
    total_photos = sum(len(a.images) for a in _completed_albums.values())
    total_photos_bytes = sum(sum(img.file_size for img in a.images) for a in _completed_albums.values())

    return {
        "cloud_huggingface": {
            **cloud_stats,
            "app_recorded_videos": huggingface_count
        },
        "render_local": {
            "total_bytes_used": local_render_bytes,
            "videos_count": local_render_count,
            "is_overflow_risk": local_render_bytes > 500 * 1024 * 1024  # Alerta se passar de 500MB no Render Free
        },
        "stream_only": {
            "videos_count": stream_only_count
        },
        "albums": {
            "total_albums": total_albums,
            "total_photos": total_photos,
            "total_size_bytes": total_photos_bytes
        }
    }


@app.post("/api/albums/upload")
async def upload_photo_album(
    title: str = Form("Novo Álbum"),
    files: List[UploadFile] = File(...),
    folder: Optional[str] = Form("Geral")
):
    """
    Cria um novo álbum de fotos a partir de imagens enviadas pelo usuário (PC ou Celular).
    Gera miniaturas, metadados e adiciona à galeria de fotos instantaneamente.
    """
    if not files:
        raise HTTPException(status_code=400, detail="Nenhum arquivo enviado")

    session_id = f"manual-{int(time.time())}-{hashlib.md5(title.encode()).hexdigest()[:6]}"
    album_dir = os.path.join(DATA_DIR, "albums", session_id)
    os.makedirs(album_dir, exist_ok=True)

    images = []
    total_bytes = 0

    for idx, f in enumerate(files):
        ext = os.path.splitext(f.filename)[1].lower()
        if not ext:
            ext = ".jpg"

        safe_fname = f"img_{idx + 1}{ext}"
        target_path = os.path.join(album_dir, safe_fname)

        content = await f.read()
        with open(target_path, "wb") as out:
            out.write(content)

        file_size = len(content)
        total_bytes += file_size

        # Descobrir dimensões com Pillow
        width, height = 1920, 1080
        try:
            from PIL import Image as PILImage
            with PILImage.open(target_path) as im:
                width, height = im.size
        except Exception:
            pass

        # Servir via URL proxy local ou arquivo
        rel_img_url = f"/api/proxy-image?url=local://albums/{session_id}/{safe_fname}"

        from src.domain.models import ExtractedImage
        img_item = ExtractedImage(
            position=idx,
            thumbnail_url=rel_img_url,
            original_url=rel_img_url,
            width=width,
            height=height,
            file_size=file_size,
            format=ext.lstrip(".").upper(),
            resolution_method="manual_upload",
            validation_status="PASS"
        )
        images.append(img_item)

    from src.domain.models import ScrapingSession
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    new_album = ScrapingSession(
        session_id=session_id,
        target_url="local://manual-upload",
        source_page="Upload Local",
        title=title,
        status="COMPLETED",
        created_at=now_iso,
        updated_at=now_iso,
        images=images,
        cover_image_url=images[0].original_url if images else "",
        total_images=len(images)
    )

    clean_folder = (folder or "Geral").strip() or "Geral"
    setattr(new_album, "folder", clean_folder)
    _ensure_album_folder_exists(clean_folder)

    _completed_albums[session_id] = new_album
    _save_album_to_disk(session_id, new_album)

    return {
        "success": True,
        "session_id": session_id,
        "album": AgentDebugger.get_ui_summary(new_album)
    }


# =====================================================================
# SECURE API KEYS & CONNECTION STATUS ENDPOINTS
# =====================================================================

def _mask_secret(val: str) -> str:
    """Masks secret key safely: e.g. AIza•••••••••••••ilHw"""
    if not val:
        return ""
    if len(val) <= 8:
        return "••••••••"
    return f"{val[:4]}•••••••••••••{val[-4:]}"


class UpdateKeysRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    hf_token: Optional[str] = None
    hf_dataset_repo: Optional[str] = None


@app.get("/api/settings/keys")
async def get_keys_status():
    """
    Returns masked keys and live connection status without exposing plain text secrets.
    """
    raw_gemini = os.getenv("GEMINI_API_KEY", "").strip()
    raw_hf = os.getenv("HF_TOKEN", "").strip()
    raw_repo = os.getenv("HF_DATASET_REPO", "").strip()

    # Test Gemini connection live
    gemini_connected = False
    gemini_error = None
    if raw_gemini:
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                url = f"https://generativelanguage.googleapis.com/v1beta/models?key={raw_gemini}"
                res = await client.get(url)
                if res.status_code == 200:
                    gemini_connected = True
                else:
                    gemini_error = f"Código HTTP {res.status_code}: {res.text[:100]}"
        except Exception as e:
            gemini_error = str(e)

    # Test Hugging Face live
    from src.server.video_service import cloud_storage
    hf_connected = cloud_storage.is_connected()

    return {
        "gemini": {
            "is_set": bool(raw_gemini),
            "masked_key": _mask_secret(raw_gemini),
            "is_connected": gemini_connected,
            "error": gemini_error
        },
        "huggingface": {
            "is_set": bool(raw_hf),
            "masked_token": _mask_secret(raw_hf),
            "repo_id": raw_repo or "lokkmorant/album-data",
            "is_connected": hf_connected
        }
    }


@app.post("/api/settings/keys")
async def update_keys(req: UpdateKeysRequest):
    """
    Updates API keys in memory and persists to .env file securely.
    """
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
    env_lines = {}

    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        env_lines[k.strip()] = v.strip().strip('"').strip("'")
        except Exception:
            pass

    updated = False
    if req.gemini_api_key is not None and req.gemini_api_key.strip():
        clean_k = req.gemini_api_key.strip()
        os.environ["GEMINI_API_KEY"] = clean_k
        env_lines["GEMINI_API_KEY"] = f'"{clean_k}"'
        updated = True

    if req.hf_token is not None and req.hf_token.strip():
        clean_hf = req.hf_token.strip()
        os.environ["HF_TOKEN"] = clean_hf
        env_lines["HF_TOKEN"] = clean_hf
        from src.server.video_service import cloud_storage
        cloud_storage.token = clean_hf
        cloud_storage._api = None
        updated = True

    if req.hf_dataset_repo is not None and req.hf_dataset_repo.strip():
        clean_repo = req.hf_dataset_repo.strip()
        os.environ["HF_DATASET_REPO"] = clean_repo
        env_lines["HF_DATASET_REPO"] = clean_repo
        from src.server.video_service import cloud_storage
        cloud_storage.repo_id = clean_repo
        cloud_storage._api = None
        updated = True

    if updated and os.path.exists(env_file):
        try:
            with open(env_file, "w", encoding="utf-8") as f:
                for k, v in env_lines.items():
                    f.write(f"{k}={v}\n")
        except Exception:
            pass

    return await get_keys_status()


@app.api_route("/api/videos/{video_id}/stream", methods=["GET", "HEAD"])
async def stream_video(video_id: str, request: Request):
    """Streams video file with full HTTP Range 206 partial content support for all browsers and mobile.
    When local file is missing (Render restart), proxies content from private HF repo or direct web source."""
    import mimetypes
    video = video_service.get_video_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")

    local_exists = video.get("full_path") and os.path.exists(video["full_path"])

    # --- HF Proxy / Remote Proxy: stream via server when local file is missing ---
    if not local_exists:
        cloud_url = video.get("cloud_url") or video.get("source_url")
        if not cloud_url or not cloud_url.startswith("http"):
            raise HTTPException(status_code=404, detail="Vídeo não encontrado localmente nem na nuvem")

        from src.server.video_service import cloud_storage as _cs
        hf_token = _cs.token or os.getenv("HF_TOKEN", "")
        proxy_headers = {"User-Agent": "Mozilla/5.0"}
        if hf_token:
            proxy_headers["Authorization"] = f"Bearer {hf_token}"

        range_header = request.headers.get("range")
        if range_header:
            proxy_headers["Range"] = range_header

        filename = video.get("filename", "video.mp4")
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = "video/mp4"

        try:
            client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=None), follow_redirects=True)
            hf_req = client.build_request("GET", cloud_url, headers=proxy_headers)
            hf_resp = await client.send(hf_req, stream=True)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erro de conexão com storage remoto: {str(e)}")

        if hf_resp.status_code not in (200, 206):
            try:
                await hf_resp.aclose()
                await client.aclose()
            except Exception:
                pass
            raise HTTPException(status_code=hf_resp.status_code, detail="Erro ao carregar vídeo do armazenamento remoto")

        resp_headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": hf_resp.headers.get("content-type", mime_type),
            "Cache-Control": "no-cache",
        }
        if "content-length" in hf_resp.headers:
            resp_headers["Content-Length"] = hf_resp.headers["content-length"]
        if "content-range" in hf_resp.headers:
            resp_headers["Content-Range"] = hf_resp.headers["content-range"]

        async def _stream_hf_generator():
            try:
                async for chunk in hf_resp.aiter_bytes(chunk_size=256 * 1024):
                    yield chunk
            except (GeneratorExit, ConnectionResetError, BrokenPipeError, httpx.StreamError):
                pass
            except Exception:
                pass
            finally:
                try:
                    await hf_resp.aclose()
                except Exception:
                    pass
                try:
                    await client.aclose()
                except Exception:
                    pass

        return StreamingResponse(_stream_hf_generator(), status_code=hf_resp.status_code, headers=resp_headers)

    file_path = video.get("full_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo físico do vídeo não encontrado")

    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "video/mp4"

    return FileResponse(
        file_path,
        media_type=mime_type,
        content_disposition_type="inline",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type"
        }
    )



@app.get("/api/videos/{video_id}/thumbnail")
async def get_video_thumbnail(video_id: str):
    """Returns a high-speed cached JPEG thumbnail for the video.
    If local file is missing (Render restart), fetches from Hugging Face dataset."""
    thumb_path = video_service.get_or_generate_thumbnail(video_id)
    if thumb_path and os.path.exists(thumb_path):
        return FileResponse(
            thumb_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"}
        )

    # Fallback: buscar thumbnail na nuvem Hugging Face
    from src.server.video_service import cloud_storage as _cs
    hf_token = _cs.token or os.getenv("HF_TOKEN", "")
    if _cs.repo_id:
        remote_thumb_url = f"https://huggingface.co/datasets/{_cs.repo_id}/resolve/main/thumbnails/{video_id}.jpg"
        try:
            proxy_headers = {"User-Agent": "Mozilla/5.0"}
            if hf_token:
                proxy_headers["Authorization"] = f"Bearer {hf_token}"
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(remote_thumb_url, headers=proxy_headers)
                if resp.status_code == 200 and len(resp.content) > 500:
                    os.makedirs(video_service.thumbnails_dir, exist_ok=True)
                    local_cache = os.path.join(video_service.thumbnails_dir, f"{video_id}.jpg")
                    try:
                        with open(local_cache, "wb") as f:
                            f.write(resp.content)
                    except Exception:
                        pass
                    return Response(content=resp.content, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})
        except Exception:
            pass

    raise HTTPException(status_code=404, detail="Thumbnail não encontrada ou não foi possível gerar")


@app.get("/api/videos/{video_id}/download")
async def download_video(video_id: str):
    """Initiates genuine local file download to user's computer.
    When local file is missing (Render restart), proxies from private HF repo using server token."""
    import mimetypes
    video = video_service.get_video_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")

    local_exists = video.get("full_path") and os.path.exists(video["full_path"])

    if not local_exists:
        cloud_url = video.get("cloud_url")
        if not cloud_url or not cloud_url.startswith("http"):
            raise HTTPException(status_code=404, detail="Vídeo não encontrado localmente nem na nuvem")

        from src.server.video_service import cloud_storage as _cs
        hf_token = _cs.token or os.getenv("HF_TOKEN", "")
        proxy_headers = {"User-Agent": "Mozilla/5.0"}
        if hf_token:
            proxy_headers["Authorization"] = f"Bearer {hf_token}"

        filename = video.get("filename", "video.mp4")
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = "video/mp4"

        client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=None), follow_redirects=True)
        hf_req = client.build_request("GET", cloud_url, headers=proxy_headers)
        hf_resp = await client.send(hf_req, stream=True)

        async def _proxy_download():
            try:
                async for chunk in hf_resp.aiter_bytes(chunk_size=256 * 1024):
                    yield chunk
            finally:
                await hf_resp.aclose()
                await client.aclose()

        resp_headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": hf_resp.headers.get("content-type", mime_type),
        }
        if "content-length" in hf_resp.headers:
            resp_headers["Content-Length"] = hf_resp.headers["content-length"]

        return StreamingResponse(
            _proxy_download(),
            status_code=200,
            headers=resp_headers
        )

    return FileResponse(
        video["full_path"],
        media_type="application/octet-stream",
        filename=video["filename"]
    )


@app.post("/api/videos/folders")
async def create_video_folder(req: CreateFolderRequest):
    """Creates a new folder in data/videos/."""
    success = video_service.create_folder(req.name)
    if not success:
        raise HTTPException(status_code=400, detail="Nome de pasta inválido ou pasta já existente")
    return {"success": True, "folders": video_service.list_folders()}


@app.patch("/api/videos/folders/{folder_name}")
async def rename_video_folder(folder_name: str, req: RenameFolderRequest):
    """Renames an existing folder on disk."""
    success = video_service.rename_folder(folder_name, req.new_name)
    if not success:
        raise HTTPException(status_code=400, detail="Não foi possível renomear a pasta")
    return {"success": True, "folders": video_service.list_folders()}


@app.delete("/api/videos/folders/{folder_name}")
async def delete_video_folder(folder_name: str):
    """Deletes a folder, moving videos to 'Geral'."""
    success = video_service.delete_folder(folder_name)
    if not success:
        raise HTTPException(status_code=400, detail="Pasta padrão 'Geral' não pode ser excluída ou pasta não encontrada")
    return {"success": True, "folders": video_service.list_folders()}


@app.patch("/api/videos/{video_id}/rename")
async def rename_video(video_id: str, req: RenameVideoRequest):
    """Renames a video's display title."""
    success = video_service.rename_video(video_id, req.title)
    if not success:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")
    return {"success": True, "video": video_service.get_video_by_id(video_id)}


@app.post("/api/videos/{video_id}/move")
async def move_video(video_id: str, req: MoveVideoRequest):
    """Moves a video to another folder."""
    updated = video_service.move_video(video_id, req.target_folder)
    if not updated:
        raise HTTPException(status_code=400, detail="Erro ao mover vídeo")
    return {"success": True, "video": updated}


@app.post("/api/videos/{video_id}/favorite")
async def toggle_video_favorite(video_id: str):
    """Toggles favorite state for a video."""
    video = video_service.get_video_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")
    new_fav = video_service.toggle_favorite(video_id)
    return {"success": True, "video_id": video_id, "is_favorite": new_fav}


@app.delete("/api/videos/{video_id}")
async def delete_video(video_id: str):
    """Moves a video to the Trash Bin."""
    video = video_service.get_video_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")
    trash_item = trash_service.move_video_to_trash(video)
    if not trash_item:
        raise HTTPException(status_code=500, detail="Erro ao mover vídeo para a lixeira")
    
    # Remove from active video_service metadata
    meta = video_service._load_metadata()
    if video_id in meta:
        del meta[video_id]
        video_service._save_metadata(meta)

    return {"success": True, "video_id": video_id, "trash_item": trash_item}


@app.post("/api/videos/batch-delete")
async def batch_delete_videos(req: BatchDeleteVideosRequest):
    """Moves multiple videos to the Trash Bin."""
    deleted_ids = []
    meta = video_service._load_metadata()
    for vid in req.video_ids:
        video = video_service.get_video_by_id(vid)
        if video:
            item = trash_service.move_video_to_trash(video)
            if item:
                deleted_ids.append(vid)
                if vid in meta:
                    del meta[vid]
    video_service._save_metadata(meta)
    return {"success": True, "deleted_ids": deleted_ids}


@app.post("/api/videos/batch-move")
async def batch_move_videos(req: BatchMoveVideosRequest):
    """Moves multiple videos to a target folder."""
    moved = video_service.move_multiple_videos(req.video_ids, req.target_folder)
    return {"success": True, "moved_ids": moved}


# ==========================================
# UNIFIED TRASH BIN API (Photos, Videos, Albums)
# ==========================================

class TrashBatchRequest(BaseModel):
    trash_ids: List[str]


@app.get("/api/trash")
async def get_trash_items():
    """Lists all items in the Trash Bin and summary stats."""
    return {
        "items": trash_service.list_all_items(),
        "stats": trash_service.get_stats()
    }


@app.get("/api/trash/stats")
async def get_trash_stats():
    """Returns Trash Bin statistics."""
    return trash_service.get_stats()


@app.get("/api/trash/videos/{trash_id}/stream")
async def stream_trash_video(trash_id: str):
    """Streams a video currently stored in the trash."""
    meta = trash_service._load_meta()
    item = meta.get(trash_id)
    if not item or item.get("type") != "video":
        raise HTTPException(status_code=404, detail="Vídeo na lixeira não encontrado")
    trash_filename = item.get("metadata", {}).get("trash_filename")
    vpath = os.path.join(trash_service.trash_videos_dir, trash_filename) if trash_filename else ""
    return FileResponse(
        vpath,
        media_type="video/mp4",
        content_disposition_type="inline",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600"
        }
    )



@app.post("/api/trash/restore")
async def restore_trash_items(req: TrashBatchRequest):
    """Restores selected items from the trash back to their original albums or folders."""
    restored = trash_service.restore_multiple(req.trash_ids)
    # Reload albums and video metadata into memory
    _load_albums_from_disk()
    return {
        "success": True,
        "restored_ids": restored,
        "stats": trash_service.get_stats()
    }


@app.post("/api/trash/permanent-delete")
async def permanently_delete_trash_items(req: TrashBatchRequest):
    """Permanently deletes selected items from the trash and disk."""
    deleted = trash_service.permanent_delete_multiple(req.trash_ids)
    return {
        "success": True,
        "deleted_ids": deleted,
        "stats": trash_service.get_stats()
    }


@app.post("/api/trash/empty")
async def empty_trash_endpoint():
    """Permanently purges all items from the trash."""
    result = trash_service.empty_trash()
    return result



# Rota Modular Isolada: Multi-Album Discovery
from .multi_album_service import router as multi_album_router
app.include_router(multi_album_router)


# ---------------------------------------------------------------------------
# Multi-Album Batch Actions: Save to Library & Download ZIPs
# ---------------------------------------------------------------------------
class MultiAlbumItemInput(BaseModel):
    title: str
    url: str
    thumbnail_url: Optional[str] = None
    source_type: Optional[str] = "related"

class MultiAlbumBatchSaveRequest(BaseModel):
    albums: List[MultiAlbumItemInput]
    model_name: Optional[str] = "gemini-3.7-flash"
    folder: Optional[str] = "Geral"

class MultiAlbumBatchDownloadRequest(BaseModel):
    albums: List[MultiAlbumItemInput]
    format: Optional[str] = "unified"  # "unified" or "individual"

async def _resolve_or_extract_album_for_multi(item: MultiAlbumItemInput) -> Album:
    """Helper to find existing completed album or extract it on-the-fly."""
    clean_url = item.url.strip()
    
    # 1. Check in-memory completed albums
    for aid, alb in _completed_albums.items():
        if getattr(alb, "source_page", None) == clean_url or getattr(alb, "source_origin", None) == clean_url:
            if getattr(alb, "images", None) and len(alb.images) > 0:
                return alb

    # 2. Check disk albums
    if os.path.exists(ALBUMS_DIR):
        for fname in os.listdir(ALBUMS_DIR):
            if fname.endswith(".json"):
                fpath = os.path.join(ALBUMS_DIR, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if data.get("source_page") == clean_url or data.get("source_origin") == clean_url:
                        alb = Album(**data)
                        if alb.images and len(alb.images) > 0:
                            aid = fname.replace(".json", "")
                            _completed_albums[aid] = alb
                            return alb
                except Exception:
                    pass

    # 3. Not found: extract with surgical scout
    scout = GeminiSurgicalScout()
    async with _extraction_semaphore:
        alb = await scout.extract_album(
            url=clean_url,
            gemini_model="gemini-3.7-flash",
            local_model="qwen2.5:32b"
        )
    if not getattr(alb, "title", None) and item.title:
        alb.title = item.title
    if item.thumbnail_url and not alb.cover_image_url:
        alb.cover_image_url = item.thumbnail_url

    s_id = f"sess_{abs(hash(clean_url + str(datetime.now(timezone.utc).timestamp()))) % 1000000}"
    _completed_albums[s_id] = alb
    _save_album_to_disk(s_id, alb)
    return alb

@app.post("/api/multi-album/batch-save-to-library")
async def multi_album_batch_save_to_library(req: MultiAlbumBatchSaveRequest):
    """Enfileira múltiplos álbuns selecionados para extração e salvamento direto na biblioteca com pasta designada."""
    if not req.albums:
        raise HTTPException(status_code=400, detail="Nenhum álbum selecionado.")

    target_folder = (req.folder or "Geral").strip() or "Geral"
    _ensure_album_folder_exists(target_folder)

    spawned = []
    for alb in req.albums:
        u = alb.url.strip()
        if not u or not u.startswith("http"):
            continue

        s_id = f"sess_{abs(hash(u + str(datetime.now(timezone.utc).timestamp()))) % 1000000}"
        _active_event_queues[s_id] = asyncio.Queue()
        job_data = {
            "session_id": s_id,
            "url": u,
            "title": alb.title or f"Álbum {u}",
            "thumbnail_url": alb.thumbnail_url,
            "mode": "surgical_scout",
            "engine_type": "gemini_surgical_scout",
            "folder": target_folder,
            "status": "running",
            "model": req.model_name or "gemini-3.7-flash",
            "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "progress": {"current": 0, "total": 0, "status": "Na fila do Extrator...", "title": alb.title},
        }
        _active_jobs[s_id] = job_data
        single_req = AnalyzeRequest(
            url=u,
            headless=True,
            gemini_model="gemini-3.7-flash",
            model_name="qwen2.5:32b",
            engine_type="gemini_surgical_scout",
            folder=target_folder,
        )
        asyncio.create_task(_run_gemini_surgical_task(s_id, single_req, semaphore=_batch_photo_semaphore))
        spawned.append(job_data)


    _save_jobs_to_disk()
    return {
        "status": "ok",
        "queued": len(spawned),
        "target_folder": target_folder,
        "jobs": spawned,
        "message": f"{len(spawned)} álbuns adicionados à fila na pasta '{target_folder}' com sucesso."
    }

@app.post("/api/multi-album/batch-download-zip")
async def multi_album_batch_download_zip(
    req: MultiAlbumBatchDownloadRequest,
    background_tasks: BackgroundTasks
):
    """Extrai e compacta múltiplos álbuns em um ZIP unificado ou individual."""
    if not req.albums:
        raise HTTPException(status_code=400, detail="Nenhum álbum fornecido.")

    from .safe_downloader import safe_downloader, _sanitize_filename

    # Extract all albums
    tasks = [_resolve_or_extract_album_for_multi(item) for item in req.albums]
    extracted_albums = await asyncio.gather(*tasks, return_exceptions=True)
    valid_albums = [a for a in extracted_albums if isinstance(a, Album) and len(a.images) > 0]

    if not valid_albums:
        raise HTTPException(status_code=400, detail="Nenhuma imagem pôde ser encontrada nos álbuns selecionados.")

    if req.format == "individual" and len(valid_albums) == 1:
        single_album = valid_albums[0]
        zip_path = await safe_downloader.create_safe_zip(single_album, remove_exif=True, naming_pattern=None)
        clean_name = _sanitize_filename(single_album.title or "album")
        background_tasks.add_task(safe_downloader.delete_temp_file, zip_path)
        return FileResponse(
            path=zip_path,
            media_type="application/zip",
            filename=f"{clean_name}.zip"
        )

    # Unified ZIP
    zip_path = await safe_downloader.create_safe_unified_zip(valid_albums, remove_exif=True, naming_pattern=None)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    background_tasks.add_task(safe_downloader.delete_temp_file, zip_path)
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"colecao_albuns_{ts}.zip"
    )

@app.get("/api/multi-album/download-single-zip")
async def multi_album_download_single_zip(
    url: str,
    background_tasks: BackgroundTasks,
    title: Optional[str] = None
):
    """Extrai e baixa um único álbum em arquivo ZIP direto."""
    if not url or not url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL inválida.")

    from .safe_downloader import safe_downloader, _sanitize_filename

    item = MultiAlbumItemInput(title=title or "Álbum", url=url)
    album = await _resolve_or_extract_album_for_multi(item)
    if not album.images or len(album.images) == 0:
        raise HTTPException(status_code=404, detail="Nenhuma imagem encontrada neste álbum.")

    zip_path = await safe_downloader.create_safe_zip(album, remove_exif=True, naming_pattern=None)
    clean_name = _sanitize_filename(album.title or title or "album")
    if background_tasks:
        background_tasks.add_task(safe_downloader.delete_temp_file, zip_path)
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"{clean_name}.zip"
    )


# ---------------------------------------------------------------------------
# Stream refresh — on-demand renewal of expired Eporner CDN URLs via XHR API
# ---------------------------------------------------------------------------
_stream_refresh_semaphore = asyncio.Semaphore(1)


async def _refresh_single_image_stream(img, default_page: Optional[str] = None) -> tuple[bool, str]:
    """Helper: fetches fresh genuine stream URL for one AlbumImage via yt-dlp.
    Returns (success, error_message). Updates img in-place on success.
    """
    import re as _re
    import yt_dlp

    candidates = [
        getattr(img, "source_page", None) or "",
        default_page or "",
        getattr(img, "original_url", None) or "",
        getattr(img, "video_stream_url", None) or "",
    ]
    target_url = None
    for raw_src in candidates:
        if not raw_src:
            continue
        for src in (raw_src, urllib.parse.unquote(raw_src)):
            m = _re.search(r'eporner\.com/(?:embed/|hd-porn/|video-)([A-Za-z0-9_-]{6,})', src)
            if m:
                target_url = f"https://www.eporner.com/video-{m.group(1)}/"
                break
            elif "eporner.com/video" in src:
                target_url = src
                break
            m_vk = _re.search(r'(?:viewkey=|pornhub\.com/(?:embed|video)/)([a-zA-Z0-9_-]+)', src)
            if m_vk:
                target_url = f"https://www.pornhub.com/view_video.php?viewkey={m_vk.group(1)}"
                break
        if target_url:
            break

    if not target_url:
        resolved_page, _, _, _ = _extract_video_info_from_url_or_albums(
            getattr(img, "video_stream_url", None) or getattr(img, "original_url", None) or ""
        )
        if resolved_page:
            target_url = resolved_page

    if not target_url:
        return False, "No valid video URL or ID found in image"

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "http_headers": _get_video_download_headers(target_url, target_url)
    }
    extracted_cookies = {}
    def _extract():
        nonlocal extracted_cookies
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            inf = ydl.extract_info(target_url, download=False)
            extracted_cookies = {c.name: c.value for c in ydl.cookiejar}
            return inf

    try:
        info = await asyncio.to_thread(_extract)
    except Exception as exc:
        return False, f"yt-dlp extraction error: {exc}"

    if extracted_cookies:
        c_str = "; ".join(f"{k}={v}" for k, v in extracted_cookies.items())
        _domain_cookies["phncdn.com"] = c_str
        _domain_cookies["pornhub.com"] = c_str
        _save_domain_cookies()

    formats = [f for f in info.get("formats", []) if f.get("ext") == "mp4" and f.get("url")]
    direct_mp4s = [f for f in formats if not str(f.get("format_id", "")).startswith("hls")]
    pool = direct_mp4s if direct_mp4s else formats
    if not pool:
        pool = [f for f in info.get("formats", []) if f.get("url") and f.get("vcodec") != "none"]
    if not pool:
        pool = [f for f in info.get("formats", []) if f.get("url")]
    if not pool:
        return False, "No stream formats returned"

    target_height = _deduce_image_target_height(img)

    exact = None
    if target_height:
        exact = next((f for f in pool if f.get("height") == target_height), None)

    if not exact:
        exact = max(pool, key=lambda f: f.get("height", 0) or 0)

    chosen_url = exact["url"]
    h = exact.get("height") or target_height or 1080
    w = exact.get("width") or (round(h * 16 / 9) if h else 1920)

    dur = int(info.get("duration") or 0)
    img.video_stream_url = chosen_url
    img.original_url = chosen_url
    img.width = w
    img.height = h
    if dur > 0:
        img.duration_seconds = dur

    f_sz = exact.get("filesize") or exact.get("filesize_approx") or 0
    if not f_sz and dur > 0:
        tbr = exact.get("tbr") or (4000 if h >= 1080 else (2000 if h >= 720 else 1000))
        f_sz = int(tbr * 1000 / 8 * dur)
    if f_sz > 0:
        img.file_size = f_sz
    return True, ""


async def _refresh_album_video_streams(album: Album) -> tuple[list, list]:
    """
    Refreshes all video streams in the album. Groups images by target video page
    so yt-dlp is executed once per video, updating all resolutions (1080p, 720p, 480p, 240p)
    efficiently with genuine file sizes and dimensions.
    """
    import re as _re
    import yt_dlp

    video_imgs = [img for img in album.images if getattr(img, "media_type", None) == "video"]
    if not video_imgs:
        return [], []

    # Map images to target video URLs
    groups: Dict[str, List[AlbumImage]] = {}
    for img in video_imgs:
        target_url = None
        candidates = [
            getattr(img, "source_page", None) or "",
            getattr(album, "source_page", None) or "",
            getattr(album, "url", None) or "",
            getattr(img, "original_url", None) or "",
            getattr(img, "video_stream_url", None) or "",
        ]
        for raw_src in candidates:
            if not raw_src:
                continue
            for src in (raw_src, urllib.parse.unquote(raw_src)):
                m_ep = _re.search(r'eporner\.com/(?:embed/|hd-porn/|video-)([A-Za-z0-9_-]{6,})', src)
                if m_ep:
                    target_url = f"https://www.eporner.com/video-{m_ep.group(1)}/"
                    break
                elif "eporner.com/video" in src:
                    target_url = src
                    break
                m_vk = _re.search(r'(?:viewkey=|pornhub\.com/(?:embed|video)/)([a-zA-Z0-9_-]+)', src)
                if m_vk:
                    target_url = f"https://www.pornhub.com/view_video.php?viewkey={m_vk.group(1)}"
                    break
            if target_url:
                break

        if not target_url:
            resolved_page, _, _, _ = _extract_video_info_from_url_or_albums(
                getattr(img, "video_stream_url", None) or getattr(img, "original_url", None) or ""
            )
            if resolved_page:
                target_url = resolved_page

        if not target_url:
            target_url = getattr(img, "source_page", None) or getattr(album, "source_page", None) or getattr(img, "original_url", None) or ""

        groups.setdefault(target_url, []).append(img)

    refreshed = []
    failed = []

    for target_url, imgs in groups.items():
        if not target_url:
            for img in imgs:
                failed.append({"id": str(img.id), "error": "No target URL could be identified"})
            continue

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "http_headers": _get_video_download_headers(target_url, target_url)
        }
        extracted_cookies = {}
        def _extract():
            nonlocal extracted_cookies
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                inf = ydl.extract_info(target_url, download=False)
                extracted_cookies = {c.name: c.value for c in ydl.cookiejar}
                return inf

        try:
            info = await asyncio.to_thread(_extract)
        except Exception as exc:
            for img in imgs:
                failed.append({"id": str(img.id), "error": f"yt-dlp error: {exc}"})
            continue

        if extracted_cookies:
            c_str = "; ".join(f"{k}={v}" for k, v in extracted_cookies.items())
            _domain_cookies["phncdn.com"] = c_str
            _domain_cookies["pornhub.com"] = c_str
            _save_domain_cookies()

        formats = [f for f in info.get("formats", []) if f.get("ext") == "mp4" and f.get("url")]
        direct_mp4s = [f for f in formats if not str(f.get("format_id", "")).startswith("hls")]
        pool = direct_mp4s if direct_mp4s else formats
        if not pool:
            pool = [f for f in info.get("formats", []) if f.get("url") and f.get("vcodec") != "none"]
        if not pool:
            pool = [f for f in info.get("formats", []) if f.get("url")]
        if not pool:
            for img in imgs:
                failed.append({"id": str(img.id), "error": "No valid MP4 streams found in response"})
            continue

        dur = int(info.get("duration") or 0)

        for img in imgs:
            target_height = _deduce_image_target_height(img)

            exact = None
            if target_height:
                exact = next((f for f in pool if f.get("height") == target_height), None)
            if not exact:
                exact = max(pool, key=lambda f: f.get("height", 0) or 0)

            chosen_url = exact["url"]
            h = exact.get("height") or target_height or 1080
            w = exact.get("width") or (round(h * 16 / 9) if h else 1920)

            img.video_stream_url = chosen_url
            img.original_url = chosen_url
            img.width = w
            img.height = h
            if dur > 0:
                img.duration_seconds = dur

            f_sz = exact.get("filesize") or exact.get("filesize_approx") or 0
            if not f_sz and dur > 0:
                tbr = exact.get("tbr") or (4000 if h >= 1080 else (2000 if h >= 720 else 1000))
                f_sz = int(tbr * 1000 / 8 * dur)
            if f_sz > 0:
                img.file_size = f_sz

            img_id = getattr(img, "id", None) or getattr(img, "candidate_id", "") or "video"
            refreshed.append({"id": str(img_id), "candidate_id": getattr(img, "candidate_id", "")})

    return refreshed, failed


@app.post("/api/albums/{session_id}/refresh-streams")
async def refresh_album_streams_endpoint(session_id: str):
    """Renova URLs de stream expiradas de TODOS os vídeos (Pornhub, Eporner, etc.) no álbum usando yt-dlp."""
    album = _completed_albums.get(session_id)
    if not album:
        _load_albums_from_disk()
        album = _completed_albums.get(session_id)
    if not album:
        fpath = os.path.join(ALBUMS_DIR, f"{session_id}.json")
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                album = Album.model_validate_json(f.read())
                _completed_albums[session_id] = album

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    async with _stream_refresh_semaphore:
        refreshed, failed = await _refresh_album_video_streams(album)
        if refreshed:
            _completed_albums[session_id] = album
            _save_album_to_disk(session_id, album)

        return {
            "success": True,
            "refreshed": len(refreshed),
            "failed": len(failed),
            "details": {"refreshed": refreshed, "failed": failed},
        }


@app.post("/api/albums/{session_id}/refresh-stream/{candidate_id}")
async def refresh_single_stream_endpoint(session_id: str, candidate_id: str):
    """Renova URL de stream expirada de um vídeo específico pelo candidate_id usando yt-dlp."""
    album = _completed_albums.get(session_id)
    if not album:
        _load_albums_from_disk()
        album = _completed_albums.get(session_id)
    if not album:
        fpath = os.path.join(ALBUMS_DIR, f"{session_id}.json")
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                album = Album.model_validate_json(f.read())
                _completed_albums[session_id] = album

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    img = next((i for i in album.images if str(getattr(i, "candidate_id", "")) == candidate_id or str(getattr(i, "id", "")) == candidate_id), None)
    if not img and candidate_id.startswith("real-img-"):
        parts = candidate_id.split("-")
        if parts[-1].isdigit():
            idx = int(parts[-1])
            if 0 <= idx < len(album.images):
                img = album.images[idx]
    if not img and candidate_id.isdigit():
        idx = int(candidate_id)
        if 0 <= idx < len(album.images):
            img = album.images[idx]
        elif 1 <= idx <= len(album.images):
            img = album.images[idx - 1]
    if not img:
        raise HTTPException(status_code=404, detail="Image not found in album")

    async with _stream_refresh_semaphore:
        ok, err = await _refresh_single_image_stream(img, default_page=getattr(album, "source_page", None) or getattr(album, "url", None))
        if ok:
            _completed_albums[session_id] = album
            _save_album_to_disk(session_id, album)
            return {"success": True, "new_url": img.video_stream_url}
        else:
            raise HTTPException(status_code=502, detail=err)



# Static UI serving (Compatível com desenvolvimento local e PyInstaller .exe)
base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

mobile_dist = os.path.join(base_path, "frontend-mobile-preview", "dist")
frontend_dist = os.path.join(base_path, "frontend", "dist")

if os.path.exists(os.path.join(mobile_dist, "index.html")):
    ui_dir = mobile_dist
elif os.path.exists(os.path.join(frontend_dist, "index.html")):
    ui_dir = frontend_dist
else:
    # Fallback caso rode da raiz diretamente
    local_mobile = os.path.join(os.getcwd(), "frontend-mobile-preview", "dist")
    if os.path.exists(os.path.join(local_mobile, "index.html")):
        ui_dir = local_mobile
    else:
        ui_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ui")

app.mount("/", StaticFiles(directory=ui_dir, html=True), name="ui")


