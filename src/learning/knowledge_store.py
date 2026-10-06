"""
Persistent Semantic Domain Knowledge Store.
Stores generalized semantic priors per domain (SiteKnowledge) encoded in Base64 (.b64)
without saving hardcoded CSS selectors or exposing plaintext domain names/content in the repository.
"""

import os
import json
import base64
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
    Persists data in URL/filesystem-safe Base64 (.b64) format to prevent plaintext exposure
    in git commits while maintaining full backward compatibility with legacy .json files.
    """

    def __init__(self, storage_dir: Optional[str] = None):
        if storage_dir is None:
            import sys
            if getattr(sys, "frozen", False):
                base_dir = os.path.dirname(sys.executable)
                if os.path.basename(base_dir).lower() == "dist":
                    base_dir = os.path.dirname(base_dir)
            else:
                base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            storage_dir = os.path.join(base_dir, "data", "knowledge")
        self.storage_dir = storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)

    @staticmethod
    def clean_domain(domain: Optional[str]) -> str:
        """
        Normalizes a domain, host, or URL into a clean lowercase domain name.
        Strips protocols (https://), paths, ports, and trailing slashes.
        """
        if not domain or not isinstance(domain, str):
            return ""
        clean = domain.strip().lower()
        if "://" in clean:
            from urllib.parse import urlparse
            parsed = urlparse(clean)
            clean = parsed.netloc or parsed.path
        if "/" in clean:
            clean = clean.split("/")[0].strip()
        if ":" in clean and not clean.startswith(":"):
            clean = clean.split(":")[0].strip()
        return clean.strip()

    @staticmethod
    def encode_domain(domain: str) -> str:
        """
        Encodes a domain to URL- and filesystem-safe Base64 without padding.
        Ensures consistent case-insensitive naming and rejects empty domains.
        """
        clean = KnowledgeStore.clean_domain(domain)
        if not clean:
            raise ValueError(f"Cannot encode invalid or empty domain: {domain!r}")
        return base64.urlsafe_b64encode(clean.encode("utf-8")).decode("ascii").rstrip("=")

    @staticmethod
    def decode_domain(encoded: str) -> str:
        """
        Decodes a Base64 encoded domain string (stripping .b64 if present).
        Supports both standard and URL-safe Base64 with or without padding.
        """
        if not encoded or not isinstance(encoded, str):
            raise ValueError("Encoded domain must be a non-empty string")
        raw = encoded.strip()
        if raw.endswith(".b64"):
            raw = raw[:-4]
        if not raw:
            raise ValueError(f"Cannot decode empty Base64 domain from '{encoded}'")

        missing_padding = len(raw) % 4
        if missing_padding:
            raw += "=" * (4 - missing_padding)

        # Try URL-safe Base64 first
        try:
            decoded = base64.urlsafe_b64decode(raw.encode("ascii")).decode("utf-8")
            clean = KnowledgeStore.clean_domain(decoded)
            if clean:
                return clean
        except Exception:
            pass

        # Try standard Base64 fallback
        try:
            decoded = base64.b64decode(raw.encode("ascii")).decode("utf-8")
            clean = KnowledgeStore.clean_domain(decoded)
            if clean:
                return clean
        except Exception:
            pass

        raise ValueError(f"Failed to decode Base64 domain from '{encoded}'")

    @staticmethod
    def encode_content(data: Dict[str, Any]) -> str:
        """Encodes dictionary payload into a Base64 string."""
        json_str = json.dumps(data, ensure_ascii=False)
        return base64.urlsafe_b64encode(json_str.encode("utf-8")).decode("ascii")

    @staticmethod
    def decode_content(raw_content: str) -> Dict[str, Any]:
        """
        Decodes raw file content. Transparently supports:
        1. URL-safe Base64 encoded JSON
        2. Standard Base64 encoded JSON (with/without padding, whitespace)
        3. Plaintext JSON (fallback for legacy files)
        """
        if not raw_content or not isinstance(raw_content, str):
            return {}

        content = raw_content.strip()
        if not content:
            return {}

        clean_b64 = "".join(content.split())
        missing_padding = len(clean_b64) % 4
        if missing_padding:
            clean_b64 += "=" * (4 - missing_padding)

        # 1. Try URL-safe Base64 decoding
        try:
            decoded_bytes = base64.urlsafe_b64decode(clean_b64.encode("ascii"))
            parsed = json.loads(decoded_bytes.decode("utf-8"))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        # 2. Try Standard Base64 decoding
        try:
            decoded_bytes = base64.b64decode(clean_b64.encode("ascii"))
            parsed = json.loads(decoded_bytes.decode("utf-8"))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        # 3. Fallback to direct plaintext JSON
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return parsed
            raise ValueError(f"Parsed JSON must be an object/dict, got {type(parsed).__name__}")
        except Exception as e:
            raise ValueError(f"Failed to parse content as either Base64 or JSON: {e}") from e

    def _get_b64_file_path(self, domain: str) -> str:
        return os.path.join(self.storage_dir, f"{self.encode_domain(domain)}.b64")

    def _get_legacy_file_path(self, domain: str) -> str:
        safe_name = domain.replace(":", "_").replace("/", "_").replace("\\", "_")
        return os.path.join(self.storage_dir, f"{safe_name}.json")

    def save_knowledge(self, knowledge: SiteKnowledge):
        """
        Persists site knowledge to a Base64 encoded file (.b64).
        Both the filename and payload are Base64 encoded.
        Removes any corresponding legacy .json to avoid duplicates.
        """
        if not knowledge or not getattr(knowledge, "domain", None):
            raise ValueError("Cannot save SiteKnowledge: missing or empty domain")

        domain = self.clean_domain(knowledge.domain)
        if not domain:
            raise ValueError(f"Cannot save SiteKnowledge with invalid domain: {knowledge.domain!r}")

        knowledge.domain = domain
        os.makedirs(self.storage_dir, exist_ok=True)
        b64_path = self._get_b64_file_path(domain)
        try:
            data = knowledge.model_dump()
            b64_text = self.encode_content(data)
            tmp_path = b64_path + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                f.write(b64_text)
            os.replace(tmp_path, b64_path)

            # Clean up legacy .json if present
            for lpath in [self._get_legacy_file_path(domain), os.path.join(self.storage_dir, f"{domain}.json")]:
                if os.path.exists(lpath):
                    try:
                        os.remove(lpath)
                    except Exception:
                        pass
            logger.info(f"Persisted Base64 semantic knowledge for domain: {domain}")
        except Exception as e:
            logger.warning(f"Failed to save Base64 knowledge for {domain}: {e}")
            raise

    def get_knowledge(self, domain: Optional[str]) -> Optional[SiteKnowledge]:
        """
        Retrieves generalized knowledge for a domain.
        Checks .b64 encoded file first, with transparent fallback to legacy .json.
        Also accepts an already encoded domain or filename for convenience.
        """
        if not domain or not isinstance(domain, str):
            return None

        clean_domain = self.clean_domain(domain)

        # 1. Check primary .b64 path
        if clean_domain:
            b64_path = self._get_b64_file_path(clean_domain)
            if os.path.exists(b64_path):
                try:
                    with open(b64_path, "r", encoding="utf-8") as f:
                        data = self.decode_content(f.read())
                    if not data.get("domain"):
                        data["domain"] = clean_domain
                    return SiteKnowledge(**data)
                except Exception as e:
                    logger.warning(f"Failed loading .b64 knowledge for {domain}: {e}")

        # 2. Check if domain argument itself is an encoded string/filename
        raw_target = domain.strip()
        direct_name = raw_target if raw_target.endswith(".b64") else f"{raw_target}.b64"
        direct_path = os.path.join(self.storage_dir, direct_name)
        if os.path.exists(direct_path):
            try:
                with open(direct_path, "r", encoding="utf-8") as f:
                    data = self.decode_content(f.read())
                if not data.get("domain"):
                    try:
                        data["domain"] = self.decode_domain(direct_name)
                    except Exception:
                        data["domain"] = clean_domain or raw_target
                return SiteKnowledge(**data)
            except Exception as e:
                logger.warning(f"Failed loading direct .b64 knowledge for {domain}: {e}")

        # 3. Fallback to legacy .json files
        if clean_domain:
            legacy_paths = [
                self._get_legacy_file_path(clean_domain),
                os.path.join(self.storage_dir, f"{clean_domain}.json"),
                self._get_legacy_file_path(raw_target),
            ]
            for lpath in legacy_paths:
                if os.path.exists(lpath):
                    try:
                        with open(lpath, "r", encoding="utf-8") as f:
                            data = self.decode_content(f.read())
                        if not data.get("domain"):
                            data["domain"] = clean_domain
                        return SiteKnowledge(**data)
                    except Exception as e:
                        logger.warning(f"Failed loading legacy knowledge for {domain}: {e}")

        # 4. Search directory for matching decoded domain if case/encoding varied
        if clean_domain and os.path.exists(self.storage_dir):
            for fname in os.listdir(self.storage_dir):
                if fname.endswith(".b64"):
                    try:
                        decoded = self.decode_domain(fname)
                        if decoded == clean_domain:
                            fpath = os.path.join(self.storage_dir, fname)
                            with open(fpath, "r", encoding="utf-8") as f:
                                data = self.decode_content(f.read())
                            if not data.get("domain"):
                                data["domain"] = clean_domain
                            return SiteKnowledge(**data)
                    except Exception:
                        pass
        return None

    def list_all_knowledge(self) -> List[SiteKnowledge]:
        """
        Lists all stored domain priors from both .b64 and legacy .json files.
        If a domain exists in both formats, .b64 takes precedence.
        """
        results_by_domain: Dict[str, SiteKnowledge] = {}
        if not os.path.exists(self.storage_dir):
            return []

        # Read .json files first so .b64 will overwrite if duplicate
        entries = sorted(os.listdir(self.storage_dir), key=lambda x: (not x.endswith(".json"), x))
        for fname in entries:
            fpath = os.path.join(self.storage_dir, fname)
            if fname.endswith(".json"):
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = self.decode_content(f.read())
                    if not data.get("domain"):
                        data["domain"] = fname[:-5]
                    sk = SiteKnowledge(**data)
                    clean_d = self.clean_domain(sk.domain)
                    if clean_d:
                        sk.domain = clean_d
                        results_by_domain[clean_d] = sk
                except Exception as e:
                    logger.debug(f"Skipping unreadable JSON file {fname}: {e}")
            elif fname.endswith(".b64"):
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = self.decode_content(f.read())
                    if not data.get("domain"):
                        try:
                            data["domain"] = self.decode_domain(fname)
                        except Exception:
                            pass
                    sk = SiteKnowledge(**data)
                    clean_d = self.clean_domain(sk.domain)
                    if clean_d:
                        sk.domain = clean_d
                        results_by_domain[clean_d] = sk
                except Exception as e:
                    logger.debug(f"Skipping unreadable Base64 file {fname}: {e}")

        return sorted(list(results_by_domain.values()), key=lambda k: k.domain)

    def delete_knowledge(self, domain: Optional[str]) -> bool:
        """
        Deletes learned knowledge for a domain in both .b64 and legacy .json formats.
        Accepts domain name, URL, encoded filename, or plain filename.
        """
        if not domain or not isinstance(domain, str):
            return False

        deleted = False
        clean_domain = self.clean_domain(domain)
        raw_target = domain.strip()

        candidate_paths = []
        if clean_domain:
            candidate_paths.append(self._get_b64_file_path(clean_domain))
            candidate_paths.append(self._get_legacy_file_path(clean_domain))
            candidate_paths.append(os.path.join(self.storage_dir, f"{clean_domain}.json"))

        candidate_paths.append(os.path.join(self.storage_dir, raw_target if raw_target.endswith(".b64") else f"{raw_target}.b64"))
        candidate_paths.append(os.path.join(self.storage_dir, raw_target if raw_target.endswith(".json") else f"{raw_target}.json"))

        for path in candidate_paths:
            if os.path.exists(path):
                try:
                    os.remove(path)
                    deleted = True
                except Exception as e:
                    logger.warning(f"Error removing {path}: {e}")

        # Also search for any file whose decoded domain matches
        if clean_domain and os.path.exists(self.storage_dir):
            for fname in os.listdir(self.storage_dir):
                if fname.endswith(".b64"):
                    try:
                        dec = self.decode_domain(fname)
                        if dec == clean_domain:
                            fpath = os.path.join(self.storage_dir, fname)
                            os.remove(fpath)
                            deleted = True
                    except Exception:
                        pass

        return deleted

    def inspect_file(self, file_path_or_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Decodes and audits a knowledge file for maintainer inspection / PR review.
        Checks structure and safety against suspicious payload patterns.
        """
        if not file_path_or_name or not isinstance(file_path_or_name, str):
            return None

        # Resolve path
        if os.path.isabs(file_path_or_name):
            full_path = file_path_or_name
        else:
            full_path = os.path.join(self.storage_dir, file_path_or_name)
            if not os.path.exists(full_path):
                full_path = os.path.abspath(file_path_or_name)

        if not os.path.exists(full_path):
            return None

        fname = os.path.basename(full_path)
        is_b64 = fname.endswith(".b64")

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                raw_text = f.read()
            data = self.decode_content(raw_text)
            knowledge = SiteKnowledge(**data)
        except Exception as e:
            return {
                "file_name": fname,
                "file_path": full_path,
                "error": f"Failed to decode or parse knowledge: {e}",
                "is_safe": False,
                "safety_verdict": "CORRUPTED",
                "safety_warnings": [str(e)],
                "pr_recommendation": "Reject: File cannot be parsed.",
            }

        # Run safety analysis
        audit = self.audit_safety(knowledge)

        return {
            "domain": knowledge.domain,
            "file_name": fname,
            "file_path": full_path,
            "format": "base64" if is_b64 else "legacy_json",
            "demonstration_count": knowledge.demonstration_count,
            "average_aspect_ratio": knowledge.average_aspect_ratio,
            "primary_containers": knowledge.primary_containers,
            "positive_signatures": knowledge.positive_signatures,
            "negative_filters": knowledge.negative_filters,
            "preferred_resolution_methods": knowledge.preferred_resolution_methods,
            "sample_evidence": knowledge.sample_evidence,
            "updated_at": knowledge.updated_at,
            "is_safe": audit["is_safe"],
            "safety_verdict": audit["verdict"],
            "safety_warnings": audit["warnings"],
            "pr_recommendation": audit["recommendation"],
            "model_data": knowledge.model_dump(),
        }

    def inspect_knowledge(self, target: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Inspects knowledge given either a domain, a filename, or a file path.
        """
        if not target or not isinstance(target, str):
            return None

        # If target points to an existing file
        if os.path.exists(target) or os.path.exists(os.path.join(self.storage_dir, target)):
            return self.inspect_file(target)

        # Try to find by domain
        clean = self.clean_domain(target)
        if clean:
            b64_name = f"{self.encode_domain(clean)}.b64"
            b64_path = os.path.join(self.storage_dir, b64_name)
            if os.path.exists(b64_path):
                return self.inspect_file(b64_path)

        legacy_path = self._get_legacy_file_path(target)
        if os.path.exists(legacy_path):
            return self.inspect_file(legacy_path)

        return None

    @staticmethod
    def audit_safety(knowledge: SiteKnowledge) -> Dict[str, Any]:
        """
        Audits a SiteKnowledge payload for security risks, suspicious patterns,
        or injection vectors.
        """
        warnings = []
        suspicious_tokens = [
            "<script", "</script", "javascript:", "vbscript:",
            "onerror=", "onload=", "eval(", "exec(", "system(",
            "cmd.exe", "powershell", "/bin/sh", "/bin/bash",
            "union select", "drop table", "rm -rf", "http://169.254.169.254"
        ]

        # Check domain
        domain = knowledge.domain.strip()
        if not domain or len(domain) > 255:
            warnings.append(f"Domain length invalid ({len(domain)} chars)")
        if any(c in domain for c in ("\n", "\r", "\t", "<", ">", '"', "'")):
            warnings.append("Domain contains invalid or control characters")

        # Collect text fields to audit
        all_text = (
            [domain]
            + knowledge.primary_containers
            + knowledge.positive_signatures
            + knowledge.negative_filters
            + knowledge.preferred_resolution_methods
            + knowledge.sample_evidence
        )

        for text in all_text:
            if not isinstance(text, str):
                warnings.append(f"Non-string entry encountered: {type(text)}")
                continue
            if len(text) > 4096:
                warnings.append(f"Entry exceeds length limit ({len(text)} chars): {text[:60]}...")
            text_lower = text.lower()
            for token in suspicious_tokens:
                if token in text_lower:
                    warnings.append(f"Suspicious token '{token}' detected in '{text[:80]}'")

        is_safe = len(warnings) == 0
        if is_safe:
            verdict = "SAFE"
            recommendation = (
                "Approved: Knowledge contains valid DOM selectors and metadata. "
                "Safe to merge into repository."
            )
        else:
            verdict = "SUSPICIOUS"
            recommendation = (
                "Caution: Potential security risks or malformed entries detected. "
                "Review carefully before approving PR."
            )

        return {
            "is_safe": is_safe,
            "verdict": verdict,
            "warnings": warnings,
            "recommendation": recommendation,
        }
