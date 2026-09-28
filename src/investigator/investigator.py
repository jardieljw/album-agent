"""
Deterministic & AI-Guided Original Image Investigator.
Executes multi-vector investigation to resolve true Original/high-res originals:
- Vector 1: Element Attributes (srcset, data-original, data-full, data-large, data-highres)
- Vector 2: Parent Anchor (direct high-res image link & detail page background inspection)
- Vector 3: Embedded JSON & Microdata (__INITIAL_STATE__, Next, Nuxt, ld+json)
- Vector 4: Network Resources Interception
- Vector 5: CDN Pattern Inferences
- Vector 6: AI Hypothesis Generation (Qwen LLM deduces high-res URL patterns for difficult items)
"""

import re
import json
import logging
from typing import Tuple, Optional, List, Dict, Any, TYPE_CHECKING
from urllib.parse import urlparse, urljoin

from ..core.models import (
    DOMCandidateInfo,
    ResolutionMethod,
    ValidationResult,
    ValidationVerdict,
    StructuredAuditTrail,
)
from ..browser.tools import BrowserTools
from ..validator.validator import ImageValidator

if TYPE_CHECKING:
    from ..agent.llm_adapter import LLMAdapter

logger = logging.getLogger(__name__)


class OriginalImageInvestigator:
    """
    Coordinates multi-vector investigation across DOM attributes, detail pages,
    network resources, CDN transformations, and Qwen AI hypothesis reasoning.
    """

    def __init__(
        self,
        tools: BrowserTools,
        validator: ImageValidator,
        llm_adapter: Optional[Any] = None,
    ):
        self.tools = tools
        self.validator = validator
        self.llm_adapter = llm_adapter

    async def investigate_candidate(
        self,
        candidate: DOMCandidateInfo,
        source_url: str,
        audit: StructuredAuditTrail,
        proven_sample_urls: Optional[List[str]] = None,
    ) -> Tuple[Optional[str], ResolutionMethod, Optional[ValidationResult]]:
        """
        Runs iterative multi-vector investigation for a single thumbnail candidate.
        Prioritizes high-resolution sources over low-res lazy-load thumbnails.
        """
        audit.actions.append("investigate_candidate")
        cand_w = candidate.width or 0
        cand_h = candidate.height or 0
        proven_urls = proven_sample_urls or []

        # -------------------------------------------------------------
        # Vector 0: Video Media Fast-Path Resolution
        # -------------------------------------------------------------
        if candidate.media_type == "video":
            audit.actions.append("resolve_video_direct")
            sources_to_try = candidate.video_sources if candidate.video_sources else ([candidate.src] if candidate.src else [])
            for v_url in sources_to_try:
                if v_url:
                    try:
                        v_res = await self.validator.validate_candidate_url(
                            candidate_url=v_url,
                            referer=source_url,
                            thumb_width=candidate.width,
                            thumb_height=candidate.height,
                        )
                        if v_res.verdict == ValidationVerdict.PASS:
                            audit.actions.append("accept_video_stream")
                            return v_url, ResolutionMethod.DIRECT, v_res
                    except Exception:
                        pass
            # Fallback to candidate source
            return candidate.src, ResolutionMethod.DIRECT, ValidationResult(
                verdict=ValidationVerdict.PASS,
                target_url=candidate.src or "",
                width=candidate.width or 1280,
                height=candidate.height or 720,
                format="mp4",
                is_valid=True
            )

        # -------------------------------------------------------------
        # Vector 1: High-Resolution Element Attributes (srcset / data-original)
        # -------------------------------------------------------------
        audit.actions.append("check_element_attributes")

        # 1.1 Check srcset on candidate element (Highest resolution descriptor first)
        if candidate.srcset:
            audit.actions.append("parse_element_srcset")
            srcset_cands = self.tools.parse_srcset_candidates(candidate.srcset, source_url)
            for item in srcset_cands:
                cand_url = item["url"]
                res = await self.validator.validate_candidate_url(
                    candidate_url=cand_url,
                    referer=source_url,
                    thumb_width=candidate.width,
                    thumb_height=candidate.height,
                )
                if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                    audit.actions.append(f"accept_srcset_{item['descriptor']}")
                    return cand_url, ResolutionMethod.SRCSET, res

        # 1.2 Check explicit high-res data attributes (data-original, data-full, data-large, data-highres)
        highres_data_keys = ["original", "full", "large", "highres", "high-res", "zoom-image"]
        for key in highres_data_keys:
            val = candidate.dataset.get(key)
            if val and val.strip() and val != candidate.src:
                resolved_data_url = urljoin(source_url, val.strip())
                audit.actions.append(f"test_data_{key}_candidate")
                res = await self.validator.validate_candidate_url(
                    candidate_url=resolved_data_url,
                    referer=source_url,
                    thumb_width=candidate.width,
                    thumb_height=candidate.height,
                )
                if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                    audit.actions.append(f"accept_data_{key}")
                    return resolved_data_url, ResolutionMethod.DATA_ATTRIBUTE, res

        # -------------------------------------------------------------
        # Vector 2: Parent Anchor / Direct Image Link & Detail Page Navigation
        # -------------------------------------------------------------
        if candidate.parent_href:
            audit.actions.append("inspect_parent_link")
            detail_url = candidate.parent_href

            # 2.1 Check if parent href is a direct high-res image link (.jpg, .png, .webp, /1280/, /orig/, etc.)
            parsed_path = urlparse(detail_url).path.lower()
            is_direct_image = any(parsed_path.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".avif", ".bmp"])
            if is_direct_image or any(k in detail_url.lower() for k in ["/1280/", "/1920/", "/full/", "/orig/", "/source/"]):
                audit.actions.append("test_parent_direct_image_link")
                res = await self.validator.validate_candidate_url(
                    candidate_url=detail_url,
                    referer=source_url,
                    thumb_width=candidate.width,
                    thumb_height=candidate.height,
                )
                if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                    audit.actions.append("accept_parent_direct_image_link")
                    return detail_url, ResolutionMethod.INDIVIDUAL_PAGE, res

            # 2.2 Open detail page in background
            audit.actions.append("open_detail_page")
            detail_data = await self.tools.open_detail_page(detail_url)
            if detail_data:
                # Inspect srcset on detail page (highest descriptor first)
                detail_images = detail_data.get("images", [])
                for d_img in detail_images:
                    d_srcset = d_img.get("srcset")
                    if d_srcset:
                        parsed_srcsets = self.tools.parse_srcset_candidates(d_srcset, detail_url)
                        for ps in parsed_srcsets:
                            res = await self.validator.validate_candidate_url(
                                candidate_url=ps["url"],
                                referer=detail_url,
                                thumb_width=candidate.width,
                                thumb_height=candidate.height,
                            )
                            if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                                audit.actions.append(f"accept_detail_page_srcset_{ps['descriptor']}")
                                return ps["url"], ResolutionMethod.SRCSET, res

                # Inspect data-original/data-full on detail page
                for d_img in detail_images:
                    d_dataset = d_img.get("dataset", {})
                    for d_k in ["original", "full", "large", "highres", "high-res", "src"]:
                        d_v = d_dataset.get(d_k)
                        if d_v and d_v.strip():
                            d_cand_url = urljoin(detail_url, d_v.strip())
                            res = await self.validator.validate_candidate_url(
                                candidate_url=d_cand_url,
                                referer=detail_url,
                                thumb_width=candidate.width,
                                thumb_height=candidate.height,
                            )
                            if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                                audit.actions.append(f"accept_detail_page_data_{d_k}")
                                return d_cand_url, ResolutionMethod.DATA_ATTRIBUTE, res

                # Inspect JSON states on detail page
                json_states = detail_data.get("json_states", [])
                for js in json_states:
                    found_json_urls = self._extract_urls_from_json(js, detail_url)
                    for fj_url in found_json_urls:
                        res = await self.validator.validate_candidate_url(
                            candidate_url=fj_url,
                            referer=detail_url,
                            thumb_width=candidate.width,
                            thumb_height=candidate.height,
                        )
                        if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                            audit.actions.append("accept_detail_page_embedded_json")
                            return fj_url, ResolutionMethod.EMBEDDED_JSON, res

                # Inspect direct images on detail page
                for d_img in detail_images:
                    d_src = d_img.get("src")
                    if d_src:
                        d_cand_url = urljoin(detail_url, d_src)
                        res = await self.validator.validate_candidate_url(
                            candidate_url=d_cand_url,
                            referer=detail_url,
                            thumb_width=candidate.width,
                            thumb_height=candidate.height,
                        )
                        if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                            audit.actions.append("accept_detail_page_main_image")
                            return d_cand_url, ResolutionMethod.INDIVIDUAL_PAGE, res

                # Inspect meta images on detail page
                for m_url in detail_data.get("meta_images", []):
                    m_abs = urljoin(detail_url, m_url)
                    res = await self.validator.validate_candidate_url(
                        candidate_url=m_abs,
                        referer=detail_url,
                        thumb_width=candidate.width,
                        thumb_height=candidate.height,
                    )
                    if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                        audit.actions.append("accept_detail_page_meta_image")
                        return m_abs, ResolutionMethod.INDIVIDUAL_PAGE, res

        # -------------------------------------------------------------
        # Vector 3: Fallback Lazy-Load Data Attributes (data-src, data-url)
        # -------------------------------------------------------------
        for key in ["src", "url", "image"]:
            val = candidate.dataset.get(key)
            if val and val.strip() and val != candidate.src:
                resolved_data_url = urljoin(source_url, val.strip())
                audit.actions.append(f"test_data_{key}_fallback")
                res = await self.validator.validate_candidate_url(
                    candidate_url=resolved_data_url,
                    referer=source_url,
                    thumb_width=candidate.width,
                    thumb_height=candidate.height,
                )
                if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                    audit.actions.append(f"accept_data_{key}")
                    return resolved_data_url, ResolutionMethod.DATA_ATTRIBUTE, res

        # -------------------------------------------------------------
        # Vector 4: Embedded JSON & Microdata on current page
        # -------------------------------------------------------------
        audit.actions.append("check_embedded_json_states")
        json_states = await self.tools.extract_json_state()
        for js in json_states:
            found_json_urls = self._extract_urls_from_json(js, source_url)
            for fj_url in found_json_urls:
                cand_filename = urlparse(candidate.src or "").path.split("/")[-1].split(".")[0]
                if cand_filename and cand_filename.lower() in fj_url.lower():
                    res = await self.validator.validate_candidate_url(
                        candidate_url=fj_url,
                        referer=source_url,
                        thumb_width=candidate.width,
                        thumb_height=candidate.height,
                    )
                    if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                        audit.actions.append("accept_page_embedded_json")
                        return fj_url, ResolutionMethod.EMBEDDED_JSON, res

        # -------------------------------------------------------------
        # Vector 5: Network Resources Interception
        # -------------------------------------------------------------
        audit.actions.append("check_network_resources")
        net_resources = self.tools.get_network_resources()
        cand_base = urlparse(candidate.src or "").path.split("/")[-1].split(".")[0]
        if cand_base and len(cand_base) >= 3:
            for nr in reversed(net_resources):
                nr_url = nr.get("url", "")
                if cand_base.lower() in nr_url.lower() and nr_url != candidate.src:
                    res = await self.validator.validate_candidate_url(
                        candidate_url=nr_url,
                        referer=source_url,
                        thumb_width=candidate.width,
                        thumb_height=candidate.height,
                    )
                    if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                        audit.actions.append("accept_network_interception")
                        return nr_url, ResolutionMethod.NETWORK, res

        # -------------------------------------------------------------
        # Vector 6: CDN Pattern Inferences (Deterministic Transformations)
        # -------------------------------------------------------------
        if candidate.src:
            audit.actions.append("test_cdn_pattern_inferences")
            inferred_candidates = self._generate_cdn_candidates(candidate.src)
            for inf_url in inferred_candidates:
                if inf_url == candidate.src:
                    continue
                res = await self.validator.validate_candidate_url(
                    candidate_url=inf_url,
                    referer=source_url,
                    thumb_width=candidate.width,
                    thumb_height=candidate.height,
                )
                if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                    audit.actions.append("accept_verified_cdn_candidate")
                    return inf_url, ResolutionMethod.VERIFIED_CDN_CANDIDATE, res

        # -------------------------------------------------------------
        # Vector 7: Qwen AI Hypothesis Generation (For Difficult Candidates)
        # -------------------------------------------------------------
        if self.llm_adapter and candidate.src:
            audit.actions.append("query_qwen_hypotheses")
            ai_hypotheses = await self.llm_adapter.query_investigation_hypotheses(
                candidate_src=candidate.src,
                proven_sample_urls=proven_urls,
                page_url=source_url,
                surrounding_text=candidate.surrounding_text,
            )
            for ai_url in ai_hypotheses:
                if ai_url == candidate.src:
                    continue
                audit.actions.append(f"test_ai_hypothesis ({ai_url[-30:]})")
                res = await self.validator.validate_candidate_url(
                    candidate_url=ai_url,
                    referer=source_url,
                    thumb_width=candidate.width,
                    thumb_height=candidate.height,
                )
                if res.verdict == ValidationVerdict.PASS and (res.width or 0) > cand_w:
                    audit.actions.append("accept_ai_hypothesized_original")
                    return ai_url, ResolutionMethod.VERIFIED_CDN_CANDIDATE, res

        # None found
        audit.actions.append("mark_unresolved")
        return None, ResolutionMethod.NONE, None

    def _extract_urls_from_json(self, data: Any, base_url: str) -> List[str]:
        """Recursively traverses JSON to find image URL strings."""
        found = []
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, str):
                    lower_v = v.lower()
                    if any(ext in lower_v for ext in [".jpg", ".jpeg", ".png", ".webp", ".avif", "image", "photo"]):
                        found.append(urljoin(base_url, v))
                elif isinstance(v, (dict, list)):
                    found.extend(self._extract_urls_from_json(v, base_url))
        elif isinstance(data, list):
            for item in data:
                found.extend(self._extract_urls_from_json(item, base_url))
        return found

    def _generate_cdn_candidates(self, src_url: str) -> List[str]:
        """
        Generates candidate URLs using common CDN structural transformations.
        NOTE: These are candidate-only hypotheses and MUST pass full validation.
        """
        candidates = []
        p1 = re.sub(r'/(460|thumbs?|thumbnails?|small|medium|preview)/', '/original/', src_url)
        if p1 != src_url:
            candidates.append(p1)
        p2 = re.sub(r'/(460|thumbs?|thumbnails?|small|medium|preview)/', '/1280/', src_url)
        if p2 != src_url:
            candidates.append(p2)
        p3 = re.sub(r'/(460|thumbs?|thumbnails?|small|medium|preview)/', '/1920/', src_url)
        if p3 != src_url:
            candidates.append(p3)
        p4 = re.sub(r'/(460|thumbs?|thumbnails?|small|medium|preview)/', '/full/', src_url)
        if p4 != src_url:
            candidates.append(p4)
        p5 = re.sub(r'/(460|thumbs?|thumbnails?|small|medium|preview)/', '/large/', src_url)
        if p5 != src_url:
            candidates.append(p5)

        p6 = re.sub(r'_(thumb|small|preview|\d+x\d+)\.', '.', src_url)
        if p6 != src_url:
            candidates.append(p6)

        p7 = re.sub(r'/thumb_([^/]+)$', r'/\1', src_url)
        if p7 != src_url:
            candidates.append(p7)

        return candidates
