import React, { useState } from 'react';
import {
  Film,
  Search,
  Loader2,
  CheckCircle2,
  Check,
  Save,
  Download,
  Play,
  Pause,
  Folder,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Trash2,
  CheckSquare,
  Square,
  AlertCircle,
  RotateCcw,
  Copy
} from 'lucide-react';
import { useAppStore, triggerJobsPollingLoop, getCanonicalMediaFingerprint } from '../../store/useAppStore';
import { backendApi } from '../../services/realApi';
import { soundEffects } from '../../services/soundEffects';
import { ScannedVideoItem } from '../../types';
import { FolderSelectModal } from '../common/FolderSelectModal';
import { SavedRedirectBadge } from '../common/SavedRedirectBadge';
import { getProxiedStreamUrl } from './AlbumDetailView';

export const WebVideoScraperView: React.FC = () => {
  const {
    settings,
    videoFolders,
    videos,
    jobs,
    addNotification,
    navigateToView,
    syncJobs,
    webScraperState,
    setWebScraperState,
    clearWebScraperState,
    checkItemSavedStatus,
    markItemAsSavedOptimistically
  } = useAppStore();

  const { url, scanResult, selectedIds, targetFolder, errorMsg } = webScraperState;
  const activeTab = webScraperState.activeTab || 'main';

  const [isScanning, setIsScanning] = useState(false);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [savingSingleId, setSavingSingleId] = useState<string | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateVideosList, setDuplicateVideosList] = useState<ScannedVideoItem[]>([]);
  const [onlyNewVideosList, setOnlyNewVideosList] = useState<ScannedVideoItem[]>([]);
  const [folderModalState, setFolderModalState] = useState<{
    isOpen: boolean;
    mode: 'single' | 'batch';
    targetVideo?: ScannedVideoItem;
  }>({ isOpen: false, mode: 'single' });

  const handleUrlChange = (val: string) => {
    setWebScraperState({ url: val });
  };

  const isVideoSavedInGallery = (item: ScannedVideoItem) => {
    if (item.already_saved) return true;
    const status = checkItemSavedStatus({
      url: item.url || item.stream_url,
      title: item.title,
      mediaType: 'video'
    });
    if (status.isSaved) return true;
    return videos.some(v =>
      (item.id && ((v as any).source_id === item.id || v.id === item.id || (v.filename && v.filename.includes(item.id)))) ||
      (item.url && (v as any).source_url === item.url) ||
      (v.title && item.title && v.title.toLowerCase().trim() === item.title.toLowerCase().trim())
    );
  };

  // In-page duplicate detection map (canonical fingerprint)
  const inPageDuplicateMap = React.useMemo(() => {
    const counts = new Map<string, number>();
    if (!scanResult || !scanResult.videos) return counts;
    scanResult.videos.forEach(v => {
      const key = getCanonicalMediaFingerprint(v.title, v.url || v.stream_url, v.height);
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    return counts;
  }, [scanResult]);

  const mainVideos = scanResult ? scanResult.videos.filter(v => v.is_primary !== false && v.section !== 'recommended') : [];
  const recommendedVideos = scanResult ? scanResult.videos.filter(v => v.is_primary === false || v.section === 'recommended') : [];
  const allVideos = scanResult ? scanResult.videos : [];

  const displayedVideos = activeTab === 'main'
    ? mainVideos
    : activeTab === 'recommended'
    ? recommendedVideos
    : allVideos;

  const displayedIds = displayedVideos.map(v => v.id);
  const isAllDisplayedSelected = displayedIds.length > 0 && displayedIds.every(id => selectedIds.includes(id));
  const newDisplayedVideos = displayedVideos.filter(v => !isVideoSavedInGallery(v));

  const totalSavedCount = scanResult ? scanResult.videos.filter(v => isVideoSavedInGallery(v)).length : 0;
  const totalNewCount = scanResult ? (scanResult.videos.length - totalSavedCount) : 0;

  const handleScanPage = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    setWebScraperState({ errorMsg: null });
    setIsScanning(true);
    soundEffects.click(settings.soundEnabled);

    try {
      const res = await backendApi.scanPageForVideos(cleanUrl, 100);
      if (res.success && res.videos && res.videos.length > 0) {
        const folder = res.suggested_folder || 'Extraídos';
        const primaryVids = res.videos.filter((v: ScannedVideoItem) => v.is_primary !== false && v.section !== 'recommended');
        const targetVids = primaryVids.length > 0 ? primaryVids : res.videos;
        
        // Smart selection: select ONLY videos that are NOT yet saved!
        const unsavedTargetIds = targetVids
          .filter((v: ScannedVideoItem) => !v.already_saved && !isVideoSavedInGallery(v))
          .map((v: ScannedVideoItem) => v.id);

        setWebScraperState({
          scanResult: {
            success: true,
            page_title: res.page_title || cleanUrl,
            suggested_folder: folder,
            total_found: res.total_found || res.videos.length,
            main_count: res.main_count || primaryVids.length,
            recommended_count: res.recommended_count || (res.videos.length - primaryVids.length),
            already_saved_count: res.already_saved_count || 0,
            new_videos_count: res.new_videos_count || (res.videos.length - (res.already_saved_count || 0)),
            album_id: res.album_id || '',
            videos: res.videos
          },
          targetFolder: folder,
          activeTab: 'main',
          selectedIds: unsavedTargetIds,
          errorMsg: null
        });
        soundEffects.success(settings.soundEnabled);
      } else {
        setWebScraperState({ errorMsg: res.error || 'Nenhum vídeo encontrado nesta página.' });
        soundEffects.trash(settings.soundEnabled);
      }
    } catch (err: any) {
      setWebScraperState({ errorMsg: err.message || 'Falha ao escanear página.' });
      soundEffects.trash(settings.soundEnabled);
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter(vId => vId !== id) : [...selectedIds, id];
    setWebScraperState({ selectedIds: next });
  };

  const handleSelectOnlyNew = () => {
    const newInTab = displayedVideos.filter(v => !isVideoSavedInGallery(v)).map(v => v.id);
    setWebScraperState({ selectedIds: newInTab });
  };

  const handleSelectAll = () => {
    if (displayedVideos.length === 0) return;
    if (isAllDisplayedSelected) {
      setWebScraperState({ selectedIds: selectedIds.filter(id => !displayedIds.includes(id)) });
    } else {
      const combined = Array.from(new Set([...selectedIds, ...displayedIds]));
      setWebScraperState({ selectedIds: combined });
    }
  };

  const handleBatchSave = () => {
    if (!scanResult || selectedIds.length === 0 || isBatchSaving) return;

    const selectedVideos = scanResult.videos.filter(v => selectedIds.includes(v.id));
    const duplicates = selectedVideos.filter(v => isVideoSavedInGallery(v));
    const onlyNew = selectedVideos.filter(v => !isVideoSavedInGallery(v));

    if (duplicates.length > 0) {
      setDuplicateVideosList(duplicates);
      setOnlyNewVideosList(onlyNew);
      setShowDuplicateModal(true);
      return;
    }

    if (settings.askFolderOnSave) {
      setFolderModalState({
        isOpen: true,
        mode: 'batch'
      });
    } else {
      executeBatchSave(selectedVideos, true, targetFolder.trim() || settings.defaultVideoFolder || 'Extraídos');
    }
  };

  const executeBatchSave = async (videosToSave: ScannedVideoItem[], skipExisting: boolean = true, customFolder?: string) => {
    if (videosToSave.length === 0) {
      setShowDuplicateModal(false);
      return;
    }
    const folderToUse = (customFolder || targetFolder).trim() || 'Extraídos';
    setIsBatchSaving(true);
    setShowDuplicateModal(false);
    soundEffects.click(settings.soundEnabled);

    try {
      const res = await backendApi.batchSaveVideos(videosToSave, folderToUse, 2, skipExisting);
      if (res.success) {
        // Marcação otimista imediata para cada vídeo salvo
        videosToSave.forEach(v => {
          markItemAsSavedOptimistically({
            url: v.url || v.stream_url,
            title: v.title,
            folder: folderToUse,
            targetId: v.id,
            targetView: 'videos'
          });
        });
        if (scanResult) {
          const saveIdSet = new Set(videosToSave.map(v => v.id));
          const updatedVideos = scanResult.videos.map(v => saveIdSet.has(v.id) ? { ...v, already_saved: true, saved_folder: folderToUse } : v);
          setWebScraperState({
            scanResult: {
              ...scanResult,
              videos: updatedVideos
            }
          });
        }

        addNotification({
          type: 'success',
          title: 'Downloads em Segundo Plano',
          message: res.message || `${videosToSave.length} vídeos foram colocados na fila de download (pasta: ${folderToUse}). Acompanhe na Gestão de Tarefas!`
        });
        soundEffects.success(settings.soundEnabled);
        await syncJobs();
        triggerJobsPollingLoop();
      } else {
        addNotification({
          type: 'error',
          title: 'Erro ao Salvar Vídeos',
          message: res.error || 'Não foi possível enfileirar os vídeos.'
        });
        soundEffects.trash(settings.soundEnabled);
      }
    } catch (err: any) {
      addNotification({
        type: 'error',
        title: 'Erro de Conexão',
        message: err.message || 'Falha ao conectar com o servidor.'
      });
      soundEffects.trash(settings.soundEnabled);
    } finally {
      setIsBatchSaving(false);
    }
  };


  const isVideoSaving = (item: ScannedVideoItem) => {
    return savingSingleId === item.id || jobs.some(j =>
      j.status === 'active' &&
      (j.mode === 'video_save' || (j.mode as string) === 'video_downloader') &&
      ((item.title && j.title.toLowerCase().includes(item.title.toLowerCase())) ||
       (item.url && j.url && j.url === item.url) ||
       (j.id && j.id.includes(item.id)))
    );
  };

  const handleInitiateSingleSave = (item: ScannedVideoItem) => {
    if (isVideoSaving(item)) return;
    const savedStatus = checkItemSavedStatus({
      url: item.url || item.stream_url,
      title: item.title,
      mediaType: 'video'
    });

    if (savedStatus.isSaved && !savedStatus.hasAlternativeResolution) {
      const proceed = window.confirm(`Este vídeo já está salvo na pasta "${savedStatus.folder}". Deseja salvar outra cópia mesmo assim?`);
      if (!proceed) return;
    }

    if (settings.askFolderOnSave) {
      setFolderModalState({
        isOpen: true,
        mode: 'single',
        targetVideo: item
      });
    } else {
      handleSaveSingleVideo(item, targetFolder.trim() || settings.defaultVideoFolder || 'Extraídos');
    }
  };

  const handleSaveSingleVideo = async (item: ScannedVideoItem, customFolder?: string) => {
    if (isVideoSaving(item)) return;
    setSavingSingleId(item.id);
    const folderToUse = (customFolder || targetFolder).trim() || 'Extraídos';

    soundEffects.click(settings.soundEnabled);
    try {
      const res = await backendApi.batchSaveVideos([item], folderToUse, 2);
      if (res.success) {
        // Marcação otimista imediata para exibir a tag Salvo em [Pasta] na mesma hora
        markItemAsSavedOptimistically({
          url: item.url || item.stream_url,
          title: item.title,
          folder: folderToUse,
          targetId: item.id,
          targetView: 'videos'
        });
        if (scanResult) {
          const updatedVideos = scanResult.videos.map(v => v.id === item.id ? { ...v, already_saved: true, saved_folder: folderToUse } : v);
          setWebScraperState({
            scanResult: {
              ...scanResult,
              videos: updatedVideos
            }
          });
        }

        addNotification({
          type: 'success',
          title: 'Salvando Vídeo em 2º Plano',
          message: `"${item.title}" foi colocado na fila de download na pasta "${folderToUse}".`
        });
        soundEffects.success(settings.soundEnabled);
        await syncJobs();
        triggerJobsPollingLoop();
      } else {
        addNotification({
          type: 'error',
          title: 'Erro ao Salvar',
          message: res.error || 'Não foi possível enfileirar o vídeo.'
        });
        soundEffects.trash(settings.soundEnabled);
      }
    } catch (err: any) {
      addNotification({
        type: 'error',
        title: 'Erro de Conexão',
        message: err.message || 'Falha ao conectar com o servidor.'
      });
      soundEffects.trash(settings.soundEnabled);
    } finally {
      setTimeout(() => setSavingSingleId(null), 2000);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6 min-w-0 max-w-full">
      {/* Hero Header Card */}
      <div className="p-6 rounded-3xl glass-panel-elevated border border-border flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 shrink-0">
              WEB VIDEO BATCH SCRAPER
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
              CONCORRÊNCIA CONTROLADA (2X)
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-100 flex items-center gap-2.5 tracking-tight">
            <Film size={22} className="text-violet-400" />
            Extrator de Vídeos da Web
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Cole a URL de qualquer página web contendo vários vídeos (como perfil de atriz, página de categoria, canal ou busca). O sistema descobre todos os vídeos e permite selecioná-los para salvar diretamente na sua Galeria de Vídeos em segundo plano.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {scanResult && (
            <button
              onClick={() => {
                clearWebScraperState();
                soundEffects.click(settings.soundEnabled);
              }}
              className="px-3.5 py-2 rounded-xl bg-surface-elevated hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-border hover:border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Limpar resultados e reiniciar busca"
            >
              <RotateCcw size={14} />
              <span>Limpar</span>
            </button>
          )}
          <button
            onClick={() => navigateToView('job-history')}
            className="px-3.5 py-2 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Abrir Gestão de Tarefas para acompanhar downloads ativos"
          >
            <Layers size={14} className="text-brand-400" />
            <span>Gestão de Tarefas</span>
          </button>
          <button
            onClick={() => navigateToView('videos')}
            className="px-3.5 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Ir para a Galeria de Vídeos"
          >
            <Folder size={14} />
            <span>Galeria de Vídeos</span>
          </button>
        </div>
      </div>

      {/* Input URL Section */}
      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border space-y-4">
        <label className="block text-xs font-bold text-slate-300">
          URL da Página de Vídeos:
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="url"
              value={url}
              onChange={e => handleUrlChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScanPage()}
              placeholder="Ex: https://www.eporner.com/pornstar/savannah-bond-GJ0Rn/ ou qualquer página com vídeos..."
              className="w-full bg-surface-elevated border border-border focus:border-violet-500 text-slate-100 text-xs sm:text-sm rounded-2xl px-4 py-3 outline-none transition-colors"
            />
          </div>
          <button
            onClick={handleScanPage}
            disabled={isScanning || !url.trim()}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 disabled:opacity-50 transition-all shrink-0"
          >
            {isScanning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Escaneando Página...</span>
              </>
            ) : (
              <>
                <Search size={16} />
                <span>Escanear Vídeos da Página</span>
              </>
            )}
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Scanned Results Toolbar & Actions */}
      {scanResult && (
        <div className="glass-panel p-4 sm:p-5 rounded-3xl border border-border space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Folder Destination & Suggestion */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-slate-400">
                Salvar na Pasta:
              </span>
              <div className="relative flex items-center gap-1.5">
                <input
                  type="text"
                  value={targetFolder}
                  onChange={e => setWebScraperState({ targetFolder: e.target.value })}
                  placeholder="Nome da pasta..."
                  className="bg-surface-elevated border border-border focus:border-brand-500 text-slate-100 text-xs font-bold rounded-xl px-3 py-1.5 outline-none w-48"
                />
                {/* Folder Select Dropdown Helper */}
                {videoFolders.length > 0 && (
                  <select
                    onChange={e => e.target.value && setWebScraperState({ targetFolder: e.target.value })}
                    value=""
                    className="bg-surface-elevated border border-border text-slate-300 text-xs rounded-xl px-2 py-1.5 outline-none cursor-pointer"
                    title="Escolher pasta existente na Galeria"
                  >
                    <option value="" disabled>Pastas Existentes</option>
                    {videoFolders.map(f => (
                      <option key={f.id} value={f.name}>{f.name} ({f.videoCount})</option>
                    ))}
                  </select>
                )}
              </div>

              {scanResult.page_title && (
                <span className="text-[11px] text-slate-400 truncate max-w-xs font-medium">
                  {scanResult.page_title}
                </span>
              )}
            </div>

            {/* Selection & Batch Download Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {newDisplayedVideos.length > 0 && (
                <button
                  onClick={handleSelectOnlyNew}
                  className="px-2.5 py-1.5 rounded-xl bg-surface-elevated hover:bg-surface-hover text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Selecionar apenas os vídeos que você ainda não salvou no app"
                >
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <span>Selecionar Novos ({newDisplayedVideos.length})</span>
                </button>
              )}

              <button
                onClick={handleSelectAll}
                className="px-2.5 py-1.5 rounded-xl bg-surface-elevated hover:bg-surface-hover text-slate-200 border border-border text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {isAllDisplayedSelected ? (
                  <>
                    <CheckSquare size={13} className="text-brand-400" />
                    <span>Desmarcar Todos ({displayedVideos.length})</span>
                  </>
                ) : (
                  <>
                    <Square size={13} />
                    <span>Selecionar Todos ({displayedVideos.length})</span>
                  </>
                )}
              </button>

              <span className="text-xs font-mono font-bold text-violet-300 px-2.5 py-1 rounded bg-violet-950/60 border border-violet-500/30">
                {selectedIds.length} selecionados
              </span>

              <button
                onClick={handleBatchSave}
                disabled={selectedIds.length === 0 || isBatchSaving}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-violet-600/30 disabled:opacity-50 transition-all"
              >
                {isBatchSaving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Enfileirando...</span>
                  </>
                ) : (
                  <>
                    <Save size={13} />
                    <span>Baixar Selecionados ({selectedIds.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Segmented Section Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40">
            <div className="flex flex-wrap items-center gap-2">
              {/* Tab: Principais (Default) */}
              <button
                onClick={() => {
                  setWebScraperState({ activeTab: 'main' });
                  soundEffects.click(settings.soundEnabled);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                  activeTab === 'main'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-violet-600/30 ring-1 ring-violet-400/40'
                    : 'bg-surface-elevated hover:bg-surface-hover text-slate-300 border border-border'
                }`}
              >
                <Film size={13} className={activeTab === 'main' ? 'text-white' : 'text-violet-400'} />
                <span>Vídeos Principais ({mainVideos.length})</span>
              </button>

              {/* Tab: Recomendados */}
              {recommendedVideos.length > 0 && (
                <button
                  onClick={() => {
                    setWebScraperState({ activeTab: 'recommended' });
                    soundEffects.click(settings.soundEnabled);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                    activeTab === 'recommended'
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-amber-600/30 ring-1 ring-amber-400/40'
                      : 'bg-surface-elevated hover:bg-surface-hover text-slate-300 border border-border'
                  }`}
                >
                  <Sparkles size={13} className={activeTab === 'recommended' ? 'text-white' : 'text-amber-400'} />
                  <span>Recomendados da Página ({recommendedVideos.length})</span>
                </button>
              )}

              {/* Tab: Todos */}
              <button
                onClick={() => {
                  setWebScraperState({ activeTab: 'all' });
                  soundEffects.click(settings.soundEnabled);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                  activeTab === 'all'
                    ? 'bg-slate-700 text-white shadow-slate-700/30 ring-1 ring-slate-400/30'
                    : 'bg-surface-elevated hover:bg-surface-hover text-slate-300 border border-border'
                }`}
              >
                <span>Todos ({allVideos.length})</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-400 font-medium">
              {totalSavedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold flex items-center gap-1 shadow-sm">
                  <Check size={11} className="text-emerald-400" />
                  <span>{totalSavedCount} Salvos</span>
                </span>
              )}
              {totalNewCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-violet-950/80 border border-violet-500/40 text-violet-300 font-bold">
                  {totalNewCount} Novos
                </span>
              )}
              <span>
                Exibindo <span className="font-bold text-slate-200">{displayedVideos.length}</span> {activeTab === 'main' ? 'principais' : activeTab === 'recommended' ? 'recomendados' : 'no total'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Videos Grid */}
      {scanResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayedVideos.map((item, idx) => {
            const isSelected = selectedIds.includes(item.id);
            const savedStatus = checkItemSavedStatus({
              url: item.url || item.stream_url,
              title: item.title,
              mediaType: 'video',
              height: item.height || (item.resolution && parseInt(item.resolution)) || undefined
            });
            const isSaved = savedStatus.isSaved;
            const isSaving = isVideoSaving(item);
            const isPlaying = playingVideoId === item.id;
            const itemFingerprint = getCanonicalMediaFingerprint(item.title, item.url || item.stream_url, item.height);
            const isInPageDuplicate = Boolean(itemFingerprint && (inPageDuplicateMap.get(itemFingerprint) || 0) > 1);

            return (
              <div
                key={item.id}
                onClick={() => handleToggleSelect(item.id)}
                className={`group relative glass-panel rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  isSelected
                    ? 'border-violet-500 ring-2 ring-violet-500/40 shadow-glow-brand bg-surface-elevated'
                    : isSaved
                    ? 'border-emerald-500/40 bg-emerald-950/15 hover:border-emerald-400/60'
                    : 'border-border hover:border-violet-500/40'
                }`}
              >
                {/* Thumbnail / Video Preview Area */}
                <div className="relative aspect-video bg-black overflow-hidden">

                  {isPlaying ? (
                    <div
                      className="w-full h-full relative"
                      onClick={e => e.stopPropagation()}
                    >
                      <video
                        src={getProxiedStreamUrl(item.stream_url || item.url, item.url)}
                        controls
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <img
                      src={item.thumbnail_url}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}

                  {/* Top-Left Selection Checkbox */}
                  <div
                    onClick={e => {
                      e.stopPropagation();
                      handleToggleSelect(item.id);
                    }}
                    className="absolute top-2.5 left-2.5 z-10"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-violet-500 cursor-pointer"
                    />
                  </div>

                  {/* Section Badge (Salvo / Recomendado / Principal) */}
                  {isSaved ? (
                    <div className="absolute top-2.5 left-8 z-10">
                      <SavedRedirectBadge savedInfo={savedStatus} />
                    </div>
                  ) : item.is_primary === false || item.section === 'recommended' ? (
                    <span className="absolute top-2.5 left-8 z-10 px-2 py-0.5 rounded-full bg-amber-950/90 backdrop-blur-md border border-amber-500/50 text-[9px] font-bold text-amber-300 flex items-center gap-1 shadow-sm">
                      <Sparkles size={9} /> Recomendado
                    </span>
                  ) : activeTab === 'all' ? (
                    <span className="absolute top-2.5 left-8 z-10 px-2 py-0.5 rounded-full bg-violet-950/90 backdrop-blur-md border border-violet-500/50 text-[9px] font-bold text-violet-300 flex items-center gap-1 shadow-sm">
                      <Film size={9} /> Principal
                    </span>
                  ) : null}

                  {/* Duplicado na Página Badge */}
                  {isInPageDuplicate && !isSaved && (
                    <span
                      className="absolute top-2.5 right-20 z-10 px-2 py-0.5 rounded-full bg-amber-500/90 text-slate-950 font-bold text-[9px] shadow-sm flex items-center gap-1 backdrop-blur-md"
                      title="Vídeo repetido múltiplas vezes nesta mesma página"
                    >
                      <Copy size={9} />
                      <span>Duplicado na Página</span>
                    </span>
                  )}

                  {/* Duration Badge */}
                  {item.duration && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[10px] font-mono font-bold text-slate-200 border border-white/10">
                      {item.duration}
                    </span>
                  )}

                  {/* Quality Badge */}
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-violet-950/80 backdrop-blur-md border border-violet-500/40 text-[9px] font-mono font-bold text-violet-200">
                    {item.quality_hint || '1080p HD'}
                  </span>
                </div>

                {/* Card Info and Buttons */}
                <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                  <h3 className="text-xs font-bold text-slate-200 line-clamp-2" title={item.title}>
                    {item.title}
                  </h3>

                  <div className="flex items-center justify-between pt-1 border-t border-border/50 text-slate-400 text-xs">
                    <span className="text-[10px] font-mono text-slate-500">
                      #{idx + 1}
                    </span>

                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      {/* Individual Save Button */}
                      <button
                        onClick={() => handleInitiateSingleSave(item)}
                        disabled={isSaving}
                        className={`p-1.5 rounded-lg border transition-colors shadow-sm disabled:opacity-80 flex items-center gap-1 text-[11px] font-bold ${
                          isSaving
                            ? 'bg-violet-900/90 text-violet-200 border-violet-500/60'
                            : isSaved
                            ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border-emerald-500/40 px-2'
                            : 'bg-violet-900/90 hover:bg-violet-800 text-violet-200 hover:text-white border border-violet-500/40'
                        }`}
                        title={
                          isSaving
                            ? 'Salvando em segundo plano... Acompanhe na Gestão de Tarefas'
                            : isSaved
                            ? `Salvo na pasta "${savedStatus.folder}". Clique para salvar novamente ou trocar pasta.`
                            : `Salvar na Galeria (${targetFolder})`
                        }
                      >
                        {isSaving ? (
                          <Loader2 size={13} className="animate-spin text-violet-300" />
                        ) : isSaved ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span>Salvo</span>
                          </>
                        ) : (
                          <Save size={13} />
                        )}
                      </button>

                      {/* Direct Browser Download */}
                      <button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = `/api/proxy-video-stream?url=${encodeURIComponent(item.stream_url || item.url)}&download=true&filename=${encodeURIComponent(item.title)}`;
                          link.download = `${item.title}.mp4`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="p-1.5 rounded-lg bg-black/60 hover:bg-black text-slate-300 hover:text-white border border-white/10 transition-colors shadow-sm"
                        title="Baixar MP4 direto no navegador"
                      >
                        <Download size={13} />
                      </button>

                      {/* Link to source */}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-black/60 hover:bg-black text-slate-400 hover:text-slate-200 border border-white/10 transition-colors shadow-sm"
                        title="Abrir página original do vídeo"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Duplicate Videos Warning / Confirmation Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg glass-panel-elevated border border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  Vídeos Já Salvos no App
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <span className="font-bold text-emerald-400">{duplicateVideosList.length}</span> dos {duplicateVideosList.length + onlyNewVideosList.length} vídeos selecionados já estão salvos na sua Galeria:
                </p>
              </div>
            </div>

            {/* List of duplicate titles */}
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {duplicateVideosList.map((d, i) => (
                <div key={d.id || i} className="p-2.5 rounded-xl bg-surface-elevated border border-border flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-200 font-medium truncate flex-1" title={d.title}>
                    {d.title}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold shrink-0">
                    {d.saved_folder || 'Galeria'}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-2xl bg-violet-950/40 border border-violet-500/30 text-xs text-violet-200 flex items-center gap-2">
              <Sparkles size={14} className="text-violet-400 shrink-0" />
              <span>
                {onlyNewVideosList.length > 0 
                  ? `Você pode pular os vídeos repetidos e baixar apenas os ${onlyNewVideosList.length} vídeos novos.`
                  : 'Todos os vídeos selecionados já foram salvos anteriormente no app.'}
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-surface hover:bg-surface-hover text-slate-400 hover:text-slate-200 border border-border text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>

              {onlyNewVideosList.length > 0 && (
                <button
                  onClick={() => executeBatchSave(onlyNewVideosList, true)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all"
                >
                  <Check size={14} />
                  <span>Pular Salvos e Baixar {onlyNewVideosList.length} Novos (Recomendado)</span>
                </button>
              )}

              <button
                onClick={() => executeBatchSave([...duplicateVideosList, ...onlyNewVideosList], false)}
                className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl bg-surface-elevated hover:bg-surface-hover text-slate-300 text-xs font-semibold border border-border transition-colors"
                title="Forçar novo download de todos"
              >
                Baixar Todos Mesmo Assim ({duplicateVideosList.length + onlyNewVideosList.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Select Modal */}
      <FolderSelectModal
        isOpen={folderModalState.isOpen}
        onClose={() => setFolderModalState({ isOpen: false, mode: 'single' })}
        title={folderModalState.mode === 'batch' ? `Salvar ${selectedIds.length} Vídeos na Pasta` : 'Escolha a Pasta para Salvar o Vídeo'}
        subtitle="Selecione uma pasta existente da Galeria de Vídeos ou crie uma nova pasta."
        existingFolders={videoFolders.map(f => f.name)}
        defaultFolder={targetFolder.trim() || settings.defaultVideoFolder || 'Extraídos'}
        type="video"
        onConfirm={(selectedFolder: string) => {
          setWebScraperState({ targetFolder: selectedFolder });
          if (folderModalState.mode === 'batch') {
            const selectedVideos = scanResult?.videos.filter(v => selectedIds.includes(v.id)) || [];
            executeBatchSave(selectedVideos, true, selectedFolder);
          } else if (folderModalState.targetVideo) {
            handleSaveSingleVideo(folderModalState.targetVideo, selectedFolder);
          }
        }}
      />
    </div>
  );
};

