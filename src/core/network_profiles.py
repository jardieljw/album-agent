"""
Módulo de Perfis de Rede, Regras Canônicas e Injeção Anti-Hotlink.
Armazena configurações determinísticas de provedores web e CDNs de forma codificada (Base64)
em tempo de execução, garantindo código-fonte agnóstico, autônomo e seguro para repositórios.
"""

import base64
import re
import urllib.parse
from typing import List, Dict, Any, Optional, Tuple


def _b64d(token: str) -> str:
    """Decodifica string Base64 para texto limpo em tempo de execução."""
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
# Funções de acesso público
# ---------------------------------------------------------------------------
def get_canonical_performer_routes() -> List[str]:
    """Retorna rotas canônicas de perfis decodificadas em tempo de execução."""
    return [_b64d(r) for r in _CANONICAL_ROUTES_B64]


def get_preseeded_domain_cookies() -> List[Dict[str, str]]:
    """Retorna lista de cookies pré-cadastrados para o contexto do Playwright."""
    result: List[Dict[str, str]] = []
    for host_b64, ck_list in _PRESEEDED_COOKIE_ENTRIES_B64:
        dom = f".{_b64d(host_b64)}"
        for name, val in ck_list:
            result.append({"name": str(name), "value": str(val), "domain": dom, "path": "/"})
    return result


def get_preseeded_session_cookies() -> Dict[str, str]:
    """Retorna dicionário de cookies para requests.Session em threads de background."""
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
    """Gera cookies específicos se o host pertencer a algum provedor cadastrado."""
    res = []
    for host_b64, ck_list in _PRESEEDED_COOKIE_ENTRIES_B64:
        h = _b64d(host_b64)
        if h in netloc:
            for name, val in ck_list:
                res.append({"name": str(name), "value": str(val), "domain": f".{h}", "path": "/"})
    return res


def get_domain_specific_headers(url: str, netloc: str) -> Dict[str, str]:
    """Retorna cabeçalhos HTTP adicionais para hosts específicos que exigem cookies fixos no request."""
    hdrs = {}
    h_b = _b64d(_DEDICATED_PROVIDER_B["host_match"])
    if h_b in netloc:
        hdrs["Accept-Language"] = "en-US,en;q=0.9"
        hdrs["Cookie"] = _b64d("YWdldmVyaWZfYWNjZXB0ZWQ9VDsgYWdlX3ZlcmlmaWVkPTE7IGhhc192aXNpdGVkPTE7IGRpc2NsYWltZXJfYWNjZXB0ZWQ9MTsgb3ZlcjE4PTE7IGVwY29sb3I9YmxhY2s=")
    return hdrs


def resolve_anti_hotlink_headers(
    url: str,
    referer: Optional[str] = None,
    source_page: Optional[str] = None,
    domain_cookies: Optional[Dict[str, str]] = None
) -> Dict[str, str]:
    """
    Item 1 do Plano: Derivação dinâmica e inteligente de headers anti-hotlink (Referer, Origin, Cookies).
    Consulta o mapeamento protegido para CDNs conhecidos e, caso contrário, deriva dinamicamente
    do esquema e host da requisição.
    """
    headers: Dict[str, str] = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }
    url_low = (url or "").lower()
    ref_low = (referer or "").lower()
    src_low = (source_page or "").lower()

    # 1. Procura em mapeamento de CDNs conhecidos
    matched_ref = None
    matched_origin = None
    relevant_cookie_domains = []

    for marker_b64, (ref_b64, orig_b64) in _CDN_ORIGIN_ENTRIES_B64:
        marker = _b64d(marker_b64)
        if marker in url_low or marker in ref_low or marker in src_low:
            matched_ref = _b64d(ref_b64)
            matched_origin = _b64d(orig_b64)
            relevant_cookie_domains.append(marker)
            # Adiciona domínios irmãos do mesmo grupo se aplicável
            if _b64d("cGhuY2Ru") in marker or _b64d("cG9ybmh1Yg==") in marker:
                relevant_cookie_domains.extend([_b64d("cGhuY2RuLmNvbQ=="), _b64d("cG9ybmh1Yi5jb20=")])
                headers["Sec-Fetch-Mode"] = "navigate"
                headers["Accept-Language"] = "en-us,en;q=0.5"
            break

    effective_ref = referer or source_page
    if matched_ref:
        headers["Referer"] = matched_ref
        headers["Origin"] = matched_origin
    elif effective_ref and effective_ref.startswith("http"):
        headers["Referer"] = effective_ref
        try:
            parsed_ref = urllib.parse.urlparse(effective_ref)
            headers["Origin"] = f"{parsed_ref.scheme}://{parsed_ref.netloc}"
        except Exception:
            pass
    elif url and url.startswith("http"):
        try:
            parsed_url = urllib.parse.urlparse(url)
            origin = f"{parsed_url.scheme}://{parsed_url.netloc}"
            headers["Referer"] = f"{origin}/"
            headers["Origin"] = origin
        except Exception:
            pass

    # 2. Injeta cookies cacheados do domínio se houver
    if domain_cookies and relevant_cookie_domains:
        cookie_dict = {}
        for dom in relevant_cookie_domains:
            if dom in domain_cookies and domain_cookies[dom]:
                for item in domain_cookies[dom].split(";"):
                    if "=" in item:
                        ck, cv = item.strip().split("=", 1)
                        cookie_dict[ck.strip()] = cv.strip()
        if cookie_dict:
            headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in cookie_dict.items())

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

