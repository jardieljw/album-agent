"""
Speculative Parallel Probing & Probe-and-Scale Engine (Pillar 4).
Provides:
1. Top-3 Competing Hypothesis Generation on Probe Sample (Candidate #1).
2. Fast Async Concurrent Probing via HTTP Range/HEAD requests.
3. Bayesian Confidence Locking and Proven Vector Selection.
4. Mass Scaling across all remaining candidates in parallel.
"""

import re
import json
import time
import logging
import asyncio
from enum import Enum
from typing import Dict, List, Any, Optional, Tuple, Callable
from urllib.parse import urlparse, urljoin
from pydantic import BaseModel, Field

from ..core.models import (
    DOMCandidateInfo,
    AlbumImage,
    ResolutionMethod,
    ValidationVerdict,
    ValidationResult,
)
from ..validator.validator import ImageValidator
from .state_machine import CognitiveContext, HypothesisRecord

logger = logging.getLogger(__name__)


class HypothesisType(str, Enum):
    """Categorization of speculative probe hypothesis vectors."""
    PARENT_LINK = "PARENT_LINK"
    CDN_SUBSTITUTION = "CDN_SUBSTITUTION"
    DATA_ATTRIBUTE = "DATA_ATTRIBUTE"
    SRCSET_DESCRIPTOR = "SRCSET_DESCRIPTOR"
    API_MANIFEST = "API_MANIFEST"
    CUSTOM_TRANSFORM = "CUSTOM_TRANSFORM"


class ProbeHypothesis(BaseModel):
    """Represents a speculative hypothesis to be tested on a probe candidate."""
    hypothesis_id: str
    hypothesis_type: HypothesisType
    description: str
    proposed_url: Optional[str] = None
    transformation_rule: Optional[str] = None  # e.g. regex find/replace or lambda string
    prior_probability: float = 0.5


class ProbeResult(BaseModel):
    """Outcome of testing a single hypothesis on a probe candidate."""
    hypothesis: ProbeHypothesis
    candidate_id: str
    tested_url: str
    validation_result: ValidationResult
    latency_ms: float
    is_winner: bool = False


class ScalingResult(BaseModel):
    """Outcome of mass-scaling a winning vector across all candidates."""
    winning_hypothesis: ProbeHypothesis
    total_candidates: int
    resolved_count: int
    unresolved_count: int
    resolved_images: List[AlbumImage] = Field(default_factory=list)
    transformed_urls: Dict[str, str] = Field(default_factory=dict)
    elapsed_seconds: float = 0.0


class SpeculativeProber:
    r"""
    Speculative Probing Engine.
    Executes the 'Probe & Scale' pattern:
    Formulate Top-3 hypotheses on candidate #1 -> Probe in parallel ->
    Lock winning vector ($P(H \mid \text{Pass}) \approx 1.0$) -> Scale mass transforms.
    """

    def __init__(
        self,
        validator: ImageValidator,
        max_probe_concurrency: int = 5,
        mass_scale_concurrency: int = 15,
    ):
        self.validator = validator
        self.max_probe_concurrency = max_probe_concurrency
        self.mass_scale_concurrency = mass_scale_concurrency

    def generate_candidate_hypotheses(
        self,
        candidate: DOMCandidateInfo,
        target_url: str,
        meta_priors: Optional[Dict[str, Any]] = None,
    ) -> List[ProbeHypothesis]:
        """
        Formulates up to 3-5 competing high-probability hypotheses for candidate #1:
        1. Parent anchor direct link / detail page inspection
        2. High-res dataset attribute (data-original, data-full, data-large, data-highres)
        3. CDN path substitutions (/thumbs/ -> /orig/, /460/ -> /1280/ or /1920/, _thumb -> '')
        4. Srcset highest resolution descriptor
        """
        hypotheses: List[ProbeHypothesis] = []
        src = candidate.src or ""
        dataset = candidate.dataset or {}
        parent_href = candidate.parent_href

        # If src is a data URI or empty, resolve from data attributes
        if not src or src.startswith("data:") or src.startswith("blob:"):
            src = dataset.get("src") or dataset.get("original") or dataset.get("large") or dataset.get("lazy-src") or dataset.get("highres") or src

        # -------------------------------------------------------------
        # Hypothesis 1: Parent Anchor Link
        # -------------------------------------------------------------
        if parent_href:
            parsed_path = urlparse(parent_href).path.lower()
            is_direct_img = any(parsed_path.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".avif", ".bmp"])
            full_parent_url = urljoin(target_url, parent_href)
            
            hypotheses.append(ProbeHypothesis(
                hypothesis_id="hyp_parent_link",
                hypothesis_type=HypothesisType.PARENT_LINK,
                description=f"Parent anchor link: {parent_href[:50]}",
                proposed_url=full_parent_url,
                prior_probability=0.85 if is_direct_img else 0.70,
            ))

        # -------------------------------------------------------------
        # Hypothesis 2: Data Attributes (data-original, data-full, data-large, data-highres, data-src)
        # -------------------------------------------------------------
        highres_keys = ["original", "full", "large", "highres", "high-res", "zoom", "src-large", "master", "src", "lazy-src"]
        for k in highres_keys:
            val = dataset.get(k)
            if val and val.strip() and val != candidate.src and not val.startswith("data:"):
                resolved_url = urljoin(target_url, val.strip())
                hypotheses.append(ProbeHypothesis(
                    hypothesis_id=f"hyp_data_{k}",
                    hypothesis_type=HypothesisType.DATA_ATTRIBUTE,
                    description=f"Element dataset attribute data-{k}",
                    proposed_url=resolved_url,
                    prior_probability=0.90,
                ))
                break  # Take primary highres data attribute

        # -------------------------------------------------------------
        # Hypothesis 3: CDN Path Substitutions
        # -------------------------------------------------------------
        if src and not src.startswith("data:"):
            cdn_rules = [
                ("thumb_", "orig_"),
                ("/thumb/", "/orig/"),
                ("/thumbs/", "/originals/"),
                ("/460/", "/1280/"),
                ("/460/", "/1920/"),
                ("/small/", "/large/"),
                ("/preview/", "/full/"),
                ("_thumb.", "."),
                ("_small.", "."),
                ("_460.", "."),
                ("thumb_", "full_"),
                ("thumb_", ""),
            ]
            for find_tok, replace_tok in cdn_rules:
                if find_tok in src:
                    transformed = src.replace(find_tok, replace_tok)
                    if transformed != src:
                        hypotheses.append(ProbeHypothesis(
                            hypothesis_id=f"hyp_cdn_{find_tok.replace('/', '_')}",
                            hypothesis_type=HypothesisType.CDN_SUBSTITUTION,
                            description=f"CDN path substitution '{find_tok}' -> '{replace_tok}'",
                            proposed_url=transformed,
                            transformation_rule=f"lambda c: (c.get('dataset', {{}}).get('src') or c.get('src', '')).replace('{find_tok}', '{replace_tok}')",
                            prior_probability=0.75,
                        ))

            # Dimension suffixes: _296x1000., _480x360., _300x200., etc.
            dim_match = re.search(r'_\d+x\d+\.', src)
            if dim_match:
                transformed = re.sub(r'_\d+x\d+\.', '.', src)
                hypotheses.append(ProbeHypothesis(
                    hypothesis_id="hyp_cdn_dim_suffix",
                    hypothesis_type=HypothesisType.CDN_SUBSTITUTION,
                    description=f"CDN dimension suffix removal '{dim_match.group(0)}' -> '.'",
                    proposed_url=transformed,
                    transformation_rule="lambda c: re.sub(r'_\\d+x\\d+\\.', '.', (c.get('dataset', {}).get('src') or c.get('src', '')))",
                    prior_probability=0.88,
                ))

            # Query parameter stripping (e.g. Cloudinary/Imgix w=460)
            if "?" in src and any(q in src.lower() for q in ["w=", "width=", "size=", "resize="]):
                stripped = src.split("?")[0]
                hypotheses.append(ProbeHypothesis(
                    hypothesis_id="hyp_cdn_strip_query",
                    hypothesis_type=HypothesisType.CDN_SUBSTITUTION,
                    description="Strip CDN query resizing parameters",
                    proposed_url=stripped,
                    transformation_rule="lambda c: (c.get('dataset', {}).get('src') or c.get('src', '')).split('?')[0]",
                    prior_probability=0.70,
                ))

        # -------------------------------------------------------------
        # Hypothesis 4: Srcset Highest Descriptor
        # -------------------------------------------------------------
        if candidate.srcset:
            parts = re.findall(r'(\S+)(?:\s+([\d\.]+[wx]))?', candidate.srcset)
            if parts:
                best_srcset_url = urljoin(target_url, parts[-1][0])
                hypotheses.append(ProbeHypothesis(
                    hypothesis_id="hyp_srcset_highest",
                    hypothesis_type=HypothesisType.SRCSET_DESCRIPTOR,
                    description=f"Highest resolution srcset descriptor: {parts[-1][1] or 'max'}",
                    proposed_url=best_srcset_url,
                    prior_probability=0.88,
                ))

        # -------------------------------------------------------------
        # Hypothesis 5: Meta-Knowledge Prior Recipes (Pillar 6)
        # -------------------------------------------------------------
        if meta_priors and isinstance(meta_priors, list):
            for prior in meta_priors:
                rule = prior.get("rule_template")
                strat = prior.get("strategy", "CUSTOM_TRANSFORM")
                prior_prob = prior.get("prior_probability", 0.90)

                if rule and rule.startswith("lambda"):
                    try:
                        fn = eval(rule, {"re": re, "urlparse": urlparse})
                        cand_dict = {"src": src, "parent_href": parent_href, "dataset": dataset}
                        gen_url = fn(cand_dict)
                        if gen_url and isinstance(gen_url, str) and gen_url.startswith("http") and gen_url != src:
                            hypotheses.append(ProbeHypothesis(
                                hypothesis_id=f"hyp_meta_{prior.get('recipe_id', 'custom')}",
                                hypothesis_type=HypothesisType.CUSTOM_TRANSFORM,
                                description=f"Meta-Archetype Transfer Recipe: {prior.get('recipe_id')}",
                                proposed_url=gen_url,
                                transformation_rule=rule,
                                prior_probability=prior_prob,
                            ))
                    except Exception:
                        pass

        # Sort hypotheses by prior probability descending and take top 4-5
        hypotheses.sort(key=lambda h: h.prior_probability, reverse=True)
        return hypotheses[:5]

    async def execute_speculative_probe(
        self,
        candidate: DOMCandidateInfo,
        hypotheses: List[ProbeHypothesis],
        referer: Optional[str] = None,
        timeout_per_probe: float = 3.5,
    ) -> Optional[ProbeResult]:
        """
        Fires async parallel probes across all candidate hypotheses on sample #1.
        Returns the winning ProbeResult that passes Original/HD validation with lowest latency.
        """
        if not hypotheses:
            return None

        async def _probe_single(hyp: ProbeHypothesis) -> Optional[ProbeResult]:
            if not hyp.proposed_url:
                return None
            start_t = time.time()
            try:
                val_res = await self.validator.validate_candidate_url(
                    candidate_url=hyp.proposed_url,
                    referer=referer,
                    thumb_width=candidate.width,
                    thumb_height=candidate.height,
                )
                elapsed_ms = round((time.time() - start_t) * 1000, 1)

                is_win = (val_res.verdict == ValidationVerdict.PASS and (val_res.width or 0) >= min(600, (candidate.width or 200)))
                return ProbeResult(
                    hypothesis=hyp,
                    candidate_id=candidate.candidate_id,
                    tested_url=hyp.proposed_url,
                    validation_result=val_res,
                    latency_ms=elapsed_ms,
                    is_winner=is_win,
                )
            except Exception as e:
                logger.warning(f"Probe {hyp.hypothesis_id} failed: {e}")
                return None

        # Execute all hypothesis probes concurrently
        probe_tasks = [_probe_single(h) for h in hypotheses]
        results = await asyncio.gather(*probe_tasks, return_exceptions=True)

        valid_results: List[ProbeResult] = [
            r for r in results if isinstance(r, ProbeResult) and r.is_winner
        ]

        if not valid_results:
            logger.info("[Speculative Prober] No probe hypothesis met winning threshold on candidate")
            return None

        # Pick the winner with largest resolution or lowest latency
        winner = max(
            valid_results,
            key=lambda r: ((r.validation_result.width or 0) * (r.validation_result.height or 0)),
        )
        logger.info(f"[Speculative Prober]  Winning Vector Proven: {winner.hypothesis.description} -> {winner.validation_result.width}x{winner.validation_result.height} in {winner.latency_ms}ms")
        return winner

    async def scale_winning_vector(
        self,
        winning_probe: ProbeResult,
        candidates: List[DOMCandidateInfo],
        target_url: str,
        referer: Optional[str] = None,
    ) -> ScalingResult:
        """
        Applies the winning proven vector across all candidates concurrently.
        Resolves high-resolution URLs and validates images in parallel batches.
        """
        start_t = time.time()
        winning_hyp = winning_probe.hypothesis
        rule_str = winning_hyp.transformation_rule
        hyp_type = winning_hyp.hypothesis_type

        # Prepare transformation function
        transform_fn: Optional[Callable[[DOMCandidateInfo], Optional[str]]] = None

        if (hyp_type in (HypothesisType.CDN_SUBSTITUTION, HypothesisType.CUSTOM_TRANSFORM)) and rule_str:
            try:
                clean_rule = rule_str.strip()
                safe_globals = {
                    "__builtins__": {
                        "str": str, "int": int, "float": float, "bool": bool, "dict": dict, "list": list,
                        "len": len, "map": map, "filter": filter, "enumerate": enumerate, "range": range,
                        "min": min, "max": max, "sorted": sorted, "sum": sum,
                    },
                    "re": re,
                    "json": json,
                    "urlparse": urlparse,
                    "urljoin": urljoin,
                }
                raw_fn = None
                if clean_rule.startswith("lambda"):
                    raw_fn = eval(clean_rule, safe_globals)
                else:
                    local_scope = {}
                    exec(f"def transform(c):\n" + "\n".join(f"    {line}" for line in clean_rule.split("\n")), safe_globals, local_scope)
                    raw_fn = local_scope.get("transform")

                if callable(raw_fn):
                    def _safe_transform(c: DOMCandidateInfo) -> Optional[str]:
                        clean_src = c.src or ""
                        if not clean_src or clean_src.startswith("data:"):
                            clean_src = c.dataset.get("src") or c.dataset.get("original") or c.dataset.get("large") or clean_src
                        cand_dict = {
                            "src": clean_src,
                            "parent_href": c.parent_href,
                            "dataset": c.dataset or {},
                            "candidate_id": c.candidate_id,
                            "id": c.candidate_id,
                        }
                        res = raw_fn(cand_dict)
                        if res and isinstance(res, str) and res.startswith("http"):
                            return res
                        return None
                    transform_fn = _safe_transform
            except Exception as ex:
                logger.warning(f"[Speculative Prober] Failed to compile transformation rule: {ex}")

        elif hyp_type == HypothesisType.DATA_ATTRIBUTE:
            # Extract highres key name from hypothesis ID e.g. hyp_data_original
            key_name = winning_hyp.hypothesis_id.replace("hyp_data_", "")
            transform_fn = lambda c: urljoin(target_url, c.dataset.get(key_name, "")) if c.dataset.get(key_name) else None

        elif hyp_type == HypothesisType.PARENT_LINK:
            transform_fn = lambda c: urljoin(target_url, c.parent_href) if c.parent_href else None

        elif hyp_type == HypothesisType.SRCSET_DESCRIPTOR:
            def _extract_srcset(c: DOMCandidateInfo) -> Optional[str]:
                if not c.srcset:
                    return None
                parts = re.findall(r'(\S+)(?:\s+([\d\.]+[wx]))?', c.srcset)
                return urljoin(target_url, parts[-1][0]) if parts else None
            transform_fn = _extract_srcset

        # Fallback if transform_fn is None
        if not transform_fn:
            transform_fn = lambda c: c.src

        transformed_map: Dict[str, str] = {}
        for cand in candidates:
            try:
                t_url = transform_fn(cand)
                if t_url and t_url.startswith("http"):
                    transformed_map[cand.candidate_id] = t_url
            except Exception:
                pass

        # Concurrently validate transformed candidate URLs
        semaphore = asyncio.Semaphore(self.mass_scale_concurrency)
        resolved_images: List[AlbumImage] = []
        unresolved_count = 0

        async def _validate_candidate_item(idx: int, cand: DOMCandidateInfo):
            cand_url = transformed_map.get(cand.candidate_id)
            if not cand_url:
                return AlbumImage(
                    position=idx + 1,
                    candidate_id=cand.candidate_id,
                    thumbnail_url=cand.src or "",
                    original_url=None,
                    width=cand.width,
                    height=cand.height,
                    resolution_method=ResolutionMethod.NONE,
                    confidence=0.5,
                    validation_status="UNRESOLVED",
                    source_page=target_url,
                )

            async with semaphore:
                val_res = await self.validator.validate_candidate_url(
                    candidate_url=cand_url,
                    referer=referer or target_url,
                    thumb_width=cand.width,
                    thumb_height=cand.height,
                )

                if val_res.verdict == ValidationVerdict.PASS:
                    method_enum = ResolutionMethod.VERIFIED_CDN_CANDIDATE
                    if hyp_type == HypothesisType.PARENT_LINK:
                        method_enum = ResolutionMethod.INDIVIDUAL_PAGE
                    elif hyp_type == HypothesisType.DATA_ATTRIBUTE:
                        method_enum = ResolutionMethod.DATA_ATTRIBUTE
                    elif hyp_type == HypothesisType.SRCSET_DESCRIPTOR:
                        method_enum = ResolutionMethod.SRCSET

                    return AlbumImage(
                        position=idx + 1,
                        candidate_id=cand.candidate_id,
                        thumbnail_url=cand.src or "",
                        original_url=cand_url,
                        width=val_res.width,
                        height=val_res.height,
                        format=val_res.format,
                        file_size=val_res.file_size,
                        resolution_method=method_enum,
                        confidence=1.0,
                        validation_status="PASS",
                        source_page=target_url,
                    )
                else:
                    return AlbumImage(
                        position=idx + 1,
                        candidate_id=cand.candidate_id,
                        thumbnail_url=cand.src or "",
                        original_url=None,
                        width=cand.width,
                        height=cand.height,
                        resolution_method=ResolutionMethod.NONE,
                        confidence=0.5,
                        validation_status="UNRESOLVED",
                        source_page=target_url,
                    )

        tasks = [_validate_candidate_item(i, c) for i, c in enumerate(candidates)]
        all_resolved = await asyncio.gather(*tasks, return_exceptions=True)

        for img in all_resolved:
            if isinstance(img, AlbumImage):
                resolved_images.append(img)
                if img.validation_status == "UNRESOLVED":
                    unresolved_count += 1
            else:
                unresolved_count += 1

        elapsed = round(time.time() - start_t, 2)
        resolved_count = len(resolved_images) - unresolved_count

        logger.info(f"[Speculative Prober] Mass scale completed: {resolved_count}/{len(candidates)} resolved in {elapsed}s")

        return ScalingResult(
            winning_hypothesis=winning_hyp,
            total_candidates=len(candidates),
            resolved_count=resolved_count,
            unresolved_count=unresolved_count,
            resolved_images=resolved_images,
            transformed_urls=transformed_map,
            elapsed_seconds=elapsed,
        )
