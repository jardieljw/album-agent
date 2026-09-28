"""
Persistent Semantic Domain Knowledge Store.
Stores generalized semantic priors per domain (SiteKnowledge) without saving hardcoded CSS selectors.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class SiteKnowledge(BaseModel):
    """
    Generalized semantic domain knowledge (soft Bayesian prior).
    Never stores hardcoded extraction rules.
    """
    domain: str
    demonstration_count: int = 1
    primary_containers: List[str] = Field(default_factory=list)
    positive_signatures: List[str] = Field(default_factory=list)
    negative_filters: List[str] = Field(default_factory=list)
    preferred_resolution_methods: List[str] = Field(default_factory=list)
    average_aspect_ratio: Optional[float] = None
    sample_evidence: List[str] = Field(default_factory=list)
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class KnowledgeStore:
    """
    Manages persistent domain semantic knowledge files.
    """

    def __init__(self, storage_dir: Optional[str] = None):
        if storage_dir is None:
            # Default to data/knowledge under project root
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            storage_dir = os.path.join(base_dir, "data", "knowledge")
        self.storage_dir = storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)

    def _get_file_path(self, domain: str) -> str:
        safe_name = domain.replace(":", "_").replace("/", "_").replace("\\", "_")
        return os.path.join(self.storage_dir, f"{safe_name}.json")

    def save_knowledge(self, knowledge: SiteKnowledge):
        """Persists site knowledge to JSON file."""
        file_path = self._get_file_path(knowledge.domain)
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(knowledge.model_dump(), f, indent=2, ensure_ascii=False)
            logger.info(f"Persisted semantic knowledge for domain: {knowledge.domain}")
        except Exception as e:
            logger.warning(f"Failed to save knowledge for {knowledge.domain}: {e}")

    def get_knowledge(self, domain: str) -> Optional[SiteKnowledge]:
        """Retrieves generalized knowledge for a domain if available."""
        file_path = self._get_file_path(domain)
        if not os.path.exists(file_path):
            return None
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return SiteKnowledge(**data)
        except Exception as e:
            logger.warning(f"Failed loading knowledge for {domain}: {e}")
            return None

    def list_all_knowledge(self) -> List[SiteKnowledge]:
        """Lists all stored domain priors."""
        results = []
        if not os.path.exists(self.storage_dir):
            return results
        for fname in os.listdir(self.storage_dir):
            if fname.endswith(".json"):
                fpath = os.path.join(self.storage_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        results.append(SiteKnowledge(**json.load(f)))
                except Exception:
                    pass
        return results

    def delete_knowledge(self, domain: str) -> bool:
        """Deletes learned knowledge for a domain."""
        file_path = self._get_file_path(domain)
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
        return False
