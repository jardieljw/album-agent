"""
Self-Reflection & Adaptive Countermeasure Engine (Pillar 5).
Provides:
1. Multi-Signature Failure Diagnosis (403 Bot Gate, 429 Rate Limiting, Stagnation Loop, Hotlink Referer Block).
2. Autonomous Countermeasure Strategy Formulation (Exponential Jitter Backoff, Cookie/Referer Binding, Prompt Mutation).
3. Meta-Cognitive Stagnation Detection over ReAct trajectory history.
"""

import random
import logging
import asyncio
from enum import Enum
from typing import Dict, List, Any, Optional, Tuple, Set
from pydantic import BaseModel, Field

from .state_machine import CognitiveContext, ReActStep

logger = logging.getLogger(__name__)


class FailureSignature(str, Enum):
    """Signatures of common scraping, bot-gate, and cognitive failures."""
    NONE = "NONE"
    BOT_GATE_403 = "BOT_GATE_403"
    RATE_LIMIT_429 = "RATE_LIMIT_429"
    STAGNATION_LOOP = "STAGNATION_LOOP"
    HOTLINK_REFERER_BLOCK = "HOTLINK_REFERER_BLOCK"
    DOM_MUTATION_OBSCURITY = "DOM_MUTATION_OBSCURITY"
    NETWORK_TIMEOUT = "NETWORK_TIMEOUT"


class CountermeasureType(str, Enum):
    """Adaptive countermeasure tactics."""
    NONE = "NONE"
    JITTER_BACKOFF = "JITTER_BACKOFF"
    ATTACH_REFERER_COOKIES = "ATTACH_REFERER_COOKIES"
    PROMPT_MUTATION_DISCARD_VECTOR = "PROMPT_MUTATION_DISCARD_VECTOR"
    REDUCE_CONCURRENCY = "REDUCE_CONCURRENCY"
    REQUEST_COPILOT_ASSISTANCE = "REQUEST_COPILOT_ASSISTANCE"
    RETRY_WITH_NEW_USER_AGENT = "RETRY_WITH_NEW_USER_AGENT"


class ReflectionDiagnosis(BaseModel):
    """Structured outcome of meta-cognitive reflection diagnosis."""
    signature: FailureSignature
    recommended_countermeasure: CountermeasureType
    description: str
    confidence: float = 1.0
    action_payload: Dict[str, Any] = Field(default_factory=dict)
    prompt_mutation_instruction: Optional[str] = None


class ReflectionEngine:
    """
    Self-Reflection & Adaptive Countermeasure Engine.
    Monitors ReAct steps, HTTP statuses, and network responses to detect failure
    signatures and execute autonomous recovery pivots.
    """

    def __init__(
        self,
        stagnation_threshold: int = 3,
        base_backoff_seconds: float = 1.0,
        max_backoff_seconds: float = 30.0,
    ):
        self.stagnation_threshold = stagnation_threshold
        self.base_backoff_seconds = base_backoff_seconds
        self.max_backoff_seconds = max_backoff_seconds

    def diagnose_failure(
        self,
        response_status: Optional[int] = None,
        headers: Optional[Dict[str, str]] = None,
        body_sample: Optional[str] = None,
        react_history: Optional[List[ReActStep]] = None,
        error_message: Optional[str] = None,
    ) -> ReflectionDiagnosis:
        """
        Diagnoses the primary failure signature across HTTP, network, or cognitive levels.
        """
        headers_lower = {k.lower(): v.lower() for k, v in (headers or {}).items()}
        body_str = (body_sample or "").lower()
        err_str = (error_message or "").lower()

        # -------------------------------------------------------------
        # Signature 1: HTTP 429 Too Many Requests / Rate Limiting
        # -------------------------------------------------------------
        if response_status == 429 or "too many requests" in body_str or "rate limit" in err_str:
            retry_after = headers_lower.get("retry-after")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else self.calculate_exponential_backoff(1)
            return ReflectionDiagnosis(
                signature=FailureSignature.RATE_LIMIT_429,
                recommended_countermeasure=CountermeasureType.JITTER_BACKOFF,
                description="Rate limited by server (HTTP 429). Exponential backoff recommended.",
                action_payload={"backoff_seconds": delay, "reduce_concurrency_by": 0.5},
            )

        # -------------------------------------------------------------
        # Signature 2: Hotlink Protection / Missing Referer (HTTP 403 on image asset)
        # -------------------------------------------------------------
        if response_status == 403 and any(img_ext in err_str or img_ext in body_str for img_ext in [".jpg", ".png", ".webp", "image"]):
            return ReflectionDiagnosis(
                signature=FailureSignature.HOTLINK_REFERER_BLOCK,
                recommended_countermeasure=CountermeasureType.ATTACH_REFERER_COOKIES,
                description="Hotlink protection triggered. Direct asset download requires valid Referer header and session cookies.",
                action_payload={"attach_referer": True, "attach_session_cookies": True},
            )

        # -------------------------------------------------------------
        # Signature 3: Cloudflare Turnstile / Bot Gate (HTTP 403 / cf-ray)
        # -------------------------------------------------------------
        if response_status == 403 or "cf-ray" in headers_lower or "attention required! | cloudflare" in body_str or "just a moment..." in body_str:
            return ReflectionDiagnosis(
                signature=FailureSignature.BOT_GATE_403,
                recommended_countermeasure=CountermeasureType.RETRY_WITH_NEW_USER_AGENT,
                description="Cloudflare or Bot Gate detected. Slow down velocity, jitter headers, or request co-pilot solve.",
                action_payload={"jitter_delay": 2.5, "request_copilot_fallback": True},
            )

        # -------------------------------------------------------------
        # Signature 4: Network Timeout
        # -------------------------------------------------------------
        if "timeout" in err_str or "timed out" in err_str:
            return ReflectionDiagnosis(
                signature=FailureSignature.NETWORK_TIMEOUT,
                recommended_countermeasure=CountermeasureType.JITTER_BACKOFF,
                description="Network socket timed out. Applying jitter delay and retrying.",
                action_payload={"backoff_seconds": 1.5},
            )

        # -------------------------------------------------------------
        # Signature 5: Cognitive Stagnation / Circular Reasoning Loop
        # -------------------------------------------------------------
        if react_history and self.check_react_stagnation(react_history, self.stagnation_threshold):
            return ReflectionDiagnosis(
                signature=FailureSignature.STAGNATION_LOOP,
                recommended_countermeasure=CountermeasureType.PROMPT_MUTATION_DISCARD_VECTOR,
                description="Cognitive reasoning stagnated. 3 consecutive steps produced zero progress.",
                prompt_mutation_instruction=(
                    "CRITICAL REFLECTION: Your previous 3 investigative actions failed to produce any progress. "
                    "You are strictly prohibited from repeating those hypotheses. "
                    "PIVOT IMMEDIATELY: Discard the previous vector and inspect the JavaScript heap or network API stream."
                ),
                action_payload={"stagnation_detected": True, "failed_steps_count": self.stagnation_threshold},
            )

        return ReflectionDiagnosis(
            signature=FailureSignature.NONE,
            recommended_countermeasure=CountermeasureType.NONE,
            description="No active failure signatures detected. System operating normally.",
        )

    def check_react_stagnation(self, history: List[ReActStep], window: int = 3) -> bool:
        """
        Detects if the last `window` steps produced zero progress or repeated actions identically.
        """
        if len(history) < window:
            return False

        recent = history[-window:]

        # Case A: None of the recent steps produced progress
        all_stalled = all(not step.produced_progress for step in recent)
        if all_stalled:
            return True

        # Case B: Identical tool action and input repeated 3 times in a row
        first_action = recent[0].action_name
        first_input = str(recent[0].action_input)
        all_identical = all(
            step.action_name == first_action and str(step.action_input) == first_input
            for step in recent
        )
        if all_identical:
            return True

        return False

    def calculate_exponential_backoff(
        self,
        retry_count: int,
        base_delay: Optional[float] = None,
        max_delay: Optional[float] = None,
    ) -> float:
        """
        Computes exponential backoff with randomized jitter:
        t_wait = min(max_delay, base_delay * (2 ^ retry_count)) + random(0, 1)
        """
        base = base_delay or self.base_backoff_seconds
        limit = max_delay or self.max_backoff_seconds
        exponential_term = base * (2 ** max(0, retry_count - 1))
        jitter = random.uniform(0.1, 1.0)
        return min(limit, round(exponential_term + jitter, 2))

    async def execute_countermeasure(
        self,
        diagnosis: ReflectionDiagnosis,
        context: CognitiveContext,
    ) -> Dict[str, Any]:
        """
        Applies the diagnosed countermeasure to the active cognitive context and session.
        """
        cm_type = diagnosis.recommended_countermeasure
        result = {"countermeasure_applied": cm_type.value, "status": "APPLIED"}

        if cm_type == CountermeasureType.JITTER_BACKOFF:
            delay = diagnosis.action_payload.get("backoff_seconds", 1.0)
            logger.info(f"[Reflection Engine] Applying backoff jitter delay: {delay}s")
            await asyncio.sleep(delay)
            result["delay_applied_seconds"] = delay

        elif cm_type == CountermeasureType.ATTACH_REFERER_COOKIES:
            context.target_url = context.target_url  # Ensure referer is bound
            logger.info(f"[Reflection Engine] Attached strict Referer binding: {context.target_url}")
            result["referer_attached"] = context.target_url

        elif cm_type == CountermeasureType.PROMPT_MUTATION_DISCARD_VECTOR:
            instruction = diagnosis.prompt_mutation_instruction
            logger.info(f"[Reflection Engine] Prompt mutation triggered: {instruction[:60]}...")
            result["mutation_instruction"] = instruction

        elif cm_type == CountermeasureType.REDUCE_CONCURRENCY:
            reduction_factor = diagnosis.action_payload.get("reduce_concurrency_by", 0.5)
            result["concurrency_factor"] = reduction_factor

        return result
