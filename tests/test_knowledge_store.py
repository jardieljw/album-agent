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
        assert "/" not in encoded
        assert "+" not in encoded
        assert "=" not in encoded
        assert d.lower() not in encoded.lower() or len(d) <= 3

        decoded = KnowledgeStore.decode_domain(encoded)
        assert decoded == d.strip().lower()

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

    encoded_name = f"{temp_store.encode_domain('photos.example.com')}.b64"
    file_path = os.path.join(temp_store.storage_dir, encoded_name)
    assert os.path.exists(file_path), "Encoded .b64 file must exist on disk"

    with open(file_path, "r", encoding="utf-8") as f:
        raw_content = f.read()

    assert "photos.example.com" not in raw_content, "Plaintext domain must not appear in .b64 file"
    assert '"primary_containers"' not in raw_content, "Plaintext JSON keys must not appear in .b64 file"

    decoded_dict = temp_store.decode_content(raw_content)
    assert decoded_dict["domain"] == "photos.example.com"
    assert decoded_dict["demonstration_count"] == 3
    assert decoded_dict["average_aspect_ratio"] == 1.67

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

    with open(legacy_file, "w", encoding="utf-8") as f:
        json.dump(legacy_payload, f, indent=2)

    assert os.path.exists(legacy_file)

    loaded = temp_store.get_knowledge(domain)
    assert loaded is not None
    assert loaded.domain == domain
    assert loaded.demonstration_count == 2
    assert loaded.primary_containers == [".legacy-gallery"]

    loaded.demonstration_count += 1
    temp_store.save_knowledge(loaded)

    b64_file = os.path.join(temp_store.storage_dir, f"{temp_store.encode_domain(domain)}.b64")
    assert os.path.exists(b64_file)
    assert not os.path.exists(legacy_file), "Legacy .json should be cleaned up on save"

    reloaded = temp_store.get_knowledge(domain)
    assert reloaded is not None
    assert reloaded.demonstration_count == 3


def test_list_all_knowledge_mixed_and_deduplicated(temp_store):
    sk_b64 = SiteKnowledge(
        domain="b64-domain.com",
        demonstration_count=1,
        primary_containers=[".gallery"],
        positive_signatures=[],
        negative_filters=[],
        preferred_resolution_methods=[],
        average_aspect_ratio=1.0,
        sample_evidence=[],
    )
    temp_store.save_knowledge(sk_b64)

    legacy_domain = "legacy-domain.org"
    legacy_file = os.path.join(temp_store.storage_dir, f"{legacy_domain}.json")
    with open(legacy_file, "w", encoding="utf-8") as f:
        json.dump({
            "domain": legacy_domain,
            "demonstration_count": 1,
            "primary_containers": [],
            "positive_signatures": [],
            "negative_filters": [],
            "preferred_resolution_methods": [],
            "average_aspect_ratio": 1.0,
            "sample_evidence": [],
        }, f)

    dup_file = os.path.join(temp_store.storage_dir, "b64-domain.com.json")
    with open(dup_file, "w", encoding="utf-8") as f:
        json.dump({
            "domain": "b64-domain.com",
            "demonstration_count": 99,
            "primary_containers": [],
            "positive_signatures": [],
            "negative_filters": [],
            "preferred_resolution_methods": [],
            "average_aspect_ratio": 1.0,
            "sample_evidence": [],
        }, f)

    all_k = temp_store.list_all_knowledge()
    domains = [k.domain for k in all_k]

    assert len(all_k) == 2
    assert "b64-domain.com" in domains
    assert "legacy-domain.org" in domains

    b64_k = next(k for k in all_k if k.domain == "b64-domain.com")
    assert b64_k.demonstration_count == 1


def test_delete_knowledge_cleans_both_formats(temp_store):
    domain = "to-delete.com"

    sk = SiteKnowledge(domain=domain, demonstration_count=1)
    temp_store.save_knowledge(sk)

    legacy_file = os.path.join(temp_store.storage_dir, f"{domain}.json")
    with open(legacy_file, "w", encoding="utf-8") as f:
        f.write("{}")

    b64_path = os.path.join(temp_store.storage_dir, f"{temp_store.encode_domain(domain)}.b64")

    assert os.path.exists(b64_path)
    assert os.path.exists(legacy_file)

    deleted = temp_store.delete_knowledge(domain)
    assert deleted is True

    assert not os.path.exists(b64_path)
    assert not os.path.exists(legacy_file)
    assert temp_store.get_knowledge(domain) is None


def test_safety_audit_and_inspection(temp_store):
    sk = SiteKnowledge(
        domain="audit-test.org",
        demonstration_count=5,
        primary_containers=[".main-album"],
        positive_signatures=["signature_1"],
        negative_filters=["filter_1"],
        preferred_resolution_methods=["method_1"],
        average_aspect_ratio=1.5,
        sample_evidence=["Evidence line 1"],
    )
    temp_store.save_knowledge(sk)

    encoded_filename = f"{temp_store.encode_domain('audit-test.org')}.b64"
    filepath = os.path.join(temp_store.storage_dir, encoded_filename)

    with open(filepath, "r", encoding="utf-8") as f:
        raw_b64 = f.read()

    decoded_dict = temp_store.decode_content(raw_b64)
    assert isinstance(decoded_dict, dict)
    assert decoded_dict["domain"] == "audit-test.org"
    assert decoded_dict["demonstration_count"] == 5
    assert decoded_dict["sample_evidence"] == ["Evidence line 1"]
