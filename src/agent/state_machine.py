"""
Cognitive State Machine & System Topology for Autonomous AI Browser Agent.
Implements the core lifecycle states, memory ledger, hypothesis tracking,
and state transitions defined in Section 1 of the Approved Plan.
"""

import time
import logging
from enum import Enum
from typing import Dict, List, Any, Optional, Set
from pydantic import BaseModel, Field

from ..core.models import (
    Album,
    AlbumImage,
    DOMCandidateInfo,
    ResolutionMethod,
    ValidationVerdict,
    ValidationResult,
    StructuredAuditTrail,
    TelemetryMetrics,
    CandidateClassification,
)

logger = logging.getLogger(__name__)


class CognitiveState(str, Enum):
    """Core lifecycle states of the Cognitive Agent State Machine."""
    PAGE_INGESTION = "PAGE_INGESTION"
    MULTI_SIGNAL_OBSERVATION = "MULTI_SIGNAL_OBSERVATION"
    ARCHETYPE_MATCHING = "ARCHETYPE_MATCHING"
    INVESTIGATION_REACT_LOOP = "INVESTIGATION_REACT_LOOP"
    MASS_SCALING = "MASS_SCALING"
    ALBUM_ASSEMBLY = "ALBUM_ASSEMBLY"
    KNOWLEDGE_PERSISTENCE = "KNOWLEDGE_PERSISTENCE"
    INTERACTIVE_GATE_WAIT = "INTERACTIVE_GATE_WAIT"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ReActStep(BaseModel):
    """Represents a single Thought -> Action -> Observation -> Reflection step in working memory."""
    step_index: int
    thought: str
    action_name: str
    action_input: Dict[str, Any] = Field(default_factory=dict)
    observation: Any = None
    reflection: Optional[str] = None
    timestamp: float = Field(default_factory=time.time)
    produced_progress: bool = True
    error: Optional[str] = None


class HypothesisRecord(BaseModel):
    """Represents a formulated URL or structural hypothesis for media discovery."""
    hypothesis_id: str
    source_vector: str  # "cdn_transform", "detail_page", "data_attr", "api_manifest", "js_eval", etc.
    candidate_id: str
    proposed_url: Optional[str] = None
    transformation_rule: Optional[str] = None
    confidence: float = 0.5
    is_tested: bool = False
    validation_result: Optional[ValidationResult] = None
    is_proven: bool = False


class StateTransitionRecord(BaseModel):
    """Audit record for a state machine transition."""
    from_state: CognitiveState
    to_state: CognitiveState
    reason: str
    timestamp: float = Field(default_factory=time.time)


class CognitiveContext:
    """
    Working Memory and State Context for the Autonomous Cognitive Agent.
    Maintains complete session telemetry, discovered candidates, evidence ledger,
    hypotheses, ReAct steps, and state history.
    """

    def __init__(
        self,
        target_url: str,
        max_react_steps: int = 15,
        session_action_budget: int = 80,
    ):
        self.target_url = target_url
        self.current_state: CognitiveState = CognitiveState.PAGE_INGESTION
        self.state_history: List[StateTransitionRecord] = []
        
        # Ingestion & Observation State
        self.page_info: Dict[str, Any] = {}
        self.raw_title: str = "Untitled Album"
        self.source_type: str = "gallery"
        self.forum_thread_url: Optional[str] = None
        self.external_album_url: Optional[str] = None
        self.discovered_candidates: List[DOMCandidateInfo] = []
        self.primary_container: Optional[str] = None
        self.related_container: Optional[str] = None
        
        # Knowledge & Archetype State
        self.matched_archetype: Optional[str] = None
        self.archetype_confidence: float = 0.0
        self.archetype_priors: Dict[str, Any] = {}
        
        # Investigation & ReAct State
        self.react_history: List[ReActStep] = []
        self.hypotheses: List[HypothesisRecord] = []
        self.proven_hypothesis: Optional[HypothesisRecord] = None
        self.proven_vectors: List[HypothesisRecord] = []
        self.max_react_steps = max_react_steps
        self.session_action_budget = session_action_budget
        self.total_actions_executed = 0
        
        # Resolution & Output State
        self.resolved_images: List[AlbumImage] = []
        self.audit_trails: List[StructuredAuditTrail] = []
        self.telemetry = TelemetryMetrics()
        self.errors: List[str] = []
        self.metadata: Dict[str, Any] = {}
        self.is_aborted: bool = False

    def transition_to(self, new_state: CognitiveState, reason: str = "") -> bool:
        """
        Executes a validated state transition and records it in history.
        Enforces state lifecycle constraints and budget awareness.
        """
        if self.current_state in (CognitiveState.COMPLETED, CognitiveState.FAILED):
            logger.warning(f"Cannot transition from terminal state {self.current_state} to {new_state}")
            return False

        old_state = self.current_state
        self.current_state = new_state
        record = StateTransitionRecord(from_state=old_state, to_state=new_state, reason=reason)
        self.state_history.append(record)
        logger.info(f"[State Machine] Transition: {old_state.value} -> {new_state.value} (Reason: {reason})")
        return True

    def record_react_step(
        self,
        thought: str,
        action_name: str,
        action_input: Dict[str, Any],
        observation: Any,
        reflection: Optional[str] = None,
        produced_progress: bool = True,
        error: Optional[str] = None,
    ) -> ReActStep:
        """Records a completed ReAct step into working memory."""
        self.total_actions_executed += 1
        self.telemetry.ai_actions_count += 1
        
        step = ReActStep(
            step_index=len(self.react_history) + 1,
            thought=thought,
            action_name=action_name,
            action_input=action_input,
            observation=observation,
            reflection=reflection,
            produced_progress=produced_progress,
            error=error,
        )
        self.react_history.append(step)
        return step

    def register_hypothesis(
        self,
        hypothesis_id: str,
        source_vector: str,
        candidate_id: str,
        proposed_url: Optional[str] = None,
        transformation_rule: Optional[str] = None,
        confidence: float = 0.5,
    ) -> HypothesisRecord:
        """Adds a candidate hypothesis to working memory."""
        hyp = HypothesisRecord(
            hypothesis_id=hypothesis_id,
            source_vector=source_vector,
            candidate_id=candidate_id,
            proposed_url=proposed_url,
            transformation_rule=transformation_rule,
            confidence=confidence,
        )
        self.hypotheses.append(hyp)
        return hyp

    def register_proven_vector(self, hypothesis: HypothesisRecord):
        """Locks a validated hypothesis as the proven vector for mass scaling."""
        hypothesis.is_proven = True
        hypothesis.confidence = 1.0
        self.proven_hypothesis = hypothesis
        if hypothesis not in self.proven_vectors:
            self.proven_vectors.append(hypothesis)
        logger.info(f"[State Machine] Proven vector locked: {hypothesis.source_vector} ({hypothesis.transformation_rule or hypothesis.proposed_url})")

    def is_budget_exhausted(self) -> bool:
        """Checks if session action budget or ReAct step limit is exceeded."""
        if self.total_actions_executed >= self.session_action_budget:
            return True
        if len(self.react_history) >= self.max_react_steps:
            return True
        return False
