import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  Search,
  Sparkles,
  ExternalLink,
  Layers,
  ArrowRight,
  AlertCircle,
  Loader2,
  FolderHeart,
  Maximize2,
  X,
  CheckSquare,
  Square,
  Download,
  Folder,
  FolderDown,
  ChevronDown,
  CheckCircle2,
  Clock,
  RotateCcw,
  Check
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { backendApi } from '../../services/realApi';
import { TelemetryBar } from '../common/TelemetryBar';
import { FolderSelectModal } from '../common/FolderSelectModal';
import { SavedRedirectBadge } from '../common/SavedRedirectBadge';

interface DiscoveredItem {
  title: string;
  url: string;
  thumbnail_url?: string | null;
  source_type: 'related' | 'performer_page' | 'search';
  total_images_hint?: number;
}

const normalizeUrl = (u?: string | null): string => {
  if (!u) return '';
  return u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
};

export const MultiAlbumView: React.FC = () => {
  const {
    multiAlbumState,
    setMultiAlbumState,
    clearMultiAlbumState,
    navigateToView,
    jobs,
    albums,
    albumFolders,
    syncJobs,
    syncAlbums,
    settings,
    checkItemSavedStatus,
    markItemAsSavedOptimistically
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Destination folder state
  const [destinationFolder, setDestinationFolder] = useState<string>('');
  const [folderModalState, setFolderModalState] = useState<{
    isOpen: boolean;
    mode: 'single' | 'batch';
    targetAlbum?: DiscoveredItem;
  }>({ isOpen: false, mode: 'single' });

  // Optimistic queue state for immediate card feedback
  const [optimisticQueuedUrls, setOptimisticQueuedUrls] = useState<Set<string>>(new Set());

  // Batch Action States
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [isDownloadingBatch, setIsDownloadingBatch] = useState(false);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'info' | 'error'; message: string; actionLabel?: string; onAction?: () => void } | null>(null);

  // Read persisted form and results
  const url = multiAlbumState.url || '';
  const performerName = multiAlbumState.performerName || '';
  const maxRelated = multiAlbumState.maxRelated || 0;
  const results: DiscoveredItem[] = multiAlbumState.results || [];
  const streamingStatus = multiAlbumState.streamingStatus || '';
  const lastSearchedPerformer = multiAlbumState.lastSearchedPerformer || null;
  const selectedUrls = useMemo(() => new Set(multiAlbumState.selectedUrls || []), [multiAlbumState.selectedUrls]);

  // Sync albums & jobs on mount
  useEffect(() => {
    syncAlbums();
    syncJobs();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleDiscover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Por favor, insira a URL principal do site ou de uma galeria.');
      return;
    }

    setLoading(true);
    setError(null);
    setMultiAlbumState({
      results: [],
      selectedUrls: [],
      streamingStatus: 'Iniciando conexão com o servidor...',
      lastSearchedPerformer: performerName.trim() || null
    });
    setShowDownloadDropdown(false);

    try {
      const res = await fetch('/api/multi-album/discover-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          performer_name: performerName.trim() || null,
          max_related: maxRelated,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Erro HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('Streaming não suportado pelo navegador.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentResults: DiscoveredItem[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const payload = JSON.parse(trimmed.slice(6));
              if (payload.type === 'album' && payload.album) {
                if (!currentResults.some((a) => a.url === payload.album.url)) {
                  currentResults = [...currentResults, payload.album];
                  setMultiAlbumState({ results: currentResults });
                }
              } else if (payload.type === 'status') {
                setMultiAlbumState({ streamingStatus: payload.message || '' });
              } else if (payload.type === 'done') {
                setMultiAlbumState({ streamingStatus: `Varredura concluída: ${payload.total} álbuns encontrados.` });
              }
            } catch (_) {}
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar álbuns. Verifique se o servidor backend foi reiniciado.');
    } finally {
      setLoading(false);
    }
  };

  const handleExtractSingle = (albumUrl: string) => {
    try {
      localStorage.setItem('imagex_extractor_single_url', albumUrl);
      localStorage.setItem('imagex_extractor_tab', 'single');
    } catch (_) {}
    navigateToView('extractor');
  };

  // Selection toggles
  const toggleSelect = (albumUrl: string) => {
    const next = new Set(selectedUrls);
    if (next.has(albumUrl)) {
      next.delete(albumUrl);
    } else {
      next.add(albumUrl);
    }
    setMultiAlbumState({ selectedUrls: Array.from(next) });
  };

  const handleSelectAll = () => {
    if (selectedUrls.size === results.length) {
      setMultiAlbumState({ selectedUrls: [] });
    } else {
      setMultiAlbumState({ selectedUrls: results.map((r) => r.url) });
    }
  };

  const clearSelection = () => {
    setMultiAlbumState({ selectedUrls: [] });
    setShowDownloadDropdown(false);
  };

  // Status helper for real-time card indicators with normalized URL matching
  const getAlbumStatus = (albumUrl: string, albumTitle: string) => {
    const normAlbumUrl = normalizeUrl(albumUrl);
    const normTitle = albumTitle.trim().toLowerCase();

    // 1. Saved in library?
    const savedAlbum = albums.find(
      (a) =>
        (a.sourceUrl && normalizeUrl(a.sourceUrl) === normAlbumUrl) ||
        (a.title && a.title.trim().toLowerCase() === normTitle)
    );
    if (savedAlbum) {
      return {
        status: 'saved' as const,
        label: `Salvo em ${savedAlbum.folder || 'Geral'}`,
        color: 'emerald',
        albumId: savedAlbum.id,
        savedFolder: savedAlbum.folder || 'Geral'
      };
    }

    // 2. Active or completed job?
    const job = jobs.find((j) => j.url && normalizeUrl(j.url) === normAlbumUrl);
    if (job) {
      if (job.status === 'active') {
        return {
          status: 'extracting' as const,
          label: `Extraindo (${job.progressPercent}%)`,
          color: 'brand',
          jobId: job.id
        };
      }
      if (job.status === 'completed') {
        const foundAlb = albums.find(a => a.id === job.resultAlbumId || (a.sourceUrl && normalizeUrl(a.sourceUrl) === normAlbumUrl));
        return {
          status: 'saved' as const,
          label: `Salvo em ${foundAlb?.folder || job.folder || 'Geral'}`,
          color: 'emerald',
          albumId: job.resultAlbumId || foundAlb?.id,
          savedFolder: foundAlb?.folder || job.folder || 'Geral'
        };
      }
      if (job.status === 'failed') {
        return { status: 'error' as const, label: 'Falha', color: 'rose' };
      }
    }

    // 3. Optimistically queued?
    if (optimisticQueuedUrls.has(normAlbumUrl)) {
      return { status: 'queued' as const, label: 'Na fila...', color: 'brand' };
    }

    return null;
  };

  const effectiveFolder = destinationFolder.trim() || settings.defaultAlbumFolder || performerName.trim() || 'Geral';

  // Direct actions
  const executeSaveSingleDirect = async (album: DiscoveredItem, targetFolder: string) => {
    const normUrl = normalizeUrl(album.url);
    setOptimisticQueuedUrls((prev) => new Set(prev).add(normUrl));

    try {
      const res = await backendApi.batchSaveMultiAlbums([album], targetFolder);
      if (res.success) {
        markItemAsSavedOptimistically({
          url: album.url,
          title: album.title,
          folder: targetFolder,
          targetView: 'gallery'
        });
        setToast({
          type: 'success',
          message: `"${album.title.slice(0, 30)}..." salvo na pasta "${targetFolder}"!`,
          actionLabel: 'Ver na Galeria',
          onAction: () => navigateToView('gallery'),
        });
        await syncJobs();
        await syncAlbums();
      } else {
        setOptimisticQueuedUrls((prev) => {
          const next = new Set(prev);
          next.delete(normUrl);
          return next;
        });
        setToast({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setOptimisticQueuedUrls((prev) => {
        const next = new Set(prev);
        next.delete(normUrl);
        return next;
      });
      setToast({ type: 'error', message: err.message || 'Erro ao enfileirar álbum.' });
    }
  };

  const handleInitiateSingleSave = (album: DiscoveredItem) => {
    if (settings.askFolderOnSave) {
      setFolderModalState({
        isOpen: true,
        mode: 'single',
        targetAlbum: album
      });
    } else {
      executeSaveSingleDirect(album, effectiveFolder);
    }
  };

  const handleDownloadSingleDirect = (album: DiscoveredItem) => {
    setToast({
      type: 'info',
      message: `Iniciando download em ZIP de "${album.title.slice(0, 28)}..."`,
    });
    backendApi.triggerSingleAlbumZipDownload(album.url, album.title);
  };

  const executeBatchSaveToApp = async (targetFolder: string) => {
    const selectedAlbums = results.filter((r) => selectedUrls.has(r.url));
    if (selectedAlbums.length === 0) return;

    // Set optimistic queued status for all selected
    setOptimisticQueuedUrls((prev) => {
      const next = new Set(prev);
      selectedAlbums.forEach((a) => next.add(normalizeUrl(a.url)));
      return next;
    });

    setIsSavingBatch(true);
    try {
      const res = await backendApi.batchSaveMultiAlbums(selectedAlbums, targetFolder);
      if (res.success) {
        selectedAlbums.forEach(a => {
          markItemAsSavedOptimistically({
            url: a.url,
            title: a.title,
            folder: targetFolder,
            targetView: 'gallery'
          });
        });
        setToast({
          type: 'success',
          message: `${res.queued} álbuns adicionados à fila na pasta "${targetFolder}"!`,
          actionLabel: 'Ver na Galeria',
          onAction: () => navigateToView('gallery'),
        });
        clearSelection();
        await syncJobs();
        await syncAlbums();
      } else {
        setToast({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Erro ao processar lote.' });
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleInitiateBatchSave = () => {
    const selectedAlbums = results.filter((r) => selectedUrls.has(r.url));
    if (selectedAlbums.length === 0) return;
    if (settings.askFolderOnSave) {
      setFolderModalState({
        isOpen: true,
        mode: 'batch'
      });
    } else {
      executeBatchSaveToApp(effectiveFolder);
    }
  };

  const handleBatchDownload = async (format: 'unified' | 'individual') => {
    const selectedAlbums = results.filter((r) => selectedUrls.has(r.url));
    if (selectedAlbums.length === 0) return;

    setShowDownloadDropdown(false);

    if (format === 'individual') {
      setToast({
        type: 'info',
        message: `Disparando download individual de ${selectedAlbums.length} álbuns em ZIP...`,
      });
      selectedAlbums.forEach((alb, idx) => {
        setTimeout(() => {
          backendApi.triggerSingleAlbumZipDownload(alb.url, alb.title);
        }, idx * 600);
      });
      clearSelection();
      return;
    }

    // Unified ZIP
    setIsDownloadingBatch(true);
    setToast({
      type: 'info',
      message: `Extraindo e compactando ${selectedAlbums.length} álbuns em ZIP unificado...`,
    });

    try {
      const res = await backendApi.batchDownloadMultiAlbumsZip(selectedAlbums, 'unified');
      if (res.success) {
        setToast({
          type: 'success',
          message: 'ZIP unificado gerado e baixado com sucesso!',
        });
        clearSelection();
      } else {
        setToast({
          type: 'error',
          message: res.error || 'Erro ao baixar ZIP unificado.',
        });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Erro ao gerar ZIP.' });
    } finally {
      setIsDownloadingBatch(false);
    }
  };

  const getSourceBadge = (type: string) => {
    switch (type) {
      case 'related':
        return <span className="px-2 py-0.5 text-[10px] rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Relacionado</span>;
      case 'performer_page':
        return <span className="px-2 py-0.5 text-[10px] rounded-full font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">Página da Modelo</span>;
      case 'search':
        return <span className="px-2 py-0.5 text-[10px] rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">Pesquisa</span>;
      default:
        return null;
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full pb-28">
      {/* Top Hero Banner */}
      <div className="p-6 rounded-3xl glass-panel-elevated border border-border relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 text-brand-400 font-semibold text-xs border border-brand-500/30 mb-3">
            <Compass size={13} />
            <span>Módulo Independente de Descoberta</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight mb-2">
            Multi-Álbum & Performer Discovery
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Localize e selecione múltiplos álbuns para download direto em ZIP ou salvamento automático na biblioteca do App sem sair da tela.
          </p>
        </div>
        {/* Decorative Ambient Background */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-brand-500/15 rounded-full filter blur-3xl pointer-events-none"></div>
      </div>

      {/* Real-time Telemetry Stats Bar */}
      <TelemetryBar />

      {/* Form Card */}
      <div className="glass-panel p-6 rounded-3xl border border-border space-y-6">
        <form onSubmit={handleDiscover} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Target URL */}
            <div className="lg:col-span-6 space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                URL da Galeria ou Domínio Principal
              </label>
              <div className="relative">
                <input
                  type="url"
                  required
                  placeholder="https://exemplo.com/galleries/album-exemplo-12345/"
                  value={url}
                  onChange={(e) => setMultiAlbumState({ url: e.target.value })}
                  className="w-full h-12 px-4 rounded-2xl bg-surface-elevated border border-border text-slate-100 placeholder-slate-500 text-xs sm:text-sm font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Performer Name */}
            <div className="lg:col-span-4 space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Nome da Performer / Atriz (Opcional)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ex: Alexis Texas, Riley Reid..."
                  value={performerName}
                  onChange={(e) => setMultiAlbumState({ performerName: e.target.value })}
                  className="w-full h-12 px-4 rounded-2xl bg-surface-elevated border border-border text-slate-100 placeholder-slate-500 text-xs sm:text-sm font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Max Related */}
            <div className="lg:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider" title="0 = Buscar todos os álbuns possíveis na página">
                Qtd (0 = Tudo)
              </label>
              <input
                type="number"
                min="0"
                max="5000"
                placeholder="Ex: 0 (Todos)"
                value={maxRelated === 0 ? '' : maxRelated}
                onChange={(e) => setMultiAlbumState({ maxRelated: e.target.value === '' ? 0 : Number(e.target.value) })}
                className="w-full h-12 px-4 rounded-2xl bg-surface-elevated border border-border text-slate-100 placeholder-slate-500 text-xs sm:text-sm font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all shadow-inner"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-400" />
              Busca progressiva em tempo real com streaming de alta velocidade.
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-12 px-6 rounded-2xl text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-glow-brand transition-all disabled:opacity-50 bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-accent-purple"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{maxRelated === 0 ? 'Varrendo página com Auto-Scroll...' : 'Descobrindo álbuns...'}</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Descobrir Álbuns
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm glass-panel">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
          <p>{error}</p>
        </div>
      )}

      {/* Results Header with Live Counter and Select All */}
      {(results.length > 0 || loading) && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-surface-elevated border border-border glass-panel">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Álbuns Descobertos
                {lastSearchedPerformer && (
                  <span className="text-xs text-slate-400 font-normal">
                    — para "{lastSearchedPerformer}"
                  </span>
                )}
              </h2>
              {/* Dynamic Live Counter */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/40 text-xs font-extrabold shadow-glow-brand">
                {loading && <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />}
                <span>Total: {results.length}</span>
              </div>

              {results.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface border border-border hover:border-brand-500/40 text-slate-300 hover:text-white text-xs font-medium transition-all"
                  >
                    {selectedUrls.size === results.length ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5 text-brand-400" />
                        <span>Desmarcar Todos</span>
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                        <span>Selecionar Todos ({results.length})</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={clearMultiAlbumState}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-surface border border-border hover:border-rose-500/40 text-slate-400 hover:text-rose-300 text-xs transition-all"
                    title="Limpar todos os resultados desta pesquisa"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Limpar Busca</span>
                  </button>
                </>
              )}
            </div>

            {loading && streamingStatus && (
              <div className="flex items-center gap-2 text-xs text-brand-400 font-medium animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>{streamingStatus}</span>
              </div>
            )}
          </div>

          {/* Album Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((album, idx) => {
              const isSelected = selectedUrls.has(album.url);
              const statusInfo = getAlbumStatus(album.url, album.title);

              return (
                <div
                  key={idx}
                  className={`bg-surface-elevated border rounded-2xl p-4 flex flex-col justify-between transition-all group shadow-md relative ${
                    isSelected
                      ? 'border-brand-500 bg-brand-950/20 shadow-glow-brand ring-1 ring-brand-500/30'
                      : 'border-border hover:border-brand-500/40'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Thumbnail Preview */}
                    <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-950/80 flex items-center justify-center border border-border relative group/thumb">
                      {/* Checkbox Overlay */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(album.url);
                        }}
                        className={`absolute top-2 left-2 z-20 p-1.5 rounded-lg backdrop-blur-md transition-all border ${
                          isSelected
                            ? 'bg-brand-600 text-white border-brand-400 shadow-md'
                            : 'bg-black/60 text-white/70 hover:text-white hover:bg-black/90 border-white/20 opacity-80 group-hover:opacity-100'
                        }`}
                        title={isSelected ? 'Desmarcar álbum' : 'Selecionar álbum'}
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>

                      {album.thumbnail_url ? (
                        <>
                          <img
                            src={`/api/proxy-image?url=${encodeURIComponent(album.thumbnail_url)}`}
                            alt={album.title}
                            className="w-full h-full object-contain cursor-pointer transition-transform duration-300"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onClick={() => setPreviewImage(album.thumbnail_url || null)}
                            title="Clique para expandir a miniatura completa"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewImage(album.thumbnail_url || null);
                            }}
                            className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/70 text-white/80 hover:text-white hover:bg-black/95 opacity-0 group-hover/thumb:opacity-100 transition-opacity backdrop-blur-sm border border-white/10"
                            title="Visualizar miniatura em tamanho real"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-600 gap-1">
                          <FolderHeart className="w-8 h-8 opacity-40" />
                          <span className="text-[10px] font-bold">Sem Miniatura</span>
                        </div>
                      )}

                      <div className="absolute top-2 right-2 pointer-events-none">
                        {getSourceBadge(album.source_type)}
                      </div>
                    </div>

                    {/* Title and Status */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-slate-100 text-sm line-clamp-2 title-tooltip flex-1" title={album.title}>
                          {album.title}
                        </h3>
                        {statusInfo && (
                          statusInfo.status === 'saved' ? (
                            <SavedRedirectBadge
                              savedInfo={{
                                isSaved: true,
                                savedFolder: statusInfo.savedFolder || 'Geral',
                                targetId: statusInfo.albumId,
                                targetView: 'gallery'
                              }}
                            />
                          ) : (
                            <span
                              className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                statusInfo.color === 'emerald'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : statusInfo.color === 'brand'
                                  ? 'bg-brand-500/20 text-brand-300 border-brand-500/30 animate-pulse'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {statusInfo.status === 'extracting' && <Loader2 className="w-3 h-3 animate-spin text-brand-400" />}
                              {statusInfo.status === 'queued' && <Clock className="w-3 h-3 text-brand-400" />}
                              <span>{statusInfo.label}</span>
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-mono truncate mt-1" title={album.url}>
                        {album.url}
                      </p>
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-border">
                    {/* Botão Dinâmico: Se Salvo -> "Ver na Galeria", Se Extraindo -> "Extraindo...", Se Normal -> "Salvar no App" */}
                    {statusInfo?.status === 'saved' ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (statusInfo.albumId) {
                            navigateToView('album-detail', statusInfo.albumId);
                          } else {
                            navigateToView('gallery');
                          }
                        }}
                        className="flex-1 min-w-[110px] flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold transition-all shadow-glow-emerald"
                        title="Abrir este álbum na Galeria"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Ver na Galeria</span>
                      </button>
                    ) : statusInfo?.status === 'extracting' || statusInfo?.status === 'queued' ? (
                      <div className="flex-1 min-w-[110px] flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-brand-500/20 text-brand-300 border border-brand-500/30 text-[11px] font-bold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                        <span>{statusInfo.status === 'queued' ? 'Na Fila...' : 'Extraindo...'}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleInitiateSingleSave(album)}
                        className="flex-1 min-w-[100px] flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold transition-all"
                        title="Salvar fotos na biblioteca interna do App sem sair desta tela"
                      >
                        <FolderHeart className="w-3.5 h-3.5" />
                        <span>Salvar no App</span>
                      </button>
                    )}

                    {/* Baixar ZIP Direto */}
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleDirect(album)}
                      className="flex-1 min-w-[90px] flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20 text-[11px] font-bold transition-all"
                      title="Baixar este álbum em ZIP no computador"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar ZIP</span>
                    </button>

                    {/* Extrair com o Agente (Aba Extrator) */}
                    <button
                      type="button"
                      onClick={() => handleExtractSingle(album.url)}
                      className="p-1.5 rounded-xl bg-surface border border-border hover:bg-surface-elevated hover:text-brand-400 text-slate-400 transition-colors"
                      title="Abrir no Extrator Manual"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    {/* Link Original */}
                    <a
                      href={album.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-xl bg-surface border border-border hover:bg-surface-elevated hover:text-brand-400 text-slate-400 transition-colors"
                      title="Abrir link original"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Action Bar (Barra Flutuante Estilo Google Fotos / Telegram Web) */}
      {selectedUrls.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-2xl animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/95 border border-brand-500/40 shadow-2xl backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 text-slate-100">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-300 font-extrabold text-xs sm:text-sm">
                {selectedUrls.size} {selectedUrls.size === 1 ? 'selecionado' : 'selecionados'}
              </div>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-semibold text-slate-300 hover:text-white transition-colors underline decoration-dotted"
              >
                {selectedUrls.size === results.length ? 'Desmarcar Todos' : `Selecionar Todos (${results.length})`}
              </button>
            </div>

            <div className="flex items-center gap-2 relative">
              {/* Seletor de Pasta de Destino */}
              <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-white/15 text-xs shadow-inner" title="Pasta de destino onde os álbuns serão organizados na Galeria">
                <Folder className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-slate-400 text-[11px] hidden sm:inline font-medium">Pasta:</span>
                <input
                  type="text"
                  value={destinationFolder}
                  onChange={(e) => setDestinationFolder(e.target.value)}
                  placeholder={performerName.trim() || 'Geral'}
                  list="multi-album-folder-options"
                  className="bg-transparent border-none text-white text-xs font-semibold focus:outline-none w-24 sm:w-28 placeholder-slate-500"
                />
                <datalist id="multi-album-folder-options">
                  {albumFolders.map((f) => (
                    <option key={f.name} value={f.name} />
                  ))}
                  {performerName.trim() && <option value={performerName.trim()} />}
                </datalist>
              </div>

              {/* Botão Salvar no App */}
              <button
                type="button"
                onClick={handleInitiateBatchSave}
                disabled={isSavingBatch || isDownloadingBatch}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50"
                title="Salvar fotos dos álbuns na biblioteca interna do App"
              >
                {isSavingBatch ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FolderHeart className="w-4 h-4" />
                )}
                <span>Salvar no App ({selectedUrls.size})</span>
              </button>

              {/* Botão Baixar */}
              {selectedUrls.size === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const alb = results.find((r) => selectedUrls.has(r.url));
                    if (alb) handleDownloadSingleDirect(alb);
                  }}
                  disabled={isSavingBatch || isDownloadingBatch}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50"
                  title="Baixar este álbum em ZIP no computador"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar ZIP</span>
                </button>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
                    disabled={isSavingBatch || isDownloadingBatch}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50"
                    title="Escolher formato de download dos álbuns selecionados"
                  >
                    {isDownloadingBatch ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>Baixar ({selectedUrls.size})</span>
                    <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                  </button>

                  {showDownloadDropdown && (
                    <div className="absolute right-0 bottom-full mb-2 w-60 rounded-2xl bg-slate-900 border border-border shadow-2xl p-1.5 z-50 text-xs">
                      <button
                        type="button"
                        onClick={() => handleBatchDownload('unified')}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-brand-500/20 text-slate-200 hover:text-white flex items-center gap-2 transition-all font-medium"
                      >
                        <FolderDown className="w-4 h-4 text-brand-400 shrink-0" />
                        <div>
                          <div className="font-bold">ZIP Único Unificado</div>
                          <div className="text-[10px] text-slate-400">Pastas separadas num só arquivo</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchDownload('individual')}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-brand-500/20 text-slate-200 hover:text-white flex items-center gap-2 transition-all font-medium"
                      >
                        <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-bold">ZIPs Individuais</div>
                          <div className="text-[10px] text-slate-400">Um arquivo ZIP para cada álbum</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Botão Fechar/Limpar */}
              <button
                type="button"
                onClick={clearSelection}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                title="Desmarcar todos"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div
            className={`px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center gap-3 text-xs sm:text-sm font-semibold ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                : 'bg-brand-950/90 border-brand-500/40 text-brand-200'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toast.type === 'info' && <Sparkles className="w-4 h-4 text-brand-400 shrink-0" />}
            <span>{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={toast.onAction}
                className="ml-2 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all underline"
              >
                {toast.actionLabel}
              </button>
            )}
            <button type="button" onClick={() => setToast(null)} className="ml-2 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Modal para visualizar miniatura sem cortes */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[92vh] bg-surface-elevated border border-border rounded-2xl overflow-hidden p-3 shadow-2xl flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/70 text-white/90 hover:bg-black/95 transition-all border border-white/20 shadow-lg"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={`/api/proxy-image?url=${encodeURIComponent(previewImage)}`}
              alt="Miniatura Completa"
              className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain shadow-inner"
            />
          </div>
        </div>
      )}

      {/* Folder Select Modal for MultiAlbumView */}
      <FolderSelectModal
        isOpen={folderModalState.isOpen}
        onClose={() => setFolderModalState({ isOpen: false, mode: 'single' })}
        title={folderModalState.mode === 'batch' ? `Salvar ${selectedUrls.size} Álbuns na Pasta` : 'Escolha a Pasta para Salvar o Álbum'}
        subtitle="Selecione uma pasta existente da Galeria de Álbuns ou crie uma nova pasta."
        existingFolders={albumFolders.map(f => f.name)}
        defaultFolder={destinationFolder.trim() || settings.defaultAlbumFolder || performerName.trim() || 'Geral'}
        type="album"
        onConfirm={(selectedFolder: string) => {
          setDestinationFolder(selectedFolder);
          if (folderModalState.mode === 'batch') {
            executeBatchSaveToApp(selectedFolder);
          } else if (folderModalState.targetAlbum) {
            executeSaveSingleDirect(folderModalState.targetAlbum, selectedFolder);
          }
        }}
      />
    </div>
  );
};
