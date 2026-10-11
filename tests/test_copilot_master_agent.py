import os
import json
import pytest
import asyncio
from src.agent.copilot_master_agent import (
    copilot_master_agent,
    CopilotMasterAgent,
    COPILOT_TOOL_DECLARATIONS,
    set_runtime_context
)


def test_tool_declarations_count_and_schema():
    """Validates that all tool declarations conform to Gemini Function Calling schema specifications."""
    assert len(COPILOT_TOOL_DECLARATIONS) >= 40
    for tool in COPILOT_TOOL_DECLARATIONS:
        assert "name" in tool, f"Tool missing name: {tool}"
        assert "description" in tool, f"Tool {tool.get('name')} missing description"
        assert "parameters" in tool, f"Tool {tool.get('name')} missing parameters"
        assert tool["parameters"]["type"] == "OBJECT"
        assert "properties" in tool["parameters"]


@pytest.mark.asyncio
async def test_album_and_photo_tools():
    """Tests deterministic execution of album creation, listing, searching and deletion."""
    agent = CopilotMasterAgent()

    # 1. Create Album
    res, media, action = await agent.execute_tool("create_album", {"title": "Test Autonomous Album", "folder": "Geral"})
    assert res.get("success") is True
    album_id = res.get("album_id")
    assert album_id is not None
    assert action == {"type": "navigate", "view": "album-detail", "target_id": album_id}

    # 2. List Albums
    res_list, media_list, _ = await agent.execute_tool("list_albums", {"query": "Test Autonomous"})
    assert res_list.get("total_found", 0) >= 1
    found = any(a["id"] == album_id for a in res_list.get("albums", []))
    assert found is True

    # 3. Rename Album
    res_ren, _, _ = await agent.execute_tool("rename_album", {"album_id": album_id, "new_title": "Renamed Autonomous Album"})
    assert res_ren.get("success") is True
    assert res_ren.get("new_title") == "Renamed Autonomous Album"

    # 4. Toggle Favorite
    res_fav, _, _ = await agent.execute_tool("toggle_favorite_album", {"album_id": album_id})
    assert res_fav.get("success") is True
    assert "is_favorite" in res_fav

    # 5. Search Photos
    res_search, media_photos, _ = await agent.execute_tool("search_photos", {"query": "", "limit": 10})
    assert "total_found" in res_search
    assert isinstance(res_search.get("photos"), list)

    # 6. Delete Album
    res_del, _, action_del = await agent.execute_tool("delete_album", {"album_id": album_id})
    assert res_del.get("success") is True
    assert action_del == {"type": "navigate", "view": "gallery"}


@pytest.mark.asyncio
async def test_video_and_folder_tools():
    """Tests video listing, details, and folder management."""
    agent = CopilotMasterAgent()

    # 1. List Folders
    res_folders, _, _ = await agent.execute_tool("list_folders", {"type": "all"})
    assert "albums_folders" in res_folders or "videos_folders" in res_folders

    # 2. Create Folder
    res_create_f, _, _ = await agent.execute_tool("create_folder", {"name": "TestFolderAuto", "type": "all"})
    assert res_create_f.get("success") is True

    # 3. Rename Folder
    res_ren_f, _, _ = await agent.execute_tool("rename_folder", {"old_name": "TestFolderAuto", "new_name": "TestFolderRenamed", "type": "all"})
    assert res_ren_f.get("success") is True

    # 4. Delete Folder
    res_del_f, _, _ = await agent.execute_tool("delete_folder", {"name": "TestFolderRenamed", "type": "all"})
    assert res_del_f.get("success") is True

    # 5. List Videos
    res_vids, media_vids, _ = await agent.execute_tool("list_videos", {"limit": 5})
    assert "total_found" in res_vids or "videos" in res_vids


@pytest.mark.asyncio
async def test_client_ui_actions():
    """Tests UI navigation, filtering, and media preview actions."""
    agent = CopilotMasterAgent()

    # 1. Navigate to Videos view
    res_nav, _, action_nav = await agent.execute_tool("navigate_app_view", {"view_name": "videos"})
    assert res_nav.get("success") is True
    assert action_nav == {"type": "navigate", "view": "videos", "target_id": ""}

    # 2. Apply UI Filter
    res_filt, _, action_filt = await agent.execute_tool("apply_ui_filter", {"filter_type": "search_query", "value": "praia"})
    assert res_filt.get("success") is True
    assert action_filt == {"type": "filter", "filter_type": "search_query", "value": "praia"}

    # 3. Preview Media
    res_prev, media_prev, action_prev = await agent.execute_tool("preview_media", {
        "media_type": "image",
        "url": "http://localhost:8000/api/images/test.jpg",
        "title": "Foto de Teste"
    })
    assert res_prev.get("success") is True
    assert len(media_prev) == 1
    assert media_prev[0]["type"] == "image"
    assert action_prev["type"] == "preview"


@pytest.mark.asyncio
async def test_settings_and_analytics_tools():
    """Tests inspection of app settings and storage analytics."""
    agent = CopilotMasterAgent()

    # 1. Get Settings
    res_sett, _, _ = await agent.execute_tool("get_app_settings", {})
    assert "gemini_api_key_configured" in res_sett

    # 2. Get Storage Analytics
    res_stor, _, _ = await agent.execute_tool("get_storage_analytics", {})
    assert "total_albums" in res_stor
    assert "storage_root" in res_stor
