# Handoff Report: Pornhub Video Streaming & Proxy Fix

## Overview
Corrigida e auditada a cadeia de extração, proxy HTTP Range 206, auto-renovação de links expirados e sincronização de metadados para vídeos do Pornhub no app NEW PROJECT ALBUM.

## Summary of Changes

### 1. Backend (`src/server/server.py`)
- **Dedução de Resolução e Qualidade (`_deduce_image_target_height`)**: Priorizou `candidate_id` (`ph_stream_1` -> 1080p, `ph_stream_2` -> 720p, `ph_stream_3` -> 480p, `ph_stream_4` -> 240p) e marcadores explícitos de títulos e URLs antes de alturas genéricas preexistentes, assegurando que todas as 4 qualidades recebam suas resoluções e URLs exatas.
- **Tratamento de Erros e Recuperação Automática (`proxy_video_stream`)**: Ampliada a captura de códigos de erro upstream do CDN para incluir `500, 502, 503, 504` além de `401, 403, 404, 410, 470, 472`, disparando re-resolução automática via yt-dlp contra o link de origem do vídeo.
- **Correspondência de Álbum em Auto-recuperação (`_extract_video_info_from_url_or_albums`)**: Adicionado matching bidirecional de URLs contidas em strings de stream para correlacionar links brutos e proxied.
- **Extrator Inicial de Pornhub**: Ajustado para filtrar e priorizar streams diretos MP4 sobre HLS para garantir suporte a HTTP Range 206 consistente no reprodutor.

### 2. Frontend (`frontend-mobile-preview`)
- **VideoPlayerModal (`src/components/common/VideoPlayerModal.tsx`)**:
  - Removido atributo `crossOrigin="anonymous"` da tag `<video>` para eliminar falhas de CORS em CDNs e compatibilidade nativa no Safari iOS.
  - Preservação do parâmetro de consulta `referer` em `effectiveStreamUrl` e `effectiveDownloadUrl` mesmo se `sourceUrl` estiver vazio.
  - Adicionado botão e handler "Renovar Stream" (`handleRenewStream`) com ícone animado e feedback no banner de erro do modal.
- **AlbumDetailView (`src/components/views/AlbumDetailView.tsx`)**:
  - Adicionado fallback em `handleRefreshSingleVideo` para renovação completa do álbum caso a renovação individual não retorne ou não corresponda ao `candidate_id`.
  - Notificações de sucesso/erro integradas para o usuário ao renovar links de stream.
- **Rebuild da Produção**:
  - Executado `npm run build` com sucesso gerando novos artefatos em `frontend-mobile-preview/dist`.

## Verification Results
- `python scripts/verify_pornhub_fix.py`: Passou em todos os 9 testes (extração de 4 qualidades, OPTIONS, HEAD probe, Range 206 bytes=0-1000, download attachment, auto-recuperação de links expirados, renovação de streams das 4 qualidades, sincronização de metadados e renovação individual).
- `python scripts/verify_browser_play_modal.py`: Passou em todos os testes E2E do navegador Playwright (reprodução inline no AlbumDetailView, checagem da URL com proxy e referer, expansão para o VideoPlayerModal e fechamento com Escape).
