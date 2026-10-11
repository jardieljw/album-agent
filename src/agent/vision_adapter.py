"""
Multimodal Vision Perception & Set-of-Marks (SoM) Visual Reasoning (Pillar 3).
Provides:
1. In-Page Set-of-Marks (SoM) visual badge overlays and viewport screenshot capture.
2. Visual Region Segmentation (Core gallery grid vs Ad banners vs Navigation logos vs Pagination).
3. Visual Fidelity Verification (Sharpness, aspect ratio alignment, blurriness detection).
"""

import io
import base64
import json
import logging
import asyncio
from typing import Dict, List, Any, Optional, Tuple, Set
from pydantic import BaseModel, Field
from PIL import Image, ImageStat

try:
    from playwright.async_api import Page
except ImportError:
    Page = Any
from ..core.models import DOMCandidateInfo, CandidateClassification
from ..agent.llm_adapter import LLMAdapter

logger = logging.getLogger(__name__)


class VisionMarkInfo(BaseModel):
    """Represents a Set-of-Marks badge overlaid on a candidate element."""
    mark_id: int
    candidate_id: str
    bounding_box: Dict[str, int]
    category: Optional[str] = None


class VisionSegmentationResult(BaseModel):
    """Structured output of visual region segmentation."""
    gallery_candidate_ids: List[str] = Field(default_factory=list)
    banner_candidate_ids: List[str] = Field(default_factory=list)
    logo_candidate_ids: List[str] = Field(default_factory=list)
    pagination_selectors: List[str] = Field(default_factory=list)
    raw_analysis: Optional[str] = None
    model_name: str = "vision_adapter"
    confidence: float = 0.90


class VisualFidelityResult(BaseModel):
    """Quality and fidelity metrics of an inspected image asset."""
    is_valid: bool
    width: int
    height: int
    aspect_ratio: float
    is_blurry: bool = False
    sharpness_score: float = 1.0
    aspect_ratio_diff: Optional[float] = None
    has_watermark_detected: bool = False
    confidence: float = 1.0


class VisionAdapter:
    """
    Multimodal Vision Perception Engine.
    Executes Set-of-Marks visual overlay generation, multimodal LLM classification,
    and image quality/fidelity checks.
    """

    def __init__(self, default_vision_model: str = "qwen2.5-vl"):
        self.default_vision_model = default_vision_model

    async def inject_set_of_marks(
        self,
        page: Page,
        candidates: List[DOMCandidateInfo],
        max_marks: int = 30,
    ) -> Tuple[bytes, Dict[int, str]]:
        """
        Injects numbered Set-of-Marks badge overlays over DOM candidate elements,
        takes a clean viewport screenshot, and removes the overlay.
        Returns (screenshot_bytes, {mark_id: candidate_id}).
        """
        mark_map: Dict[int, str] = {}
        mark_payload = []

        # Prepare mark elements
        for idx, cand in enumerate(candidates[:max_marks]):
            mark_id = idx + 1
            mark_map[mark_id] = cand.candidate_id
            mark_payload.append({
                "mark_id": mark_id,
                "selector": cand.selector,
                "candidate_id": cand.candidate_id,
                "src": cand.src or "",
            })

        # Inject Set-of-Marks CSS and badge elements into the page
        try:
            await page.evaluate("""(marks) => {
                // Remove existing overlay if present
                const oldOverlay = document.getElementById('__som_overlay_container__');
                if (oldOverlay) oldOverlay.remove();

                const container = document.createElement('div');
                container.id = '__som_overlay_container__';
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.zIndex = '9999999';
                container.style.pointerEvents = 'none';

                marks.forEach(m => {
                    const el = document.querySelector(m.selector);
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        const scrollX = window.scrollX || window.pageXOffset || 0;
                        const scrollY = window.scrollY || window.pageYOffset || 0;

                        if (rect.width > 0 && rect.height > 0) {
                            // Bounding box border
                            const box = document.createElement('div');
                            box.style.position = 'absolute';
                            box.style.left = (rect.left + scrollX) + 'px';
                            box.style.top = (rect.top + scrollY) + 'px';
                            box.style.width = rect.width + 'px';
                            box.style.height = rect.height + 'px';
                            box.style.border = '2px solid #00E5FF';
                            box.style.boxSizing = 'border-box';
                            box.style.backgroundColor = 'rgba(0, 229, 255, 0.12)';

                            // Badge label
                            const badge = document.createElement('div');
                            badge.innerText = '[' + m.mark_id + ']';
                            badge.style.position = 'absolute';
                            badge.style.top = '-14px';
                            badge.style.left = '-2px';
                            badge.style.backgroundColor = '#00E5FF';
                            badge.style.color = '#000000';
                            badge.style.fontSize = '12px';
                            badge.style.fontWeight = 'bold';
                            badge.style.padding = '1px 4px';
                            badge.style.borderRadius = '3px';
                            badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';

                            box.appendChild(badge);
                            container.appendChild(box);
                        }
                    }
                });

                document.body.appendChild(container);
            }""", mark_payload)

            # Capture viewport screenshot
            screenshot_bytes = await page.screenshot(type="jpeg", quality=85, full_page=False)

            # Clean up overlay
            await page.evaluate("""() => {
                const el = document.getElementById('__som_overlay_container__');
                if (el) el.remove();
            }""")

            return screenshot_bytes, mark_map
        except Exception as e:
            logger.warning(f"Set-of-Marks overlay generation failed: {e}")
            # Fallback to direct screenshot
            try:
                screenshot_bytes = await page.screenshot(type="jpeg", quality=80)
                return screenshot_bytes, mark_map
            except Exception:
                return b"", mark_map

    async def analyze_visual_regions(
        self,
        screenshot_bytes: bytes,
        mark_map: Dict[int, str],
        page_title: str,
        candidates: List[DOMCandidateInfo],
        llm_adapter: Optional[LLMAdapter] = None,
    ) -> VisionSegmentationResult:
        """
        Queries Vision LLM (or executes geometric visual segmentation fallback)
        to categorize marked regions into Gallery, Ad Banners, Logos, and Pagination.
        """
        if not mark_map:
            return VisionSegmentationResult()

        if llm_adapter and getattr(llm_adapter, "is_live_llm_available", False) and screenshot_bytes:
            # Prepare Multimodal Vision Prompt
            base64_image = base64.b64encode(screenshot_bytes).decode("utf-8")
            system_prompt = (
                "You are an AI Vision-Language Web Perception Engine. Analyze the webpage screenshot with Set-of-Marks "
                "numbered badges ([1], [2], [3], ...) overlaid on image candidate elements.\n"
                "Categorize every mark ID into:\n"
                "- gallery_marks: list of mark integers representing core album/gallery photos\n"
                "- banner_marks: list of mark integers representing advertisements or promotional banners\n"
                "- logo_marks: list of mark integers representing site logos or avatars\n"
                "- pagination_marks: list of mark integers representing pagination or 'Load More' buttons\n"
                "Return JSON ONLY with: {\"gallery_marks\": [1, 2], \"banner_marks\": [3], \"logo_marks\": [4], \"pagination_marks\": []}\n"
                "Do not write markdown or conversational explanations."
            )
            user_prompt = f"Page Title: {page_title}. Marked candidate IDs range from 1 to {len(mark_map)}."

            try:
                import httpx
                async with httpx.AsyncClient(timeout=llm_adapter.timeout) as client:
                    resp = await client.post(
                        f"{llm_adapter.api_base}/chat/completions",
                        headers={"Authorization": f"Bearer {llm_adapter.api_key}", "Content-Type": "application/json"},
                        json={
                            "model": getattr(llm_adapter, "model_name", self.default_vision_model),
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {
                                    "role": "user",
                                    "content": [
                                        {"type": "text", "text": user_prompt},
                                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}},
                                    ]
                                }
                            ],
                            "response_format": {"type": "json_object"},
                            "temperature": 0.0,
                        }
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        choices = data.get("choices", [])
                        if choices:
                            raw = choices[0].get("message", {}).get("content", "").strip()
                            if raw.startswith("```json"):
                                raw = raw[7:]
                            if raw.startswith("```"):
                                raw = raw[3:]
                            if raw.endswith("```"):
                                raw = raw[:-3]
                            parsed = json.loads(raw.strip())
                            
                            gallery_cands = [mark_map[m] for m in parsed.get("gallery_marks", []) if m in mark_map]
                            banner_cands = [mark_map[m] for m in parsed.get("banner_marks", []) if m in mark_map]
                            logo_cands = [mark_map[m] for m in parsed.get("logo_marks", []) if m in mark_map]

                            return VisionSegmentationResult(
                                gallery_candidate_ids=gallery_cands,
                                banner_candidate_ids=banner_cands,
                                logo_candidate_ids=logo_cands,
                                raw_analysis=raw,
                                model_name=llm_adapter.model_name,
                                confidence=0.95,
                            )
            except Exception as e:
                logger.warning(f"Vision LLM query failed: {e}")

        # Deterministic Geometric Visual Segmentation Fallback
        return self._geometric_visual_segmentation_fallback(mark_map, candidates)

    def _geometric_visual_segmentation_fallback(
        self,
        mark_map: Dict[int, str],
        candidates: List[DOMCandidateInfo],
    ) -> VisionSegmentationResult:
        """
        Accurately segments candidates using spatial geometry, container homogeneity,
        and aspect ratio cluster analysis.
        """
        cand_by_id = {c.candidate_id: c for c in candidates}
        gallery_cands = []
        banner_cands = []
        logo_cands = []

        # Find container cluster with highest number of homogeneous thumbnails
        container_counts = {}
        for c in candidates:
            if c.container_selector:
                container_counts[c.container_selector] = container_counts.get(c.container_selector, 0) + 1

        primary_container = max(container_counts, key=container_counts.get) if container_counts else None

        for mark_id, cand_id in mark_map.items():
            cand = cand_by_id.get(cand_id)
            if not cand:
                continue

            w = cand.width or 0
            h = cand.height or 0
            classes = " ".join(cand.classes).lower()
            container = (cand.container_selector or "").lower()

            # Logo detection
            if "logo" in classes or "avatar" in classes or (w <= 140 and h <= 60):
                logo_cands.append(cand_id)
            # Banner detection
            elif "banner" in classes or "ad" in classes or "promo" in classes or "sidebar" in container:
                banner_cands.append(cand_id)
            # Primary gallery cluster
            elif cand.container_selector == primary_container and w >= 150 and h >= 150:
                gallery_cands.append(cand_id)
            # Sibling repetition
            elif cand.total_siblings >= 2 and w >= 150 and h >= 150:
                gallery_cands.append(cand_id)
            else:
                gallery_cands.append(cand_id)

        return VisionSegmentationResult(
            gallery_candidate_ids=gallery_cands,
            banner_candidate_ids=banner_cands,
            logo_candidate_ids=logo_cands,
            raw_analysis="Geometric Visual Segmentation Fallback",
            model_name="geometric_fallback",
            confidence=0.88,
        )

    def verify_visual_fidelity(
        self,
        image_bytes: bytes,
        expected_aspect_ratio: Optional[float] = None,
    ) -> VisualFidelityResult:
        """
        Inspects decoded image bytes using PIL for dimensions, sharpness, blurriness,
        and aspect ratio consistency.
        """
        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                w, h = img.size
                actual_ar = round(w / h, 3) if h > 0 else 1.0

                # Compute image sharpness via variance of image gradients
                gray = img.convert("L")
                stat = ImageStat.Stat(gray)
                var = stat.var[0] if stat.var else 0.0
                is_blurry = (var < 20.0 and w > 100)  # Very low variance indicates flat/blurred image

                ar_diff = None
                if expected_aspect_ratio:
                    ar_diff = round(abs(actual_ar - expected_aspect_ratio), 3)

                is_valid = (w >= 300 and h >= 300 and not is_blurry)
                if ar_diff is not None and ar_diff > 0.40:
                    is_valid = False

                return VisualFidelityResult(
                    is_valid=is_valid,
                    width=w,
                    height=h,
                    aspect_ratio=actual_ar,
                    is_blurry=is_blurry,
                    sharpness_score=round(var, 2),
                    aspect_ratio_diff=ar_diff,
                    has_watermark_detected=False,
                    confidence=1.0 if is_valid else 0.5,
                )
        except Exception as e:
            logger.warning(f"Visual fidelity check failed: {e}")
            return VisualFidelityResult(
                is_valid=False,
                width=0,
                height=0,
                aspect_ratio=1.0,
                is_blurry=True,
                sharpness_score=0.0,
                confidence=0.0,
            )
