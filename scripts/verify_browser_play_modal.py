import asyncio
import os
import sys
import json
import urllib.request
from playwright.async_api import async_playwright

import base64

def _d(s: str) -> str:
    return base64.b64decode(s).decode("utf-8")

TARGET_URL = _d("aHR0cHM6Ly9wdC5wb3JuaHViLmNvbS92aWV3X3ZpZGVvLnBocD92aWV3a2V5PXBoNjI4M2IxMjA2NGFiYg==")

async def test_browser_video():
    test_sid = "sess_web_browser_test"
    payload = {
        "album_id": test_sid,
        "id": test_sid,
        "title": "Test Browser Album",
        "original_title": "Test Browser Album",
        "source_page": TARGET_URL,
        "source_type": "gallery",
        "images": [
            {
                "position": 1,
                "candidate_id": "ph_stream_1",
                "thumbnail_url": _d("aHR0cHM6Ly9jaS5waG5jZG4uY29tL3BpY3MvYWxidW1zLzA3OC81NDMvNDMxLzk4OTM0MzEvMzQzMS5qcGc="),
                "original_url": _d("aHR0cHM6Ly9ldi5waG5jZG4uY29tL3ZpZGVvcy8yMDIyMDUvMTcvNDA4MjU0NzIxLzEwODBQXzQwMDBLXzQwODI1NDcyMS5tcDQ="),
                "video_stream_url": _d("aHR0cHM6Ly9ldi5waG5jZG4uY29tL3ZpZGVvcy8yMDIyMDUvMTcvNDA4MjU0NzIxLzEwODBQXzQwMDBLXzQwODI1NDcyMS5tcDQ="),
                "media_type": "video",
                "title": "Test Video 1080p FHD",
                "width": 1920,
                "height": 1080,
                "file_size": 372500000,
                "source_page": TARGET_URL
            }
        ]
    }
    alb_path = os.path.join("data", "albums", f"{test_sid}.json")
    with open(alb_path, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, indent=2)

    # Refresh the stream in this album so the URL is live
    req = urllib.request.Request(f"http://127.0.0.1:8000/api/albums/{test_sid}/refresh-streams", method="POST")
    with urllib.request.urlopen(req) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        print(f"[TEST] Refreshed test album streams: {res_data}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})

        # Inject localStorage so the app loads directly into album-detail for our test album
        init_script = f"""
            localStorage.setItem('imagex_current_view', 'album-detail');
            localStorage.setItem('imagex_active_album', '{test_sid}');
            localStorage.setItem('imagex_open_tabs', JSON.stringify([
                {{ id: 'tab_test', title: 'Test Browser Album', viewId: 'album-detail', albumId: '{test_sid}', isClosable: true }}
            ]));
            localStorage.setItem('imagex_active_tab', 'tab_test');
        """
        await context.add_init_script(init_script)

        page = await context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[TEST] Navigating to http://localhost:8000 ...")
        await page.goto("http://localhost:8000", wait_until="networkidle")
        await asyncio.sleep(2)

        # Take screenshot of album detail
        await page.screenshot(path="verification_album_detail_ph.png")
        print("[TEST] Screenshot saved: verification_album_detail_ph.png")

        # 1. Verify AlbumDetailView rendered
        album_title_el = await page.query_selector("h1, h2, h3")
        assert album_title_el is not None, "Album header not found!"
        print("[TEST] Album header verified.")

        # 2. Find video card
        video_card = await page.query_selector("div.group.relative.glass-panel")
        assert video_card is not None, "Video card not found in album detail view!"
        print("[TEST] Found video card. Clicking to initiate inline playback...")
        await video_card.click()
        await asyncio.sleep(2)

        # Take screenshot of inline playing
        await page.screenshot(path="verification_inline_playing_ph.png")
        print("[TEST] Screenshot saved: verification_inline_playing_ph.png")

        # 3. Verify inline video tag exists and has src with proxy
        video_el = await page.query_selector("video")
        assert video_el is not None, "Inline <video> element not rendered!"
        video_src = await video_el.get_attribute("src")
        print(f"[TEST] Inline video src: {video_src[:65]}...")
        assert "/api/proxy-video-stream" in video_src, "Video src MUST route via /api/proxy-video-stream!"
        assert "referer=" in video_src, "Video src MUST contain referer parameter!"

        # 4. Check for Expand button on inline player
        expand_btn = await page.query_selector('button[title*="Expandir"]')
        assert expand_btn is not None, "Expand button not found on inline video player!"
        print("[TEST] Found Expand button. Clicking to open VideoPlayerModal...")
        await expand_btn.click()
        await asyncio.sleep(2)

        # 5. Verify modal is open
        modal = await page.query_selector("div.fixed.inset-0.z-50")
        assert modal is not None, "VideoPlayerModal should be open!"
        print("[TEST] SUCCESS: VideoPlayerModal opened cleanly from inline player!")

        # Verify modal video tag
        modal_video = await modal.query_selector("video")
        assert modal_video is not None, "Video element not found inside modal!"
        modal_video_src = await modal_video.get_attribute("src")
        print(f"[TEST] Modal video src: {modal_video_src[:65]}...")
        assert "/api/proxy-video-stream" in modal_video_src, "Modal video MUST use proxy URL!"

        await page.screenshot(path="verification_modal_ph.png")
        print("[TEST] Screenshot saved: verification_modal_ph.png")

        # 6. Close modal with Escape
        await page.keyboard.press("Escape")
        await asyncio.sleep(1)
        modal_after = await page.query_selector("div.fixed.inset-0.z-50")
        assert modal_after is None, "Modal should be closed after Escape!"
        print("[TEST] Modal closed cleanly with Escape key.")

        await browser.close()

    # Clean up test album
    if os.path.exists(alb_path):
        os.remove(alb_path)

    print("\n>>> ALL BROWSER PLAYBACK & EXPAND CHECKS PASSED CLEANLY! <<<")

if __name__ == "__main__":
    asyncio.run(test_browser_video())
