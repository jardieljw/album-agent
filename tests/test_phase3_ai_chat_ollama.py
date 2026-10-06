import pytest
from httpx import AsyncClient, ASGITransport, Response
from unittest.mock import MagicMock
from src.server.server import app


@pytest.mark.asyncio
async def test_ollama_status_offline():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/ai/ollama/status?url=http://127.0.0.1:54321")
    assert response.status_code == 200
    data = response.json()
    assert data["is_available"] is False
    assert data["installed_models"] == []
    assert data["error"] is not None


@pytest.mark.asyncio
async def test_ollama_status_online():
    mock_version_resp = MagicMock(spec=Response)
    mock_version_resp.status_code = 200
    mock_version_resp.json.return_value = {"version": "0.5.4"}

    mock_tags_resp = MagicMock(spec=Response)
    mock_tags_resp.status_code = 200
    mock_tags_resp.json.return_value = {
        "models": [
            {"name": "llama3.2:latest", "size": 2147483648},
            {"name": "qwen2.5:7b", "size": 4294967296}
        ]
    }

    original_send = AsyncClient.send

    async def mock_send(self, request, *args, **kwargs):
        if request.url.port == 11434:
            if "version" in request.url.path:
                return mock_version_resp
            return mock_tags_resp
        return await original_send(self, request, *args, **kwargs)

    AsyncClient.send = mock_send
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/ai/ollama/status?url=http://localhost:11434")
    finally:
        AsyncClient.send = original_send

    assert response.status_code == 200
    data = response.json()
    assert data["is_available"] is True
    assert data["version"] == "0.5.4"
    assert "llama3.2:latest" in data["installed_models"]
    assert "qwen2.5:7b" in data["installed_models"]


@pytest.mark.asyncio
async def test_ollama_models_online():
    mock_tags_resp = MagicMock(spec=Response)
    mock_tags_resp.status_code = 200
    mock_tags_resp.json.return_value = {
        "models": [
            {"name": "llama3.2:latest", "size": 2147483648, "modified_at": "2026-01-01"}
        ]
    }

    original_send = AsyncClient.send

    async def mock_send(self, request, *args, **kwargs):
        if request.url.port == 11434:
            return mock_tags_resp
        return await original_send(self, request, *args, **kwargs)

    AsyncClient.send = mock_send
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/ai/ollama/models?url=http://localhost:11434")
    finally:
        AsyncClient.send = original_send

    assert response.status_code == 200
    data = response.json()
    assert data["is_available"] is True
    assert len(data["models"]) == 1
    assert data["models"][0]["name"] == "llama3.2:latest"
    assert data["models"][0]["size_gb"] == 2.0


@pytest.mark.asyncio
async def test_chat_api_ollama_offline_fallback():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/chat", json={
            "message": "Olá",
            "provider": "ollama",
            "model": "llama3.2",
            "ollama_url": "http://127.0.0.1:54321"
        })
    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "ollama"
    assert data.get("error_type") == "ollama_offline"
    assert data.get("can_fallback") is True
    assert "Não consegui conectar" in data["reply"]


@pytest.mark.asyncio
async def test_chat_api_gemini_no_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/chat", json={
            "message": "Olá",
            "provider": "gemini"
        })
    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "gemini"
    assert data.get("error_type") == "no_api_key"
    assert data.get("can_fallback") is True


@pytest.mark.asyncio
async def test_chat_api_ollama_success():
    mock_chat_resp = MagicMock(spec=Response)
    mock_chat_resp.status_code = 200
    mock_chat_resp.json.return_value = {
        "message": {"content": "Olá! Sou o Co-Pilot via Ollama Local."}
    }

    original_send = AsyncClient.send

    async def mock_send(self, request, *args, **kwargs):
        if request.url.port == 11434:
            return mock_chat_resp
        return await original_send(self, request, *args, **kwargs)

    AsyncClient.send = mock_send
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/chat", json={
                "message": "Oi",
                "provider": "ollama",
                "model": "llama3.2"
            })
    finally:
        AsyncClient.send = original_send

    assert response.status_code == 200
    data = response.json()
    assert data["reply"] == "Olá! Sou o Co-Pilot via Ollama Local."
    assert data["provider"] == "ollama"
    assert data["model"] == "llama3.2"


@pytest.mark.asyncio
async def test_ollama_status_http_404_not_ollama():
    """Verify that a server returning 404 (non-Ollama) is NOT marked as is_available=True."""
    mock_404 = MagicMock(spec=Response)
    mock_404.status_code = 404
    mock_404.text = "Not Found"

    original_send = AsyncClient.send

    async def mock_send(self, request, *args, **kwargs):
        if request.url.host == "custom-host":
            return mock_404
        return await original_send(self, request, *args, **kwargs)

    AsyncClient.send = mock_send
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/ai/ollama/status?url=http://custom-host:8080")
    finally:
        AsyncClient.send = original_send

    assert response.status_code == 200
    data = response.json()
    assert data["is_available"] is False
    assert data["installed_models"] == []
    assert "não é Ollama" in data["error"] or "HTTP 404" in data["error"]


@pytest.mark.asyncio
async def test_chat_api_gemini_contents_sanitization_first_turn_user(monkeypatch):
    """
    Verify that when conversation history starts with an assistant turn (default app greeting)
    and has consecutive user turns, contents are sanitized so:
    1. First turn is strictly 'user' (leading 'model' turns dropped)
    2. Consecutive 'user' turns are merged so roles strictly alternate
    """
    monkeypatch.setenv("GEMINI_API_KEY", "test-mock-key-12345")
    captured_payloads = []

    mock_gemini_resp = MagicMock(spec=Response)
    mock_gemini_resp.status_code = 200
    mock_gemini_resp.json.return_value = {
        "candidates": [
            {
                "content": {"parts": [{"text": "Resposta Gemini com contexto limpo."}]},
                "finishReason": "STOP"
            }
        ]
    }

    original_send = AsyncClient.send

    async def mock_send(self, request, *args, **kwargs):
        if "generativelanguage.googleapis.com" in str(request.url):
            import json
            captured_payloads.append(json.loads(request.content.decode("utf-8")))
            return mock_gemini_resp
        return await original_send(self, request, *args, **kwargs)

    AsyncClient.send = mock_send
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/chat", json={
                "message": "Segunda pergunta do usuário",
                "provider": "gemini",
                "model": "gemini-3.7-flash",
                "conversation_history": [
                    {"role": "assistant", "content": "Olá! Sou o Co-Pilot IMAGEX.AI."},
                    {"role": "user", "content": "Primeira pergunta do usuário"},
                    {"role": "user", "content": "Adicional à primeira pergunta"}
                ]
            })
    finally:
        AsyncClient.send = original_send

    assert response.status_code == 200
    data = response.json()
    assert data["reply"] == "Resposta Gemini com contexto limpo."
    assert data["provider"] == "gemini"

    # Verify captured Gemini request structure
    assert len(captured_payloads) == 1
    sent_contents = captured_payloads[0]["contents"]
    # Rule 1: First turn MUST be 'user' (assistant greeting dropped)
    assert sent_contents[0]["role"] == "user"
    # Rule 2: Strictly alternating roles (no consecutive 'user' turns)
    for i in range(len(sent_contents) - 1):
        assert sent_contents[i]["role"] != sent_contents[i + 1]["role"]
    # The consecutive user turns were merged into the single user turn
    assert "Primeira pergunta" in sent_contents[0]["parts"][0]["text"]
    assert "Adicional à primeira" in sent_contents[0]["parts"][0]["text"]


@pytest.mark.asyncio
async def test_chat_api_cross_model_leakage_sanitization(monkeypatch):
    """Verify that cross-provider model leakage is sanitized safely."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-mock-key-12345")
    mock_gemini_resp = MagicMock(spec=Response)
    mock_gemini_resp.status_code = 200
    mock_gemini_resp.json.return_value = {
        "candidates": [{"content": {"parts": [{"text": "OK"}]}}]
    }

    original_send = AsyncClient.send

    async def mock_send(self, request, *args, **kwargs):
        if "generativelanguage.googleapis.com" in str(request.url):
            assert "gemini-3.7-flash" in str(request.url)
            assert "llama" not in str(request.url)
            return mock_gemini_resp
        return await original_send(self, request, *args, **kwargs)

    AsyncClient.send = mock_send
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/chat", json={
                "message": "Teste sanitização",
                "provider": "gemini",
                "model": "llama3.2"  # Incompatible model leaked to gemini
            })
    finally:
        AsyncClient.send = original_send

    assert response.status_code == 200
    assert response.json()["model"] == "gemini-3.7-flash"
