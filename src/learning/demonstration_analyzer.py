"""
Demonstration Analyzer for Learning by Demonstration (Mode 2).
Analyzes user-labeled positive and negative examples to infer generalized semantic traits.
"""

from typing import List, Dict, Any, Tuple, Optional
from urllib.parse import urlparse
from ..core.models import DOMCandidateInfo, ResolutionMethod
from .knowledge_store import SiteKnowledge


class DemonstrationAnalyzer:
    """
    Infers generalized structural and semantic priors from user demonstrations.
    """

    @staticmethod
    def analyze_demonstration(
        domain: str,
        positive_candidates: List[DOMCandidateInfo],
        negative_candidates: List[DOMCandidateInfo],
        proven_methods: Optional[List[ResolutionMethod]] = None,
    ) -> SiteKnowledge:
        """
        Extracts generalized semantic evidence from positive vs negative demonstrations.
        """
        evidence_points: List[str] = []
        positive_signatures: List[str] = []
        negative_filters: List[str] = []
        primary_containers: List[str] = []

        # 1. Analyze positive containers and structure
        pos_containers = [c.container_selector for c in positive_candidates if c.container_selector]
        if pos_containers:
            # Find most common container
            container_counts = {}
            for c in pos_containers:
                container_counts[c] = container_counts.get(c, 0) + 1
            primary = max(container_counts, key=container_counts.get)
            primary_containers.append(primary)
            positive_signatures.append(f"primary_album_container:{primary}")
            evidence_points.append(f"Located in primary album container {primary}")

        # Check sibling homogeneity
        if any(c.total_siblings > 1 for c in positive_candidates):
            positive_signatures.append("repeated_homogeneous_sibling_structure")
            evidence_points.append("Shares repeated DOM tile structure across siblings")

        # Check parent link behavior
        if all(bool(c.parent_href) for c in positive_candidates):
            positive_signatures.append("parent_links_to_individual_detail_page")
            evidence_points.append("Every positive thumbnail links to an individual detail page")

        # Check aspect ratios
        aspect_ratios = []
        for c in positive_candidates:
            if c.width and c.height and c.height > 0:
                aspect_ratios.append(c.width / c.height)
        avg_ar = round(sum(aspect_ratios) / len(aspect_ratios), 2) if aspect_ratios else None
        if avg_ar:
            positive_signatures.append(f"cluster_aspect_ratio:{avg_ar}")
            evidence_points.append(f"Aspect ratio cluster around {avg_ar:.2f}")

        # 2. Analyze negative candidates and contrast
        for neg in negative_candidates:
            if neg.container_selector and neg.container_selector not in primary_containers:
                filter_key = f"exclude_container:{neg.container_selector}"
                if filter_key not in negative_filters:
                    negative_filters.append(filter_key)
                    evidence_points.append(f"Explicitly excludes non-album container {neg.container_selector}")

            for cls in neg.classes:
                if any(k in cls.lower() for k in ["promo", "banner", "ad", "sponsor", "related", "sidebar"]):
                    filter_key = f"exclude_class:{cls}"
                    if filter_key not in negative_filters:
                        negative_filters.append(filter_key)
                        evidence_points.append(f"Explicitly filters out promotional/related class '{cls}'")

        # 3. Preferred resolution methods
        preferred_methods = []
        if proven_methods:
            for pm in proven_methods:
                if pm != ResolutionMethod.NONE and pm.value not in preferred_methods:
                    preferred_methods.append(pm.value)
                    evidence_points.append(f"Proven original discovery vector: {pm.value}")

        return SiteKnowledge(
            domain=domain,
            demonstration_count=1,
            primary_containers=primary_containers,
            positive_signatures=positive_signatures,
            negative_filters=negative_filters,
            preferred_resolution_methods=preferred_methods,
            average_aspect_ratio=avg_ar,
            sample_evidence=evidence_points,
        )
