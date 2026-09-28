"""
Interactive Autonomous Co-Pilot Mode & Collaboration Channel (Pillar 7).
Provides:
1. Bidirectional Asynchronous Event Channel between Autonomous Agent and Human Operator.
2. Structured Question/Option/Screenshot Payloads with non-blocking timeout fallbacks.
3. State machine integration with INTERACTIVE_GATE_WAIT.
4. CLI and WebSocket-ready async callback hooks.
"""

import time
import base64
import logging
import asyncio
from enum import Enum
from typing import Dict, List, Any, Optional, Tuple, Callable, Awaitable
from pydantic import BaseModel, Field

from .state_machine import CognitiveContext, CognitiveState

logger = logging.getLogger(__name__)


class CoPilotEventType(str, Enum):
    """Types of events transmitted over the Co-Pilot Channel."""
    QUESTION = "QUESTION"
    BOT_CHALLENGE_HELP = "BOT_CHALLENGE_HELP"
    AMBIGUITY_RESOLUTION = "AMBIGUITY_RESOLUTION"
    USER_RESPONSE = "USER_RESPONSE"
    TIMEOUT = "TIMEOUT"
    STATUS_UPDATE = "STATUS_UPDATE"


class AgentQuestionEvent(BaseModel):
    """Question or decision event dispatched to human operator."""
    event_id: str
    event_type: CoPilotEventType = CoPilotEventType.QUESTION
    question: str
    options: List[str] = Field(default_factory=list)
    screenshot_base64: Optional[str] = None
    timeout_seconds: float = 30.0
    default_option: Optional[str] = None
    timestamp: float = Field(default_factory=time.time)


class UserResponseEvent(BaseModel):
    """Response returned from human operator or timeout fallback."""
    event_id: str
    selected_option: Optional[str] = None
    text_input: Optional[str] = None
    action_type: str = "SUBMIT"  # "SUBMIT", "SKIP", "TIMEOUT_FALLBACK"
    timestamp: float = Field(default_factory=time.time)


class CoPilotChannel:
    """
    Interactive Autonomous Co-Pilot Channel.
    Facilitates real-time human-in-the-loop interaction when resolving ambiguous layouts,
    CAPTCHAs, or multi-chapter boundaries.
    """

    def __init__(
        self,
        on_question_callback: Optional[Callable[[AgentQuestionEvent], Awaitable[UserResponseEvent]]] = None,
        on_status_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None,
        default_timeout_seconds: float = 30.0,
    ):
        self.on_question_callback = on_question_callback
        self.on_status_callback = on_status_callback
        self.default_timeout_seconds = default_timeout_seconds
        self.event_history: List[BaseModel] = []

    async def request_human_input(
        self,
        question: str,
        options: Optional[List[str]] = None,
        event_type: CoPilotEventType = CoPilotEventType.QUESTION,
        screenshot_bytes: Optional[bytes] = None,
        timeout_seconds: Optional[float] = None,
        default_option: Optional[str] = None,
        context: Optional[CognitiveContext] = None,
    ) -> UserResponseEvent:
        """
        Dispatches a structured question event to the human operator and awaits response.
        If operator does not respond within timeout, executes graceful default fallback.
        """
        effective_timeout = timeout_seconds or self.default_timeout_seconds
        opts = options or ["Proceed", "Abort"]
        default_opt = default_option or opts[0]
        event_id = f"copilot_evt_{int(time.time() * 1000)}"

        screenshot_b64 = None
        if screenshot_bytes:
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

        event = AgentQuestionEvent(
            event_id=event_id,
            event_type=event_type,
            question=question,
            options=opts,
            screenshot_base64=screenshot_b64,
            timeout_seconds=effective_timeout,
            default_option=default_opt,
        )
        self.event_history.append(event)

        # Transition context to INTERACTIVE_GATE_WAIT if present
        if context:
            context.transition_to(
                CognitiveState.INTERACTIVE_GATE_WAIT,
                f"Awaiting human input on: {question[:50]}",
            )

        logger.info(f"[Co-Pilot] Question dispatched: '{question}' (Options: {opts}, Timeout: {effective_timeout}s)")

        # If an async callback is registered (e.g. CLI input or WebSocket frontend)
        if self.on_question_callback:
            try:
                response = await asyncio.wait_for(
                    self.on_question_callback(event),
                    timeout=effective_timeout,
                )
                self.event_history.append(response)
                logger.info(f"[Co-Pilot] Operator responded: {response.selected_option or response.text_input}")
                return response
            except asyncio.TimeoutError:
                logger.warning(f"[Co-Pilot] Timeout ({effective_timeout}s) expired. Falling back to default: '{default_opt}'")
                timeout_resp = UserResponseEvent(
                    event_id=event_id,
                    selected_option=default_opt,
                    text_input="TIMEOUT_FALLBACK",
                    action_type="TIMEOUT_FALLBACK",
                )
                self.event_history.append(timeout_resp)
                return timeout_resp
            except Exception as e:
                logger.error(f"[Co-Pilot] Callback error: {e}. Using fallback.")
                fallback_resp = UserResponseEvent(
                    event_id=event_id,
                    selected_option=default_opt,
                    text_input=f"ERROR_FALLBACK: {e}",
                    action_type="TIMEOUT_FALLBACK",
                )
                self.event_history.append(fallback_resp)
                return fallback_resp

        # Hermetic / Headless Default Fallback
        fallback_resp = UserResponseEvent(
            event_id=event_id,
            selected_option=default_opt,
            text_input="HEADLESS_AUTO_PROCEED",
            action_type="TIMEOUT_FALLBACK",
        )
        self.event_history.append(fallback_resp)
        return fallback_resp

    def emit_status_update(self, message: str, details: Optional[Dict[str, Any]] = None):
        """Broadcasts live reasoning / observation telemetry to connected observers."""
        logger.info(f"[Co-Pilot Status] {message}")
        if self.on_status_callback:
            try:
                self.on_status_callback(message, details or {})
            except Exception as e:
                logger.warning(f"[Co-Pilot] Status callback failed: {e}")
