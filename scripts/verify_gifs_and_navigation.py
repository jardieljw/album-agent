import asyncio
import os
import sys
from playwright.async_api import async_playwright

async def main():
    print("=== Starting End-to-End Verification ===")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        # Capture console errors to ensure zero regressions
        page_errors = []
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on("console", lambda msg: print(f"Browser Console [{msg.type}]: {msg.text}") if msg.type == "error" else None)

        # 1. Test Gallery View & GIF Filter
        print("\n--- Testing Gallery View & GIF Filter ---")
        await page.goto("http://localhost:8000/#/gallery", wait_until="networkidle")
        await page.wait_for_timeout(3000)

        # Check for 'Com GIFs' filter chip
        com_gifs_btn = page.locator("button:has-text('Com GIFs')")
        has_gif_btn = await com_gifs_btn.count() > 0
        print(f"Filter button 'Com GIFs' found: {has_gif_btn}")
        assert has_gif_btn, "Button 'Com GIFs' should be visible in Gallery"

        # Click 'Com GIFs'
        await com_gifs_btn.first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path="verification_gallery_gifs.png")
        print("Captured screenshot: verification_gallery_gifs.png")

        # 2. Click an Album with GIFs from GalleryView to open AlbumDetailView
        print("\n--- Testing Transition to Album Detail View ---")
        first_album_card = page.locator("[data-album-id]").first
        assert await first_album_card.count() > 0, "At least one album with GIFs must be present"
        album_id = await first_album_card.get_attribute("data-album-id")
        print(f"Opening album with ID: {album_id}")
        await first_album_card.click()
        await page.wait_for_timeout(2500)

        # Check breadcrumb with folder redirect
        breadcrumb_folder = page.locator("button:has-text('Pasta:')")
        has_breadcrumb = await breadcrumb_folder.count() > 0
        print(f"Folder breadcrumb found: {has_breadcrumb}")
        assert has_breadcrumb, "Folder breadcrumb must be visible"

        # Check 'Ver Vídeos da Pasta' button
        videos_folder_btn = page.locator("button:has-text('Ver Vídeos da Pasta')")
        has_vid_folder_btn = await videos_folder_btn.count() > 0
        print(f"'Ver Vídeos da Pasta' button found: {has_vid_folder_btn}")
        assert has_vid_folder_btn, "'Ver Vídeos da Pasta' button must be visible"

        # Check 4 Card Viewing Modes
        adaptive_btn = page.locator("button:has-text('Adaptativo')")
        panoramic_btn = page.locator("button:has-text('Panorâmico')")
        masonry_btn = page.locator("button:has-text('Masonry')")
        standard_btn = page.locator("button:has-text('4:5')")

        assert await adaptive_btn.count() > 0, "Adaptativo button must exist"
        assert await panoramic_btn.count() > 0, "Panorâmico button must exist"
        assert await masonry_btn.count() > 0, "Masonry button must exist"
        assert await standard_btn.count() > 0, "Standard 4:5 button must exist"
        print("All 4 card viewing mode buttons verified!")

        # Verify GIF card badge
        gif_badge = page.locator("span:has-text('GIF')")
        has_gif_badge = await gif_badge.count() > 0
        print(f"GIF badge on card found: {has_gif_badge}")
        assert has_gif_badge, "GIF badge must be present on card"
        badge_text = await gif_badge.first.inner_text()
        print(f"GIF badge content: '{badge_text}'")

        # Test switching to Panorâmico Mode
        print("Switching card viewing mode to Panorâmico...")
        await panoramic_btn.first.click()
        await page.wait_for_timeout(1000)
        await page.screenshot(path="verification_album_panoramic_gifs.png")
        print("Captured screenshot: verification_album_panoramic_gifs.png")

        # 3. Test GIF in Lightbox
        print("\n--- Testing GIF Playback in Lightbox ---")
        album_gif_chip = page.locator("button:has-text('GIFs Animados')").first
        if await album_gif_chip.count() > 0:
            print("Filtering album by GIFs Animados...")
            await album_gif_chip.click()
            await page.wait_for_timeout(1000)

        first_gif_card = page.locator("div.group.relative.glass-panel").first
        await first_gif_card.click()
        await page.wait_for_timeout(2000)

        # Check Lightbox opened with GIF ANIMADO badge
        lightbox_open = await page.locator("text=GIF ANIMADO").count() > 0
        print(f"Lightbox opened with 'GIF ANIMADO' badge: {lightbox_open}")
        assert lightbox_open, "Lightbox should display 'GIF ANIMADO' badge"

        await page.screenshot(path="verification_lightbox_gif.png")
        print("Captured screenshot: verification_lightbox_gif.png")

        # Close Lightbox (press Escape)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(800)

        # 4. Test Videos View Navigation
        print("\n--- Testing Videos View & Folder Navigation ---")
        await page.goto("http://localhost:8000/#/videos", wait_until="networkidle")
        await page.wait_for_timeout(2500)

        # Verify video card folder badge is clickable
        first_video_card = page.locator("div.group.relative").first
        folder_badge = first_video_card.locator("button:has-text('Geral'), button:has-text('Extraídos')").first
        has_video_folder_badge = await folder_badge.count() > 0
        print(f"Clickable folder badge on video card: {has_video_folder_badge}")
        if has_video_folder_badge:
            folder_name = await folder_badge.inner_text()
            print(f"Clicking video card folder badge: '{folder_name}'")
            await folder_badge.click()
            await page.wait_for_timeout(1000)

        # Verify 3-dots dropdown menu "Ir para Álbum de Origem"
        more_btn = first_video_card.locator("button[title='Opções do vídeo']").first
        if await more_btn.count() > 0:
            await more_btn.click()
            await page.wait_for_timeout(600)
            orig_album_btn = page.locator("button:has-text('Ir para Álbum de Origem')")
            has_orig_album_btn = await orig_album_btn.count() > 0
            print(f"'Ir para Álbum de Origem' option found in 3-dots menu: {has_orig_album_btn}")
            assert has_orig_album_btn, "'Ir para Álbum de Origem' must exist in dropdown menu"
            await page.screenshot(path="verification_video_dropdown_origin_album.png")
            print("Captured screenshot: verification_video_dropdown_origin_album.png")

            # Click 'Ir para Álbum de Origem'
            print("Clicking 'Ir para Álbum de Origem'...")
            await orig_album_btn.click()
            await page.wait_for_timeout(2000)
            await page.screenshot(path="verification_navigated_to_origin.png")
            print("Captured screenshot: verification_navigated_to_origin.png")

        print(f"\nTotal critical page errors: {len(page_errors)}")
        assert len(page_errors) == 0, f"Encountered unexpected page errors: {page_errors}"

        print("\n=== ALL E2E VERIFICATIONS PASSED WITH 100% SUCCESS! ===")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
