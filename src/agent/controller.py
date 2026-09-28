"""
Investigation Controller & Agent State Manager (Section 24).
Provides state awareness, action memory, evidence ledger, no-new-information detection,
investigation budgets, strategy scoring, loop/cycle detection, and candidate grouping.
"""

import hashlib
import time
import logging
from typing import Dict, List, Any, Optional, Set, Tuple
from ..core.models import (
    DOMCandidateInfo,
    CandidateClassification,
    ResolutionMethod,
    ValidationVerdict,
    ValidationResult,
    StructuredAuditTrail,
)

logger = logging.getLogger(__name__)


class ActionRecord:
    """Represents a recorded browser action for deduplication and loop detection."""

    def __init__(self, action_name: str, target: str, params: Optional[Dict[str, Any]] = None):
        self.action_name = action_name
        self.target = target
        self.params = params or {}
        self.timestamp = time.time()
        self.result_signature: Optional[str] = None
        self.produced_new_information: bool = True

    @property
    def key(self) -> str:
        param_str = str(sorted(self.params.items()))
        return f"{self.action_name}:{self.target}:{param_str}"


class EvidenceLedger:
    """Accumulates structured facts and observations per candidate."""

    def __init__(self, candidate_id: str):
        self.candidate_id = candidate_id
        self.facts: List[str] = []
        self.observations: List[Dict[str, Any]] = []
        self.attempted_methods: Set[str] = set()
        self.discovered_urls: List[str] = []
        self.action_count: int = 0
        self.is_resolved: bool = False
        self.resolved_url: Optional[str] = None
        self.validation_result: Optional[ValidationResult] = None

    def add_fact(self, fact: str):
        if fact not in self.facts:
            self.facts.append(fact)

    def record_action(self, method_name: str):
        self.attempted_methods.add(method_name)
        self.action_count += 1


class CandidateGroup:
    """Represents a homogeneous group of candidates sharing DOM container and structural traits."""

    def __init__(self, container_selector: str):
        self.container_selector = container_selector
        self.candidates: List[DOMCandidateInfo] = []
        self.has_parent_links: bool = False
        self.average_width: float = 0.0
        self.average_height: float = 0.0
        self.aspect_ratio: float = 0.0
        self.is_album_group: bool = False
        self.proven_resolution_method: Optional[ResolutionMethod] = None


class InvestigationController:
    """
    Central Controller for preventing loops, enforcing budgets,
    scoring strategies, and managing the evidence ledger for Qwen.
    """

    def __init__(
        self,
        candidate_budget: int = 8,
        session_budget: int = 80,
    ):
        self.candidate_budget = candidate_budget
        self.session_budget = session_budget
        self.total_session_actions = 0
        self.action_history: List[ActionRecord] = []
        self.action_keys_seen: Set[str] = set()
        self.ledgers: Dict[str, EvidenceLedger] = {}
        self.candidate_groups: List[CandidateGroup] = []
        self.is_cancelled: bool = False

    def cancel(self):
        """Signals the investigation controller to immediately abort further candidate actions."""
        self.is_cancelled = True
        logger.info("InvestigationController: cancellation requested")

    def get_or_create_ledger(self, candidate_id: str) -> EvidenceLedger:
        """Retrieves or creates an evidence ledger for a candidate."""
        if candidate_id not in self.ledgers:
            self.ledgers[candidate_id] = EvidenceLedger(candidate_id)
        return self.ledgers[candidate_id]

    def record_action_execution(
        self,
        action_name: str,
        target: str,
        params: Optional[Dict[str, Any]] = None,
        result_data: Optional[Any] = None,
    ) -> Tuple[bool, str]:
        """
        Records an action and checks for duplication and No-New-Information.
        Returns (should_proceed, status_message).
        """
        self.total_session_actions += 1
        record = ActionRecord(action_name, target, params)
        key = record.key

        # 24.1 Action Memory & Deduplication
        if key in self.action_keys_seen:
            # Check if previous execution yielded identical result
            prev_record = next((r for r in reversed(self.action_history) if r.key == key), None)
            if prev_record and not prev_record.produced_new_information:
                return False, "DUPLICATE_ACTION_NO_NEW_INFORMATION"

        # 24.3 Compute signature for No-New-Information detection
        result_sig = self._compute_signature(result_data)
        record.result_signature = result_sig

        # Check against previous result signature
        prev_matching = next((r for r in reversed(self.action_history) if r.key == key), None)
        if prev_matching and prev_matching.result_signature == result_sig:
            record.produced_new_information = False
            self.action_history.append(record)
            return False, "NO_NEW_INFORMATION"

        self.action_keys_seen.add(key)
        self.action_history.append(record)
        return True, "PROCEED"

    def detect_cycle(self, recent_window: int = 6) -> bool:
        """
        24.12 Cycle & Loop Detection:
        Detects repetitive action loops such as A -> B -> A or A -> A -> A.
        """
        if len(self.action_history) < recent_window:
            return False

        recent = [r.action_name for r in self.action_history[-recent_window:]]

        # Check immediate repeat A -> A -> A
        if len(set(recent[-3:])) == 1:
            logger.warning(f"Loop detected: 3 identical consecutive actions {recent[-1]}")
            return True

        # Check oscillation A -> B -> A -> B
        if len(recent) >= 4 and recent[-1] == recent[-3] and recent[-2] == recent[-4]:
            logger.warning(f"Oscillation loop detected: {recent[-2]} <-> {recent[-1]}")
            return True

        return False

    def can_investigate_candidate(self, candidate_id: str) -> Tuple[bool, Optional[str]]:
        """
        24.4 Investigation Budget & Cancellation Check:
        Checks if candidate has remaining action budget and session budget.
        """
        if getattr(self, "is_cancelled", False):
            return False, "CANCELLED"

        if self.total_session_actions >= self.session_budget:
            return False, "SESSION_BUDGET_EXHAUSTED"

        ledger = self.get_or_create_ledger(candidate_id)
        if ledger.is_resolved:
            return False, "ALREADY_RESOLVED"

        if ledger.action_count >= self.candidate_budget:
            return False, "CANDIDATE_BUDGET_EXHAUSTED"

        return True, None

    def is_budget_exhausted(self, candidate_id: str) -> bool:
        """Returns True if the candidate has exhausted its action budget or session budget."""
        can, _ = self.can_investigate_candidate(candidate_id)
        return not can

    def group_candidates(self, raw_candidates: List[DOMCandidateInfo]) -> List[CandidateGroup]:
        """
        24.8 Group-Level Reasoning:
        Groups homogeneous candidate elements by container, DOM structure, and aspect ratio.
        """
        groups_by_container: Dict[str, List[DOMCandidateInfo]] = {}
        for cand in raw_candidates:
            c_sel = cand.container_selector or "body"
            groups_by_container.setdefault(c_sel, []).append(cand)

        result_groups: List[CandidateGroup] = []
        for container_sel, items in groups_by_container.items():
            group = CandidateGroup(container_sel)
            group.candidates = items
            group.has_parent_links = any(bool(c.parent_href) for c in items)

            widths = [c.width for c in items if c.width]
            heights = [c.height for c in items if c.height]
            if widths and heights:
                group.average_width = sum(widths) / len(widths)
                group.average_height = sum(heights) / len(heights)
                group.aspect_ratio = round(group.average_width / group.average_height, 2) if group.average_height else 1.0

            # Reason if group is candidate album (e.g. repeated items >= 3 in non-related container)
            sel_lower = container_sel.lower()
            if len(items) >= 3 and not any(r in sel_lower for r in ["related", "recommend", "banner", "sidebar", "footer"]):
                group.is_album_group = True

            result_groups.append(group)

        self.candidate_groups = result_groups
        return result_groups

    def score_investigation_strategies(
        self,
        candidate: DOMCandidateInfo,
        ledger: EvidenceLedger,
    ) -> List[Tuple[str, float, str]]:
        """
        24.5 & 24.11 Dynamic Strategy Selection & Scoring:
        Calculates utility scores for candidate resolution strategies based on accumulated evidence.
        """
        scores: List[Tuple[str, float, str]] = []

        # Vector 1: Element srcset
        if candidate.srcset and "srcset" not in ledger.attempted_methods:
            scores.append(("inspect_element_srcset", 0.95, "Element contains high-resolution srcset attribute"))

        # Vector 2: Data attributes (data-original, data-full, data-large, data-highres)
        data_keys = [k for k in ["original", "full", "large", "highres", "src"] if candidate.dataset.get(k)]
        if data_keys and "data_attributes" not in ledger.attempted_methods:
            scores.append(("inspect_data_attributes", 0.92, f"Found promising data-* keys: {data_keys}"))

        # Vector 3: Parent detail link
        if candidate.parent_href and "detail_page" not in ledger.attempted_methods:
            scores.append(("open_parent_detail_page", 0.90, f"Parent anchor points to detail page {candidate.parent_href[:35]}"))

        # Vector 4: Embedded JSON states
        if "embedded_json" not in ledger.attempted_methods:
            scores.append(("inspect_embedded_json", 0.65, "Inspect page window.__INITIAL_STATE__ and JSON-LD"))

        # Vector 5: Dynamic network resources
        if "network_resources" not in ledger.attempted_methods:
            scores.append(("inspect_network_resources", 0.50, "Inspect dynamic XHR/Fetch media requests"))

        # Vector 6: Verified CDN pattern hypotheses
        if candidate.src and "cdn_pattern" not in ledger.attempted_methods:
            scores.append(("test_cdn_patterns", 0.40, "Generate and validate CDN structural hypotheses"))

        # Sort highest score first
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores

    def register_early_success(
        self,
        candidate_id: str,
        resolved_url: str,
        method: ResolutionMethod,
        validation_result: ValidationResult,
    ):
        """
        24.6 Early Success Termination:
        Records resolution success and closes candidate ledger.
        """
        ledger = self.get_or_create_ledger(candidate_id)
        ledger.is_resolved = True
        ledger.resolved_url = resolved_url
        ledger.validation_result = validation_result
        ledger.add_fact(f"Successfully resolved via {method.value} to {validation_result.width}x{validation_result.height}")

    def _compute_signature(self, data: Any) -> str:
        """Generates MD5 hash signature of data for state change detection."""
        if data is None:
            return "none"
        raw_str = str(data)
        return hashlib.md5(raw_str.encode("utf-8")).hexdigest()
