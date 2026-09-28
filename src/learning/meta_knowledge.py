"""
Hierarchical Meta-Archetype Knowledge Graph & Transfer Learning Engine (Pillar 6).
Provides:
1. Meta-Archetype Taxonomy (Level 1: Global Archetype, Level 2: Platform Variant, Level 3: Verified Recipes).
2. Structural Archetype Matching using DOM layouts, script tags, framework signatures.
3. Bayesian Confidence Updates & Prior Hypothesis Injection for Speculative Probing.
4. Persistent Knowledge Store with atomic file sync and baseline transfer priors.
"""

import os
import time
import json
import logging
from enum import Enum
from typing import Dict, List, Any, Optional, Tuple, Set
from pydantic import BaseModel, Field

from ..core.models import DOMCandidateInfo

logger = logging.getLogger(__name__)


class GlobalArchetype(str, Enum):
    """Level 1: Global structural layout archetypes."""
    SPA_HYDRATED_STATE = "SPA_HYDRATED_STATE"
    STATIC_GRID_TILES = "STATIC_GRID_TILES"
    FORUM_THREAD_EMBEDS = "FORUM_THREAD_EMBEDS"
    LIGHTBOX_INTERACTIVE = "LIGHTBOX_INTERACTIVE"
    PAGINATED_CATALOG = "PAGINATED_CATALOG"
    UNKNOWN = "UNKNOWN"


class ResolutionRecipe(BaseModel):
    """Level 3: Verified resolution rule recipe."""
    recipe_id: str
    strategy: str  # e.g. "CDN_SUBSTITUTION", "DATA_ATTRIBUTE", "PARENT_LINK", "API_MANIFEST"
    rule_template: str  # e.g. "lambda c: c['src'].replace('thumb_', 'orig_')"
    success_count: int = 1
    failure_count: int = 0
    confidence_score: float = 0.85
    example_domains: List[str] = Field(default_factory=list)

    def update_bayesian_confidence(self):
        """Computes Laplace-smoothed Bayesian confidence score."""
        self.confidence_score = round(
            (self.success_count + 1.0) / (self.success_count + self.failure_count + 2.0),
            3
        )


class ArchetypeNode(BaseModel):
    """Level 1 + Level 2: Meta-Archetype entity with structural signatures and recipes."""
    archetype_id: str
    global_archetype: GlobalArchetype
    platform_variant: str = "generic"  # e.g. "Wordpress", "Shopify", "Discourse", "NextJS", "Custom"
    dom_signatures: List[str] = Field(default_factory=list)
    script_signatures: List[str] = Field(default_factory=list)
    recipes: List[ResolutionRecipe] = Field(default_factory=list)
    total_extractions: int = 0
    last_updated: float = Field(default_factory=time.time)


class MetaKnowledgeGraph:
    """
    Meta-Archetype Knowledge Graph.
    Retains cross-session structural patterns, recipes, and success priors.
    """

    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = storage_path or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "data",
            "meta_knowledge_graph.json",
        )
        self.archetypes: Dict[str, ArchetypeNode] = {}
        self._load_or_initialize_defaults()

    def _load_or_initialize_defaults(self):
        """Loads knowledge graph from disk or populates baseline archetypes."""
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for k, node_dict in data.items():
                        self.archetypes[k] = ArchetypeNode.model_validate(node_dict)
                logger.info(f"[Meta Knowledge] Loaded {len(self.archetypes)} archetypes from {self.storage_path}")
                return
            except Exception as e:
                logger.warning(f"[Meta Knowledge] Failed to load {self.storage_path}, initializing defaults: {e}")

        # Initialize Default Baseline Archetypes
        self._initialize_baseline_archetypes()

    def _initialize_baseline_archetypes(self):
        """Initializes core default web archetypes and proven recipes."""
        # 1. Static Grid Tiles (Thumbnails with parent view link or CDN substitution)
        self.archetypes["static_grid_standard"] = ArchetypeNode(
            archetype_id="static_grid_standard",
            global_archetype=GlobalArchetype.STATIC_GRID_TILES,
            platform_variant="Generic",
            dom_signatures=["#tiles", ".thumbwook", ".gallery-grid", ".photo-grid", ".image-tile"],
            script_signatures=[],
            recipes=[
                ResolutionRecipe(
                    recipe_id="cdn_thumb_to_orig",
                    strategy="CDN_SUBSTITUTION",
                    rule_template="lambda c: c.get('src', '').replace('thumb_', 'orig_')",
                    success_count=5,
                    confidence_score=0.92,
                    example_domains=["generic-galleries.com"],
                ),
                ResolutionRecipe(
                    recipe_id="parent_anchor_link",
                    strategy="PARENT_LINK",
                    rule_template="lambda c: c.get('parent_href')",
                    success_count=4,
                    confidence_score=0.88,
                ),
            ],
            total_extractions=9,
        )

        # 2. Modern SPA / Next.js Hydrated State
        self.archetypes["spa_nextjs_hydrated"] = ArchetypeNode(
            archetype_id="spa_nextjs_hydrated",
            global_archetype=GlobalArchetype.SPA_HYDRATED_STATE,
            platform_variant="NextJS_React",
            dom_signatures=["#__next", "#__NEXT_DATA__", "#app", "#root", ".spa-item"],
            script_signatures=["window.__INITIAL_STATE__", "__NEXT_DATA__", "api/v1/gallery"],
            recipes=[
                ResolutionRecipe(
                    recipe_id="api_manifest_extractor",
                    strategy="API_MANIFEST",
                    rule_template="extract_media_manifests",
                    success_count=6,
                    confidence_score=0.95,
                    example_domains=["modern-spa.app"],
                ),
                ResolutionRecipe(
                    recipe_id="dataset_original_extractor",
                    strategy="DATA_ATTRIBUTE",
                    rule_template="lambda c: c.get('dataset', {}).get('original')",
                    success_count=3,
                    confidence_score=0.86,
                ),
            ],
            total_extractions=9,
        )

        # 3. Lightbox Interactive / Data-Attribute Gallery
        self.archetypes["lightbox_data_gallery"] = ArchetypeNode(
            archetype_id="lightbox_data_gallery",
            global_archetype=GlobalArchetype.LIGHTBOX_INTERACTIVE,
            platform_variant="Lightbox2_Fancybox",
            dom_signatures=[".lightbox", "[data-fancybox]", "[data-lightbox]", ".pswp"],
            script_signatures=["fancybox", "lightbox.js", "photoswipe"],
            recipes=[
                ResolutionRecipe(
                    recipe_id="fancybox_data_src",
                    strategy="DATA_ATTRIBUTE",
                    rule_template="lambda c: c.get('dataset', {}).get('fancybox') or c.get('dataset', {}).get('src')",
                    success_count=4,
                    confidence_score=0.90,
                )
            ],
            total_extractions=4,
        )

    def match_archetype(
        self,
        page_html: str = "",
        page_scripts: Optional[List[str]] = None,
        dom_candidates: Optional[List[DOMCandidateInfo]] = None,
        has_api_manifest: bool = False,
    ) -> Tuple[Optional[ArchetypeNode], float]:
        """
        Matches page structural signatures against known archetype nodes.
        Returns (best_matching_archetype, confidence_score).
        """
        html_lower = page_html.lower()
        scripts_str = " ".join(page_scripts or []).lower()

        scores: Dict[str, float] = {}

        for arch_id, node in self.archetypes.items():
            score = 0.0

            # Match DOM Signatures
            for sig in node.dom_signatures:
                sig_clean = sig.strip().lower()
                matched_sig = False
                if sig_clean in html_lower:
                    matched_sig = True
                elif sig_clean.startswith("#"):
                    id_name = sig_clean[1:]
                    if f'id="{id_name}"' in html_lower or f"id='{id_name}'" in html_lower or f'id={id_name}' in html_lower:
                        matched_sig = True
                elif sig_clean.startswith("."):
                    class_name = sig_clean[1:]
                    if class_name in html_lower:
                        matched_sig = True
                elif sig_clean.startswith("[") and sig_clean.endswith("]"):
                    attr_name = sig_clean[1:-1]
                    if attr_name in html_lower:
                        matched_sig = True

                # Also match against candidate classes/containers if available
                if not matched_sig and dom_candidates:
                    for cand in dom_candidates:
                        cand_classes = [c.lower() for c in cand.classes]
                        cand_cont = (cand.container_selector or "").lower()
                        if sig_clean.startswith(".") and sig_clean[1:] in cand_classes:
                            matched_sig = True
                            break
                        elif sig_clean in cand_cont:
                            matched_sig = True
                            break

                if matched_sig:
                    score += 0.35

            # Match Script Signatures
            for scr_sig in node.script_signatures:
                if scr_sig.lower() in html_lower or scr_sig.lower() in scripts_str:
                    score += 0.40

            # Check special features
            if has_api_manifest and node.global_archetype == GlobalArchetype.SPA_HYDRATED_STATE:
                score += 0.30

            if score > 0.0:
                scores[arch_id] = min(1.0, score)

        if not scores:
            # Default to static grid standard if candidates exist
            if dom_candidates and len(dom_candidates) >= 3:
                return self.archetypes.get("static_grid_standard"), 0.60
            return None, 0.0

        best_id = max(scores, key=scores.get)
        return self.archetypes.get(best_id), round(scores[best_id], 2)

    def match_structural_archetype(
        self,
        dom_candidates: Optional[List[DOMCandidateInfo]] = None,
        page_info: Optional[Dict[str, Any]] = None,
        has_api_manifest: bool = False,
    ) -> Tuple[Optional[ArchetypeNode], float]:
        """Convenience wrapper for matching structural archetype from DOM and page info."""
        html = page_info.get("html", "") if page_info else ""
        scripts = page_info.get("scripts", []) if page_info else []
        return self.match_archetype(
            page_html=html,
            page_scripts=scripts,
            dom_candidates=dom_candidates,
            has_api_manifest=has_api_manifest,
        )

    def get_archetype(self, archetype_id: str) -> Optional[ArchetypeNode]:
        """Retrieves archetype by ID."""
        return self.archetypes.get(archetype_id)

    def get_archetype_by_domain(self, domain: str) -> Optional[ArchetypeNode]:
        """Retrieves archetype associated with a domain."""
        for node in self.archetypes.values():
            for r in node.recipes:
                if domain in r.example_domains:
                    return node
        return None

    def get_prior_hypotheses(self, archetype: Optional[ArchetypeNode]) -> List[Dict[str, Any]]:
        """
        Extracts ordered prior hypotheses with prior probabilities from the matched archetype.
        """
        if not archetype:
            return []

        priors = []
        for recipe in sorted(archetype.recipes, key=lambda r: r.confidence_score, reverse=True):
            priors.append({
                "recipe_id": recipe.recipe_id,
                "strategy": recipe.strategy,
                "rule_template": recipe.rule_template,
                "prior_probability": recipe.confidence_score,
            })
        return priors

    def record_success(
        self,
        archetype_id: str,
        winning_strategy: str,
        winning_rule: str,
        domain: str = "",
    ):
        """
        Consolidates experience: increments success counts, updates Bayesian confidence,
        and updates knowledge store.
        """
        node = self.archetypes.get(archetype_id)
        if not node:
            # Create new archetype node
            node = ArchetypeNode(
                archetype_id=archetype_id,
                global_archetype=GlobalArchetype.STATIC_GRID_TILES,
                platform_variant="Dynamic_Learned",
            )
            self.archetypes[archetype_id] = node

        node.total_extractions += 1
        node.last_updated = time.time()

        # Find or create recipe
        matched_recipe = next((r for r in node.recipes if r.rule_template == winning_rule), None)
        if matched_recipe:
            matched_recipe.success_count += 1
            if domain and domain not in matched_recipe.example_domains:
                matched_recipe.example_domains.append(domain)
            matched_recipe.update_bayesian_confidence()
        else:
            new_recipe = ResolutionRecipe(
                recipe_id=f"rec_{len(node.recipes) + 1}",
                strategy=winning_strategy,
                rule_template=winning_rule,
                success_count=1,
                failure_count=0,
                confidence_score=0.85,
                example_domains=[domain] if domain else [],
            )
            node.recipes.append(new_recipe)

        self.save()

    def record_failure(self, archetype_id: str, failed_rule: str):
        """Records failure and decays Bayesian confidence of a failing recipe."""
        node = self.archetypes.get(archetype_id)
        if node:
            matched_recipe = next((r for r in node.recipes if r.rule_template == failed_rule), None)
            if matched_recipe:
                matched_recipe.failure_count += 1
                matched_recipe.update_bayesian_confidence()
                self.save()

    def learn_demonstration_recipe(
        self,
        domain: str,
        dom_candidates: List[DOMCandidateInfo],
        page_info: Optional[Dict[str, Any]] = None,
        winning_rule: str = "",
        strategy: str = "CUSTOM_TRANSFORM",
    ) -> ArchetypeNode:
        """
        Learns from a human demonstration in Mode 2:
        1. Identifies the matching structural Archetype (or creates a learned one).
        2. Consolidates DOM container signatures.
        3. Registers the demonstrated ground-truth recipe with high confidence.
        4. Saves atomically to disk.
        """
        matched_node, conf = self.match_structural_archetype(dom_candidates, page_info)
        if not matched_node:
            matched_node = self.archetypes.get("static_grid_standard")
            if not matched_node:
                matched_node = ArchetypeNode(
                    archetype_id="learned_grid_archetype",
                    global_archetype=GlobalArchetype.STATIC_GRID_TILES,
                    platform_variant="Demonstrated",
                )
                self.archetypes[matched_node.archetype_id] = matched_node

        # Add candidate container signature to archetype if missing
        for c in dom_candidates:
            if c.container_selector and c.container_selector not in matched_node.dom_signatures:
                matched_node.dom_signatures.append(c.container_selector)

        if winning_rule:
            self.record_success(
                archetype_id=matched_node.archetype_id,
                winning_strategy=strategy,
                winning_rule=winning_rule,
                domain=domain,
            )

        return matched_node

    def save(self, path: Optional[str] = None):
        """Atomically persists knowledge graph to JSON."""
        target = path or self.storage_path
        try:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            temp_path = f"{target}.tmp"
            serialized = {k: v.model_dump() for k, v in self.archetypes.items()}
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(serialized, f, indent=2)
            os.replace(temp_path, target)
            logger.info(f"[Meta Knowledge] Knowledge graph persisted to {target}")
        except Exception as e:
            logger.warning(f"[Meta Knowledge] Failed to persist knowledge graph: {e}")
