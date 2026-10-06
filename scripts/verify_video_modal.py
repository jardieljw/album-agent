import asyncio
import sys
import json
import urllib.request
from playwright.async_api import async_playwright

async def main():
    req = urllib.request.urlopen("http://localhost:8000/api/videos")
    data = json.loads(req.read().decode('utf-8'))
    videos = data.get("videos", [])
    print(f"[TEST] Total videos in backend: {len(videos)}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        console_errors = []
        page_errors = []

        def on_console(msg):
            if msg.type == "error":
                text = msg.text
                console_errors.append(text)
                print(f"[BROWSER CONSOLE ERROR]: {text}")

        def on_page_error(err):
            page_errors.append(str(err))
            print(f"[BROWSER PAGE ERROR]: {err}")

        page.on("console", on_console)
        page.on("pageerror", on_page_error)

        print("[TEST] Navigating to http://localhost:8000/#/videos ...")
        await page.goto("http://localhost:8000/#/videos", wait_until="networkidle")
        await asyncio.sleep(2)

        # Wait for thumbnails to be loaded
        thumb_selector = ".group\\/thumb"
        await page.wait_for_selector(thumb_selector, timeout=10000)
        thumbs = await page.query_selector_all(thumb_selector)
        print(f"[TEST] Found {len(thumbs)} video thumbnail cards.")
        assert len(thumbs) > 0, "No video thumbnail cards found!"

        # Click the first thumbnail card to open VideoPlayerModal
        print("[TEST] Clicking the first video thumbnail card to trigger VideoPlayerModal...")
        await thumbs[0].click()
        await asyncio.sleep(2)

        # Verify modal is open and DOM is healthy
        modal_container = await page.query_selector("div.fixed.inset-0.z-50")
        assert modal_container is not None, "VideoPlayerModal container not found after click!"
        print("[TEST] SUCCESS: VideoPlayerModal container is rendered in DOM.")

        # Verify video element
        video_el = await page.query_selector("video")
        assert video_el is not None, "HTML <video> element not found inside modal!"
        src = await video_el.get_attribute("src")
        has_native_controls = await video_el.get_attribute("controls")
        assert has_native_controls is None, "HTML <video> element should not have native controls attribute!"
        print(f"[TEST] SUCCESS: <video> element found with src={src} and clean custom UI (no native controls collision).")

        # Take screenshot of the cleanly opened modal
        await page.screenshot(path="video_modal_opened.png")

        # Test video surface click to pause
        initial_paused = await page.evaluate('() => document.querySelector("video").paused')
        print(f"[TEST] Initial video paused status: {initial_paused}")

        if not initial_paused:
            print("[TEST] Clicking video element to pause...")
            await video_el.click()
            await asyncio.sleep(0.8)
            is_paused = await page.evaluate('() => document.querySelector("video").paused')
            assert is_paused is True, "Clicking video failed to pause playback!"
            print("[TEST] SUCCESS: Clicking video successfully paused playback.")

            # Central play overlay should now be visible
            play_overlay = await page.query_selector(".scale-110, .scale-125")
            assert play_overlay is not None, "Central play overlay button should appear when paused!"
            print("[TEST] SUCCESS: Central play overlay button is visible.")

            # Click central play overlay to resume
            print("[TEST] Clicking central play overlay to resume playback...")
            await play_overlay.click()
            await asyncio.sleep(0.8)
            is_resumed = await page.evaluate('() => document.querySelector("video").paused')
            assert is_resumed is False, "Clicking central play overlay failed to resume playback!"
            print("[TEST] SUCCESS: Clicking central play overlay successfully resumed playback.")

        # Test Space key toggle
        print("[TEST] Pressing Space key to toggle play/pause...")
        await page.keyboard.press("Space")
        await asyncio.sleep(0.8)
        paused_space = await page.evaluate('() => document.querySelector("video").paused')
        print(f"[TEST] Video paused status after Space key: {paused_space}")
        assert paused_space is True, "Space key failed to pause playback!"

        await page.keyboard.press("Space")
        await asyncio.sleep(0.8)
        resumed_space = await page.evaluate('() => document.querySelector("video").paused')
        print(f"[TEST] Video paused status after second Space key: {resumed_space}")
        assert resumed_space is False, "Space key failed to resume playback!"
        print("[TEST] SUCCESS: Space key keyboard shortcut toggles playback cleanly.")

        # Verify Close button works (Emergency exit or X button)
        close_btn = await page.query_selector("button[title*='Fechar Vídeo'], button[aria-label='Fechar Reprodutor de Vídeo']")
        assert close_btn is not None, "Close button not found!"
        print("[TEST] Clicking close button...")
        await close_btn.click()
        await asyncio.sleep(1)

        # Verify modal closed
        video_el_closed = await page.query_selector("div.fixed.inset-0.z-50")
        assert video_el_closed is None, "Modal did not close after clicking close button!"
        print("[TEST] SUCCESS: VideoPlayerModal closed cleanly.")

        # Test reopening another video (second card if available)
        if len(thumbs) > 1:
            print("[TEST] Clicking second video thumbnail to verify consecutive open/close...")
            await thumbs[1].click()
            await asyncio.sleep(1.5)
            modal_container2 = await page.query_selector("div.fixed.inset-0.z-50")
            assert modal_container2 is not None, "Second modal open failed!"
            print("[TEST] SUCCESS: Second video opened cleanly without error.")

            # Test keyboard Escape to close
            print("[TEST] Pressing Escape key to close modal...")
            await page.keyboard.press("Escape")
            await asyncio.sleep(1)
            modal_container_esc = await page.query_selector("div.fixed.inset-0.z-50")
            assert modal_container_esc is None, "Modal did not close on Escape key!"
            print("[TEST] SUCCESS: Modal closed via Escape key.")

        # Check console and page errors for React #310 or other fatal errors
        hook_errors = [e for e in console_errors + page_errors if "310" in e or "Rendered more hooks" in e or "rendered fewer hooks" in e]
        assert len(hook_errors) == 0, f"React hook violation detected: {hook_errors}"

        fatal_page_errors = [e for e in page_errors]
        assert len(fatal_page_errors) == 0, f"Fatal page errors detected: {fatal_page_errors}"

        # Verify #root is still completely mounted and healthy
        root_content = await page.inner_html("#root")
        assert len(root_content) > 1000, "DOM unmounted or corrupted!"
        print(f"[TEST] SUCCESS: React application root is fully mounted ({len(root_content)} chars).")

        print("\n========================================================")
        print("[SUCCESS] ALL VERIFICATION TESTS PASSED FLAWLESSLY!")
        print("========================================================\n")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
