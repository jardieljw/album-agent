import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from src.server.server import app, TaskJobController, DownloadTaskController, _active_jobs, _job_controllers


@pytest.mark.asyncio
async def test_task_job_controller_pause_resume():
    ctrl = TaskJobController()
    assert not ctrl.is_paused
    assert ctrl.is_active()

    ctrl.pause()
    assert ctrl.is_paused

    # wait_if_paused should block until resume
    resumed = False

    async def unpause_later():
        nonlocal resumed
        await asyncio.sleep(0.05)
        resumed = True
        ctrl.resume()

    asyncio.create_task(unpause_later())
    await ctrl.wait_if_paused()
    assert resumed
    assert not ctrl.is_paused


@pytest.mark.asyncio
async def test_download_task_controller_pause_resume():
    dummy_task = asyncio.create_task(asyncio.sleep(1))
    ctrl = DownloadTaskController(dummy_task)
    assert not ctrl.is_paused

    ctrl.pause()
    assert ctrl.is_paused

    ctrl.resume()
    assert not ctrl.is_paused

    ctrl.cancel()
    assert ctrl.is_cancelled
    dummy_task.cancel()


@pytest.mark.asyncio
async def test_api_pause_and_resume_endpoints():
    test_session_id = "test-session-pause-123"
    ctrl = TaskJobController()
    _job_controllers[test_session_id] = ctrl
    _active_jobs[test_session_id] = {
        "session_id": test_session_id,
        "status": "active",
        "progress": {"status": "Running"},
        "started_at": "2026-10-04T12:00:00"
    }

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Pause job
            res_pause = await client.post(f"/api/jobs/{test_session_id}/pause")
            assert res_pause.status_code == 200
            data_pause = res_pause.json()
            assert data_pause["status"] == "paused"
            assert ctrl.is_paused
            assert _active_jobs[test_session_id]["status"] == "paused"

            # 2. Check /api/jobs/active includes paused job
            res_active = await client.get("/api/jobs/active")
            assert res_active.status_code == 200
            active_list = res_active.json()
            assert any(j["session_id"] == test_session_id and j["status"] == "paused" for j in active_list)

            # 3. Resume job
            res_resume = await client.post(f"/api/jobs/{test_session_id}/resume")
            assert res_resume.status_code == 200
            data_resume = res_resume.json()
            assert data_resume["status"] == "active"
            assert not ctrl.is_paused
            assert _active_jobs[test_session_id]["status"] == "active"
    finally:
        _job_controllers.pop(test_session_id, None)
        _active_jobs.pop(test_session_id, None)


@pytest.mark.asyncio
async def test_investigation_controller_pause_resume():
    from src.agent.controller import InvestigationController
    ctrl = InvestigationController()
    assert not ctrl.is_paused
    ctrl.pause()
    assert ctrl.is_paused

    resumed = False

    async def unpause_later():
        nonlocal resumed
        await asyncio.sleep(0.05)
        resumed = True
        ctrl.resume()

    asyncio.create_task(unpause_later())
    await ctrl.wait_if_paused()
    assert resumed
    assert not ctrl.is_paused


@pytest.mark.asyncio
async def test_active_jobs_endpoint_filters_correctly():
    comp_id = "test-comp-job"
    active_id = "test-running-job"
    _active_jobs[comp_id] = {"session_id": comp_id, "status": "completed"}
    _active_jobs[active_id] = {"session_id": active_id, "status": "active"}

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/jobs/active")
            assert res.status_code == 200
            ids = [j["session_id"] for j in res.json()]
            assert active_id in ids
            assert comp_id not in ids
    finally:
        _active_jobs.pop(comp_id, None)
        _active_jobs.pop(active_id, None)
