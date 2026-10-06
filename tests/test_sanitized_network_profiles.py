import pytest
import re
from src.core.network_profiles import (
    _b64d,
    get_canonical_performer_routes,
    get_preseeded_domain_cookies,
    get_preseeded_session_cookies,
    get_domain_specific_cookies,
    get_domain_specific_headers,
    resolve_anti_hotlink_headers,
    extract_canonical_target_page,
    get_cookie_domains_for_url,
    is_fast_track_supported,
    get_fast_track_endpoint,
    matches_embed_player_provider,
    get_embed_poster_url,
    get_embed_xhr_url,
    matches_direct_extractor_provider,
    is_tls_impersonation_required,
    matches_video_id_in_cdn,
    is_static_preview_upgradeable,
    matches_enrichment_provider,
    get_enrichment_api_url,
    get_video_host_indicators,
    suggest_smart_folder_name,
)
from src.server.server import _normalize_title_for_comparison
import src.server.resilient_downloader as resilient_downloader


def test_b64d_basic():
    assert _b64d("aGVsbG8=") == "hello"


def test_canonical_performer_routes():
    routes = get_canonical_performer_routes()
    assert len(routes) == 9
    assert any("{slug}" in r for r in routes)


def test_preseeded_cookies_decoding():
    cookies = get_preseeded_domain_cookies()
    assert len(cookies) > 0
    # Confirm no cookie name is raw base64 like 'YWNjZXNzQWdlRGlzY2xhaW1lclBI'
    cookie_names = [c["name"] for c in cookies]
    assert _b64d("YWNjZXNzQWdlRGlzY2xhaW1lclBI") in cookie_names
    assert "YWNjZXNzQWdlRGlzY2xhaW1lclBI" not in cookie_names
    assert _b64d("ZXBjb2xvcg==") in cookie_names
    assert _b64d("YWdlX2dhdGU=") in cookie_names
    assert _b64d("c2JfZGlzY2xhaW1lcg==") in cookie_names
    assert "age_verified" in cookie_names


def test_preseeded_session_cookies():
    session_cookies = get_preseeded_session_cookies()
    assert _b64d("YWNjZXNzQWdlRGlzY2xhaW1lclBI") in session_cookies
    assert _b64d("ZXBjb2xvcg==") in session_cookies
    assert _b64d("YWdlX2dhdGU=") in session_cookies
    assert "over18" in session_cookies
    assert session_cookies["over18"] == "1"


def test_domain_specific_cookies():
    host_b = _b64d("ZXBvcm5lci5jb20=")
    ep_cookies = get_domain_specific_cookies(host_b)
    assert len(ep_cookies) > 0
    assert any(c["name"] == _b64d("ZXBjb2xvcg==") and c["value"] == "black" for c in ep_cookies)

    host_a = _b64d("cG9ybmh1Yi5jb20=")
    ph_cookies = get_domain_specific_cookies(host_a)
    assert len(ph_cookies) > 0
    assert any(c["name"] == _b64d("YWNjZXNzQWdlRGlzY2xhaW1lclBI") for c in ph_cookies)


def test_domain_specific_headers():
    host_b = _b64d("ZXBvcm5lci5jb20=")
    hdrs = get_domain_specific_headers(f"https://{host_b}/media-123", host_b)
    assert "Cookie" in hdrs
    assert f"{_b64d('ZXBjb2xvcg==')}=black" in hdrs["Cookie"]


def test_anti_hotlink_cdn_mapping():
    # Recognized CDN
    cdn_url = _b64d("aHR0cHM6Ly9jaS5waG5jZG4uY29tL3ZpZGVvcy8yMDIyMDUvMTcvNDA4NDMyMTIxLzcyMFBfNDAwMEtfNDA4NDMyMTIxLm1wNA==")
    h = resolve_anti_hotlink_headers(cdn_url)
    assert _b64d("cG9ybmh1Yi5jb20=") in h["Referer"]
    assert _b64d("aHR0cHM6Ly93d3cucG9ybmh1Yi5jb20=") in h["Origin"]
    assert h.get("Sec-Fetch-Mode") == "navigate"


def test_anti_hotlink_source_page_fallback():
    # Generic CDN with source_page fallback when referer is empty
    cdn_url = "https://cdn.example.org/images/photo_01.jpg"
    src_page = "https://example.org/galleries/album-123"
    h = resolve_anti_hotlink_headers(cdn_url, referer=None, source_page=src_page)
    assert h["Referer"] == src_page
    assert h["Origin"] == "https://example.org"


def test_anti_hotlink_url_dynamic_derivation():
    # Unknown URL with no referer or source_page
    generic_url = "https://media.mysite.com/video/stream.mp4"
    h = resolve_anti_hotlink_headers(generic_url)
    assert h["Referer"] == "https://media.mysite.com/"
    assert h["Origin"] == "https://media.mysite.com"


def test_extract_canonical_target_page():
    # Provider A viewkey
    u_ph = _b64d("aHR0cHM6Ly9wdC5wb3JuaHViLmNvbS92aWV3X3ZpZGVvLnBocD92aWV3a2V5PXBoNjI4M2IxMjA2NGFiYg==")
    canon_ph = extract_canonical_target_page(u_ph)
    assert canon_ph == _b64d("aHR0cHM6Ly93d3cucG9ybmh1Yi5jb20vdmlld192aWRlby5waHA/dmlld2tleT1waDYyODNiMTIwNjRhYmI=")

    # Provider B video slug
    u_ep = _b64d("aHR0cHM6Ly93d3cuZXBvcm5lci5jb20vdmlkZW8ta2xJdEVqb1JxeGovbGlseS12aWRlby8=")
    canon_ep = extract_canonical_target_page(u_ep)
    assert canon_ep == _b64d("aHR0cHM6Ly93d3cuZXBvcm5lci5jb20vdmlkZW8ta2xJdEVqb1JxeGov")


def test_fast_track_support():
    host_c = _b64d("cG9ybnBpY3MuY29t")
    assert is_fast_track_supported(host_c, f"https://{host_c}/galleries/12345/")
    assert not is_fast_track_supported("example.com", "https://example.com/galleries/12345/")
    endpoint = get_fast_track_endpoint()
    assert endpoint.startswith("https://")
    assert "related_json.php" in endpoint


def test_embed_player_sniffer():
    u_ep = _b64d("aHR0cHM6Ly93d3cuZXBvcm5lci5jb20vdmlkZW8ta2xJdEVqb1JxeGovbGlseS12aWRlby8=")
    matched, vid_id, embed_url = matches_embed_player_provider(u_ep)
    assert matched is True
    assert vid_id == "klItEjoRqxj"
    assert embed_url == _b64d("aHR0cHM6Ly93d3cuZXBvcm5lci5jb20vZW1iZWQva2xJdEVqb1JxeGov")

    poster = get_embed_poster_url("12345")
    assert "12345" in poster


def test_direct_extractor_provider():
    u_ph = _b64d("aHR0cHM6Ly93d3cucG9ybmh1Yi5jb20vdmlld192aWRlby5waHA/dmlld2tleT1waDYyODNiMTIwNjRhYmI=")
    matched, vid_id, target = matches_direct_extractor_provider(u_ph)
    assert matched is True
    assert vid_id == "ph6283b12064abb"
    assert "viewkey=ph6283b12064abb" in target


def test_tls_impersonation_required():
    cdn_u = _b64d("aHR0cHM6Ly9jaS5waG5jZG4uY29tL3ZpZGVvcy8xMjMubXA0")
    assert is_tls_impersonation_required(cdn_u)
    assert not is_tls_impersonation_required("https://example.com/video.mp4")


def test_matches_video_id_in_cdn():
    stream_u = _b64d("aHR0cHM6Ly9ldi5waG5jZG4uY29tL3ZpZGVvcy8yMDIyMDUvMTcvNDA4MjU0NzIxLzEwODBQXzQwMDBLXzQwODI1NDcyMS5tcDQ=")
    assert matches_video_id_in_cdn(stream_u) == "408254721"
    assert matches_video_id_in_cdn("https://example.com/video.mp4") is None


def test_suggest_smart_folder_name():
    # URL with slug and hash
    url = _b64d("aHR0cHM6Ly93d3cuZXBvcm5lci5jb20vcG9ybnN0YXIvYWJpZ2FpaWwtbW9ycmlzLU9nU3lE")
    folder = suggest_smart_folder_name(url, "Abigaiil Morris Videos")
    assert folder == "Abigaiil Morris"

    # URL with actor
    url2 = "https://example.com/actor/john-doe-1234"
    folder2 = suggest_smart_folder_name(url2)
    assert folder2 == "John Doe"

    # Fallback to cleaned page title
    folder3 = suggest_smart_folder_name("", "Summer Vacation Videos HD")
    assert folder3 == "Summer Vacation"


def test_normalize_title_for_comparison():
    # Site domain suffix removed
    t1 = "Awesome Movie - MyTube.com"
    norm1 = _normalize_title_for_comparison(t1)
    assert norm1 == "awesomemovie"

    # Preserves subtitles / parts separated by hyphens
    t2 = "Matrix - Reloaded"
    norm2 = _normalize_title_for_comparison(t2)
    assert norm2 == "matrixreloaded"

    t3 = "Concert Live - Tokyo"
    norm3 = _normalize_title_for_comparison(t3)
    assert norm3 == "concertlivetokyo"


def test_resilient_downloader_import():
    assert hasattr(resilient_downloader, "download_video_resilient")
    assert hasattr(resilient_downloader, "logger")
