"""
Network Sniffer & JSON API Manifest Interceptor (Pillar 2).
Provides:
1. Playwright Response Interception Buffer for XHR/Fetch/GraphQL and JSON streams.
2. Recursive Media Manifest Crawler and Schema Dissector.
3. Session-Consistent Validation for signed, tokenized, and hotlink-protected URLs.
"""

import json
import time
import logging
import asyncio
from typing import Dict, List, Any, Optional, Tuple, Set
from urllib.parse import urlparse, urljoin
from pydantic import BaseModel, Field

from playwright.async_api import Page, Response

from ..core.models import (
    AlbumImage,
    ResolutionMethod,
    ValidationVerdict,
    ValidationResult,
)
from ..validator.validator import ImageValidator

logger = logging.getLogger(__name__)


class CapturedPayload(BaseModel):
    """Represents a captured JSON network response."""
    url: str
    status: int
    content_type: str
    resource_type: str
    data: Any  # Parsed JSON dict or list
    timestamp: float = Field(default_factory=time.time)
    size_bytes: int = 0


class MediaManifestItem(BaseModel):
    """Represents a discovered media item from a JSON API manifest."""
    original_url: str
    thumbnail_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    title: Optional[str] = None
    caption: Optional[str] = None
    format: Optional[str] = None
    source_api_url: str
    raw_node: Dict[str, Any] = Field(default_factory=dict)
    confidence_score: float = 0.85


class NetworkSniffer:
    """
    Interception Buffer and Schema Dissector for Network & API streams.
    Captures background REST/GraphQL responses, extracts media manifests,
    and runs session-consistent validation.
    """

    def __init__(self, max_buffer_size: int = 50, max_payload_bytes: int = 2 * 1024 * 1024):
        self.max_buffer_size = max_buffer_size
        self.max_payload_bytes = max_payload_bytes
        self.captured_payloads: List[CapturedPayload] = []
        self._attached_pages: Set[int] = set()
        self._lock = asyncio.Lock()

    def attach_to_page(self, page: Page):
        """Attaches response listener to a Playwright page instance."""
        page_id = id(page)
        if page_id in self._attached_pages:
            return
        self._attached_pages.add(page_id)

        async def _on_response(response: Response):
            try:
                headers = response.headers
                content_type = headers.get("content-type", "").lower()
                resource_type = response.request.resource_type
                url = response.url

                is_json = any(k in content_type for k in [
                    "application/json",
                    "application/graphql",
                    "application/ld+json",
                    "text/json",
                    "text/javascript",
                ])

                if is_json or (resource_type in ("xhr", "fetch") and not url.endswith((".js", ".css", ".svg", ".woff", ".woff2"))):
                    status = response.status
                    if 200 <= status < 300:
                        try:
                            # Safely read response text with size limit
                            body_text = await response.text()
                            if len(body_text) <= self.max_payload_bytes:
                                try:
                                    parsed_data = json.loads(body_text)
                                    if parsed_data:
                                        payload = CapturedPayload(
                                            url=url,
                                            status=status,
                                            content_type=content_type,
                                            resource_type=resource_type,
                                            data=parsed_data,
                                            size_bytes=len(body_text),
                                        )
                                        async with self._lock:
                                            self.captured_payloads.append(payload)
                                            if len(self.captured_payloads) > self.max_buffer_size:
                                                self.captured_payloads.pop(0)
                                except json.JSONDecodeError:
                                    pass
                        except Exception:
                            pass
            except Exception:
                pass

        page.on("response", _on_response)
        logger.info(f"[Network Sniffer] Attached response listener to Playwright page {page_id}")

    def add_payload_manually(self, url: str, data: Any, status: int = 200, content_type: str = "application/json"):
        """Allows injecting captured JSON payloads (e.g. from in-page script evaluation or tests)."""
        payload = CapturedPayload(
            url=url,
            status=status,
            content_type=content_type,
            resource_type="fetch",
            data=data,
            size_bytes=len(str(data)),
        )
        self.captured_payloads.append(payload)
        if len(self.captured_payloads) > self.max_buffer_size:
            self.captured_payloads.pop(0)

    def get_captured_payloads(
        self,
        url_filter: Optional[str] = None,
        min_items_threshold: int = 1,
    ) -> List[CapturedPayload]:
        """Returns captured payloads matching filters."""
        results = []
        for p in self.captured_payloads:
            if url_filter and url_filter.lower() not in p.url.lower():
                continue
            results.append(p)
        return results

    def extract_media_manifests(
        self,
        base_url: Optional[str] = None,
    ) -> List[MediaManifestItem]:
        """
        Recursively analyzes all captured JSON payloads to discover structured image manifests.
        Identifies media lists, original resolution URLs, dimensions, and metadata.
        """
        manifest_items: List[MediaManifestItem] = []
        seen_urls: Set[str] = set()

        for payload in self.captured_payloads:
            api_url = payload.url
            discovered = self._crawl_json_for_media(
                node=payload.data,
                api_url=api_url,
                base_url=base_url or api_url,
                seen_urls=seen_urls,
            )
            manifest_items.extend(discovered)

        # Sort manifests by resolution (if available) descending
        manifest_items.sort(
            key=lambda x: ((x.width or 0) * (x.height or 0)),
            reverse=True,
        )
        return manifest_items

    def _crawl_json_for_media(
        self,
        node: Any,
        api_url: str,
        base_url: str,
        seen_urls: Set[str],
    ) -> List[MediaManifestItem]:
        """Recursive crawler to extract media candidate dicts from arbitrary JSON schemas."""
        results: List[MediaManifestItem] = []

        if isinstance(node, dict):
            # Check if this dictionary itself represents a media item
            item = self._parse_media_dict(node, api_url, base_url)
            consumed_keys = set()
            if item:
                if item.original_url not in seen_urls:
                    seen_urls.add(item.original_url)
                    if item.thumbnail_url:
                        seen_urls.add(item.thumbnail_url)
                    results.append(item)
                # Mark media keys as consumed so we don't treat child objects as duplicate items
                consumed_keys = {"original", "thumbnail", "preview", "thumb", "small", "large", "highres", "master", "full_size", "image", "media"}

            # Recurse into dict values (skipping consumed media sub-dicts)
            for k, v in node.items():
                if k not in consumed_keys and isinstance(v, (dict, list)):
                    results.extend(self._crawl_json_for_media(v, api_url, base_url, seen_urls))

        elif isinstance(node, list):
            for element in node:
                if isinstance(element, (dict, list)):
                    results.extend(self._crawl_json_for_media(element, api_url, base_url, seen_urls))

        return results

    def _parse_media_dict(
        self,
        d: Dict[str, Any],
        api_url: str,
        base_url: str,
    ) -> Optional[MediaManifestItem]:
        """Inspects a single dictionary for image URL signatures and metadata."""
        if not isinstance(d, dict):
            return None

        # Keys likely to contain high-resolution / original media URLs
        highres_keys = [
            "original", "original_url", "highres", "high_res", "source", "source_url",
            "full_size", "full_url", "download_url", "master", "raw_url", "image_url",
            "large", "large_url", "photo_url", "url", "src", "file_url", "asset_url"
        ]
        
        # Keys likely to contain thumbnail URLs
        thumb_keys = ["thumbnail", "thumbnail_url", "thumb", "thumb_url", "preview", "preview_url", "small", "small_url", "tiny"]

        original_url = None
        thumbnail_url = None

        # Look for explicit original / highres keys first
        for hk in highres_keys:
            val = d.get(hk)
            if isinstance(val, str) and self._is_valid_image_url(val):
                original_url = urljoin(base_url, val.strip())
                break
            elif isinstance(val, dict):
                # Nested object e.g. "original": {"url": "https://..."}
                for inner_k in ["url", "src", "file", "download"]:
                    inner_v = val.get(inner_k)
                    if isinstance(inner_v, str) and self._is_valid_image_url(inner_v):
                        original_url = urljoin(base_url, inner_v.strip())
                        break
                if original_url:
                    break

        # Look for thumbnail
        for tk in thumb_keys:
            val = d.get(tk)
            if isinstance(val, str) and self._is_valid_image_url(val):
                thumbnail_url = urljoin(base_url, val.strip())
                break
            elif isinstance(val, dict):
                for inner_k in ["url", "src", "file"]:
                    inner_v = val.get(inner_k)
                    if isinstance(inner_v, str) and self._is_valid_image_url(inner_v):
                        thumbnail_url = urljoin(base_url, inner_v.strip())
                        break
                if thumbnail_url:
                    break

        if not original_url:
            return None

        # Extract dimensions from top-level or nested media dicts
        width = None
        height = None

        dicts_to_check = [d]
        for key in ["original", "highres", "master", "image", "media", "dimensions", "resolution", "size"]:
            nested = d.get(key)
            if isinstance(nested, dict):
                dicts_to_check.append(nested)

        for target_d in dicts_to_check:
            if not width:
                for wk in ["width", "w", "natural_width", "image_width", "pixel_x"]:
                    w_val = target_d.get(wk)
                    if isinstance(w_val, int) and w_val > 0:
                        width = w_val
                        break
                    elif isinstance(w_val, str) and w_val.isdigit():
                        width = int(w_val)
                        break

            if not height:
                for hk in ["height", "h", "natural_height", "image_height", "pixel_y"]:
                    h_val = target_d.get(hk)
                    if isinstance(h_val, int) and h_val > 0:
                        height = h_val
                        break
                    elif isinstance(h_val, str) and h_val.isdigit():
                        height = int(h_val)
                        break

            # Also check sub-nested dimensions dict
            if not width or not height:
                dims_obj = target_d.get("dimensions") or target_d.get("resolution") or target_d.get("size")
                if isinstance(dims_obj, dict):
                    width = dims_obj.get("width") or dims_obj.get("w") or width
                    height = dims_obj.get("height") or dims_obj.get("h") or height

        # Extract Title / Caption
        title = None
        for tk in ["title", "name", "label", "filename", "caption", "alt"]:
            t_val = d.get(tk)
            if isinstance(t_val, str) and t_val.strip():
                title = t_val.strip()
                break

        caption = d.get("caption") if isinstance(d.get("caption"), str) else None
        fmt = d.get("format") or d.get("mime_type") or d.get("extension")

        return MediaManifestItem(
            original_url=original_url,
            thumbnail_url=thumbnail_url,
            width=int(width) if width else None,
            height=int(height) if height else None,
            title=title,
            caption=caption,
            format=str(fmt) if fmt else None,
            source_api_url=api_url,
            raw_node=d,
            confidence_score=0.95 if (width and width >= 1920) else 0.85,
        )

    def _is_valid_image_url(self, val: str) -> bool:
        """Determines if a string is a plausible media/image URL."""
        if not val or not isinstance(val, str):
            return False
        val_clean = val.strip().lower()
        if not (val_clean.startswith("http://") or val_clean.startswith("https://") or val_clean.startswith("/") or val_clean.startswith("./")):
            return False
        
        # Obvious non-media strings
        if any(val_clean.endswith(ext) for ext in [".js", ".css", ".html", ".htm", ".json", ".xml", ".txt", ".woff", ".woff2"]):
            return False

        # Positive media extension or media keywords
        media_indicators = [
            ".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".bmp",
            "/orig", "/large", "/master", "/highres", "/images/", "/photos/",
            "/attachments/", "/uploads/", "/media/", "/assets/"
        ]
        return any(ind in val_clean for ind in media_indicators) or "?" in val_clean

    async def validate_manifest_items(
        self,
        items: List[MediaManifestItem],
        validator: ImageValidator,
        referer: Optional[str] = None,
        session_cookies: Optional[Dict[str, str]] = None,
        max_concurrent: int = 5,
    ) -> List[Tuple[MediaManifestItem, ValidationResult]]:
        """
        Concurrently validates discovered media manifest items against the ImageValidator
        with session cookies and Referer headers to ensure signed/expiring tokens pass.
        """
        if session_cookies:
            validator.update_session(cookies=session_cookies)

        semaphore = asyncio.Semaphore(max_concurrent)
        results: List[Tuple[MediaManifestItem, ValidationResult]] = []

        async def _validate_single(item: MediaManifestItem):
            async with semaphore:
                val_res = await validator.validate_candidate_url(
                    candidate_url=item.original_url,
                    referer=referer or item.source_api_url,
                    thumb_width=item.width,
                    thumb_height=item.height,
                )
                return item, val_res

        tasks = [_validate_single(item) for item in items]
        validated_pairs = await asyncio.gather(*tasks, return_exceptions=True)

        for pair in validated_pairs:
            if isinstance(pair, tuple) and len(pair) == 2:
                results.append(pair)

        return results
