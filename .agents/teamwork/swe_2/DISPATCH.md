## 2026-09-28T01:04:20Z

You are teamwork_preview_swe, the SWE Light Orchestrator.

Your working directory is:
c:\Users\jardi\Desktop\NEW PROJECT ALBUM\.agents\teamwork\swe_2

The project root is:
c:\Users\jardi\Desktop\NEW PROJECT ALBUM

The user's original request is recorded in:
c:\Users\jardi\Desktop\NEW PROJECT ALBUM\.agents\teamwork\ORIGINAL_REQUEST.md (under ## 2026-09-28T01:04:20Z)

Task Details:
Corrigir a extração, reprodução inline e renovação de streams e metadados para vídeos do Pornhub no app NEW PROJECT ALBUM. Garantir que todas as qualidades extraídas (1080p, 720p, 480p, 240p) sejam reproduzíveis sem erro de CDN (CORS/403/410/500), com proxy HTTP Range 206 funcionando, auto-renovação de links expirados e sincronização de metadados em tempo real no app web/mobile.

Key Requirements:
1. R1: Correção Definitiva do Proxy de Vídeo com Suporte a Range 206 em src/server/server.py (/api/proxy-video-stream):
   - Fix stream_generator async generator implementation.
   - Async streaming with aiter_bytes, Range: bytes=X-Y support, 206 Partial Content, CORS headers (*), inject Referer: https://www.pornhub.com/ and Origin: https://www.pornhub.com.
   - If upstream returns 401/403/404/410, auto re-resolve fresh stream via yt-dlp using viewkey from referer/original URL without failing the client stream.
2. R2: Blindagem da Reprodução no Frontend (AlbumDetailView.tsx and VideoPlayerModal.tsx):
   - Route video stream links via /api/proxy-video-stream when from restricted external CDNs (phncdn.com).
   - Handle onError on <video> in InlineStreamPlayer with clear UI feedback and quick "Renovar Stream" action button.
   - Ensure Safari iOS compatibility (playsInline, webkit-playsinline, controls, preloading).
3. R3: Renovação de Streams e Sincronização de Metadados:
   - Ensure /api/albums/{session_id}/refresh-streams and /api/albums/{session_id}/sync-metadata renew all 4 resolutions (1080p, 720p, 480p, 240p) via yt-dlp.
   - Update both JSON in data/albums/ and in-memory _completed_albums.
4. R4: Rebuild frontend (npm run build in frontend-mobile-preview) and test/verify server uvicorn on port 8000. Verify 206 Partial Content for https://pt.pornhub.com/view_video.php?viewkey=ph6283b12064abb.

Please execute the SWE Light workflow: implement via implementer, review via reviewer, verify with tests, and report completion when ready.
