import asyncio
import sys
import json
import urllib.request
from playwright.async_api import async_playwright

async def main():
    print("[TEST] Fetching video list from backend...")
    req = urllib.request.urlopen("http://localhost:8000/api/videos")
    data = json.loads(req.read().decode('utf-8'))
    videos = data.get("videos", [])
    print(f"[TEST] Total videos in backend: {len(videos)}")
    assert len(videos) > 0, "No videos found in backend!"

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

        # 1. Wait for video cards
        thumb_selector = ".group\\/thumb"
        await page.wait_for_selector(thumb_selector, timeout=10000)
        thumbs = await page.query_selector_all(thumb_selector)
        print(f"[TEST] Found {len(thumbs)} video thumbnail cards.")
        assert len(thumbs) >= 2, "Need at least 2 video cards to test simultaneous playback!"

        # 2. Click the first video card
        print("[TEST] Clicking the first video card (thumbnail)...")
        await thumbs[0].click()
        await asyncio.sleep(1.5)

        # Verify NO popup modal opened
        modal = await page.query_selector("div.fixed.inset-0.z-50")
        assert modal is None, "Popup modal should NOT open when clicking video card!"
        print("[TEST] SUCCESS: No popup modal opened on card click.")

        # Verify inline video player is rendered inside the card
        inline_videos = await page.query_selector_all("video")
        assert len(inline_videos) == 1, f"Expected 1 inline video, found {len(inline_videos)}"
        print("[TEST] SUCCESS: 1 inline video element is playing inside the card.")

        # 3. Click the second video card to verify simultaneous playback
        thumbs_after = await page.query_selector_all(thumb_selector)
        print(f"[TEST] Clicking second video card (thumbs remaining: {len(thumbs_after)})...")
        await thumbs_after[0].click()
        await asyncio.sleep(1.5)

        inline_videos_2 = await page.query_selector_all("video")
        assert len(inline_videos_2) == 2, f"Expected 2 inline videos playing simultaneously, found {len(inline_videos_2)}"
        print("[TEST] SUCCESS: 2 inline videos playing simultaneously in their respective cards.")

        # 4. Test Expand (Maximize) button on the inline player
        expand_inline_btn = await page.query_selector('button[title*="Expandir"]')
        assert expand_inline_btn is not None, "Expand button not found on video card / inline player!"
        print("[TEST] Found expand button. Clicking it to open modal player...")
        await expand_inline_btn.click()
        await asyncio.sleep(1.5)

        # Verify modal is now open
        modal = await page.query_selector("div.fixed.inset-0.z-50")
        assert modal is not None, "Modal should be open after clicking Expand button!"
        print("[TEST] SUCCESS: Modal player opened cleanly after clicking Expand button.")

        # Take screenshot of expanded modal
        await page.screenshot(path="inline_to_expand_modal.png")

        # 5. Close modal with Escape key
        print("[TEST] Pressing Escape key to close modal...")
        await page.keyboard.press("Escape")
        await asyncio.sleep(1)

        modal_after = await page.query_selector("div.fixed.inset-0.z-50")
        assert modal_after is None, "Modal should be closed after pressing Escape!"
        print("[TEST] SUCCESS: Modal closed cleanly, returned to gallery.")

        # Check for any fatal React errors
        root_content = await page.evaluate('() => document.getElementById("root")?.innerHTML?.length || 0')
        assert root_content > 1000, f"#root is empty or crashed! Length: {root_content}"
        print(f"[TEST] #root DOM length is healthy: {root_content} characters.")

        critical_errors = [e for e in console_errors + page_errors if "Minified React error" in e or "Invariant Violation" in e]
        assert len(critical_errors) == 0, f"Critical React errors encountered: {critical_errors}"
        print("[TEST] ZERO React errors! All assertions passed successfully!")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
