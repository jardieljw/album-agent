import React, { useState } from 'react';
import {
  Zap,
  Layers,
  Sparkles,
  ShieldCheck,
  Bot,
  Globe,
  Radio,
  ArrowRight,
  Play,
  Copy,
  CheckCircle2,
  FileCode,
  Sliders,
  Cpu,
  Film,
  Image,
  Clapperboard,
  Download,
  Video,
  Save
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { backendApi } from '../../services/realApi';
import { soundEffects } from '../../services/soundEffects';
import { ExtractionMode, ExtractionJob, MediaExtractFilter } from '../../types';
import { TelemetryBar } from '../common/TelemetryBar';
import { translations } from '../../i18n/translations';
import { AiEngineSelector } from '../common/AiEngineSelector';
import { FolderSelectModal } from '../common/FolderSelectModal';

export const ExtractorView: React.FC = () => {
  const {
    settings,
    updateSettings,
    navigateToView,
    backendOnline,
    activeAiEngine,
    addJob,
    updateJob,
    addLog,
    addNotification,
    addAlbum,
    albums,
    albumFolders,
    videoFolders,
    mediaTypeFilter,
    setMediaTypeFilter,
    saveExtractedVideoToGallery,
    syncVideos
  } = useAppStore();
  const t = translations[settings.language].extractor;

  const [inputTab, setInputTab] = useState<'single' | 'batch'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('imagex_extractor_tab') as 'single' | 'batch') || 'single';
    }
    return 'single';
  });
  const [singleUrl, setSingleUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('imagex_extractor_single_url') || '';
    }
    return '';
  });
  const [batchUrls, setBatchUrls] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('imagex_extractor_batch_urls') || '';
    }
    return '';
  });
  const [mode, setMode] = useState<ExtractionMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('imagex_extractor_mode') as ExtractionMode) || 'classic';
    }
    return 'classic';
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [folderModalState, setFolderModalState] = useState<{
    isOpen: boolean;
    mode: 'single' | 'batch';
    targetUrl?: string;
  }>({
    isOpen: false,
    mode: 'single'
  });

  const isVideoKeyword = (u: string) => {
    const l = u.toLowerCase();
    const isGallery = l.includes('/gallery/') || l.includes('/album/') || l.includes('/photos/') || l.includes('/photo/');
    if (isGallery) return false;
    return (
      l.includes('video-') ||
      l.includes('/video/') ||
      l.includes('/watch') ||
      l.includes('.mp4') ||
      l.includes('.m3u8') ||
      l.includes('.webm')
    );
  };

  const handleSetSingleUrl = (val: string) => {
    setSingleUrl(val);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('imagex_extractor_single_url', val); } catch (_) {}
    }
    if (val && isVideoKeyword(val) && mediaTypeFilter !== 'videos') {
      setMediaTypeFilter('videos');
    }
  };
  const handleSetBatchUrls = (val: string) => {
    setBatchUrls(val);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('imagex_extractor_batch_urls', val); } catch (_) {}
    }
  };
  const handleSetMode = (m: ExtractionMode) => {
    setMode(m);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('imagex_extractor_mode', m); } catch (_) {}
    }
  };
  const handleSetInputTab = (tab: 'single' | 'batch') => {
    setInputTab(tab);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('imagex_extractor_tab', tab); } catch (_) {}
    }
  };

  const extractionProfiles = [
    {
      id: 'classic' as ExtractionMode,
      title: 'Classic Semantic Investigator',
      desc: 'Investigação profunda individual (OriginalImageInvestigator), filtragem rigorosa de logos/SVGs e 100% de resolução nativa (Resolução Original).',
      badge: 'Mais Estável (Resolução Original)',
      icon: Cpu,
      color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
    },
    {
      id: 'ai_react' as ExtractionMode,
      title: '7-Pillar Autonomous ReAct Agent',
      desc: 'Loop neural ReAct com Qwen 2.5:32b, Set-of-Marks visual, indução de fórmulas e prova paralela em lote.',
      badge: 'Neural / Alta Velocidade',
      icon: Bot,
      color: 'text-brand-400 border-brand-500/40 bg-brand-500/10'
    },
    {
      id: 'gemini_surgical_scout' as ExtractionMode,
      title: 'Gemini Surgical Scout',
      desc: 'Análise multimodal via Gemini para extração cirúrgica de elementos DOM complexos e raio-X de bytes.',
      badge: 'Google Gemini',
      icon: Sparkles,
      color: 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10'
    },
    {
      id: 'gemini_layout_explorer' as ExtractionMode,
      title: 'Gemini Layout Explorer',
      desc: 'Compreensão avançada de layout com Gemini Pro para galerias, paginação e grids.',
      badge: 'Google Gemini',
      icon: Layers,
      color: 'text-blue-400 border-blue-500/40 bg-blue-500/10'
    }
  ];

  const handleStartExtraction = async (targetUrl: string, folder: string = 'Geral') => {
    if (!targetUrl.trim()) return;
    
    const existing = albums.find(a => a.sourceUrl === targetUrl.trim());
    if (existing) {
      if (!window.confirm("Este link já foi extraído e está na sua galeria. Deseja extrair novamente?")) {
        return;
      }
    }

    setIsExtracting(true);
    soundEffects.click(settings.soundEnabled);

    const isRealUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://');
    const isMock = targetUrl.includes('.mock');

    if (backendOnline && isRealUrl && !isMock) {
      addLog({
        level: 'info',
        category: (activeAiEngine || 'gemini_layout_explorer').toUpperCase(),
        message: `Iniciando extração [${(activeAiEngine || 'gemini_layout_explorer').toUpperCase()}] com ${settings.aiModel} em ${targetUrl} (Pasta: ${folder})...`
      });

      const isVid = mediaTypeFilter === 'videos' || isVideoKeyword(targetUrl);
      const effectiveMediaType = isVid ? 'videos' : mediaTypeFilter;

      const res = await backendApi.startExtraction(
        targetUrl,
        activeAiEngine || mode,
        settings.aiModel,
        settings.geminiModel || 'gemini-3.7-flash',
        settings.reasoningBudget || 3,
        settings.maxConcurrency || 3,
        settings.antiBotDelayMs || 500,
        effectiveMediaType,
        folder
      );
      if (res && res.session_id) {
        const jobId = res.session_id;
        const newJob = {
          id: jobId,
          title: `Extração: ${new URL(targetUrl).hostname}`,
          url: targetUrl,
          status: 'active' as const,
          mode: activeAiEngine as any || mode,
          aiModel: `${settings.geminiModel || 'gemini-3.7-flash'} + ${settings.aiModel}`,
          progressPercent: 10,
          currentStage: `Iniciando ${activeAiEngine || mode}...`,
          discoveredImagesCount: 0,
          resolvedOriginalCount: 0,
          failedCount: 0,
          startTime: new Date().toLocaleTimeString(),
          durationSeconds: 0,
          throughputMbps: 45.2,
          fps: 60,
          estimatedRemainingSeconds: 25
        };

        addJob(newJob);
        setIsExtracting(false);
        addNotification({
          title: 'Extração Iniciada',
          message: `Extração de "${new URL(targetUrl).hostname}" iniciada em segundo plano.`,
          type: 'info',
          linkViewId: 'live-monitor'
        });

        backendApi.subscribeToSessionEvents(
          jobId,
          (event) => {
            if (event.type === 'status') {
              updateJob(jobId, { currentStage: event.message });
              addLog({ level: 'info', category: 'AGENT_THOUGHT', message: event.message });
            } else if (event.type === 'ai_thought') {
              addLog({
                level: 'ai',
                category: event.stage || 'QWEN_REASONING',
                message: event.thought || ''
              });
            } else if (event.type === 'album_init') {
              updateJob(jobId, { discoveredImagesCount: event.total_candidates });
              addLog({ level: 'info', category: 'DOM_ANALYSIS', message: `Encontrados ${event.total_candidates} candidatos iniciais no DOM.` });
            } else if (event.type === 'image_resolved' || event.type === 'candidate_processed') {
              const pos = event.position || event.image?.position || 1;
              const rawThumb = event.thumbnail_url || event.image?.thumbnail_url || event.image?.src || '';
              const rawOrig = event.original_url || event.image?.original_url || '';
              const safeThumb = rawThumb.startsWith('http')
                ? `/api/proxy-image?url=${encodeURIComponent(rawThumb)}&referer=${encodeURIComponent(targetUrl || rawThumb)}`
                : rawThumb;
              const isVideoItem = event.image?.media_type === 'video' || event.media_type === 'video';
              const isGifItem = event.image?.media_type === 'gif' || event.media_type === 'gif';
              const mediaPrefix = isVideoItem ? 'Vídeo' : isGifItem ? 'GIF' : 'Foto';
              const isPass = event.validation_status === 'PASS' || event.image?.validation_status === 'PASS';
              const isNoise = event.image?.classification === 'banner_noise' || event.validation_status === 'REJECTED';
              const dims = event.dimensions || (event.image?.width ? `${event.image.width}x${event.image.height}` : 'Original');

              const markItem = {
                id: pos,
                thumbnailUrl: safeThumb,
                resolvedOriginalUrl: rawOrig,
                label: isPass ? `${mediaPrefix} #${pos} (${dims})` : (isNoise ? `Banner Rejeitado #${pos}` : `Candidato #${pos}`),
                type: isPass ? 'album_item' as const : (isNoise ? 'banner_noise' as const : 'unresolved' as const),
                confidence: 0.98,
                box: { top: 0, left: 0, width: 200, height: 200 }
              };

              useAppStore.setState(state => {
                const existingIdx = state.setOfMarks.findIndex(m => m.id === pos);
                const updatedMarks = [...state.setOfMarks];
                if (existingIdx >= 0) {
                  updatedMarks[existingIdx] = markItem;
                } else {
                  updatedMarks.push(markItem);
                }
                return {
                  setOfMarks: updatedMarks,
                  inspectingMarkId: pos
                };
              });

              updateJob(jobId, {
                resolvedOriginalCount: isPass ? pos : undefined,
                progressPercent: Math.min(95, pos * 10)
              });
              addLog({
                level: 'ai',
                category: isPass ? `${mediaPrefix.toUpperCase()}_RESOLVED` : 'INSPECTING',
                message: `${mediaPrefix} #${pos} ${isPass ? 'resolvido com sucesso' : 'sendo inspecionado'} (${dims})`
              });
            }
          },
          (completedAlbum) => {
            const isVideoMode = mediaTypeFilter === 'videos' || completedAlbum.images.some(i => i.mediaType === 'video');
            const videoCount = completedAlbum.images.filter(i => i.mediaType === 'video').length;

            const finalMarks = completedAlbum.images.map((img, i) => ({
              id: i + 1,
              thumbnailUrl: img.thumbnailUrl,
              resolvedOriginalUrl: img.originalUrl,
              label: `${img.title || (img.mediaType === 'video' ? `Vídeo #${i+1}` : `Foto #${i+1}`)} (${img.width > 0 ? `${img.width}x${img.height}` : 'HD'})`,
              type: 'album_item' as const,
              confidence: 1.0,
              box: { top: 0, left: 0, width: 200, height: 200 }
            }));

            useAppStore.setState({
              setOfMarks: finalMarks,
              inspectingMarkId: null
            });

            updateJob(jobId, {
              status: 'completed',
              progressPercent: 100,
              currentStage: isVideoMode ? 'Vídeos extraídos com sucesso!' : 'Álbum salvo com sucesso!',
              resolvedOriginalCount: completedAlbum.images.length
            });
            addAlbum(completedAlbum);
            soundEffects.success(settings.soundEnabled);

            if (isVideoMode) {
              syncVideos();
              addNotification({
                title: 'Vídeo(s) Extraído(s) com Sucesso!',
                message: `"${completedAlbum.title}" com ${videoCount > 0 ? videoCount : completedAlbum.images.length} stream(s) prontos na Galeria de Vídeos.`,
                type: 'success',
                linkViewId: 'videos'
              });
            } else {
              addNotification({
                title: 'Álbum Extraído com Sucesso!',
                message: `"${completedAlbum.title}" com ${completedAlbum.images.length} fotos salvas em disco.`,
                type: 'success',
                linkViewId: 'album-detail',
                linkAlbumId: completedAlbum.id
              });
            }
            setIsExtracting(false);
          },
          (err) => {
            updateJob(jobId, { status: 'failed', currentStage: `Erro: ${err}` });
            addLog({ level: 'error', category: 'EXTRACTION_ERROR', message: err });
            setIsExtracting(false);
          }
        );
        return;
      }
    }

    setIsExtracting(false);
    addNotification({
      title: 'Falha ao Iniciar Extração',
      message: backendOnline
        ? 'O servidor backend não conseguiu iniciar a tarefa para esta URL. Verifique a URL informada.'
        : 'O backend Python está offline. Inicie o servidor via iniciar_servidor.bat (porta 8000).',
      type: 'warning'
    });
  };

  const handleBatchExtraction = async (folder: string = 'Geral') => {
    const urls = batchUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;

    const dupes = urls.filter(u => albums.some(a => a.sourceUrl === u));
    if (dupes.length > 0) {
      if (!window.confirm(`${dupes.length} link(s) já existem na sua galeria. Deseja extraí-los novamente?`)) {
        return;
      }
    }

    setIsExtracting(true);
    soundEffects.click(settings.soundEnabled);
    if (backendOnline) {
      const hasVid = mediaTypeFilter === 'videos' || urls.some(u => isVideoKeyword(u));
      const effectiveMediaType = hasVid ? 'videos' : mediaTypeFilter;

      const batchJobs = await backendApi.startBatchExtraction(
        urls,
        activeAiEngine || mode,
        settings.aiModel,
        settings.geminiModel || 'gemini-3.7-flash',
        settings.reasoningBudget || 3,
        settings.maxConcurrency || 3,
        settings.antiBotDelayMs || 500,
        effectiveMediaType,
        folder
      );

      if (batchJobs && batchJobs.length > 0) {
        batchJobs.forEach((bJob: any) => {
          const job: ExtractionJob = {
            id: bJob.session_id,
            url: bJob.url,
            title: `Batch: ${bJob.url.slice(0, 30)}...`,
            status: 'queued',
            progressPercent: 0,
            discoveredImagesCount: 0,
            resolvedOriginalCount: 0,
            failedCount: 0,
            currentStage: `Na fila de espera (${activeAiEngine || mode})`,
            startTime: new Date().toISOString(),
            durationSeconds: 0,
            throughputMbps: 0,
            fps: 0,
            mode: (activeAiEngine || mode) as any,
            aiModel: settings.aiModel,
            priority: 'medium'
          };
          useAppStore.getState().addJob(job);
          useAppStore.getState().subscribeToJob(bJob.session_id, bJob.url);
        });
      }

      addNotification({
        title: 'Lote Enviado',
        message: `${urls.length} URLs enfileiradas para extração em lote na pasta "${folder}".`,
        type: 'info'
      });
      navigateToView('batch-queue');
    } else {
      addNotification({ title: 'Erro', message: 'Backend offline. Não é possível extrair lote.', type: 'error' });
    }
    setIsExtracting(false);
  };

  const handleInitiateSingleExtraction = (targetUrl: string) => {
    if (!targetUrl.trim()) return;
    const isVid = mediaTypeFilter === 'videos' || isVideoKeyword(targetUrl);
    if (settings.askFolderOnSave) {
      setFolderModalState({
        isOpen: true,
        mode: 'single',
        targetUrl: targetUrl.trim()
      });
    } else {
      const defaultFolder = isVid ? (settings.defaultVideoFolder || 'Extraídos') : (settings.defaultAlbumFolder || 'Geral');
      handleStartExtraction(targetUrl.trim(), defaultFolder);
    }
  };

  const handleInitiateBatchExtraction = () => {
    const urls = batchUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    const hasVid = mediaTypeFilter === 'videos' || urls.some(u => isVideoKeyword(u));
    if (settings.askFolderOnSave) {
      setFolderModalState({
        isOpen: true,
        mode: 'batch'
      });
    } else {
      const defaultFolder = hasVid ? (settings.defaultVideoFolder || 'Extraídos') : (settings.defaultAlbumFolder || 'Geral');
      handleBatchExtraction(defaultFolder);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full">
      {/* Top Hero Banner */}
      <div className="p-6 rounded-3xl glass-panel-elevated border border-border relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 text-brand-400 font-semibold text-xs border border-brand-500/30 mb-3">
            <Sparkles size={13} />
            <span>Autonomous Image Intelligence Studio v4.2</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight mb-2">
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* Decorative Ambient Background */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-brand-500/15 rounded-full filter blur-3xl pointer-events-none"></div>
      </div>

      {/* Real-time Telemetry Stats Bar */}
      <TelemetryBar />

      {/* Main Extraction Form */}
      <div className="glass-panel p-6 rounded-3xl border border-border space-y-6">
        {/* Tabs: Single vs Batch */}
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <button
            onClick={() => handleSetInputTab('single')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              inputTab === 'single'
                ? 'bg-brand-600 text-white shadow-glow-brand'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-elevated'
            }`}
          >
            <Zap size={14} />
            <span>{t.singleUrlTab}</span>
          </button>

          <button
            onClick={() => handleSetInputTab('batch')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              inputTab === 'batch'
                ? 'bg-brand-600 text-white shadow-glow-brand'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-elevated'
            }`}
          >
            <Layers size={14} />
            <span>{t.batchUrlTab}</span>
          </button>
        </div>

        {/* Media Type Selector Toolbar */}
        <div className="p-4 rounded-2xl bg-surface-elevated/70 border border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Film size={13} className="text-brand-400" />
              O que você deseja extrair deste link?
            </span>
            {mediaTypeFilter === 'videos' && (
              <span className="px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 text-[10px] font-bold flex items-center gap-1 animate-pulse">
                <Film size={11} />
                <span>MODO VÍDEO ATIVO</span>
              </span>
            )}
            {mediaTypeFilter === 'gifs' && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1">
                <Clapperboard size={11} />
                <span>MODO GIF ATIVO</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              { id: 'all', label: 'Tudo (Fotos, Vídeos, GIFs)', icon: Globe, color: 'brand' },
              { id: 'images', label: 'Apenas Fotos', icon: Image, color: 'emerald' },
              { id: 'videos', label: 'Apenas Vídeos', icon: Film, color: 'violet' },
              { id: 'gifs', label: 'Apenas GIFs Animados', icon: Clapperboard, color: 'amber' },
            ] as { id: MediaExtractFilter; label: string; icon: any; color: string }[]).map(opt => {
              const isActive = mediaTypeFilter === opt.id;
              const colorMap: Record<string, string> = {
                brand:   isActive ? 'bg-brand-600 text-white border-brand-500 shadow-glow-brand ring-2 ring-brand-500/30' : 'text-slate-400 border-border hover:border-brand-500/50 hover:text-slate-200 bg-surface',
                emerald: isActive ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-500/30' : 'text-slate-400 border-border hover:border-emerald-500/50 hover:text-slate-200 bg-surface',
                violet:  isActive ? 'bg-violet-600 text-white border-violet-500 shadow-md ring-2 ring-violet-500/30' : 'text-slate-400 border-border hover:border-violet-500/50 hover:text-slate-200 bg-surface',
                amber:   isActive ? 'bg-amber-600 text-white border-amber-500 shadow-md ring-2 ring-amber-500/30' : 'text-slate-400 border-border hover:border-amber-500/50 hover:text-slate-200 bg-surface',
              };
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => setMediaTypeFilter(opt.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${colorMap[opt.color]}`}
                >
                  <Icon size={14} />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {mediaTypeFilter === 'videos' && (
            <p className="text-xs text-violet-300/90 pt-1 flex items-center gap-1">
              <Film size={12} className="shrink-0 text-violet-400" />
              <span><strong>Modo Vídeo:</strong> Detecta players HTML5, manifestos de streaming HLS (<code className="bg-black/40 px-1 rounded text-[11px]">.m3u8</code>) e downloads diretos (<code className="bg-black/40 px-1 rounded text-[11px]">.mp4 / .webm</code>). O vídeo será extraído, salvo na sua Galeria de Vídeos e aberto para reprodução.</span>
            </p>
          )}
          {mediaTypeFilter === 'gifs' && (
            <p className="text-xs text-amber-300/90 pt-1 flex items-center gap-1">
              <Clapperboard size={12} className="shrink-0 text-amber-400" />
              <span><strong>Modo GIF:</strong> Busca imagens .gif animadas e micro-vídeos em loop silencioso (Reddit, Giphy, Twitter/X).</span>
            </p>
          )}
        </div>

        {/* Input Controls */}
        {inputTab === 'single' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  type="url"
                  value={singleUrl}
                  onChange={e => handleSetSingleUrl(e.target.value)}
                  placeholder={
                    mediaTypeFilter === 'videos'
                      ? 'Insira o link da página do vídeo (ex: https://.../video-...)'
                      : mediaTypeFilter === 'gifs'
                      ? 'Insira o link para extrair GIFs animados...'
                      : mediaTypeFilter === 'images'
                      ? 'Insira o link do álbum de fotos (ex: https://.../gallery/...)'
                      : t.urlPlaceholder
                  }
                  className="w-full h-12 px-4 rounded-2xl bg-surface-elevated border border-border text-slate-100 placeholder-slate-500 text-xs sm:text-sm font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all shadow-inner"
                />
              </div>

              <button
                onClick={() => handleInitiateSingleExtraction(singleUrl)}
                disabled={isExtracting || !singleUrl.trim()}
                className={`h-12 px-6 rounded-2xl text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-glow-brand transition-all disabled:opacity-50 ${
                  mediaTypeFilter === 'videos'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500'
                    : mediaTypeFilter === 'gifs'
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'
                    : 'bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-accent-purple'
                }`}
              >
                {isExtracting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    {mediaTypeFilter === 'videos' ? 'Detectando Vídeos...' : 'Investigando DOM...'}
                  </span>
                ) : (
                  <>
                    {mediaTypeFilter === 'videos' ? <Film size={16} /> : <Zap size={16} />}
                    <span>
                      {mediaTypeFilter === 'videos'
                        ? 'Extrair Vídeos'
                        : mediaTypeFilter === 'gifs'
                        ? 'Extrair GIFs'
                        : mediaTypeFilter === 'images'
                        ? 'Extrair Fotos'
                        : t.extractBtn}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Batch Multi-URL Input */
          <div className="space-y-4">
            <textarea
              rows={4}
              value={batchUrls}
              onChange={e => handleSetBatchUrls(e.target.value)}
              placeholder={t.batchPlaceholder}
              className="w-full p-4 rounded-2xl bg-surface-elevated border border-border text-slate-100 placeholder-slate-500 text-xs font-mono outline-none focus:border-brand-500 transition-all"
            ></textarea>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">
                {batchUrls.split('\n').filter(u => u.trim()).length} URLs identificadas
              </span>
              <button
                onClick={handleInitiateBatchExtraction}
                disabled={!batchUrls.trim()}
                className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-glow-brand transition-all disabled:opacity-50"
              >
                {t.extractBatchBtn}
              </button>
            </div>
          </div>
        )}

        {/* Universal AI Engine Strategy Selector */}
        <div className="pt-2 border-t border-border">
          <AiEngineSelector variant="cards" />
        </div>
      </div>

      {/* Universal Destination Folder Selector Modal */}
      <FolderSelectModal
        isOpen={folderModalState.isOpen}
        onClose={() => setFolderModalState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={(chosenFolder) => {
          const activeMode = folderModalState.mode;
          const targetUrl = folderModalState.targetUrl || singleUrl;
          setFolderModalState(prev => ({ ...prev, isOpen: false }));
          if (activeMode === 'single') {
            handleStartExtraction(targetUrl, chosenFolder);
          } else {
            handleBatchExtraction(chosenFolder);
          }
        }}
        existingFolders={
          (mediaTypeFilter === 'videos' || (folderModalState.targetUrl && isVideoKeyword(folderModalState.targetUrl)))
            ? videoFolders.map(f => f.name)
            : albumFolders.map(f => f.name)
        }
        currentFolder={
          (mediaTypeFilter === 'videos' || (folderModalState.targetUrl && isVideoKeyword(folderModalState.targetUrl)))
            ? (settings.defaultVideoFolder || 'Extraídos')
            : (settings.defaultAlbumFolder || 'Geral')
        }
        mediaType={
          (mediaTypeFilter === 'videos' || (folderModalState.targetUrl && isVideoKeyword(folderModalState.targetUrl)))
            ? 'video'
            : 'album'
        }
        title={folderModalState.mode === 'single' ? 'Escolher Pasta de Destino da Extração' : 'Escolher Pasta para o Lote'}
        subtitle="Selecione em qual pasta do aplicativo este conteúdo será organizado e salvo."
      />
    </div>
  );
};
