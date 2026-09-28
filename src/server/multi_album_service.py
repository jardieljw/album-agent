"""
Serviço Isolado de Expansão e Descoberta Multi-Álbum / Performer.
Executa buscas determinísticas em contêineres relacionados, rotas canônicas e busca interna do site,
sem depender de alucinações de LLM e sem alterar os motores de extração existentes.
"""

import os
import re
import asyncio
import urllib.parse
import json
from typing import List, Dict, Any, Optional, AsyncGenerator
import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/multi-album", tags=["Multi-Album Discovery"])

# Palavras de ruído e stop-words em português para extração de nomes
STOP_WORDS_PT = {
    'quero', 'album', 'albums', 'albuns', 'link', 'outro', 'outros', 'mais',
    'dos', 'das', 'pagina', 'dela', 'dele', 'relacionados', 'relacionadas',
    'fotos', 'videos', 'site', 'qualquer', 'todos', 'todas', 'extrair',
    'principal', 'galerias', 'galeria', 'esse', 'essa', 'este', 'esta',
    'como', 'para', 'pelo', 'pela', 'com', 'sem', 'que', 'nao', 'sim',
    'tambem', 'apenas', 'somente', 'outro', 'outra', 'atriz', 'modelo',
    'pornstar', 'actress', 'related', 'links', 'imagens', 'download'
}

CANONICAL_PERFORMER_ROUTES = [
    "/pornstars/{slug}/",
    "/models/{slug}/",
    "/pornstar/{slug}/",
    "/model/{slug}/",
    "/actress/{slug}/",
    "/girls/{slug}/",
    "/performer/{slug}/"
]

SEARCH_QUERY_ROUTES = [
    "{origin}/search/?q={query}",
    "{origin}/search?q={query}",
    "{origin}/search.php?q={query}",
    "{origin}/search.php?keywords={query}",
    "{origin}/?s={query}",
    "{origin}/search/{query}/"
]

class DiscoveryRequest(BaseModel):
    url: str
    performer_name: Optional[str] = None
    max_related: Optional[int] = 3

class DiscoveredAlbumItem(BaseModel):
    title: str
    url: str
    thumbnail_url: Optional[str] = None
    source_type: str  # 'related', 'performer_page', 'search'
    total_images_hint: Optional[int] = None

class DiscoveryResponse(BaseModel):
    source_url: str
    target_performer: Optional[str] = None
    discovered_albums: List[DiscoveredAlbumItem]
    total_found: int


class MultiAlbumService:
    """
    Motor determinístico e assíncrono para descoberta de novos álbuns
    sem qualquer dependência de Selenium, PyQt ou chamadas pesadas a LLM.
    """

    @staticmethod
    def extract_performer_slug(raw_name: str) -> str:
        clean = raw_name.strip().lower()
        # Remove caracteres especiais
        clean = re.sub(r'[^a-zA-Z0-9\s-]', '', clean)
        return clean.replace(" ", "-")

    @staticmethod
    def extract_thumbnail(tag_a, base_url: str) -> Optional[str]:
        # Busca imagem interna
        img = tag_a.find("img")
        if img:
            for attr in ["data-original", "data-lazy-src", "data-src", "src", "data-thumb", "data-bg"]:
                val = img.get(attr)
                if val and val.startswith("http"):
                    return urllib.parse.urljoin(base_url, val)
                elif val:
                    return urllib.parse.urljoin(base_url, val)
        
        # Busca por background-image em divs internas ou no próprio link
        for tag in [tag_a] + tag_a.find_all():
            style = tag.get("style", "")
            if "background" in style.lower():
                m = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
                if m:
                    val = m.group(1)
                    if not val.startswith("data:image"):
                        return urllib.parse.urljoin(base_url, val)
        return None

    @staticmethod
    def unpack_redirect_url(href: str, base_url: str) -> str:
        """Descompacta URLs de redirecionamento/tracking como /hit/.../?url=... para a URL real da galeria."""
        full = urllib.parse.urljoin(base_url, href).strip()
        if "url=" in full or "redirect=" in full or "link=" in full:
            m = re.search(r'(?:url|redirect|link|target|goto)=([^&]+)', full)
            if m:
                unpacked = urllib.parse.unquote(urllib.parse.unquote(m.group(1)))
                if unpacked.startswith("http"):
                    return unpacked.rstrip("/")
        return full.rstrip("/")

    @staticmethod
    def extract_title_from_tag(tag_a, full_url: str, fallback_index: int) -> str:
        # 1. Title do link
        title = tag_a.get("title", "").strip()
        if title and len(title) > 3:
            return title[:90]

        # 2. Alt/title da imagem
        img = tag_a.find("img")
        if img:
            img_alt = img.get("alt", "").strip() or img.get("title", "").strip()
            if img_alt and len(img_alt) > 3:
                return img_alt[:90]

        # 3. Texto do próprio elemento
        txt = tag_a.get_text(separator=" ", strip=True)
        if txt and len(txt) > 3 and len(txt) < 120:
            return txt[:90]

        # 4. Texto do card pai
        card = tag_a.find_parent(class_=lambda c: c and any(k in str(c).lower() for k in ['item', 'thumb', 'video', 'post', 'box', 'card']))
        if card:
            card_txt = card.get_text(separator=" ", strip=True)
            # Remove timestamps como 4:04 ou datas
            clean_txt = re.sub(r'^\d{1,2}:\d{2}\s*', '', card_txt).strip()
            if clean_txt and len(clean_txt) > 3:
                return clean_txt[:90]

        # 5. Derivado do slug da URL
        try:
            slug = urllib.parse.urlparse(full_url).path.rstrip("/").split("/")[-1]
            slug = re.sub(r'^\d+[-_]?', '', slug)
            slug = re.sub(r'[-_]\d+$', '', slug)
            clean_slug = slug.replace("-", " ").replace("_", " ").title().strip()
            if clean_slug and len(clean_slug) > 3:
                return clean_slug[:90]
        except Exception:
            pass

        return f"Álbum Relacionado #{fallback_index}"

    @staticmethod
    async def discover_albums(req: DiscoveryRequest) -> DiscoveryResponse:
        results: List[DiscoveredAlbumItem] = []
        seen_urls = {req.url.rstrip("/")}

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        }

        # Padrões comuns expandidos para captura exaustiva
        ALBUM_PATTERNS = [
            "/galleries/", "/gallery/", "/album/", "/albums/", "/g/", "/post/", "/posts/",
            "/thread/", "/threads/", "/photo/", "/photos/", "/set/", "/sets/", "/pics/",
            "/pictures/", "/v/", "/video/", "/videos/", "/watch/", "/item/", "/tube/videos/"
        ]

        parsed_origin = urllib.parse.urlparse(req.url)
        origin_url = f"{parsed_origin.scheme}://{parsed_origin.netloc}"
        netloc = parsed_origin.netloc.lower()

        # -----------------------------------------------------------------
        # PASSO A: FAST-TRACK PORNPICS (Se for galeria individual)
        # -----------------------------------------------------------------
        if "pornpics.com" in netloc and "/galleries/" in req.url:
            gid_m = re.search(r'-([0-9]{6,10})/?$', req.url)
            if gid_m:
                gid = gid_m.group(1)
                try:
                    async with httpx.AsyncClient(timeout=10.0, headers=headers) as pclient:
                        p_resp = await pclient.post(
                            "https://rel.pornpics.com/related/related_json.php",
                            json={"lang": "en", "gid": gid, "limit": 400},
                            headers={"Referer": req.url}
                        )
                        if p_resp.status_code == 200:
                            data = p_resp.json()
                            if isinstance(data, list):
                                for item in data:
                                    if req.max_related and req.max_related > 0 and len(results) >= req.max_related:
                                        break
                                    g_url = (item.get("g_url") or "").rstrip("/")
                                    if g_url and g_url not in seen_urls:
                                        results.append(DiscoveredAlbumItem(
                                            title=(item.get("desc") or "Galeria Relacionada")[:90],
                                            url=g_url,
                                            thumbnail_url=item.get("t_url_460") or item.get("t_url"),
                                            source_type="related"
                                        ))
                                        seen_urls.add(g_url)
                except Exception:
                    pass

        # -----------------------------------------------------------------
        # SE O USUÁRIO PEDIU TUDO (max_related == 0), VAI DIRETO AO NAVEGADOR
        # COM ROLAGEM DE HARDWARE REAL (PAGEDOWN + MOUSE WHEEL)
        # -----------------------------------------------------------------
        is_unlimited = (req.max_related == 0)

        # Se NÃO for ilimitado e ainda não tivermos resultados, tenta HTTPX rápido
        if not is_unlimited and not results:
            try:
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
                    resp = await client.get(req.url)
                    if resp.status_code == 200:
                        soup = BeautifulSoup(resp.text, "html.parser")
                        all_links = soup.find_all("a", href=True)

                        for tag_a in all_links:
                            if req.max_related and req.max_related > 0 and len(results) >= req.max_related:
                                break

                            raw_href = tag_a["href"].strip()
                            full_sub = MultiAlbumService.unpack_redirect_url(raw_href, req.url)

                            if not full_sub or full_sub in seen_urls:
                                continue

                            if any(full_sub.lower().endswith(ext) for ext in [".jpg", ".png", ".webp", ".gif", ".css", ".js", ".svg"]):
                                continue

                            if any(noise in full_sub.lower() for noise in ["login", "terms", "privacy", "dmca", "contact", "join", "signup", "/advertising", "/faq", "/support"]):
                                continue

                            path_lower = urllib.parse.urlparse(full_sub).path.lower()
                            has_album_pattern = any(p in path_lower for p in ALBUM_PATTERNS)
                            has_thumb = (tag_a.find("img") is not None) or ("background" in tag_a.get("style", "").lower())

                            if has_album_pattern or (has_thumb and len(path_lower) > 3):
                                title = MultiAlbumService.extract_title_from_tag(tag_a, full_sub, len(results) + 1)
                                thumb = MultiAlbumService.extract_thumbnail(tag_a, req.url)

                                results.append(DiscoveredAlbumItem(
                                    title=title,
                                    url=full_sub,
                                    thumbnail_url=thumb,
                                    source_type="related"
                                ))
                                seen_urls.add(full_sub)
            except Exception:
                pass

        # -----------------------------------------------------------------
        # PASSO B: UNSTOPPABLE HARDWARE SCROLL HARVESTER (Playwright)
        # Executa rolagem real com PageDown e MouseWheel
        # -----------------------------------------------------------------
        needs_deep_scroll = is_unlimited or (len(results) < (req.max_related or 20))
        if needs_deep_scroll:
            try:
                from ..browser.engine import BrowserEngine
                browser = BrowserEngine(headless=True)
                await browser.start()
                try:
                    page = browser.main_page

                    # Intercepta dados JSON de galerias dinâmicas
                    async def on_dynamic_response(res):
                        try:
                            if "json" in res.headers.get("content-type", "").lower():
                                data = await res.json()
                                items_to_parse = []
                                if isinstance(data, list):
                                    items_to_parse = data
                                elif isinstance(data, dict):
                                    for key in ["data", "items", "galleries", "albums", "videos", "results"]:
                                        if isinstance(data.get(key), list):
                                            items_to_parse = data[key]
                                            break

                                for item in items_to_parse:
                                    if isinstance(item, dict) and any(k in item for k in ["g_url", "url", "gallery", "gallery_url", "link"]):
                                        u = (item.get("g_url") or item.get("url") or item.get("gallery") or item.get("gallery_url") or item.get("link") or "").rstrip("/")
                                        if u and u not in seen_urls:
                                            t = item.get("t_url_460") or item.get("t_url") or item.get("thumb") or item.get("thumbnail") or item.get("image")
                                            d = item.get("desc") or item.get("title") or item.get("name") or "Galeria Relacionada"
                                            results.append(DiscoveredAlbumItem(
                                                title=str(d)[:90],
                                                url=u,
                                                thumbnail_url=t,
                                                source_type="related"
                                            ))
                                            seen_urls.add(u)
                        except Exception:
                            pass

                    page.on("response", on_dynamic_response)
                    await browser.navigate(req.url)
                    await browser.dismiss_age_gates_and_popups(page)

                    # ROLAGEM REAL DE HARDWARE (PAGEDOWN + MOUSEWHEEL)
                    # 30 ciclos sucessivos de rolagem sem interrupção falsa
                    total_cycles = 35 if is_unlimited else 15
                    for cycle in range(total_cycles):
                        if req.max_related and req.max_related > 0 and len(results) >= req.max_related:
                            break

                        # Emula eventos de teclado e roda física
                        await page.keyboard.press("PageDown")
                        await page.keyboard.press("PageDown")
                        await page.mouse.wheel(0, 1400)
                        await asyncio.sleep(0.35)

                        # Tenta clicar em botões "Carregar Mais" / "Load More"
                        await page.evaluate("""() => {
                            const selectors = [
                                'button.load-more', '.load-more button', '#load-more', '.load_more',
                                'a.load-more', 'a.show-more', 'button.show-more', '.btn-load-more',
                                '.pagination-load-more'
                            ];
                            for (const s of selectors) {
                                const el = document.querySelector(s);
                                if (el && el.offsetParent !== null) {
                                    try { el.click(); return; } catch (_) {}
                                }
                            }
                            const allBtns = Array.from(document.querySelectorAll('button, a.btn, a'));
                            for (const b of allBtns) {
                                const t = (b.innerText || '').toLowerCase().trim();
                                if (t === 'load more' || t === 'carregar mais' || t === 'show more' || t === 'ver mais' || t === 'more albums' || t === 'more videos') {
                                    try { b.click(); return; } catch (_) {}
                                }
                            }
                        }""")

                    # Aguarda 1 segundo para a última leva de imagens assentar
                    await asyncio.sleep(1.0)

                    # Extração final completa do DOM acumulado
                    rendered_html = await page.content()
                    soup_dyn = BeautifulSoup(rendered_html, "html.parser")
                    for tag_a in soup_dyn.find_all("a", href=True):
                        if req.max_related and req.max_related > 0 and len(results) >= req.max_related:
                            break
                        raw_href = tag_a["href"].strip()
                        full_sub = MultiAlbumService.unpack_redirect_url(raw_href, req.url)
                        if not full_sub or full_sub in seen_urls:
                            continue
                        if any(full_sub.lower().endswith(ext) for ext in [".jpg", ".png", ".webp", ".gif", ".css", ".js", ".svg"]):
                            continue
                        if any(noise in full_sub.lower() for noise in ["login", "terms", "privacy", "dmca", "contact", "join", "signup", "/advertising", "/faq", "/support"]):
                            continue

                        path_lower = urllib.parse.urlparse(full_sub).path.lower()
                        has_album_pattern = any(p in path_lower for p in ALBUM_PATTERNS)
                        has_thumb = (tag_a.find("img") is not None) or ("background" in tag_a.get("style", "").lower())

                        if has_album_pattern or (has_thumb and len(path_lower) > 3):
                            title = MultiAlbumService.extract_title_from_tag(tag_a, full_sub, len(results) + 1)
                            thumb = MultiAlbumService.extract_thumbnail(tag_a, req.url)
                            results.append(DiscoveredAlbumItem(
                                title=title,
                                url=full_sub,
                                thumbnail_url=thumb,
                                source_type="related"
                            ))
                            seen_urls.add(full_sub)
                finally:
                    await browser.close()
            except Exception:
                pass

        # -------------------------------------------------------------
        # PASSO B: Rota Canônica de Performer (se especificada)
        # -------------------------------------------------------------
        if req.performer_name:
            slug = MultiAlbumService.extract_performer_slug(req.performer_name)
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
                for pattern in CANONICAL_PERFORMER_ROUTES:
                    test_url = f"{origin_url}{pattern.format(slug=slug)}"
                    try:
                        resp_m = await client.get(test_url)
                        if resp_m.status_code == 200 and slug in resp_m.url.lower():
                            soup_m = BeautifulSoup(resp_m.text, "html.parser")
                            performer_found_count = 0
                            for tag_a in soup_m.find_all("a", href=True):
                                if req.max_related and req.max_related > 0 and performer_found_count >= req.max_related + 2:
                                    break
                                    
                                raw_href = tag_a["href"].strip()
                                full_sub = MultiAlbumService.unpack_redirect_url(raw_href, test_url)
                                if full_sub in seen_urls:
                                    continue
                                path_lower = urllib.parse.urlparse(full_sub).path.lower()
                                if any(p in path_lower for p in ALBUM_PATTERNS) and slug in full_sub.lower():
                                    title = tag_a.get("title", "").strip() or tag_a.get_text().strip() or f"Álbum de {req.performer_name}"
                                    thumb = MultiAlbumService.extract_thumbnail(tag_a, test_url)

                                    results.append(DiscoveredAlbumItem(
                                        title=title[:80],
                                        url=full_sub,
                                        thumbnail_url=thumb,
                                        source_type="performer_page"
                                    ))
                                    seen_urls.add(full_sub)
                                    performer_found_count += 1
                            
                            if any(r.source_type == "performer_page" for r in results):
                                break
                    except Exception:
                        continue

        # -------------------------------------------------------------
        # PASSO C: Busca Interna no Site (Fallback se performer não achar)
        # -------------------------------------------------------------
        if req.performer_name and not any(r.source_type == "performer_page" for r in results):
            query_enc = urllib.parse.quote_plus(req.performer_name.strip())
            slug = MultiAlbumService.extract_performer_slug(req.performer_name)
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
                for pattern in SEARCH_QUERY_ROUTES:
                    search_url = pattern.format(origin=origin_url, query=query_enc)
                    try:
                        resp_s = await client.get(search_url)
                        if resp_s.status_code == 200:
                            soup_s = BeautifulSoup(resp_s.text, "html.parser")
                            search_found_count = 0
                            for tag_a in soup_s.find_all("a", href=True):
                                if req.max_related and req.max_related > 0 and search_found_count >= req.max_related + 2:
                                    break
                                    
                                raw_href = tag_a["href"].strip()
                                full_sub = MultiAlbumService.unpack_redirect_url(raw_href, search_url)
                                if full_sub in seen_urls:
                                    continue
                                path_lower = urllib.parse.urlparse(full_sub).path.lower()
                                if any(p in path_lower for p in ALBUM_PATTERNS):
                                    if slug in full_sub.lower() or slug.replace("-", " ") in (tag_a.get("title", "") or tag_a.get_text() or "").lower():
                                        title = tag_a.get("title", "").strip() or tag_a.get_text().strip() or f"Resultado de Pesquisa: {req.performer_name}"
                                        thumb = MultiAlbumService.extract_thumbnail(tag_a, search_url)

                                        results.append(DiscoveredAlbumItem(
                                            title=title[:80],
                                            url=full_sub,
                                            thumbnail_url=thumb,
                                            source_type="search"
                                        ))
                                        seen_urls.add(full_sub)
                                        search_found_count += 1
                                        
                            if any(r.source_type == "search" for r in results):
                                break
                    except Exception:
                        continue

    @staticmethod
    async def stream_discover_albums(req: DiscoveryRequest) -> AsyncGenerator[str, None]:
        results: List[DiscoveredAlbumItem] = []
        seen_urls = {req.url.rstrip("/")}

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        }

        ALBUM_PATTERNS = [
            "/galleries/", "/gallery/", "/album/", "/albums/", "/g/", "/post/", "/posts/",
            "/thread/", "/threads/", "/photo/", "/photos/", "/set/", "/sets/", "/pics/",
            "/pictures/", "/v/", "/video/", "/videos/", "/watch/", "/item/", "/tube/videos/"
        ]

        parsed_origin = urllib.parse.urlparse(req.url)
        origin_url = f"{parsed_origin.scheme}://{parsed_origin.netloc}"
        netloc = parsed_origin.netloc.lower()
        is_unlimited = (req.max_related == 0)

        yield f"data: {json.dumps({'type': 'status', 'message': 'Conectando ao site...', 'count': 0})}\n\n"

        # -----------------------------------------------------------------
        # FAST-TRACK PORNPICS
        # -----------------------------------------------------------------
        if "pornpics.com" in netloc and "/galleries/" in req.url:
            gid_m = re.search(r'-([0-9]{6,10})/?$', req.url)
            if gid_m:
                gid = gid_m.group(1)
                try:
                    async with httpx.AsyncClient(timeout=10.0, headers=headers) as pclient:
                        p_resp = await pclient.post(
                            "https://rel.pornpics.com/related/related_json.php",
                            json={"lang": "en", "gid": gid, "limit": 400},
                            headers={"Referer": req.url}
                        )
                        if p_resp.status_code == 200:
                            data = p_resp.json()
                            if isinstance(data, list):
                                for item in data:
                                    if req.max_related and req.max_related > 0 and len(results) >= req.max_related:
                                        break
                                    g_url = (item.get("g_url") or "").rstrip("/")
                                    if g_url and g_url not in seen_urls:
                                        album_obj = DiscoveredAlbumItem(
                                            title=(item.get("desc") or "Galeria Relacionada")[:90],
                                            url=g_url,
                                            thumbnail_url=item.get("t_url_460") or item.get("t_url"),
                                            source_type="related"
                                        )
                                        results.append(album_obj)
                                        seen_urls.add(g_url)
                                        yield f"data: {json.dumps({'type': 'album', 'album': album_obj.dict(), 'count': len(results)})}\n\n"
                                        await asyncio.sleep(0.01)
                except Exception:
                    pass

        # -----------------------------------------------------------------
        # NAVEGADOR COM HARDWARE SCROLL STREAMING (Playwright)
        # -----------------------------------------------------------------
        needs_deep_scroll = is_unlimited or (len(results) < (req.max_related or 20))
        if needs_deep_scroll:
            try:
                try:
                    from ..browser.engine import BrowserEngine
                except (ImportError, ValueError):
                    from src.browser.engine import BrowserEngine
                browser = BrowserEngine(headless=True)
                await browser.start()
                try:
                    page = browser.main_page

                    # Fila para transmitir itens interceptados via XHR/JSON
                    pending_stream_items: List[DiscoveredAlbumItem] = []

                    async def on_dynamic_response(res):
                        try:
                            if "json" in res.headers.get("content-type", "").lower():
                                data = await res.json()
                                items_to_parse = []
                                if isinstance(data, list):
                                    items_to_parse = data
                                elif isinstance(data, dict):
                                    for key in ["data", "items", "galleries", "albums", "videos", "results"]:
                                        if isinstance(data.get(key), list):
                                            items_to_parse = data[key]
                                            break

                                for item in items_to_parse:
                                    if isinstance(item, dict) and any(k in item for k in ["g_url", "url", "gallery", "gallery_url", "link"]):
                                        u = (item.get("g_url") or item.get("url") or item.get("gallery") or item.get("gallery_url") or item.get("link") or "").rstrip("/")
                                        if u and u not in seen_urls:
                                            t = item.get("t_url_460") or item.get("t_url") or item.get("thumb") or item.get("thumbnail") or item.get("image")
                                            d = item.get("desc") or item.get("title") or item.get("name") or "Galeria Relacionada"
                                            album_obj = DiscoveredAlbumItem(
                                                title=str(d)[:90],
                                                url=u,
                                                thumbnail_url=t,
                                                source_type="related"
                                            )
                                            results.append(album_obj)
                                            seen_urls.add(u)
                                            pending_stream_items.append(album_obj)
                        except Exception:
                            pass

                    page.on("response", on_dynamic_response)
                    yield f"data: {json.dumps({'type': 'status', 'message': 'Abrindo página no navegador...', 'count': len(results)})}\n\n"
                    await browser.navigate(req.url)
                    await browser.dismiss_age_gates_and_popups(page)

                    yield f"data: {json.dumps({'type': 'status', 'message': 'Iniciando rolagem contínua (PageDown)...', 'count': len(results)})}\n\n"

                    total_cycles = 50 if is_unlimited else 20
                    for cycle in range(total_cycles):
                        if req.max_related and req.max_related > 0 and len(results) >= req.max_related:
                            break

                        # Transmite qualquer item interceptado do XHR/JSON
                        while pending_stream_items:
                            popped = pending_stream_items.pop(0)
                            yield f"data: {json.dumps({'type': 'album', 'album': popped.dict(), 'count': len(results)})}\n\n"

                        # Hardware Scroll
                        await page.keyboard.press("PageDown")
                        await page.keyboard.press("PageDown")
                        await page.mouse.wheel(0, 1500)
                        await asyncio.sleep(0.35)

                        # Auto-click em botões de "Load More"
                        await page.evaluate("""() => {
                            const selectors = ['.load-more', '#load-more', '.btn-load-more', '.pagination-load-more'];
                            for (const s of selectors) {
                                const el = document.querySelector(s);
                                if (el && el.offsetParent !== null) { try { el.click(); return; } catch (_) {} }
                            }
                            const allBtns = Array.from(document.querySelectorAll('button, a.btn, a'));
                            for (const b of allBtns) {
                                const t = (b.innerText || '').toLowerCase().trim();
                                if (t === 'load more' || t === 'carregar mais' || t === 'show more' || t === 'ver mais') {
                                    try { b.click(); return; } catch (_) {}
                                }
                            }
                        }""")

                        # A cada 2 ciclos, raspa os novos links injetados no DOM e envia ao vivo
                        if cycle % 2 == 0 or cycle == total_cycles - 1:
                            rendered_html = await page.content()
                            soup_dyn = BeautifulSoup(rendered_html, "html.parser")
                            for tag_a in soup_dyn.find_all("a", href=True):
                                if req.max_related and req.max_related > 0 and len(results) >= req.max_related:
                                    break
                                raw_href = tag_a["href"].strip()
                                full_sub = MultiAlbumService.unpack_redirect_url(raw_href, req.url)
                                if not full_sub or full_sub in seen_urls:
                                    continue
                                if any(full_sub.lower().endswith(ext) for ext in [".jpg", ".png", ".webp", ".gif", ".css", ".js", ".svg"]):
                                    continue
                                if any(noise in full_sub.lower() for noise in ["login", "terms", "privacy", "dmca", "contact", "join", "signup", "/advertising", "/faq", "/support"]):
                                    continue

                                path_lower = urllib.parse.urlparse(full_sub).path.lower()
                                has_album_pattern = any(p in path_lower for p in ALBUM_PATTERNS)
                                has_thumb = (tag_a.find("img") is not None) or ("background" in tag_a.get("style", "").lower())

                                if has_album_pattern or (has_thumb and len(path_lower) > 3):
                                    title = MultiAlbumService.extract_title_from_tag(tag_a, full_sub, len(results) + 1)
                                    thumb = MultiAlbumService.extract_thumbnail(tag_a, req.url)
                                    album_obj = DiscoveredAlbumItem(
                                        title=title,
                                        url=full_sub,
                                        thumbnail_url=thumb,
                                        source_type="related"
                                    )
                                    results.append(album_obj)
                                    seen_urls.add(full_sub)
                                    yield f"data: {json.dumps({'type': 'album', 'album': album_obj.dict(), 'count': len(results)})}\n\n"

                            yield f"data: {json.dumps({'type': 'status', 'message': f'Rolando página... ({len(results)} álbuns encontrados)', 'count': len(results)})}\n\n"

                    # Descarrega qualquer item restante na fila
                    while pending_stream_items:
                        popped = pending_stream_items.pop(0)
                        yield f"data: {json.dumps({'type': 'album', 'album': popped.dict(), 'count': len(results)})}\n\n"

                finally:
                    await browser.close()
            except Exception as e:
                pass

        yield f"data: {json.dumps({'type': 'done', 'total': len(results)})}\n\n"

    @staticmethod
    async def discover_albums(req: DiscoveryRequest) -> DiscoveryResponse:
        results: List[DiscoveredAlbumItem] = []
        async for chunk in MultiAlbumService.stream_discover_albums(req):
            if chunk.startswith("data: "):
                try:
                    payload = json.loads(chunk[6:].strip())
                    if payload.get("type") == "album":
                        results.append(DiscoveredAlbumItem(**payload["album"]))
                except Exception:
                    pass
        return DiscoveryResponse(
            source_url=req.url,
            target_performer=req.performer_name,
            discovered_albums=results,
            total_found=len(results)
        )

multi_album_service = MultiAlbumService()

@router.post("/discover-stream")
async def discover_albums_stream_endpoint(req: DiscoveryRequest):
    """Transmite álbuns encontrados em tempo real via Server-Sent Events (SSE)."""
    if not req.url or not req.url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL inválida fornecida.")
    return StreamingResponse(multi_album_service.stream_discover_albums(req), media_type="text/event-stream")

@router.post("/discover", response_model=DiscoveryResponse)
async def discover_albums_endpoint(req: DiscoveryRequest):
    """Rota isolada para descobrir álbuns secundários e de modelos sem travar a navegação principal."""
    if not req.url or not req.url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL inválida fornecida.")
    return await multi_album_service.discover_albums(req)

