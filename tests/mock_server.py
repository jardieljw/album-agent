"""
Local HTTP Mock Server for Hermetic and Deterministic Verification.
Serves realistic Gallery, Forum, Detail Pages, High-Res Images, and JSON States.
"""

import io
from typing import Dict
from fastapi import FastAPI, Response, Request
from fastapi.responses import HTMLResponse, JSONResponse
from PIL import Image, ImageDraw

app = FastAPI(title="Mock Test Server")

# Image memory cache for lightning-fast test responses
_image_cache: Dict[str, bytes] = {}


def _create_jpeg_bytes(width: int, height: int, text: str, color=(70, 130, 180)) -> bytes:
    """Generates an in-memory valid JPEG image with given dimensions."""
    key = f"{width}_{height}_{text}_{color}"
    if key in _image_cache:
        return _image_cache[key]

    img = Image.new("RGB", (width, height), color=color)
    draw = ImageDraw.Draw(img)
    # Simple label on the image
    draw.text((10, 10), text, fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    data = buf.getvalue()
    _image_cache[key] = data
    return data


# -------------------------------------------------------------
# Image Endpoints
# -------------------------------------------------------------
@app.get("/image/orig_{item_id}.jpg")
async def get_original_image(item_id: int):
    """Returns 3840x5760 full-resolution original image."""
    data = _create_jpeg_bytes(3840, 5760, f"ORIGINAL 4K #{item_id}", color=(34, 139, 34))
    return Response(content=data, media_type="image/jpeg")


@app.get("/image/thumb_{item_id}.jpg")
async def get_thumb_image(item_id: int):
    """Returns 300x450 thumbnail candidate."""
    data = _create_jpeg_bytes(300, 450, f"THUMB #{item_id}", color=(100, 149, 237))
    return Response(content=data, media_type="image/jpeg")


@app.get("/image/truly_missing_{item_id}.jpg")
async def get_truly_missing_image(item_id: int):
    """Returns 300x450 thumbnail candidate with no original counterpart."""
    data = _create_jpeg_bytes(300, 450, f"NO ORIG #{item_id}", color=(100, 149, 237))
    return Response(content=data, media_type="image/jpeg")


@app.get("/image/banner_300x450.jpg")
async def get_banner_image():
    """Returns 300x450 promo banner."""
    data = _create_jpeg_bytes(300, 450, "SPONSORED PROMO BANNER", color=(220, 20, 60))
    return Response(content=data, media_type="image/jpeg")


@app.get("/image/avatar_{user_id}.jpg")
async def get_avatar_image(user_id: int):
    """Returns 64x64 user avatar."""
    data = _create_jpeg_bytes(64, 64, f"U{user_id}", color=(128, 128, 128))
    return Response(content=data, media_type="image/jpeg")


@app.get("/image/logo.png")
async def get_logo_image():
    """Returns 120x40 site logo."""
    data = _create_jpeg_bytes(120, 40, "SITE LOGO", color=(40, 40, 40))
    return Response(content=data, media_type="image/jpeg")


# -------------------------------------------------------------
# HTML Test Pages
# -------------------------------------------------------------
@app.get("/gallery/album-1", response_class=HTMLResponse)
async def get_gallery_album_1(request: Request):
    """
    Test 1, Test 2, Test 5, Test 6:
    - Raw title: Summer Beach (オリジナル) [Vol. 01]
    - 15 album thumbnails inside #tiles
    - Each parent <a> links to /view/photo_{id}.html
    - 12 related thumbnails inside #related-grid
    - Promo banners and logo
    """
    base_url = str(request.base_url).rstrip("/")
    tiles_html = ""
    for i in range(1, 16):
        tiles_html += f"""
        <div class="thumbwook" id="thumb-item-{i}">
            <a href="{base_url}/view/photo_{i}.html" title="Photo #{i}">
                <img src="{base_url}/image/thumb_{i}.jpg" width="300" height="450" alt="Summer Beach Image {i}" />
                <span class="photo-caption">Photo {i:02d}</span>
            </a>
        </div>
        """

    related_html = ""
    for r in range(1, 13):
        related_html += f"""
        <div class="related-card">
            <a href="{base_url}/gallery/related-{r}">
                <img src="{base_url}/image/thumb_{r}.jpg" width="300" height="450" alt="Related Album {r}" />
                <span>Related Set {r}</span>
            </a>
        </div>
        """

    return f"""<!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <title>Summer Beach (オリジナル) [Vol. 01]</title>
        <style>
            body {{ font-family: sans-serif; margin: 0; padding: 20px; }}
            #tiles {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; }}
            #related-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }}
            .promo-banner {{ width: 300px; height: 450px; border: 2px solid red; }}
        </style>
    </head>
    <body>
        <header>
            <img class="site-logo" src="{base_url}/image/logo.png" alt="Site Logo" />
            <nav><a href="/">Home</a> | <a href="/galleries">Galleries</a></nav>
        </header>

        <div class="banner-top">
            <a href="https://sponsor.example.com/affiliate" class="ad-link">
                <img class="promo-banner" src="{base_url}/image/banner_300x450.jpg" alt="Special Promo 50% Off Banner" />
            </a>
        </div>

        <main>
            <h1>Summer Beach (オリジナル) [Vol. 01]</h1>
            <p class="model-meta">Artist: Example Model</p>

            <section id="album-container">
                <div id="tiles">
                    {tiles_html}
                </div>
            </section>

            <section id="related-section">
                <h2>Related Albums & Recommendations</h2>
                <div id="related-grid">
                    {related_html}
                </div>
            </section>
        </main>

        <footer>
            <p>&copy; 2026 Gallery Archive. All rights reserved.</p>
        </footer>
    </body>
    </html>
    """


@app.get("/view/photo_{photo_id}.html", response_class=HTMLResponse)
async def get_photo_detail_page(photo_id: int, request: Request):
    """
    Detail page for photo #{photo_id}.
    Contains high-res 3840x5760 image with srcset and data-original.
    """
    base_url = str(request.base_url).rstrip("/")
    return f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Photo #{photo_id} - Summer Beach (オリジナル)</title>
    </head>
    <body>
        <div id="viewer">
            <h1>Photo #{photo_id}</h1>
            <div class="main-image-wrapper">
                <img id="full-image"
                     src="{base_url}/image/orig_{photo_id}.jpg"
                     srcset="{base_url}/image/orig_{photo_id}.jpg 3840w, {base_url}/image/thumb_{photo_id}.jpg 300w"
                     data-original="{base_url}/image/orig_{photo_id}.jpg"
                     data-full="{base_url}/image/orig_{photo_id}.jpg"
                     width="3840" height="5760"
                     alt="Full Resolution Photo {photo_id}" />
            </div>
            <a href="{base_url}/gallery/album-1">Back to Album</a>
        </div>
    </body>
    </html>
    """


@app.get("/forum/thread-42", response_class=HTMLResponse)
async def get_forum_thread_42(request: Request):
    """
    Test 3: Forum Thread containing commentary, avatars, and textual external album link.
    """
    base_url = str(request.base_url).rstrip("/")
    return f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Forum Discussion: High-Res Summer Beach Photoset Found!</title>
        <style>
            .post {{ border-bottom: 1px solid #ccc; padding: 15px; }}
            .avatar {{ width: 64px; height: 64px; border-radius: 50%; }}
        </style>
    </head>
    <body>
        <h1>[Thread] High-Res Summer Beach Photoset Discussion</h1>

        <div class="post">
            <div class="user-meta">
                <img class="user-avatar" src="{base_url}/image/avatar_1.jpg" alt="User 1 Avatar" />
                <strong>CosplayArchiver</strong>
            </div>
            <div class="post-content">
                <p>Hey everyone, I found the full 15-photo set for the Summer Beach album!</p>
                <p>You can check the full gallery album here:
                   <a class="external-link" href="{base_url}/gallery/album-1">Summer Beach (オリジナル) [Vol. 01] Album</a>
                </p>
                <p>All photos are 4K resolution.</p>
            </div>
        </div>

        <div class="post">
            <div class="user-meta">
                <img class="user-avatar" src="{base_url}/image/avatar_2.jpg" alt="User 2 Avatar" />
                <strong>PhotoCollector</strong>
            </div>
            <div class="post-content">
                <p>Thanks for sharing! The quality looks amazing.</p>
            </div>
        </div>
    </body>
    </html>
    """


@app.get("/gallery/hard-negative", response_class=HTMLResponse)
async def get_hard_negative_page(request: Request):
    """
    Hard Negative Test: 300x450 Promo Banner placed inside/near 300x450 Album Thumbnails.
    """
    base_url = str(request.base_url).rstrip("/")
    return f"""<!DOCTYPE html>
    <html>
    <head>
        <title>Hard Negative Test Album</title>
    </head>
    <body>
        <h1>Hard Negative Test Album</h1>
        <div id="tiles">
            <div class="thumbwook"><a href="{base_url}/view/photo_1.html"><img src="{base_url}/image/thumb_1.jpg" width="300" height="450" alt="Item 1" /></a></div>
            <div class="thumbwook"><a href="{base_url}/view/photo_2.html"><img src="{base_url}/image/thumb_2.jpg" width="300" height="450" alt="Item 2" /></a></div>
            <div class="thumbwook"><a href="{base_url}/view/photo_3.html"><img src="{base_url}/image/thumb_3.jpg" width="300" height="450" alt="Item 3" /></a></div>
        </div>

        <aside class="sidebar-promo">
            <a href="https://sponsor.com/sale" class="affiliate-banner">
                <img class="promo-banner" src="{base_url}/image/banner_300x450.jpg" width="300" height="450" alt="Sponsored Advertisement Promo Sale" />
            </a>
        </aside>
    </body>
    </html>
    """


@app.get("/gallery/json-state", response_class=HTMLResponse)
async def get_json_state_album(request: Request):
    """
    Mock Test A: Detail page contains high-res URLs in window.__INITIAL_STATE__ / ld+json.
    """
    base_url = str(request.base_url).rstrip("/")
    return f"""<!DOCTYPE html>
    <html>
    <head>
        <title>JSON State Album</title>
    </head>
    <body>
        <h1>JSON State Album</h1>
        <div id="tiles">
            <div class="thumbwook"><a href="{base_url}/view/json_photo_1.html"><img src="{base_url}/image/thumb_1.jpg" width="300" height="450" alt="JSON 1" /></a></div>
            <div class="thumbwook"><a href="{base_url}/view/json_photo_2.html"><img src="{base_url}/image/thumb_2.jpg" width="300" height="450" alt="JSON 2" /></a></div>
        </div>
    </body>
    </html>
    """


@app.get("/view/json_photo_{photo_id}.html", response_class=HTMLResponse)
async def get_json_photo_detail_page(photo_id: int, request: Request):
    """Detail page with embedded JSON state."""
    base_url = str(request.base_url).rstrip("/")
    return f"""<!DOCTYPE html>
    <html>
    <head>
        <title>JSON Photo #{photo_id}</title>
        <script>
            window.__INITIAL_STATE__ = {{
                "mediaItem": {{
                    "id": {photo_id},
                    "originalUrl": "{base_url}/image/orig_{photo_id}.jpg",
                    "width": 3840,
                    "height": 5760
                }}
            }};
        </script>
        <script type="application/ld+json">
        {{
            "@context": "https://schema.org",
            "@type": "ImageObject",
            "contentUrl": "{base_url}/image/orig_{photo_id}.jpg",
            "width": 3840,
            "height": 5760
        }}
        </script>
    </head>
    <body>
        <div id="app">
            <h1>Dynamic Photo Viewer</h1>
            <!-- No <img> tag with full res in raw HTML -->
            <img src="{base_url}/image/thumb_{photo_id}.jpg" width="300" height="450" />
        </div>
    </body>
    </html>
    """


@app.get("/gallery/unresolvable", response_class=HTMLResponse)
async def get_unresolvable_page(request: Request):
    """
    Test 7: Album with 2 resolvable originals and 2 unresolvable thumbnails.
    """
    base_url = str(request.base_url).rstrip("/")
    return f"""<!DOCTYPE html>
    <html>
    <head>
        <title>Mixed Resolution Album</title>
    </head>
    <body>
        <h1>Mixed Resolution Album</h1>
        <div id="tiles">
            <!-- Resolvable -->
            <div class="thumbwook"><a href="{base_url}/view/photo_1.html"><img src="{base_url}/image/thumb_1.jpg" width="300" height="450" alt="Res 1" /></a></div>
            <div class="thumbwook"><a href="{base_url}/view/photo_2.html"><img src="{base_url}/image/thumb_2.jpg" width="300" height="450" alt="Res 2" /></a></div>
            <!-- Unresolvable (no detail page, no higher res exists) -->
            <div class="thumbwook"><img src="{base_url}/image/truly_missing_3.jpg" width="300" height="450" alt="No Original 3" /></div>
            <div class="thumbwook"><img src="{base_url}/image/truly_missing_4.jpg" width="300" height="450" alt="No Original 4" /></div>
        </div>
    </body>
    </html>
    """


@app.get("/api/v1/gallery/spa-album", response_class=JSONResponse)
async def get_spa_gallery_api(request: Request):
    """Returns REST API JSON manifest with 5 4K photo items."""
    base_url = str(request.base_url).rstrip("/")
    return {
        "status": "success",
        "album_title": "Modern SPA Gallery Collection",
        "data": {
            "total_items": 5,
            "media_items": [
                {
                    "item_id": i,
                    "title": f"SPA Photo {i}",
                    "original_url": f"{base_url}/image/orig_{i}.jpg",
                    "thumbnail_url": f"{base_url}/image/thumb_{i}.jpg",
                    "width": 3840,
                    "height": 5760,
                    "format": "JPEG",
                    "dimensions": {"width": 3840, "height": 5760}
                }
                for i in range(1, 6)
            ]
        }
    }


@app.get("/gallery/spa-app", response_class=HTMLResponse)
async def get_spa_gallery_page(request: Request):
    """Renders a modern SPA page that loads image manifest via client-side fetch()."""
    base_url = str(request.base_url).rstrip("/")
    return f"""<!DOCTYPE html>
    <html>
    <head>
        <title>SPA Dynamic Photo Gallery</title>
    </head>
    <body>
        <h1>SPA Dynamic Photo Gallery</h1>
        <div id="spa-tiles">Loading gallery...</div>
        <script>
            fetch('{base_url}/api/v1/gallery/spa-album')
                .then(res => res.json())
                .then(json => {{
                    const container = document.getElementById('spa-tiles');
                    container.innerHTML = '';
                    json.data.media_items.forEach(item => {{
                        const div = document.createElement('div');
                        div.className = 'spa-item';
                        div.innerHTML = `<img src="${{item.thumbnail_url}}" width="300" height="450" alt="${{item.title}}" data-id="${{item.item_id}}" />`;
                        container.appendChild(div);
                    }});
                }});
        </script>
    </body>
    </html>
    """

