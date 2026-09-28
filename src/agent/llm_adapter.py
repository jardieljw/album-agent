"""
LLM Adapter for AI Semantic Reasoning.
Supports:
1. Local OpenAI-compatible API (Ollama, Qwen2.5:32b, Qwen3:8b, Qwen3:14b, Qwen2.5:7b, vLLM, LM Studio)
2. Dynamic discovery of locally installed models via Ollama
3. Deterministic Semantic Rule Adapter (Hermetic, offline testing)
4. AI-Driven Candidate Hypothesis Generation for Difficult Originals
"""

import os
import json
import logging
import re
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
import httpx

logger = logging.getLogger(__name__)


class LLMAdapter:
    """
    Interfaces between the Agent Brain and Local/Remote LLM endpoints.
    Supports qwen2.5:32b, qwen3:8b, qwen2.5:7b, Gemini Cloud (via OpenAI-compatible API), and Ollama model auto-discovery.
    """

    def __init__(
        self,
        api_base: Optional[str] = None,
        model_name: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 120.0,
        is_live_llm_available: bool = False,
    ):
        self.api_base = api_base or os.getenv("LLM_API_BASE", "http://localhost:11434/v1")
        self.model_name = model_name or os.getenv("LLM_MODEL_NAME", "qwen2.5:32b")
        self.api_key = api_key or os.getenv("LLM_API_KEY", "ollama")
        self.timeout = timeout
        self.is_live_llm_available = is_live_llm_available

    async def check_availability(self) -> bool:
        """Probes the LLM endpoint or auto-switches to Gemini Cloud if Ollama is offline."""
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{self.api_base}/models", headers={"Authorization": f"Bearer {self.api_key}"})
                if res.status_code == 200:
                    self.is_live_llm_available = True
                    return True
        except Exception:
            pass

        # Fallback to Gemini Cloud if Ollama is unreachable and GEMINI_API_KEY is available
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if gemini_key:
            self.api_base = "https://generativelanguage.googleapis.com/v1beta/openai"
            self.api_key = gemini_key
            if not self.model_name or "qwen" in self.model_name.lower() or "gemini-2" in self.model_name.lower():
                self.model_name = "gemini-3.6-flash"
            self.is_live_llm_available = True
            logger.info(f"Ollama not detected. Auto-routed LLMAdapter to Gemini Cloud ({self.model_name})")
            return True

        self.is_live_llm_available = False
        return False

    @staticmethod
    async def get_available_local_models(ollama_host: str = "http://localhost:11434") -> Dict[str, Any]:
        """
        Discovers models installed locally in Ollama (e.g. qwen2.5:32b, qwen3:8b, qwen2.5:7b).
        """
        discovered = []
        is_online = False
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{ollama_host}/api/tags")
                if res.status_code == 200:
                    is_online = True
                    data = res.json()
                    for m in data.get("models", []):
                        name = m.get("name", "")
                        size = m.get("size", 0)
                        size_gb = round(size / (1024 ** 3), 1) if size else 0
                        discovered.append({
                            "name": name,
                            "label": f"{name} ({size_gb} GB)" if size_gb else name,
                            "size_gb": size_gb,
                        })
        except Exception:
            is_online = False

        # If offline or no models found, supply default known profiles
        default_profiles = [
            {"name": "qwen2.5:32b", "label": "qwen2.5:32b (Recommended / High Precision)", "size_gb": 18.5},
            {"name": "qwen3:14b", "label": "qwen3:14b (Advanced Reasoning)", "size_gb": 8.6},
            {"name": "qwen3:8b", "label": "qwen3:8b (Fast Reasoning)", "size_gb": 4.9},
            {"name": "qwen2.5:14b", "label": "qwen2.5:14b (Balanced)", "size_gb": 8.4},
            {"name": "qwen2.5:7b", "label": "qwen2.5:7b (Fast)", "size_gb": 4.4},
            {"name": "qwen2.5:3b", "label": "qwen2.5:3b (Ultra-Light)", "size_gb": 1.8},
        ]

        if not discovered:
            models_to_return = default_profiles
        else:
            models_to_return = discovered

        return {
            "is_online": is_online,
            "models": models_to_return,
            "default": "qwen2.5:32b" if any(m["name"].startswith("qwen2.5:32b") for m in models_to_return) else (models_to_return[0]["name"] if models_to_return else "qwen2.5:7b")
        }

    async def query_semantic_classification(
        self,
        page_info: Dict[str, Any],
        containers: List[Dict[str, Any]],
        headings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Queries LLM (Qwen2.5 / Qwen3) for page classification and main container identification.
        """
        if self.is_live_llm_available:
            system_prompt = (
                "You are an AI Web Comprehension Engine. Analyze page structure facts and return JSON only with:\n"
                "- page_type: 'album' | 'gallery' | 'profile' | 'forum' | 'thread' | 'article' | 'search' | 'unknown'\n"
                "- main_container: selector of primary album container (e.g. '#tiles' or '.thumbwook' or 'main')\n"
                "- related_container: selector of related/recommended items (or null)\n"
                "- is_forum_with_external_link: boolean\n"
                "- raw_title: raw page/album title exactly as presented on the page in its original language, NEVER translate it\n"
                "Respond with valid JSON only. Do not output conversational text or markdown explanation."
            )
            user_prompt = json.dumps({
                "page_title": page_info.get("title"),
                "headings": headings,
                "containers": containers[:10],
                "total_images": page_info.get("total_images"),
                "total_links": page_info.get("total_links"),
            }, indent=2)

            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        f"{self.api_base}/chat/completions",
                        headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                        json={
                            "model": self.model_name,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt},
                            ],
                            "response_format": {"type": "json_object"},
                            "temperature": 0.0,
                        },
                    )
                    if response.status_code == 200:
                        data = response.json()
                        choices = data.get("choices", [])
                        if choices:
                            content = choices[0].get("message", {}).get("content", "").strip()
                            # Clean code fences if present
                            if content.startswith("```json"):
                                content = content[7:]
                            if content.startswith("```"):
                                content = content[3:]
                            if content.endswith("```"):
                                content = content[:-3]
                            content = content.strip()

                            parsed = json.loads(content)
                            logger.info(f"Live LLM ({self.model_name}) successfully classified page as: {parsed.get('page_type')}")
                            return parsed
                    else:
                        logger.warning(f"Ollama returned HTTP {response.status_code} for {self.model_name}: {response.text}")
            except Exception as e:
                logger.warning(f"Live LLM ({self.model_name}) query failed, falling back to deterministic semantic engine: {e}")

        # Fallback to deterministic semantic inference
        return self._semantic_fallback_classification(page_info, containers, headings)

    def _semantic_fallback_classification(
        self,
        page_info: Dict[str, Any],
        containers: List[Dict[str, Any]],
        headings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Deterministic semantic inference when running offline or in test suites."""
        title = page_info.get("title", "")
        title_lower = title.lower()

        # Check for forum
        if any(w in title_lower for w in ["forum", "thread", "discussion", "board", "topic", "post"]):
            return {
                "page_type": "forum",
                "main_container": "article, .thread-body, .post-content, main",
                "related_container": None,
                "is_forum_with_external_link": True,
                "raw_title": title,
            }

        # Check largest container
        main_sel = "#tiles"
        if containers:
            main_sel = containers[0].get("selector", "#tiles")

        return {
            "page_type": "gallery",
            "main_container": main_sel,
            "related_container": ".related, #related-grid",
            "is_forum_with_external_link": False,
            "raw_title": title,
        }

    async def query_investigation_hypotheses(
        self,
        candidate_src: str,
        proven_sample_urls: List[str],
        page_url: str,
        surrounding_text: str = "",
    ) -> List[str]:
        """
        Invokes Qwen LLM to hypothesize high-resolution candidate URLs for difficult or low-res items,
        inferring transformations from the thumbnail URL and proven high-res patterns in the same album.
        """
        if not candidate_src:
            return []

        if self.is_live_llm_available:
            system_prompt = (
                "You are an expert AI Media Resolution Agent. Given a thumbnail image URL from a web gallery and "
                "confirmed high-resolution original image URLs from the same website, deduce 3-5 candidate high-resolution "
                "original image URLs for this thumbnail.\n"
                "Return JSON only with: {\"candidate_urls\": [\"url1\", \"url2\", ...]}\n"
                "Do not write conversational explanations."
            )
            user_prompt = json.dumps({
                "thumbnail_url": candidate_src,
                "domain_page_url": page_url,
                "confirmed_original_patterns": proven_sample_urls[-5:] if proven_sample_urls else [],
                "surrounding_context": surrounding_text[:150] if surrounding_text else "",
            }, indent=2)

            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        f"{self.api_base}/chat/completions",
                        headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                        json={
                            "model": self.model_name,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt},
                            ],
                            "response_format": {"type": "json_object"},
                            "temperature": 0.0,
                        },
                    )
                    if response.status_code == 200:
                        data = response.json()
                        choices = data.get("choices", [])
                        if choices:
                            content = choices[0].get("message", {}).get("content", "").strip()
                            if content.startswith("```json"):
                                content = content[7:]
                            if content.startswith("```"):
                                content = content[3:]
                            if content.endswith("```"):
                                content = content[:-3]
                            parsed = json.loads(content.strip())
                            urls = parsed.get("candidate_urls", [])
                            if isinstance(urls, list) and len(urls) > 0:
                                logger.info(f"Qwen LLM ({self.model_name}) hypothesized {len(urls)} high-res candidate URLs")
                                return [u for u in urls if isinstance(u, str) and u.startswith("http")]
                    else:
                        logger.warning(f"Ollama returned HTTP {response.status_code} for {self.model_name}: {response.text}")
            except Exception as e:
                logger.warning(f"Qwen hypothesis query failed: {e}")

        # Deterministic pattern extrapolation fallback
        return self._extrapolate_hypotheses_deterministically(candidate_src, proven_sample_urls)

    def _extrapolate_hypotheses_deterministically(
        self,
        candidate_src: str,
        proven_sample_urls: List[str],
    ) -> List[str]:
        """Extrapolates original high-res URLs using proven patterns in the same album."""
        hypotheses = []
        if not candidate_src:
            return hypotheses

        # 1. Direct transformation using proven patterns in the same album
        for proven in proven_sample_urls:
            # Pattern: /460/ -> /1280/ or /1920/ or /orig/
            if "/1280/" in proven and "/460/" in candidate_src:
                hypotheses.append(candidate_src.replace("/460/", "/1280/"))
            if "/1920/" in proven and "/460/" in candidate_src:
                hypotheses.append(candidate_src.replace("/460/", "/1920/"))
            if "/orig" in proven and "/thumb" in candidate_src:
                hypotheses.append(candidate_src.replace("/thumb", "/orig"))
            if "/full/" in proven and "/preview/" in candidate_src:
                hypotheses.append(candidate_src.replace("/preview/", "/full/"))

        # 2. General common CDN high-res folder replacements
        for folder in ["1280", "1920", "original", "full", "orig", "large", "highres"]:
            h = re.sub(r'/(460|thumbs?|thumbnails?|small|medium|preview)/', f'/{folder}/', candidate_src)
            if h != candidate_src and h not in hypotheses:
                hypotheses.append(h)

        return hypotheses

    async def query_pattern_deduction_from_examples(
        self,
        demonstrated_pairs: List[Dict[str, str]],
        target_thumbnails: List[str],
        page_url: str,
    ) -> Dict[str, Any]:
        """
        Deep Qwen LLM Induction:
        Given ground-truth (thumbnail -> resolução original) URL pairs demonstrated by the user,
        deduces the structural domain transformation rule and predicts high-res original URLs
        for all target thumbnails.
        """
        if not demonstrated_pairs:
            return {"rule_description": "No demonstration pairs provided", "resolved_urls": {}}

        # Attempt Live Qwen LLM Induction if Ollama is available
        if self.is_live_llm_available:
            system_prompt = (
                "You are an AI Web Media Inductive Logic Engine. Analyze the exact ground-truth URL pairs "
                "where thumbnail URLs are mapped to their high-resolution Original original image URLs.\n"
                "Task:\n"
                "1. Deduce the exact pattern transformation rule (e.g. folder changes like '/t/' -> '/u/i/' or '/460/' -> '/1280/', or filename prefix/suffix modifications, or query param removal).\n"
                "2. Apply this deduced rule to all given target thumbnails and generate their corresponding original high-resolution URLs.\n"
                "Return JSON only with:\n"
                "{\n"
                "  \"rule_description\": \"Descriptive summary of the transformation\",\n"
                "  \"winning_rule\": \"Python lambda string or replace expression, e.g. lambda c: (c.get('dataset', {}).get('src') or c.get('src', '')).replace('/460/', '/1280/')\",\n"
                "  \"url_substitutions\": [{\"find\": \"string_or_regex\", \"replace\": \"replacement\"}],\n"
                "  \"resolved_urls\": {\"target_thumbnail_url_1\": \"predicted_original_url_1\"}\n"
                "}\n"
                "Do not output conversational text or markdown codeblock."
            )
            user_prompt = json.dumps({
                "page_url": page_url,
                "demonstrated_ground_truth_pairs": demonstrated_pairs,
                "target_thumbnails_to_resolve": target_thumbnails[:60],
            }, indent=2)

            try:
                timeout_cfg = httpx.Timeout(self.timeout, connect=2.0)
                async with httpx.AsyncClient(timeout=timeout_cfg) as client:
                    response = await client.post(
                        f"{self.api_base}/chat/completions",
                        headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                        json={
                            "model": self.model_name,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt},
                            ],
                            "response_format": {"type": "json_object"},
                            "temperature": 0.0,
                        },
                    )
                    if response.status_code == 200:
                        data = response.json()
                        choices = data.get("choices", [])
                        if choices:
                            content = choices[0].get("message", {}).get("content", "").strip()
                            if content.startswith("```json"):
                                content = content[7:]
                            if content.startswith("```"):
                                content = content[3:]
                            if content.endswith("```"):
                                content = content[:-3]
                            parsed = json.loads(content.strip())
                            logger.info(f"Qwen deduced pattern rule: {parsed.get('rule_description')}")
                            self.is_live_llm_available = True
                            return parsed
                    else:
                        logger.warning(f"Ollama returned HTTP {response.status_code} for {self.model_name}: {response.text}")
            except Exception as e:
                logger.warning(f"Qwen pattern deduction query failed: {e}")

        # Deterministic induction fallback
        return self._deduce_pattern_deterministically(demonstrated_pairs, target_thumbnails)

    def _deduce_pattern_deterministically(
        self,
        demonstrated_pairs: List[Dict[str, str]],
        target_thumbnails: List[str],
    ) -> Dict[str, Any]:
        """Calculates path and string delta between demonstrated thumbnail and original."""
        substitutions = []
        resolved_urls = {}

        for pair in demonstrated_pairs:
            t = pair.get("thumbnail", "")
            o = pair.get("original", "")
            if not t or not o:
                continue

            t_url = urlparse(t)
            o_url = urlparse(o)
            t_path = t_url.path
            o_path = o_url.path

            # 1. Identify path prefix delta sharing a common suffix
            for i in range(len(t_path)):
                sub = t_path[i:]
                if sub and len(sub) >= 4 and sub in o_path:
                    t_pre = t_path[:i]
                    o_pre = o_path[:o_path.find(sub)]
                    if t_pre and o_pre and t_pre != o_pre:
                        substitutions.append({"find": t_pre, "replace": o_pre})
                    break

            # 2. Check directory token delta (e.g. /t/ -> /u/i/ or /460/ -> /1280/)
            t_parts = [p for p in t_path.split("/") if p]
            o_parts = [p for p in o_path.split("/") if p]
            for tp in t_parts:
                for op in o_parts:
                    if tp in ["t", "thumbs", "thumb", "small", "preview", "460"] and op in ["u", "i", "original", "orig", "full", "1280", "1920"]:
                        substitutions.append({"find": f"/{tp}/", "replace": f"/{op}/"})

            # 3. Direct filename prefix delta
            t_fname = t_path.split("/")[-1]
            o_fname = o_path.split("/")[-1]
            if t_fname != o_fname:
                p_t = t_fname.split("_")[0] if "_" in t_fname else ""
                p_o = o_fname.split("_")[0] if "_" in o_fname else ""
                if p_t and p_o and p_t != p_o:
                    substitutions.append({"find": f"/{p_t}_", "replace": f"/{p_o}_"})

        # Apply substitutions to target thumbnails
        for target in target_thumbnails:
            current = target
            for sub in substitutions:
                if sub["find"] in current:
                    current = current.replace(sub["find"], sub["replace"])
            if current != target:
                resolved_urls[target] = current

        return {
            "rule_description": f"Extrapolated from {len(demonstrated_pairs)} ground truth pairs",
            "url_substitutions": substitutions,
            "resolved_urls": resolved_urls,
        }
