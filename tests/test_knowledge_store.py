import os
import json
import base64
import pytest
from src.learning.knowledge_store import KnowledgeStore, SiteKnowledge


@pytest.fixture
def temp_store(tmp_path):
    """Fixture providing a KnowledgeStore isolated in a temporary directory."""
    store_dir = str(tmp_path / "knowledge")
    return KnowledgeStore(storage_dir=store_dir)


def test_domain_encoding_decoding():
    domains = [
        "example.com",
        "sub.domain.co.uk",
        "my-gallery-site.org",
        "Upper.Case.COM",
    ]
    for d in domains:
        encoded = KnowledgeStore.encode_domain(d)
        # Verify filesystem-safe Base64: no slashes, pluses, or equals
        assert "/" not in encoded
        assert "+" not in encoded
        assert "=" not in encoded
        assert d.lower() not in encoded.lower() or len(d) <= 3

        # Decode directly
        decoded = KnowledgeStore.decode_domain(encoded)
        assert decoded == d.strip().lower()

        # Decode with .b64 extension attached
        decoded_ext = KnowledgeStore.decode_domain(f"{encoded}.b64")
        assert decoded_ext == d.strip().lower()


def test_domain_decoding_invalid_input():
    with pytest.raises(ValueError):
        KnowledgeStore.decode_domain("???not_base64!!!")


def test_save_and_get_knowledge_base64(temp_store):
    sk = SiteKnowledge(
        domain="photos.example.com",
        demonstration_count=3,
        primary_containers=[".album-grid", "#photo-container"],
        positive_signatures=["primary_album_container:.album-grid", "repeated_homogeneous_sibling_structure"],
        negative_filters=["exclude_container:.sidebar", "exclude_class:ad-banner"],
        preferred_resolution_methods=["verified_cdn_candidate", "parent_anchor"],
        average_aspect_ratio=1.67,
        sample_evidence=["Located in primary album container .album-grid", "Aspect ratio cluster around 1.67"],
    )

    temp_store.save_knowledge(sk)

    # 1. Verify file on disk
    encoded_name = f"{temp_store.encode_domain('photos.example.com')}.b64"
    file_path = os.path.join(temp_store.storage_dir, encoded_name)
    assert os.path.exists(file_path), "Encoded .b64 file must exist on disk"

    # 2. Verify raw file contents are Base64 and have NO plaintext JSON
    with open(file_path, "r", encoding="utf-8") as f:
        raw_content = f.read()

    assert "photos.example.com" not in raw_content, "Plaintext domain must not appear in .b64 file"
    assert '"primary_containers"' not in raw_content, "Plaintext JSON keys must not appear in .b64 file"

    # Decode and verify payload
    decoded_dict = temp_store.decode_content(raw_content)
    assert decoded_dict["domain"] == "photos.example.com"
    assert decoded_dict["demonstration_count"] == 3
    assert decoded_dict["average_aspect_ratio"] == 1.67

    # 3. Retrieve through KnowledgeStore.get_knowledge
    retrieved = temp_store.get_knowledge("photos.example.com")
    assert retrieved is not None
    assert retrieved.domain == "photos.example.com"
    assert retrieved.demonstration_count == 3
    assert retrieved.primary_containers == [".album-grid", "#photo-container"]
    assert retrieved.average_aspect_ratio == 1.67
    assert "verified_cdn_candidate" in retrieved.preferred_resolution_methods


def test_backward_compatibility_with_legacy_json(temp_store):
    domain = "legacy-site.net"
    legacy_file = os.path.join(temp_store.storage_dir, f"{domain}.json")

    legacy_payload = {
        "domain": domain,
        "demonstration_count": 2,
        "primary_containers": [".legacy-gallery"],
        "positive_signatures": ["primary_album_container:.legacy-gallery"],
        "negative_filters": [],
        "preferred_resolution_methods": ["individual_page"],
        "average_aspect_ratio": 1.33,
        "sample_evidence": ["Legacy evidence"],
        "updated_at": "2026-01-01T00:00:00Z",
    }

    # Write plaintext legacy JSON
    with open(legacy_file, "w", encoding="utf-8") as f:
        json.dump(legacy_payload, f, indent=2)

    assert os.path.exists(legacy_file)

    # 1. Read through get_knowledge transparently
    loaded = temp_store.get_knowledge(domain)
    assert loaded is not None
    assert loaded.domain == domain
    assert loaded.demonstration_count == 2
    assert loaded.primary_containers == [".legacy-gallery"]

    # 2. Saving updates to this domain should migrate to .b64 and clean up legacy .json
    loaded.demonstration_count += 1
    temp_store.save_knowledge(loaded)

    b64_file = os.path.join(temp_store.storage_dir, f"{temp_store.encode_domain(domain)}.b64")
    assert os.path.exists(b64_file)
    assert not os.path.exists(legacy_file), "Legacy .json should be cleaned up on save"

    # Reload from .b64
    reloaded = temp_store.get_knowledge(domain)
    assert reloaded is not None
    assert reloaded.demonstration_count == 3


def test_list_all_knowledge_mixed_and_deduplicated(temp_store):
    # 1. Create a Base64 entry
    sk_b64 = SiteKnowledge(
        domain="modern-site.com",
        demonstration_count=5,
        primary_containers=[".gallery-modern"],
    )
    temp_store.save_knowledge(sk_b64)

    # 2. Create a legacy JSON entry for another domain
    legacy_domain = "old-site.org"
    legacy_file = os.path.join(temp_store.storage_dir, f"{legacy_domain}.json")
    with open(legacy_file, "w", encoding="utf-8") as f:
        json.dump({"domain": legacy_domain, "demonstration_count": 1}, f)

    # 3. Create a duplicate legacy JSON for modern-site.com
    dup_file = os.path.join(temp_store.storage_dir, "modern-site.com.json")
    with open(dup_file, "w", encoding="utf-8") as f:
        json.dump({"domain": "modern-site.com", "demonstration_count": 1}, f)

    all_k = temp_store.list_all_knowledge()
    domains = [k.domain for k in all_k]

    # Should find exactly 2 unique domains (modern-site.com deduplicated, preferring .b64 with count 5)
    assert len(all_k) == 2
    assert "modern-site.com" in domains
    assert "old-site.org" in domains

    modern_item = next(k for k in all_k if k.domain == "modern-site.com")
    assert modern_item.demonstration_count == 5, ".b64 version must take precedence over legacy duplicate"


def test_delete_knowledge(temp_store):
    sk = SiteKnowledge(domain="todelete.com", demonstration_count=1)
    temp_store.save_knowledge(sk)

    b64_path = os.path.join(temp_store.storage_dir, f"{temp_store.encode_domain('todelete.com')}.b64")
    assert os.path.exists(b64_path)

    # Delete by domain
    deleted = temp_store.delete_knowledge("todelete.com")
    assert deleted is True
    assert not os.path.exists(b64_path)
    assert temp_store.get_knowledge("todelete.com") is None

    # Deleting again returns False
    assert temp_store.delete_knowledge("todelete.com") is False


def test_safety_audit_and_inspection(temp_store):
    safe_sk = SiteKnowledge(
        domain="safe-gallery.com",
        primary_containers=[".container-grid", "#gallery"],
        positive_signatures=["primary_album_container:.container-grid"],
        negative_filters=["exclude_container:.ads"],
        average_aspect_ratio=1.5,
    )
    temp_store.save_knowledge(safe_sk)

    audit_safe = temp_store.inspect_knowledge("safe-gallery.com")
    assert audit_safe is not None
    assert audit_safe["is_safe"] is True
    assert audit_safe["safety_verdict"] == "SAFE"
    assert "Approved" in audit_safe["pr_recommendation"]

    # Test suspicious payload with injection tokens
    suspicious_sk = SiteKnowledge(
        domain="evil.com",
        primary_containers=["<script>alert('xss')</script>"],
        positive_signatures=["eval(evil_code)"],
    )
    temp_store.save_knowledge(suspicious_sk)

    audit_suspicious = temp_store.inspect_knowledge("evil.com")
    assert audit_suspicious is not None
    assert audit_suspicious["is_safe"] is False
    assert audit_suspicious["safety_verdict"] == "SUSPICIOUS"
    assert len(audit_suspicious["safety_warnings"]) >= 2


@pytest.mark.asyncio
async def test_server_pattern_endpoints(tmp_path, monkeypatch):
    from src.server.server import knowledge_store, list_domain_patterns, delete_domain_pattern

    test_dir = str(tmp_path / "server_knowledge")
    monkeypatch.setattr(knowledge_store, "storage_dir", test_dir)
    os.makedirs(test_dir, exist_ok=True)

    sk = SiteKnowledge(
        domain="pattern-test.com",
        demonstration_count=4,
        primary_containers=[".gallery-grid"],
        preferred_resolution_methods=["verified_cdn_candidate"],
    )
    knowledge_store.save_knowledge(sk)

    patterns = await list_domain_patterns()
    assert len(patterns) == 1
    assert patterns[0]["domain"] == "pattern-test.com"
    assert patterns[0]["demonstrationCount"] == 4
    assert ".gallery-grid" in patterns[0]["primaryContainers"]

    res = await delete_domain_pattern("pattern-test.com")
    assert res == {"domain": "pattern-test.com", "deleted": True}

    patterns_after = await list_domain_patterns()
    assert len(patterns_after) == 0


def test_edge_case_null_and_empty_inputs(temp_store):
    # None inputs
    assert temp_store.get_knowledge(None) is None
    assert temp_store.delete_knowledge(None) is False
    assert temp_store.inspect_file(None) is None
    assert temp_store.inspect_knowledge(None) is None

    # Empty string inputs
    assert temp_store.get_knowledge("") is None
    assert temp_store.get_knowledge("   ") is None
    assert temp_store.delete_knowledge("") is False
    assert temp_store.delete_knowledge("   ") is False
    assert temp_store.inspect_file("") is None
    assert temp_store.inspect_knowledge("") is None

    # Empty domain encoding / decoding raises ValueError
    with pytest.raises(ValueError):
        KnowledgeStore.encode_domain("")

    with pytest.raises(ValueError):
        KnowledgeStore.encode_domain("   ")

    with pytest.raises(ValueError):
        KnowledgeStore.decode_domain("")

    with pytest.raises(ValueError):
        KnowledgeStore.decode_domain(".b64")

    # Saving invalid SiteKnowledge
    with pytest.raises(ValueError):
        temp_store.save_knowledge(None)

    with pytest.raises(ValueError):
        temp_store.save_knowledge(SiteKnowledge(domain=""))


def test_url_and_path_normalization(temp_store):
    sk = SiteKnowledge(
        domain="example.org",
        demonstration_count=2,
        primary_containers=[".gallery-main"],
    )
    temp_store.save_knowledge(sk)

    # Retrieval via various URL and trailing-slash formats
    assert temp_store.get_knowledge("https://example.org/gallery/album-1") is not None
    assert temp_store.get_knowledge("http://example.org") is not None
    assert temp_store.get_knowledge("example.org/") is not None
    assert temp_store.get_knowledge("example.org:8080") is not None

    # Deletion via URL format
    deleted = temp_store.delete_knowledge("https://example.org/test")
    assert deleted is True
    assert temp_store.get_knowledge("example.org") is None


def test_corrupted_and_unreadable_file_handling(temp_store):
    # 1. Place a corrupt .b64 file with random invalid bytes
    corrupt_file = os.path.join(temp_store.storage_dir, "corrupt_data.b64")
    with open(corrupt_file, "w", encoding="utf-8") as f:
        f.write("???not_base64_and_not_json!!!")

    # 2. Place a .b64 file with Base64-encoded array (not a dict)
    array_b64_content = base64.b64encode(b"[1, 2, 3]").decode("ascii")
    array_file = os.path.join(temp_store.storage_dir, "array_data.b64")
    with open(array_file, "w", encoding="utf-8") as f:
        f.write(array_b64_content)

    # 3. Place a broken .json file
    broken_json = os.path.join(temp_store.storage_dir, "broken.json")
    with open(broken_json, "w", encoding="utf-8") as f:
        f.write("{invalid json...")

    # 4. Save a valid entry
    valid_sk = SiteKnowledge(domain="valid-target.com", demonstration_count=1)
    temp_store.save_knowledge(valid_sk)

    # list_all_knowledge should skip corrupted files gracefully and list valid ones
    all_k = temp_store.list_all_knowledge()
    domains = [k.domain for k in all_k]
    assert "valid-target.com" in domains
    assert len(all_k) == 1

    # inspect_file on corrupted file returns safe error dict
    report = temp_store.inspect_file(corrupt_file)
    assert report is not None
    assert report["is_safe"] is False
    assert report["safety_verdict"] == "CORRUPTED"


def test_base64_multiline_and_formatting(temp_store):
    # Valid Base64 with internal spaces and newlines
    sk = SiteKnowledge(domain="formatted.com", demonstration_count=3)
    encoded = KnowledgeStore.encode_content(sk.model_dump())
    multiline_encoded = f"  {encoded[:10]}\n  {encoded[10:20]}\r\n  {encoded[20:]}  "

    file_path = os.path.join(temp_store.storage_dir, f"{KnowledgeStore.encode_domain('formatted.com')}.b64")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(multiline_encoded)

    retrieved = temp_store.get_knowledge("formatted.com")
    assert retrieved is not None
    assert retrieved.domain == "formatted.com"
    assert retrieved.demonstration_count == 3


def test_frozen_mode_storage_dir_resolution(tmp_path, monkeypatch):
    import sys
    fake_exe = str(tmp_path / "myapp" / "dist" / "main.exe")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", fake_exe, raising=False)

    store = KnowledgeStore()
    expected_base = str(tmp_path / "myapp" / "data" / "knowledge")
    assert os.path.abspath(store.storage_dir) == os.path.abspath(expected_base)


def test_site_knowledge_demonstration_merge(temp_store):
    from src.learning.demonstration_analyzer import DemonstrationAnalyzer
    from src.core.models import DOMCandidateInfo, ResolutionMethod

    cand1 = DOMCandidateInfo(candidate_id="c1", selector="img.item-1", container_selector=".grid-container", width=800, height=600)
    cand2 = DOMCandidateInfo(candidate_id="c2", selector="img.item-2", container_selector=".grid-container", width=800, height=600)
    neg1 = DOMCandidateInfo(candidate_id="n1", selector="img.ad", container_selector=".sidebar-ads", classes=["ad-banner"])

    # 1. First demonstration
    sk1 = DemonstrationAnalyzer.analyze_demonstration(
        domain="demo-site.com",
        positive_candidates=[cand1, cand2],
        negative_candidates=[neg1],
        proven_methods=[ResolutionMethod.VERIFIED_CDN_CANDIDATE],
    )
    temp_store.save_knowledge(sk1)

    loaded1 = temp_store.get_knowledge("demo-site.com")
    assert loaded1.demonstration_count == 1
    assert ".grid-container" in loaded1.primary_containers
    assert "exclude_class:ad-banner" in loaded1.negative_filters

    # 2. Second demonstration with new container and method
    cand3 = DOMCandidateInfo(candidate_id="c3", selector="img.item-3", container_selector=".alt-container", width=1200, height=800)
    sk2 = DemonstrationAnalyzer.analyze_demonstration(
        domain="demo-site.com",
        positive_candidates=[cand3],
        negative_candidates=[],
        proven_methods=[ResolutionMethod.PARENT_ANCHOR],
    )

    # Merge with existing knowledge
    existing = temp_store.get_knowledge("demo-site.com")
    sk2.demonstration_count = existing.demonstration_count + 1
    for c in existing.primary_containers:
        if c not in sk2.primary_containers:
            sk2.primary_containers.append(c)
    for f in existing.negative_filters:
        if f not in sk2.negative_filters:
            sk2.negative_filters.append(f)
    for m in existing.preferred_resolution_methods:
        if m not in sk2.preferred_resolution_methods:
            sk2.preferred_resolution_methods.append(m)

    temp_store.save_knowledge(sk2)

    loaded2 = temp_store.get_knowledge("demo-site.com")
    assert loaded2.demonstration_count == 2
    assert ".grid-container" in loaded2.primary_containers
    assert ".alt-container" in loaded2.primary_containers
    assert "exclude_class:ad-banner" in loaded2.negative_filters
    assert ResolutionMethod.VERIFIED_CDN_CANDIDATE.value in loaded2.preferred_resolution_methods
    assert ResolutionMethod.PARENT_ANCHOR.value in loaded2.preferred_resolution_methods



