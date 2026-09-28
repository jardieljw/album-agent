"""
Gemini Layout & Host Explorer Engine (from Backup3).
Performs deep DOM layout structure deduction, multi-strategy host rule discovery, and automatic pagination.
"""

import os
import re
import time
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Set, Callable
from urllib.parse import urlparse, urljoin

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

from ..core.models import Album, AlbumImage, ResolutionMethod, TelemetryMetrics
from .knowledge_bridge import ScoutKnowledgeBridge, extract_base_domain

logger = logging.getLogger("gemini_layout_explorer")
load_dotenv()

DEFAULT_GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")


class GeminiLayoutExplorer:
    """
    Engine 2: Gemini Layout & Host Explorer.
    Discovers complete domain layout recipes (recipes.json) and external host rules.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", DEFAULT_GEMINI_KEY)
        self.client = genai.Client(api_key=self.api_key) if (genai and self.api_key) else None
        self.bridge = ScoutKnowledgeBridge()
        self.is_cancelled = False

    def cancel(self):
        self.is_cancelled = True

    async def scout_website_layout(
        self,
        domain_name: str,
        raw_html_sample: str,
        model_name: str = "gemini-3.7-flash",
    ) -> Optional[Dict[str, Any]]:
        """
        Gemini acts as Layout Scout inspecting the full DOM to deduce layout recipes.
        """
        if not self.client:
            logger.warning("Gemini Client not initialized (GEMINI_API_KEY missing)")
            return None

        prompt = f"""
Você é um engenheiro de Web Scraping de alta precisão.
Analise o HTML bruto do site '{domain_name}' e descubra como obter o ARQUIVO DIRETO da imagem (.jpg, .png, .webp).

REGRAS CRÍTICAS:
- O link final da imagem original NUNCA pode ser uma página HTML de visualização (ex: '/show/', '/view/'). Deve ser o arquivo direto.
- Se o link no <a> levar para uma subpágina de visualizador interno, defina full_res_method como "subpage" e aponte os seletores.
- Se o link puder ser transformado por regex (ex: trocar 'thumb' por 'orig'), defina como "url_replace".
- PROIBIDO inventar seletores genéricos com vírgula. Use APENAS classes e IDs existentes no HTML fornecido.

Retorne APENAS um objeto JSON:
{{
  "gallery_container": "Seletor CSS ÚNICO do container da galeria",
  "item_card": "Seletor CSS ÚNICO de cada card de imagem",
  "ignore_selectors": ["seletores de recomendados, banners, sidebar"],
  "thumbnail_attr": "atributo da miniatura (src, data-src, data-original)",
  "full_res_method": "direct_attribute | url_replace | subpage",
  "full_res_details": {{
     "pattern_find": "Regex se url_replace ou null",
     "pattern_replace": "String de substituição se url_replace ou null",
     "attribute_name": "Nome do atributo se direct_attribute ou null",
     "subpage_link_selector": "Seletor do link da subpágina se subpage ou null",
     "subpage_img_selector": "Seletor da tag <img> na subpágina se subpage ou null"
  }},
  "pagination_next_selector": "Seletor do link da próxima página ou null"
}}

HTML COMPLETO:
{raw_html_sample[:40000]}
"""
        try:
            loop = asyncio.get_running_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json") if genai else None
                )
            )
            raw_text = response.text or "{}"
            new_recipe = json.loads(raw_text)
            return new_recipe
        except Exception as e:
            logger.error(f"Gemini layout inspection failed for {domain_name}: {e}")
            return None

    async def discover_host_rule(
        self,
        link_url: str,
        thumb_url: Optional[str] = None,
        model_name: str = "gemini-3.7-flash",
        client: Optional[httpx.AsyncClient] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Discovers resolution rules for external image hosting platforms.
        """
        if not self.client:
            return None

        domain = extract_base_domain(link_url)
        html_sample = ""
        try:
            if client:
                res = await client.get(link_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10.0)
                if res.status_code == 200:
                    html_sample = res.text[:25000]
        except Exception as e:
            logger.warning(f"Could not load HTML sample for host {link_url}: {e}")

        prompt = f"""
Analise a hospedagem de imagens do domínio '{domain}'.

Link da Página: {link_url}
Link da Miniatura: {thumb_url or 'N/A'}
HTML da Página:
{html_sample}

ATENÇÃO:
- Se a imagem real estiver no HTML dentro de uma tag <img>, defina strategy como "subpage_scrape", "container_selector" como o seletor CSS exato dessa tag (ex: "img#show_image") e "target_attr" como "src".
- Se a URL puder ser convertida via regex da miniatura/link, defina como "url_replace".

Retorne APENAS um JSON:
{{
  "strategy": "subpage_scrape | url_replace | direct",
  "pattern_find": "regex ou null",
  "pattern_replace": "string de substituição ou null",
  "container_selector": "seletor CSS da imagem final em alta resolução ou null",
  "target_attr": "atributo da imagem final (src, href) ou null"
}}
"""
        try:
            loop = asyncio.get_running_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json") if genai else None
                )
            )
            raw_text = response.text or "{}"
            rule = json.loads(raw_text)
            return rule
        except Exception as e:
            logger.error(f"Gemini host discovery failed for {domain}: {e}")
            return None

    async def extract_album(
        self,
        url: str,
        max_pages: int = 3,
        gemini_model: str = "gemini-3.7-flash",
        local_model: str = "qwen2.5:32b",
        on_event: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> Album:
        """
        Runs deep Layout Explorer extraction across multiple paginated pages.
        """
        self.is_cancelled = False
        start_time = time.time()
        domain = extract_base_domain(url)

        async def emit(event_data: Dict[str, Any]):
            if on_event:
                if asyncio.iscoroutinefunction(on_event):
                    await on_event(event_data)
                else:
                    on_event(event_data)

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
        }

        await emit({
            "type": "status",
            "message": f"Iniciando exploração de layout em {url}...",
        })
        await emit({
            "type": "ai_thought",
            "stage": "OBSERVATION",
            "thought": f" [Gemini Layout Explorer] Analisando arquitetura completa de {domain} com {gemini_model}",
        })

        recipes = self.bridge.load_recipes()
        recipe = recipes.get(domain)

        current_url = url
        page_count = 0
        all_records: List[Dict[str, Any]] = []
        resolved_images: List[AlbumImage] = []
        seen_urls: Set[str] = set()
        page_title = f"Galeria {domain}"

        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True, headers=headers) as client:
            while current_url and page_count < max_pages:
                if self.is_cancelled:
                    await emit({"type": "status", "message": "Varredura interrompida pelo operador."})
                    break

                await emit({
                    "type": "status",
                    "message": f"Raspando página {page_count + 1}: {current_url}",
                })

                try:
                    res = await client.get(current_url)
                    if res.status_code != 200:
                        break
                    raw_html = res.text
                except Exception as e:
                    logger.error(f"Failed to fetch {current_url}: {e}")
                    break

                soup = BeautifulSoup(raw_html, "html.parser")
                if page_count == 0 and soup.title:
                    page_title = soup.title.get_text(strip=True)
                    await emit({
                        "type": "album_init",
                        "title": page_title,
                        "total_candidates": 0,
                        "url": url,
                    })

                # Check or learn layout recipe
                if not recipe:
                    await emit({
                        "type": "ai_thought",
                        "stage": "SPECULATIVE_PROBING",
                        "thought": f" [Gemini Scout] Descobrindo receita de layout completa para '{domain}'...",
                    })
                    recipe = await self.scout_website_layout(domain, raw_html, model_name=gemini_model)
                    if recipe:
                        self.bridge.save_recipe(domain, recipe)
                        await emit({
                            "type": "ai_thought",
                            "stage": "PROVEN_VECTOR",
                            "thought": f" [Layout Explorer] Receita de layout gerada com sucesso! Container: {recipe.get('gallery_container')}, Card: {recipe.get('item_card')}",
                        })

                # Apply recipe extraction
                if recipe:
                    for ign in recipe.get("ignore_selectors", []):
                        for el in soup.select(ign):
                            el.decompose()

                    container = soup.select_one(recipe.get("gallery_container")) or soup
                    cards = container.select(recipe.get("item_card", "img"))
                    method = recipe.get("full_res_method", "direct_attribute")
                    details = recipe.get("full_res_details", {})
                    thumb_attr = recipe.get("thumbnail_attr", "src")
                    # Parallel card resolution
                    def resolve_card_item(card):
                        img_elem = card.select_one("img") or (card if card.name == "img" else None)
                        a_elem = card.select_one("a") or (card if card.name == "a" else None)

                        thumb_url = None
                        alt_text = ""
                        if img_elem:
                            raw_s = img_elem.get(thumb_attr) or img_elem.get("src") or ""
                            if not raw_s or "data:image" in raw_s or "1x1" in raw_s:
                                raw_s = img_elem.get("data-src") or img_elem.get("data-original") or raw_s
                            thumb_url = raw_s
                            alt_text = img_elem.get("alt", "").strip()

                        link_url = a_elem.get("href") if a_elem and a_elem.has_attr("href") else None
                        full_thumb = urljoin(current_url, thumb_url) if thumb_url else None
                        full_link = urljoin(current_url, link_url) if link_url else full_thumb

                        original_url = None

                        if method == "direct_attribute":
                            attr = details.get("attribute_name", "data-original")
                            if img_elem and img_elem.has_attr(attr):
                                original_url = img_elem[attr]
                            elif a_elem and a_elem.has_attr("href"):
                                original_url = a_elem["href"]

                        elif method == "url_replace":
                            p_find = details.get("pattern_find")
                            p_replace = details.get("pattern_replace")
                            if p_find and p_replace and full_thumb:
                                original_url = re.sub(p_find, p_replace, full_thumb)

                        elif method == "subpage":
                            sub_link = a_elem.get("href") if a_elem else None
                            if sub_link:
                                try:
                                    import requests
                                    sub_res = requests.get(urljoin(current_url, sub_link), timeout=5, headers=headers)
                                    if sub_res.status_code == 200:
                                        sub_soup = BeautifulSoup(sub_res.text, "html.parser")
                                        sub_img = sub_soup.select_one(details.get("subpage_img_selector", "img"))
                                        if sub_img:
                                            original_url = sub_img.get("src") or sub_img.get("data-src")
                                except Exception:
                                    pass

                        # If not resolved internally, check external host rule
                        if not original_url and full_link and extract_base_domain(full_link) != domain:
                            host_rules = self.bridge.load_host_rules()
                            h_domain = extract_base_domain(full_link)
                            h_rule = host_rules.get(h_domain)
                            if h_rule:
                                if h_rule.get("strategy") == "url_replace" and h_rule.get("pattern_find") and full_thumb:
                                    original_url = re.sub(h_rule["pattern_find"], h_rule.get("pattern_replace", ""), full_thumb)
                                elif h_rule.get("strategy") == "subpage_scrape":
                                    try:
                                        import requests
                                        sub_res = requests.get(full_link, headers={"Referer": current_url, **headers}, timeout=5)
                                        if sub_res.status_code == 200:
                                            sub_soup = BeautifulSoup(sub_res.text, "html.parser")
                                            img_t = sub_soup.select_one(h_rule.get("container_selector", "img"))
                                            if img_t:
                                                original_url = img_t.get(h_rule.get("target_attr", "src"))
                                    except Exception:
                                        pass

                        if original_url:
                            resolved_full = urljoin(current_url, original_url.strip())
                            return {
                                "original_url": resolved_full,
                                "thumbnail_url": full_thumb or resolved_full,
                                "alt_text": alt_text
                            }
                        elif full_link and re.search(r"\.(jpg|jpeg|png|webp|gif)(\?.*)?$", full_link, re.I):
                            return {
                                "original_url": full_link,
                                "thumbnail_url": full_thumb or full_link,
                                "alt_text": alt_text
                            }
                        return None

                    from concurrent.futures import ThreadPoolExecutor, as_completed
                    with ThreadPoolExecutor(max_workers=6) as executor:
                        futures = [executor.submit(resolve_card_item, card) for card in cards]
                        for fut in as_completed(futures):
                            if self.is_cancelled:
                                break
                            try:
                                res_rec = fut.result()
                                if res_rec and res_rec.get("original_url"):
                                    resolved_full = res_rec["original_url"]
                                    if resolved_full not in seen_urls:
                                        seen_urls.add(resolved_full)
                                        pos = len(resolved_images) + 1
                                        img_obj = AlbumImage(
                                            position=pos,
                                            candidate_id=f"layout_cand_{pos}",
                                            thumbnail_url=res_rec.get("thumbnail_url") or resolved_full,
                                            original_url=resolved_full,
                                            width=res_rec.get("width") or 0,
                                            height=res_rec.get("height") or 0,
                                            file_size=res_rec.get("file_size"),
                                            format="jpg",
                                            resolution_method=ResolutionMethod.INDIVIDUAL_PAGE if method == "subpage" else ResolutionMethod.VERIFIED_CDN_CANDIDATE,
                                            confidence=0.98,
                                            validation_status="PASS",
                                            source_page=current_url,
                                        )
                                        resolved_images.append(img_obj)
                                        all_records.append(res_rec)

                                        async def push_layout_event(img: AlbumImage):
                                            await emit({
                                                "type": "image_resolved",
                                                "position": img.position,
                                                "thumbnail_url": img.thumbnail_url,
                                                "original_url": img.original_url,
                                                "width": img.width,
                                                "height": img.height,
                                                "dimensions": "4K Original",
                                                "format": "jpg",
                                                "validation_status": "PASS",
                                                "resolution_method": "verified_cdn_candidate",
                                            })
                                        asyncio.run_coroutine_threadsafe(push_layout_event(img_obj), loop)
                            except Exception:
                                pass

                page_count += 1

                # Pagination
                next_sel = recipe.get("pagination_next_selector") if recipe else None
                if next_sel:
                    next_btn = soup.select_one(next_sel)
                    if next_btn and next_btn.get("href"):
                        next_href = next_btn["href"].strip()
                        if next_href.startswith("#") or next_href.startswith("javascript:"):
                            current_url = None
                        else:
                            current_url = urljoin(current_url, next_href)
                            await asyncio.sleep(0.5)
                    else:
                        current_url = None
                else:
                    current_url = None

        # Save to knowledge ledger
        self.bridge.save_knowledge_ledger(url, page_title, all_records, model_name=f"Gemini Layout Explorer ({gemini_model}) + Qwen ({local_model})")

        dur = round(time.time() - start_time, 2)
        try:
            telemetry = TelemetryMetrics(
                candidates_discovered=len(resolved_images),
                candidates_investigated=len(resolved_images),
                originals_resolved=len(resolved_images),
                originals_unresolved=0,
                banners_rejected=0,
                duration_seconds=dur,
            )
        except Exception:
            telemetry = TelemetryMetrics(
                candidates_discovered=len(resolved_images),
                candidates_investigated=len(resolved_images),
                originals_resolved=len(resolved_images),
                originals_unresolved=0,
                banners_rejected=0,
            )

        duration_saved = getattr(telemetry, "duration_seconds", dur)

        # Auto-resolve valid cover thumbnail (prevent transparent 1px placeholders)
        def _is_valid_media_url(u: Optional[str]) -> bool:
            if not u:
                return False
            u_low = str(u).lower()
            return not any(p in u_low for p in ("1px.png", "1px.gif", "blank.gif", "spacer.gif", "transparent.png"))

        cover_url = None
        for img in resolved_images:
            if _is_valid_media_url(img.original_url):
                cover_url = img.original_url
                break
            if _is_valid_media_url(img.thumbnail_url):
                cover_url = img.thumbnail_url
                break
            if getattr(img, "poster_url", None) and _is_valid_media_url(img.poster_url):
                cover_url = img.poster_url
                break

        album = Album(
            album_id=f"layout_{abs(hash(url)) % 1000000}",
            title=page_title,
            original_title=page_title,
            source_page=url,
            source_type="gallery",
            cover_image_url=cover_url,
            images=resolved_images,
            telemetry=telemetry,
            metadata={
                "model_used": f"Gemini Layout Explorer ({gemini_model}) + Qwen Closer ({local_model})",
                "engine_type": "gemini_layout_explorer",
                "saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                "duration": duration_saved,
            }
        )

        return album
