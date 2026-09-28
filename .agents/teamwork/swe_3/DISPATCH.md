## 2026-09-28T03:57:00Z

You are teamwork_preview_swe, the SWE Light Orchestrator.

Your working directory is:
c:\Users\jardi\Desktop\NEW PROJECT ALBUM\.agents\teamwork\swe_3

The project root is:
c:\Users\jardi\Desktop\NEW PROJECT ALBUM

The user's original request is recorded in:
c:\Users\jardi\Desktop\NEW PROJECT ALBUM\.agents\teamwork\ORIGINAL_REQUEST.md (under ## 2026-09-28T03:57:00Z)

Task Details:
Corrigir e auditar a extração, reprodução inline e renovação de streams e metadados para vídeos do Pornhub no app NEW PROJECT ALBUM. Garantir que todas as qualidades extraídas (1080p, 720p, 480p, 240p) sejam reproduzíveis sem erro de CDN (CORS/403/410/500), com proxy HTTP Range 206 funcionando, auto-renovação de links expirados e sincronização de metadados em tempo real no app web/mobile.

Working directory: c:/Users/jardi/Desktop/NEW PROJECT ALBUM
Integrity mode: development
Target URL: https://pt.pornhub.com/view_video.php?viewkey=ph6283b12064abb

Requirements:
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

Acceptance Criteria:
- [ ] O endpoint /api/proxy-video-stream responde com HTTP 206 e streaming de bytes válido.
- [ ] O player inline em AlbumDetailView e o modal VideoPlayerModal reproduzem os vídeos do Pornhub sem erro no Safari e no Chrome.
- [ ] O botão "Renovar Streams" obtém URLs frescas para as 4 qualidades (1080p, 720p, 480p, 240p) e salva no JSON do álbum.
- [ ] Links expirados (410 Gone) são recuperados automaticamente no proxy.

Please execute the SWE Light workflow: implement/verify via implementer, review via reviewer, verify with tests, and report completion when ready.
