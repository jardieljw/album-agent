import pytest
from bs4 import BeautifulSoup
from src.server.multi_album_service import MultiAlbumService, DiscoveredAlbumItem

def test_is_related_container_detection():
    html_doc = """
    <div>
        <main class="main-content">
            <div class="gallery-grid">
                <a id="main-link-1" href="/album/featured-gallery-1">
                    <img src="/thumb1.jpg" />
                    <span>Featured Gallery 1</span>
                </a>
            </div>
            <div class="performer-galleries">
                <a id="main-link-2" href="/album/featured-gallery-2">
                    <img src="/thumb2.jpg" />
                    <span>Featured Gallery 2</span>
                </a>
            </div>
        </main>
        <aside class="sidebar-widgets">
            <div class="related-posts">
                <a id="rel-link-1" href="/album/related-gallery-1">
                    <img src="/thumb3.jpg" />
                    <span>Related Gallery 1</span>
                </a>
            </div>
            <div id="recommended-galleries">
                <a id="rel-link-2" href="/album/related-gallery-2">
                    <img src="/thumb4.jpg" />
                    <span>Related Gallery 2</span>
                </a>
            </div>
        </aside>
        <footer>
            <a id="footer-link" href="/album/footer-album">Footer Album</a>
        </footer>
    </div>
    """
    soup = BeautifulSoup(html_doc, "html.parser")

    main1 = soup.find("a", id="main-link-1")
    main2 = soup.find("a", id="main-link-2")
    rel1 = soup.find("a", id="rel-link-1")
    rel2 = soup.find("a", id="rel-link-2")
    footer_link = soup.find("a", id="footer-link")

    assert MultiAlbumService.is_related_container(main1) is False
    assert MultiAlbumService.is_related_container(main2) is False

    assert MultiAlbumService.is_related_container(rel1) is True
    assert MultiAlbumService.is_related_container(rel2) is True
    assert MultiAlbumService.is_related_container(footer_link) is True


def test_discovered_album_item_source_type_tagging():
    primary_album = DiscoveredAlbumItem(
        title="Featured Gallery 1",
        url="https://example.com/galleries/featured-gallery-1",
        source_type="primary"
    )
    assert primary_album.source_type == "primary"

    related_album = DiscoveredAlbumItem(
        title="Related Album",
        url="https://example.com/galleries/collection-1",
        source_type="related"
    )
    assert related_album.source_type == "related"


def test_is_single_gallery_url():
    assert MultiAlbumService.is_single_gallery_url("https://www.image-platform.com/galleries/urban-architecture-collection-92979511/") is True
    assert MultiAlbumService.is_single_gallery_url("https://www.media-hub.com/gallery/qs062kWubB/Studio-Photography-Showcase/") is True
    assert MultiAlbumService.is_single_gallery_url("https://imgur.com/a/xYz123") is True
    assert MultiAlbumService.is_single_gallery_url("https://www.artstation.com/artwork/X1YZ3") is True
    assert MultiAlbumService.is_single_gallery_url("https://danbooru.donmai.us/posts/1234567") is True
    assert MultiAlbumService.is_single_gallery_url("https://example.com/album/12345/") is True

    assert MultiAlbumService.is_single_gallery_url("https://www.image-platform.com/authors/johndoe/") is False
    assert MultiAlbumService.is_single_gallery_url("https://www.media-hub.com/photos/archive-section/") is False
    assert MultiAlbumService.is_single_gallery_url("https://example.com/user/john_doe") is False
    assert MultiAlbumService.is_single_gallery_url("https://example.com/category/nature/") is False
    assert MultiAlbumService.is_single_gallery_url("https://example.com/explore") is False
    assert MultiAlbumService.is_single_gallery_url("https://example.com/galleries/summer-vibes/?page=2") is False
    assert MultiAlbumService.is_single_gallery_url("https://example.com/tags/landscape/") is False


def test_extract_main_gallery_rejects_google_button_and_extracts_photo():
    sample_html = """
    <html>
        <head>
            <meta property="og:title" content="Urban Architecture Collection High Resolution 4K" />
            <meta property="og:image" content="https://cdn.image-platform.com/1280/9/297/92979511/92979511_001_8a12.jpg" />
        </head>
        <body>
            <header>
                <a class="google-oauth-button btn-outlined" href="#">
                    <img alt="google" class="google-icon" src="https://static.image-platform.com/style/img/google-icon.svg">
                    <span class="google-text">Login with Google</span>
                </a>
            </header>
            <main>
                <h1>Urban Architecture Collection High Resolution 4K</h1>
                <ul class="gallery">
                    <li><img data-src="https://cdn.image-platform.com/460/9/297/92979511/92979511_001_8a12.jpg" /></li>
                </ul>
            </main>
        </body>
    </html>
    """

    url = "https://www.image-platform.com/galleries/urban-architecture-collection-92979511/"
    main_item = MultiAlbumService.extract_main_gallery(sample_html, url)

    assert main_item is not None
    assert "Urban Architecture" in main_item.title
    assert "google" not in main_item.title.lower()
    assert main_item.thumbnail_url == "https://cdn.image-platform.com/1280/9/297/92979511/92979511_001_8a12.jpg"
    assert not main_item.thumbnail_url.endswith(".svg")
    assert main_item.source_type == "primary"


def test_google_oauth_button_tag_rejected_by_helpers():
    html_btn = '<a class="google-oauth-button btn-outlined" href="#"><img alt="google" class="google-icon" src="https://static.image-platform.com/style/img/google-icon.svg"><span class="google-text">Login with Google</span></a>'
    soup = BeautifulSoup(html_btn, "html.parser")
    tag_a = soup.find("a")

    assert MultiAlbumService.unpack_redirect_url(tag_a["href"], "https://example.com") == ""
    assert MultiAlbumService.extract_thumbnail(tag_a, "https://example.com") is None
