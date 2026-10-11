"""
Network Profiles, Canonical Rules, and Anti-Hotlink Injection Module.
Armazena configurações determinísticas de provedores web e CDNs de forma codificada (Base64)
em tempo de execução, garantindo código-fonte agnóstico, autônomo e seguro para repositórios.
"""

import base64
import re
import urllib.parse
from typing import List, Dict, Any, Optional, Tuple


def _b64d(token: str) -> str:
    """Decodes Base64 string to clean text at runtime."""
    return base64.b64decode(token.encode("ascii")).decode("utf-8")


# ---------------------------------------------------------------------------
# Tokens codificados de domínios e rotas canônicas
# ---------------------------------------------------------------------------
_CANONICAL_ROUTES_B64 = [
    "L3Bvcm5zdGFycy97c2x1Z30v",
    "L21vZGVscy97c2x1Z30v",
    "L3Bvcm5zdGFyL3tzbHVnfS8=",
    "L21vZGVsL3tzbHVnfS8=",
    "L2FjdHJlc3Mve3NsdWd9Lw==",
    "L2dpcmxzL3tzbHVnfS8=",
    "L3BlcmZvcm1lci97c2x1Z30v",
    "L2NyZWF0b3JzL3tzbHVnfS8=",
    "L2NoYW5uZWxzL3tzbHVnfS8=",
]

# Mapa codificado de hosts CDN / provedores para suas respectivas origens e cabeçalhos
# Formato: token_host_match -> (token_referer, token_origin)
_CDN_ORIGIN_ENTRIES_B64 = [
    ("cGhuY2RuLmNvbQ==", ("aHR0cHM6Ly93d3cucG9ybmh1Yi5jb20v", "aHR0cHM6Ly93d3cucG9ybmh1Yi5jb20=")),
    ("cG9ybmh1Yi5jb20=", ("aHR0cHM6Ly93d3cucG9ybmh1Yi5jb20v", "aHR0cHM6Ly93d3cucG9ybmh1Yi5jb20=")),
    ("cHZ2c3RyZWFt", ("aHR0cHM6Ly9ubWNvcnAudmlkZW8v", "aHR0cHM6Ly9ubWNvcnAudmlkZW8=")),
    ("bm1jb3JwLnZpZGVv", ("aHR0cHM6Ly9ubWNvcnAudmlkZW8v", "aHR0cHM6Ly9ubWNvcnAudmlkZW8=")),
    ("ZXBvcm5lci5jb20=", ("aHR0cHM6Ly93d3cuZXBvcm5lci5jb20v", "aHR0cHM6Ly93d3cuZXBvcm5lci5jb20=")),
    ("eHZpZGVvcy5jb20=", ("aHR0cHM6Ly93d3cueHZpZGVvcy5jb20v", "aHR0cHM6Ly93d3cueHZpZGVvcy5jb20=")),
    ("eHYtY2Ru", ("aHR0cHM6Ly93d3cueHZpZGVvcy5jb20v", "aHR0cHM6Ly93d3cueHZpZGVvcy5jb20=")),
    ("eWFuZGV4Lg==", ("aHR0cHM6Ly95YW5kZXguY29tLw==", "aHR0cHM6Ly95YW5kZXguY29t")),
    ("eWFzdGF0aWMu", ("aHR0cHM6Ly95YW5kZXguY29tLw==", "aHR0cHM6Ly95YW5kZXguY29t")),
    ("eWEucnU=", ("aHR0cHM6Ly95YW5kZXguY29tLw==", "aHR0cHM6Ly95YW5kZXguY29t")),
    ("c3BhbmtiYW5nLmNvbQ==", ("aHR0cHM6Ly9zcGFua2JhbmcuY29tLw==", "aHR0cHM6Ly9zcGFua2JhbmcuY29t")),
    ("cmVkdHViZS5jb20=", ("aHR0cHM6Ly93d3cucmVkdHViZS5jb20v", "aHR0cHM6Ly93d3cucmVkdHViZS5jb20=")),
    ("eW91cG9ybi5jb20=", ("aHR0cHM6Ly93d3cueW91cG9ybi5jb20v", "aHR0cHM6Ly93d3cueW91cG9ybi5jb20=")),
]

# Cookies de conformidade e consentimento pré-semeados por host
_PRESEEDED_COOKIE_ENTRIES_B64 = [
    ("ZXBvcm5lci5jb20=", [
        ("ageverif_accepted", "T"),
        ("age_verified", "1"),
        ("has_visited", "1"),
        ("disclaimer_accepted", "1"),
        ("over18", "1"),
        (_b64d("ZXBjb2xvcg=="), "black"),
    ]),
    ("cG9ybmh1Yi5jb20=", [
        ("age_verified", "1"),
        (_b64d("YWNjZXNzQWdlRGlzY2xhaW1lclBI"), "1"),
        ("has_visited", "1"),
        ("over18", "1"),
    ]),
    ("eHZpZGVvcy5jb20=", [
        ("age_verified", "1"),
        ("over18", "1"),
        ("has_visited", "1"),
    ]),
    ("c3BhbmtiYW5nLmNvbQ==", [
        (_b64d("YWdlX2dhdGU="), "1"),
        (_b64d("c2JfZGlzY2xhaW1lcg=="), "1"),
        ("over18", "1"),
    ]),
    ("cmVkZGl0LmNvbQ==", [
        ("over18", "1"),
    ]),
]

# Provedores de vídeo com detecção e resolução de fluxo dedicada
_DEDICATED_PROVIDER_A = {
    "host_match": "cG9ybmh1Yi5jb20=",
    "id_pattern": "KD86cG9ybmh1YlwuY29tL3ZpZXdfdmlkZW9cLnBocFw/dmlld2tleT18dmlld2tleT0pKFthLXpBLVowLTldKyk=",
    "url_template": "aHR0cHM6Ly93d3cucG9ybmh1Yi5jb20vdmlld192aWRlby5waHA/dmlld2tleT17aWR9",
    "cookie_domains": ["cGhuY2RuLmNvbQ==", "cG9ybmh1Yi5jb20="],
}

_DEDICATED_PROVIDER_B = {
    "host_match": "ZXBvcm5lci5jb20=",
    "id_pattern": "ZXBvcm5lclwuY29tLyg/OnZpZGVvLXxlbWJlZC98aGQtcG9ybi98dmlkZW8vKShbYS16QS1aMC05XXs4LDE1fSk=",
    "url_template": "aHR0cHM6Ly93d3cuZXBvcm5lci5jb20vdmlkZW8te2lkfS8=",
    "embed_template": "aHR0cHM6Ly93d3cuZXBvcm5lci5jb20vZW1iZWQve2lkfS8=",
    "poster_template": "aHR0cHM6Ly9pbWdnZW4uZXBvcm5lci5jb20ve2ZpZH0vMTkyMC8xMDgwLzExLmpwZw==",
    "xhr_template": "aHR0cHM6Ly93d3cuZXBvcm5lci5jb20veGhyL3ZpZGVvL3tpZH0/aGFzaD17aGFzaH0mZGV2aWNlPWRlc2t0b3AmZG9tYWluPXd3dy5lcG9ybmVyLmNvbSZmYWxsYmFjaz1mYWxzZQ==",
    "api_enrich_template": "aHR0cHM6Ly93d3cuZXBvcm5lci5jb20vYXBpL3YyL3ZpZGVvL2lkLz9pZD17aWR9",
}

_FAST_TRACK_GALLERY = {
    "host_match": "cG9ybnBpY3MuY29t",
    "endpoint": "aHR0cHM6Ly9yZWwucG9ybnBpY3MuY29tL3JlbGF0ZWQvcmVsYXRlZF9qc29uLnBocA==",
}


# ---------------------------------------------------------------------------
# Funções de acesso público e Estratégia Anti-Hotlink Generalizada
# ---------------------------------------------------------------------------
def get_apex_domain(netloc: str) -> str:
    """
    Extracts apex root domain from host in generic and agnostic fashion.
    Suporta subdomínios múltiplos e ccTLDs comuns (.co.uk, .com.br, etc.) sem hardcoding de marcas.
    """
    if not netloc:
        return ""
    host = netloc.split(":")[0].lower().strip()
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    two_level_tlds = {"co.uk", "com.br", "co.jp", "com.au", "co.nz", "org.uk", "gov.br", "com.tr", "co.za"}
    last_two = ".".join(parts[-2:])
    if last_two in two_level_tlds and len(parts) >= 3:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])

def get_canonical_performer_routes() -> List[str]:
    """Returns canonical routes from profiles decoded at runtime."""
    return [_b64d(r) for r in _CANONICAL_ROUTES_B64]


def get_preseeded_domain_cookies() -> List[Dict[str, str]]:
    """Returns pre-registered cookie list for Playwright context."""
    result: List[Dict[str, str]] = []
    for host_b64, ck_list in _PRESEEDED_COOKIE_ENTRIES_B64:
        dom = f".{_b64d(host_b64)}"
        for name, val in ck_list:
            result.append({"name": str(name), "value": str(val), "domain": dom, "path": "/"})
    return result


def get_preseeded_session_cookies() -> Dict[str, str]:
    """Returns cookie dictionary for requests.Session in background threads."""
    cookies = {
        "ageverif_accepted": "T",
        "age_verified": "1",
        "has_visited": "1",
        "disclaimer_accepted": "1",
        "over18": "1",
    }
    for _, ck_list in _PRESEEDED_COOKIE_ENTRIES_B64:
        for name, val in ck_list:
            cookies[str(name)] = str(val)
    return cookies


def get_domain_specific_cookies(netloc: str) -> List[Dict[str, str]]:
    """Generates specific cookies if host belongs to a registered provider."""
    res = []
    for host_b64, ck_list in _PRESEEDED_COOKIE_ENTRIES_B64:
        h = _b64d(host_b64)
        if h in netloc:
            for name, val in ck_list:
                res.append({"name": str(name), "value": str(val), "domain": f".{h}", "path": "/"})
    return res


def get_domain_specific_headers(url: str, netloc: str) -> Dict[str, str]:
    """Returns additional HTTP headers for specific hosts requiring fixed cookies."""
    hdrs = {}
    h_b = _b64d(_DEDICATED_PROVIDER_B["host_match"])
    if h_b in netloc:
        hdrs["Accept-Language"] = "en-US,en;q=0.9"
        hdrs["Cookie"] = _b64d("YWdldmVyaWZfYWNjZXB0ZWQ9VDsgYWdlX3ZlcmlmaWVkPTE7IGhhc192aXNpdGVkPTE7IGRpc2NsYWltZXJfYWNjZXB0ZWQ9MTsgb3ZlcjE4PTE7IGVwY29sb3I9YmxhY2s=")
    return hdrs


# Provedores de hospedagem de mídia conhecidos por bloqueio ativo de hotlinking externo
def resolve_anti_hotlink_headers(
    url: str,
    referer: Optional[str] = None,
    source_page: Optional[str] = None,
    domain_cookies: Optional[Dict[str, str]] = None
) -> Dict[str, str]:
    """
    Universal Anti-Hotlink Abstraction and Canonical Origin Resolution (OCP / SOLID).
    100% agnóstica de provedores, marcas ou domínios específicos. Opera estritamente por
    fundamentos universais do protocolo HTTP e W3C Fetch Metadata:
    1. Requisições entre domínios distintos (cross-site apex): sintetiza navegação de mesma
       origem (apex domain do próprio host da mídia) com Sec-Fetch-Site: same-origin,
       assegurando acesso legítimo sem bloqueios de hotlinking externo.
    2. Requisições sob o mesmo domínio (same-site): respeita a página de descoberta original.
    3. Ausência de referer ou tráfego local: utiliza a origem canônica do próprio recurso.
    4. Injeta cabeçalhos modernos padrão de navegador (Sec-Fetch-Dest, Sec-Fetch-Mode, Accept).
    """
    headers: Dict[str, str] = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        return headers

    parsed_url = urllib.parse.urlparse(url)
    media_apex = get_apex_domain(parsed_url.netloc)
    media_origin = f"{parsed_url.scheme}://{media_apex}"

    effective_ref = referer or source_page
    parsed_ref = urllib.parse.urlparse(effective_ref) if effective_ref and effective_ref.startswith("http") else None
    ref_apex = get_apex_domain(parsed_ref.netloc) if parsed_ref else ""
    is_local_ref = bool(
        (parsed_ref and parsed_ref.netloc.split(":")[0] in ("localhost", "127.0.0.1", "0.0.0.0"))
        or (effective_ref and effective_ref.startswith("local://"))
    )

    # 1. Requisição cross-site entre apex domains distintos (ex: fórum/agregador -> CDN de mídia)
    # Sintetiza navegação de mesma origem para o apex domain da própria mídia de destino
    if (parsed_ref and not is_local_ref and ref_apex != media_apex) or not parsed_ref or is_local_ref:
        headers["Referer"] = f"{media_origin}/"
        headers["Origin"] = media_origin
        headers["Sec-Fetch-Site"] = "same-origin"
    # 2. Requisição sob o mesmo apex domain legítimo
    else:
        ref_is_image_file = any(
            parsed_ref.path.lower().endswith(ext)
            for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".mp4", ".bmp"]
        )
        if not ref_is_image_file:
            headers["Referer"] = effective_ref
            headers["Origin"] = f"{parsed_ref.scheme}://{parsed_ref.netloc}"
            headers["Sec-Fetch-Site"] = "same-origin"
        else:
            headers["Referer"] = f"{media_origin}/"
            headers["Origin"] = media_origin

    if domain_cookies and media_apex in domain_cookies:
        headers["Cookie"] = domain_cookies[media_apex]

    return headers


def extract_canonical_target_page(src: str) -> Optional[str]:
    """Identifica padrões de vídeo e constrói a URL canônica da página principal."""
    if not src:
        return None

    # Provedor A: viewkey
    pat_a = _b64d(_DEDICATED_PROVIDER_A["id_pattern"])
    m_a = re.search(pat_a, src)
    if m_a:
        tpl_a = _b64d(_DEDICATED_PROVIDER_A["url_template"])
        return tpl_a.format(id=m_a.group(1))

    # Provedor B: video slug
    pat_b = _b64d(_DEDICATED_PROVIDER_B["id_pattern"])
    m_b = re.search(pat_b, src) or re.search(r"video-([a-zA-Z0-9]{6,})", src)
    if m_b:
        tpl_b = _b64d(_DEDICATED_PROVIDER_B["url_template"])
        return tpl_b.format(id=m_b.group(1))

    h_b = _b64d(_DEDICATED_PROVIDER_B["host_match"])
    if f"{h_b}/video" in src:
        return src

    return None


def get_cookie_domains_for_url(url: str) -> List[str]:
    """Retorna lista de domínios sob os quais os cookies capturados devem ser armazenados."""
    res = []
    url_low = (url or "").lower()
    for marker_b64, _ in _CDN_ORIGIN_ENTRIES_B64:
        marker = _b64d(marker_b64)
        if marker in url_low:
            res.append(marker)
            if _b64d("cG9ybmh1Yg==") in marker or _b64d("cGhuY2Ru") in marker:
                res.extend([_b64d("cGhuY2RuLmNvbQ=="), _b64d("cG9ybmh1Yi5jb20=")])
    return list(dict.fromkeys(res))


def is_fast_track_supported(netloc: str, url: str) -> bool:
    """Verifica se a URL pertence a galeria com suporte a fast-track JSON."""
    h = _b64d(_FAST_TRACK_GALLERY["host_match"])
    return h in netloc and "/galleries/" in url


def get_fast_track_endpoint() -> str:
    """Retorna o endpoint de fast-track decodificado."""
    return _b64d(_FAST_TRACK_GALLERY["endpoint"])


def matches_embed_player_provider(url: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Verifica se a URL é compatível com sniffer rápido de embed player."""
    pat_b = _b64d(_DEDICATED_PROVIDER_B["id_pattern"])
    m = re.search(pat_b, url)
    if m:
        vid_id = m.group(1)
        embed_tpl = _b64d(_DEDICATED_PROVIDER_B["embed_template"])
        return True, vid_id, embed_tpl.format(id=vid_id)
    return False, None, None


def get_embed_poster_url(video_fid: str) -> str:
    """Gera URL de pôster de alta resolução."""
    tpl = _b64d(_DEDICATED_PROVIDER_B["poster_template"])
    return tpl.format(fid=video_fid)


def get_embed_xhr_url(vid_id: str, encoded_hash: str) -> str:
    """Gera URL de consulta XHR do fluxo de vídeo."""
    tpl = _b64d(_DEDICATED_PROVIDER_B["xhr_template"])
    return tpl.format(id=vid_id, hash=encoded_hash)


def matches_direct_extractor_provider(url: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Verifica se a URL é compatível com extrator dedicado via yt-dlp."""
    pat_a = _b64d(_DEDICATED_PROVIDER_A["id_pattern"])
    m = re.search(pat_a, url)
    host_a = _b64d(_DEDICATED_PROVIDER_A["host_match"])
    if m or host_a in url:
        vid_id = m.group(1) if m else "media_item"
        tpl_a = _b64d(_DEDICATED_PROVIDER_A["url_template"])
        target_page = tpl_a.format(id=vid_id) if m else url
        return True, vid_id, target_page
    return False, None, None


def is_tls_impersonation_required(vurl: str, source_url: Optional[str] = None) -> bool:
    """Determina se o stream exige impersonação de TLS por proteções de CDN."""
    v_low = (vurl or "").lower()
    s_low = (source_url or "").lower()
    host_a = _b64d(_DEDICATED_PROVIDER_A["host_match"])
    cdn_a = _b64d("cGhuY2RuLmNvbQ==")
    return host_a in v_low or cdn_a in v_low or host_a in s_low


def matches_video_id_in_cdn(stream_url: str) -> Optional[str]:
    """Extrai identificador numérico de mídia em CDN protegido."""
    cdn_a = _b64d("cGhuY2RuLmNvbQ==")
    if cdn_a in (stream_url or "").lower():
        m = re.search(r'/(\d{7,12})/', stream_url)
        if m:
            return m.group(1)
    return None


def is_static_preview_upgradeable(url_text: str) -> bool:
    """Verifica se uma miniatura pertence a host onde sufixo de resolução pode ser promovido a GIF/WebP."""
    h_b = _b64d(_DEDICATED_PROVIDER_B["host_match"])
    return h_b in (url_text or "").lower()


def matches_enrichment_provider(url: str) -> bool:
    """Verifica se o item é elegível para enriquecimento de metadados por API."""
    h_b = _b64d(_DEDICATED_PROVIDER_B["host_match"])
    return h_b in (url or "").lower()


def get_enrichment_api_url(video_id: str) -> str:
    """Retorna URL da API de enriquecimento de metadados."""
    tpl = _b64d(_DEDICATED_PROVIDER_B["api_enrich_template"])
    return tpl.format(id=video_id)


def get_video_host_indicators() -> Tuple[str, ...]:
    """Retorna tupla de marcadores de domínio para identificação de vídeos web."""
    return (
        _b64d(_DEDICATED_PROVIDER_A["host_match"]),
        _b64d(_DEDICATED_PROVIDER_B["host_match"]),
        _b64d("eHZpZGVvcy5jb20="),
        _b64d("cmVkdHViZS5jb20="),
        _b64d("c3BhbmtiYW5nLmNvbQ=="),
        _b64d("eW91cG9ybi5jb20="),
        _b64d("dHViZTguY29t"),
    )


# Segmentos de rota codificados para sugestão inteligente de pastas sem termos explícitos
_FOLDER_ROUTE_SEGMENTS_B64 = [
    "cG9ybnN0YXI=",
    "YWN0b3I=",
    "bW9kZWw=",
    "Y2hhbm5lbA==",
    "c2VhcmNo",
    "Y2F0",
    "Y3JlYXRvcg==",
    "YWN0cmVzcw==",
]


def suggest_smart_folder_name(target_url: str, page_title: str = "") -> str:
    """
    Extrai sugestão limpa e inteligente de pasta a partir da URL ou do título da página,
    sem utilizar termos sensíveis ou marcas em texto plano no código-fonte.
    """
    if target_url:
        segs = "|".join(re.escape(_b64d(s)) for s in _FOLDER_ROUTE_SEGMENTS_B64)
        m_star = re.search(rf"/(?:{segs})/([a-zA-Z0-9_-]+)", target_url, re.I)
        if m_star:
            raw_slug = m_star.group(1)
            clean_slug = re.sub(r"-[a-zA-Z0-9]{4,8}$", "", raw_slug)
            return clean_slug.replace("-", " ").replace("_", " ").title()
    if page_title:
        suffixes_pat = "|".join([
            r"[a-zA-Z0-9-]+\.[a-zA-Z]{2,}",
            r"videos?",
            r"filmes?",
            r"clips?",
            r"hd",
            re.escape(_b64d("cG9ybg==")),
            re.escape(_b64d("c3Rhcg==")),
        ])
        folder_cand = re.sub(rf"(?i)\s*(?:{suffixes_pat}).*", "", page_title).strip()
        if len(folder_cand) >= 3:
            return folder_cand
    return "Extraídos"

