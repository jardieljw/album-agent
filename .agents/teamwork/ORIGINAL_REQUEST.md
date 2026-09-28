# Original User Request

## Initial Request — 2026-09-27T19:44:28Z

Task Overview:
Implement seamless, reliable scroll position restoration across view and tab switches (such as Multi-Album, Web Video Scraper, Gallery, Videos, and other views) in the React application so navigation between tabs never loses the user's scroll position.

Requirements:
R1. Automatic Scroll State Retention per View & Tab
- Track and remember the scroll position (scrollTop) of the main content container (main element in src/App.tsx) for each active view (currentView) and session tab (activeTabId / activeAlbumId).
- When navigating away from any view (e.g. from Multi-Álbum to Extrator de Vídeos da Web or any other page), the scroll offset must be preserved.

R2. Seamless Restoration on View Mount / Navigation
- When returning to a previously visited view or tab, the application must automatically restore the saved scroll position accurately.
- Must handle dynamic rendering and grid layout shifts (e.g., hundreds of discovered album cards or video cards) using requestAnimationFrame or post-layout synchronization so the user lands exactly where they were without jumping back to top.
- Fast tab switching must not cause scroll flicker, stutter, or reset to 0.

Acceptance Criteria:
- Scrolling down to any position in Multi-Álbum (e.g. item 50/100) and switching to Extrator de Vídeos da Web or any other page and switching back restores the exact same scroll position.
- Scrolling down in Extrator de Vídeos da Web and switching to another page and back restores the exact scroll position.
- Switching between top session tabs preserves the independent scroll position of each tab.
- Code builds without errors (npm run build or Vite build passes clean).

## 2026-09-28T01:04:20Z

This is a single self-contained fix; keep it small and focused.

Corrigir a extração, reprodução inline e renovação de streams e metadados para vídeos do Pornhub no app NEW PROJECT ALBUM. Garantir que todas as qualidades extraídas (1080p, 720p, 480p, 240p) sejam reproduzíveis sem erro de CDN (CORS/403/410/500), com proxy HTTP Range 206 funcionando, auto-renovação de links expirados e sincronização de metadados em tempo real no app web/mobile.

Working directory: c:/Users/jardi/Desktop/NEW PROJECT ALBUM
Integrity mode: development

## Diagnóstico Técnico das Causas Raiz
1. Crash no Proxy de Vídeo (/api/proxy-video-stream): No arquivo src/server/server.py, a função proxy_video_stream tenta chamar StreamingResponse(stream_generator(), ...) sem que o gerador assíncrono stream_generator esteja definido no escopo da função, disparando NameError: name 'stream_generator' is not defined (HTTP 500) em qualquer requisição de reprodução via proxy.
2. Bloqueio de CORS e Referer pelo CDN do Pornhub (phncdn.com): O CDN bloqueia requisições diretas de navegadores sem Referer: https://www.pornhub.com/ e com cabeçalho de CORS restrito (Access-Control-Allow-Origin: https://www.pornhub.com), retornando HTTP 404/410. No frontend (AlbumDetailView.tsx), links de stream sem proxy causam falha instantânea no Safari/iOS (ícone de play riscado exibido na captura de tela do usuário).
3. Links de Stream Efêmeros (Expiração de 2 horas): As URLs diretas do CDN do Pornhub expiram após 2 horas (validto=...). O proxy precisa interceptar respostas 404/410/403 e re-resolver automaticamente a stream fresca via yt-dlp usando a viewkey/página de origem sem que o usuário receba erro de reprodução.
4. Renovação de Streams e Sincronização de Metadados: "Sincronizar Metadados" não renovava streams expiradas; e "Renovar Streams" precisava de injeção correta de headers e atualização fluida no estado do frontend.

## Requirements

### R1. Correção Definitiva do Proxy de Vídeo com Suporte a Range 206
- Corrigir a implementação de stream_generator em src/server/server.py no endpoint /api/proxy-video-stream.
- Garantir streaming assíncrono em chunks (aiter_bytes), suporte a cabeçalhos Range: bytes=X-Y, resposta 206 Partial Content, headers CORS abertos (*), e injeção de Referer: https://www.pornhub.com/ e Origin: https://www.pornhub.com.
- Se o upstream retornar 401, 403, 404 ou 410 (link expirado), tentar re-resolver a URL da stream automaticamente via yt-dlp usando a viewkey contida no referer ou na URL original, continuando o stream sem erro para o cliente.

### R2. Blindagem da Reprodução no Frontend (AlbumDetailView.tsx e VideoPlayerModal.tsx)
- Garantir que todos os links de vídeo exibidos em álbuns sejam roteados de forma confiável pelo /api/proxy-video-stream quando originários de CDNs externos restritos (como phncdn.com).
- Tratar o evento onError do elemento <video> no InlineStreamPlayer, exibindo feedback claro e botão de ação rápida para "Renovar Stream" caso ocorra falha.
- Assegurar compatibilidade total com Safari no iOS (playsInline, webkit-playsinline, preloading e controles nativos).

### R3. Renovação de Streams e Sincronização de Metadados
- Garantir que /api/albums/{session_id}/refresh-streams e /api/albums/{session_id}/sync-metadata renovem com sucesso as URLs das 4 resoluções (1080p, 720p, 480p, 240p) via yt-dlp com headers apropriados.
- Atualizar tanto o arquivo JSON em data/albums/ quanto o estado da sessão em memória (_completed_albums), recarregando o álbum atualizado no frontend Zustand.

### R4. Rebuild do Frontend e Verificação E2E
- Executar o build do frontend (npm run build em frontend-mobile-preview) para atualizar a pasta dist.
- Reiniciar o servidor uvicorn (porta 8000) com o código corrigido.
- Validar via requisições HTTP (GET/Range/HEAD) que os vídeos da URL https://pt.pornhub.com/view_video.php?viewkey=ph6283b12064abb reproduzem e retornam 206 Partial Content sem erros.

## Acceptance Criteria

### Reprodução de Vídeo
- [ ] O endpoint /api/proxy-video-stream responde com HTTP 206 e streaming de bytes válido (sem erro 500 de stream_generator).
- [ ] O player inline em AlbumDetailView e o modal VideoPlayerModal reproduzem os vídeos do Pornhub sem exibir o ícone de vídeo quebrado no Safari e no Chrome.
- [ ] O download de vídeo através do botão de download funciona com arquivo MP4 válido.

### Renovação e Metadados
- [ ] O botão "Renovar Streams" e o endpoint correspondente obtêm URLs frescas para as 4 qualidades (1080p, 720p, 480p, 240p) e salvam no JSON do álbum.
- [ ] Links expirados (410 Gone) são recuperados automaticamente no proxy ou via clique de renovação.

## 2026-09-28T03:57:00Z

This is a single self-contained fix; keep it small and focused.

Corrigir e auditar a extração, reprodução inline e renovação de streams e metadados para vídeos do Pornhub no app NEW PROJECT ALBUM. Garantir que todas as qualidades extraídas (1080p, 720p, 480p, 240p) sejam reproduzíveis sem erro de CDN (CORS/403/410/500), com proxy HTTP Range 206 funcionando, auto-renovação de links expirados e sincronização de metadados em tempo real no app web/mobile.

Working directory: c:/Users/jardi/Desktop/NEW PROJECT ALBUM
Integrity mode: development

Target URL: https://pt.pornhub.com/view_video.php?viewkey=ph6283b12064abb

## Requirements

### R1. Validação e Auditoria do Proxy de Vídeo com Range 206
- Verificar a implementação de stream_generator em src/server/server.py no endpoint /api/proxy-video-stream.
- Garantir streaming assíncrono em chunks (aiter_bytes), suporte a cabeçalhos Range: bytes=X-Y, resposta 206 Partial Content, headers CORS abertos (*), e injeção de Referer: https://www.pornhub.com/ e Origin: https://www.pornhub.com.
- Confirmar auto-recuperação de links expirados quando upstream retornar 401, 403, 404 ou 410.

### R2. Blindagem da Reprodução no Frontend (AlbumDetailView.tsx e VideoPlayerModal.tsx)
- Garantir que todos os links de vídeo exibidos em álbuns sejam roteados de forma confiável pelo /api/proxy-video-stream quando originários de CDNs externos restritos (como phncdn.com).
- Tratar o evento onError do elemento <video> no InlineStreamPlayer, exibindo feedback claro e botão de ação rápida para "Renovar Stream" caso ocorra falha.
- Assegurar compatibilidade total com Safari no iOS (playsInline, webkit-playsinline, preloading e controles nativos).

### R3. Renovação de Streams e Sincronização de Metadados
- Garantir que /api/albums/{session_id}/refresh-streams e /api/albums/{session_id}/sync-metadata renovem com sucesso as URLs das 4 resoluções (1080p, 720p, 480p, 240p) via yt-dlp com headers apropriados.
- Atualizar tanto o arquivo JSON em data/albums/ quanto o estado da sessão em memória (_completed_albums), recarregando o álbum atualizado no frontend Zustand.

### R4. Rebuild do Frontend e Verificação E2E
- Executar o build do frontend (npm run build em frontend-mobile-preview) para atualizar a pasta dist.
- Validar via requisições HTTP (GET/Range/HEAD) que os vídeos da URL https://pt.pornhub.com/view_video.php?viewkey=ph6283b12064abb reproduzem e retornam 206 Partial Content sem erros.

## Acceptance Criteria
- [ ] O endpoint /api/proxy-video-stream responde com HTTP 206 e streaming de bytes válido.
- [ ] O player inline em AlbumDetailView e o modal VideoPlayerModal reproduzem os vídeos do Pornhub sem erro no Safari e no Chrome.
- [ ] O botão "Renovar Streams" obtém URLs frescas para as 4 qualidades (1080p, 720p, 480p, 240p) e salva no JSON do álbum.
- [ ] Links expirados (410 Gone) são recuperados automaticamente no proxy.

