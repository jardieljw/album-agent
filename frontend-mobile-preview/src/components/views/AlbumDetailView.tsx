import React, { useState, useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Download,
  Sparkles,
  Play,
  LayoutGrid,
  Edit2,
  ExternalLink,
  Star,
  Trash2,
  Film,
  Clapperboard,
  Save,
  Video,
  Loader2,
  X,
  RefreshCw,
  HardDrive,
  Clock,
  Check,
  BookmarkCheck,
  Folder,
  Image as ImageIcon,
  Layers,
  Eye,
  AlertTriangle,
  Maximize2
} from 'lucide-react';
import { useAppStore, triggerJobsPollingLoop } from '../../store/useAppStore';
import { backendApi } from '../../services/realApi';
import { translations } from '../../i18n/translations';
import { formatFileSize } from '../../utils/formatters';
import { FolderSelectModal } from '../common/FolderSelectModal';
import { SavedRedirectBadge } from '../common/SavedRedirectBadge';
import { CHROMATIC_PALETTE_COLORS, matchesPaletteFuzzy, colorPaletteCache, extractDominantColors } from '../../services/colorExtractor';
import { ColorFilterPopover } from '../common/ColorFilterPopover';

export const getProxiedStreamUrl = (rawUrl?: string, referer?: string): string => {
  if (!rawUrl) return '';
  let cleanUrl = rawUrl;
  let unwrapCount = 0;
  let extractedReferer = referer;
  const wasAlreadyProxied = rawUrl.includes('/api/proxy-video-stream');

  while (cleanUrl.includes('/api/proxy-video-stream') && cleanUrl.includes('url=') && unwrapCount < 5) {
    unwrapCount++;
    const mRef = cleanUrl.match(/[?&]referer=([^&]+)/);
    if (mRef && !extractedReferer) {
      extractedReferer = decodeURIComponent(mRef[1]);
    }
    const m = cleanUrl.match(/[?&]url=([^&]+)/);
    if (m) {
      cleanUrl = decodeURIComponent(m[1]);
    } else {
      break;
    }
  }
  if (cleanUrl.startsWith('/api/')) return cleanUrl;

  const isRestricted = wasAlreadyProxied || cleanUrl.startsWith('http');
  if (isRestricted) {
    let defaultRef = '';
    try {
      defaultRef = new URL(cleanUrl).origin;
    } catch {
      defaultRef = '';
    }
    const ref = extractedReferer || defaultRef;
    const refParam = ref ? `&referer=${encodeURIComponent(ref)}` : '';
    return `/api/proxy-video-stream?url=${encodeURIComponent(cleanUrl)}${refParam}`;
  }
  return cleanUrl;
};

const InlineStreamPlayer: React.FC<{
  url: string;
  poster?: string;
  referer?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}> = ({ url, poster, referer, onRefresh, isRefreshing }) => {
  const { settings } = useAppStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const effectiveUrl = useMemo(() => {
    return getProxiedStreamUrl(url, referer);
  }, [url, referer]);

  useEffect(() => {
    setHasError(false);
    setErrorMessage(null);
    const video = videoRef.current;
    if (!video || !effectiveUrl) return;

    const isHls = effectiveUrl.includes('.m3u8') || effectiveUrl.includes('/hls/');
    let hlsInstance: Hls | null = null;

    if (isHls && Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsInstance.loadSource(effectiveUrl);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setHasError(true);
          setErrorMessage('Erro ao carregar fluxo HLS.');
        }
      });
    } else {
      video.src = effectiveUrl;
      video.load();
    }

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [effectiveUrl]);

  return (
    <div className="w-full h-full relative bg-black flex items-center justify-center">
      {hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-slate-950/95 z-20">
          <AlertTriangle size={32} className="text-amber-400 mb-2" />
          <p className="text-xs text-white font-semibold mb-1">
            {errorMessage || (translations[settings.language].albumDetail.streamPlaybackFailed || 'Falha na reprodução do vídeo')}
          </p>
          <p className="text-[11px] text-slate-400 mb-3 max-w-xs">
            O link de stream pode estar expirado ou bloqueado pela CDN.
          </p>
          {onRefresh && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              disabled={isRefreshing}
              className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all cursor-pointer"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Renovando...' : 'Renovar Stream'}</span>
            </button>
          )}
        </div>
      ) : (
        <video
          ref={videoRef}
          controls
          autoPlay
          playsInline
          {...({ 'webkit-playsinline': 'true', 'x5-playsinline': 'true' } as any)}
          preload="auto"
          poster={poster}
          onError={(e) => {
            console.warn('Inline video player error:', e);
            setHasError(true);
            setErrorMessage(translations[settings.language].albumDetail.streamUnavailable || 'Stream indisponível ou link expirado (CDN 404/410).');
          }}
          className="w-full h-full object-contain"
        >
          {translations[settings.language].albumDetail.browserNoVideo || 'Seu navegador não suporta este vídeo.'}
        </video>
      )}
    </div>
  );
};

export const AlbumDetailView: React.FC = () => {
  const getVideoResolutionInfo = (img: any) => {
    let h = img.height || 0;
    let w = img.width || 0;
    const t = (img.title || '').toLowerCase();
    const url = (img.originalUrl || img.videoUrl || img.videoStreamUrl || '').toLowerCase();

    // Se o título especificar explicitamente uma resolução (ex: 2160p, 4k, 1440p, 2k, 1080p, 720p)
    let titleH = 0;
    if (/(2160p|4k|uhd)/i.test(t)) {
      titleH = 2160;
    } else if (/(1440p|2k|qhd)/i.test(t)) {
      titleH = 1440;
    } else if (/(1080p|1080|fhd)/i.test(t)) {
      titleH = 1080;
    } else if (/(720p|720)/i.test(t)) {
      titleH = 720;
    } else if (/(480p|480)/i.test(t)) {
      titleH = 480;
    }

    // Se o título indica 4K ou 2K mas a altura no objeto é menor (ex: atribuída como 1080p pelo scraper antigo),
    // respeita a resolução superior do título
    if (titleH > h) {
      h = titleH;
      if (h === 2160) w = 3840;
      else if (h === 1440) w = 2560;
      else if (h === 1080) w = 1920;
      else if (h === 720) w = 1280;
    }

    const is60 = t.includes('60fps') || t.includes('60p') || t.includes('60 fps');

    // 4K UHD (2160p)
    if (h >= 2160 || w >= 3840) {
      return {
        label: is60 ? '4K 60fps' : '4K UHD',
        dimensions: '3840×2160',
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-amber-900/30'
      };
    }
    // 2K QHD (1440p)
    if (h >= 1440 || w >= 2560) {
      return {
        label: is60 ? '2K 60fps' : '2K QHD',
        dimensions: '2560×1440',
        badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-indigo-900/30'
      };
    }
    // 1080p Full HD
    if (h >= 1080 || w >= 1920) {
      return {
        label: is60 ? '1080p60' : '1080p FHD',
        dimensions: '1920×1080',
        badgeClass: 'bg-violet-900/90 text-violet-200 border-violet-400/50 shadow-violet-900/30'
      };
    }
    // 720p HD
    if (h >= 720 || w >= 1280) {
      return {
        label: is60 ? '720p60' : '720p HD',
        dimensions: '1280×720',
        badgeClass: 'bg-blue-900/80 text-blue-200 border-blue-400/40'
      };
    }
    // 480p SD
    if (h >= 480) {
      return {
        label: '480p SD',
        dimensions: '854×480',
        badgeClass: 'bg-slate-800 text-slate-300 border-slate-600/40'
      };
    }
    // 360p
    if (h >= 360) {
      return {
        label: '360p',
        dimensions: '640×360',
        badgeClass: 'bg-slate-800 text-slate-300 border-slate-600/40'
      };
    }
    // 240p
    if (h >= 240) {
      return {
        label: '240p',
        dimensions: '426×240',
        badgeClass: 'bg-slate-800 text-slate-300 border-slate-600/40'
      };
    }
    return {
      label: h > 0 ? `${h}p` : 'HD',
      dimensions: w > 0 && h > 0 ? `${w}×${h}` : (img.aspectRatio || '16:9'),
      badgeClass: 'bg-violet-900/90 text-violet-200 border-violet-400/50'
    };
  };

  const {
    albums,
    activeAlbumId,
    updateAlbum,
    openLightbox,
    openExportModal,
    setSlideshowOpen,
    setContactSheetOpen,
    albumDetailZoomCols,
    setAlbumDetailZoomCols,
    selectedImageIds,
    toggleSelectImage,
    selectAllImages,
    clearSelectedImages,
    removeImagesFromAlbum,
    deleteAlbum,
    setAlbumCover,
    refreshAlbumStreams,
    navigateToView,
    settings,
    saveExtractedVideoToGallery,
    setActivePlayingVideo,
    videos,
    videoFolders,
    jobs,
    addNotification,
    renameAlbumImage,
    checkItemSavedStatus,
    setActiveAlbumFolder,
    setActiveVideoFolder,
    albumColorFilter,
    setAlbumColorFilter
  } = useAppStore();

  const t = translations[settings.language].albumDetail;
  const album = albums.find(a => a.id === activeAlbumId) || albums[0];

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(album?.title || '');
  const [playingVideoIds, setPlayingVideoIds] = useState<string[]>([]);
  const [savingVideoId, setSavingVideoId] = useState<string | null>(null);
  const [coverUpdatingId, setCoverUpdatingId] = useState<string | null>(null);
  const [isBatchSavingVideos, setIsBatchSavingVideos] = useState(false);
  const [refreshingStreamId, setRefreshingStreamId] = useState<string | null>(null);
  const [isConfirmingDeleteAlbum, setIsConfirmingDeleteAlbum] = useState(false);
  const [isRefreshingStreams, setIsRefreshingStreams] = useState(false);
  const [isSyncingMetadata, setIsSyncingMetadata] = useState(false);
  const [loadedDimensions, setLoadedDimensions] = useState<Record<string, { w: number; h: number }>>({});
  const [cardViewMode, setCardViewMode] = useState<'adaptive' | 'contain' | 'masonry' | 'standard'>('adaptive');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'photos' | 'gifs' | 'videos'>('all');
  const [folderModalState, setFolderModalState] = useState<{
    isOpen: boolean;
    mode: 'single' | 'batch';
    targetVideo?: any;
  }>({ isOpen: false, mode: 'single' });

  // Individual image/video renaming state
  const [imageToRename, setImageToRename] = useState<{ id: string; title: string; isVideo: boolean } | null>(null);
  const [newImageTitle, setNewImageTitle] = useState<string>('');
  const [isSavingImageTitle, setIsSavingImageTitle] = useState(false);

  const handleOpenRename = (img: any) => {
    setImageToRename({ id: img.id, title: img.title || '', isVideo: img.mediaType === 'video' });
    setNewImageTitle(img.title || '');
  };

  const handleSaveImageTitle = async () => {
    if (!imageToRename || !newImageTitle.trim() || !album) return;
    setIsSavingImageTitle(true);
    try {
      await renameAlbumImage(album.id, imageToRename.id, newImageTitle.trim());
      addNotification({
        title: t.titleUpdated || 'Título Atualizado',
        message: (t.itemRenamed || '{type} renomeado para "{title}".').replace('{type}', imageToRename.isVideo ? (t.extractedVideo || 'Vídeo') : 'Item').replace('{title}', newImageTitle.trim()),
        type: 'success'
      });
      setImageToRename(null);
    } catch {
      addNotification({
        title: 'Erro',
        message: t.failSaveTitle || 'Não foi possível salvar o novo título.',
        type: 'error'
      });
    } finally {
      setIsSavingImageTitle(false);
    }
  };

  // 1. When opening an album, pre-read the original image dimensions and genuine file sizes if missing
  useEffect(() => {
    if (!album) return;

    // Check if album has missing dimensions or missing file sizes
    const needsProbe = (album.images || []).some(
      img => img.mediaType !== 'video' && ((!img.width || img.width === 0) || (!img.fileSizeBytes || img.fileSizeBytes === 0))
    );

    if (needsProbe) {
      backendApi.fetchAlbumDetails(album.id).then(fresh => {
        if (fresh) {
          useAppStore.setState(state => ({
            albums: state.albums.map(a => a.id === album.id ? fresh : a)
          }));
        }
      }).catch(() => {});
    }
  }, [album?.id]);

  const [, setPaletteRenderTick] = useState(0);

  // Dynamic computer vision: extract dominant colors for album photos that don't have palettes yet
  useEffect(() => {
    if (!album || !album.images || album.images.length === 0) return;
    const unextracted = album.images.filter(img =>
      (!img.colorPalette || img.colorPalette.length === 0) &&
      (img.thumbnailUrl || img.previewUrl || img.originalUrl) &&
      !colorPaletteCache.has(img.thumbnailUrl || img.previewUrl || img.originalUrl)
    ).slice(0, 30);

    if (unextracted.length === 0) return;

    let cancelled = false;
    unextracted.forEach(img => {
      const url = img.thumbnailUrl || img.previewUrl || img.originalUrl;
      if (url) {
        extractDominantColors(url).then(colors => {
          if (!cancelled && colors && colors.length > 0) {
            img.colorPalette = colors;
            setPaletteRenderTick(t => t + 1);
          }
        });
      }
    });

    return () => { cancelled = true; };
  }, [album?.id, album?.images?.length]);

  const toggleInlinePlay = (id: string) => {
    setPlayingVideoIds(prev =>
      prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]
    );
  };

  const closeInlinePlay = (id: string) => {
    setPlayingVideoIds(prev => prev.filter(vId => vId !== id));
  };

  if (!album) {
    return (
      <div className="p-12 text-center text-slate-500 text-xs">
        {t.noAlbumSelected || 'Nenhum álbum selecionado.'}
      </div>
    );
  }

  const handleSaveTitle = () => {
    updateAlbum(album.id, { title: editedTitle });
    setIsEditingTitle(false);
  };

  const handleAutoCurate = () => {
    // Select top 5 highest aesthetic score photos
    const sorted = [...(album.images || [])].sort((a, b) => (b.aestheticScore || 0) - (a.aestheticScore || 0));
    const topIds = sorted.slice(0, 5).map(i => i.id);
    selectAllImages(topIds);
  };

  const handleDownloadSelected = () => {
    const selectedImages = (album.images || []).filter(img => selectedImageIds.includes(img.id));
    selectedImages.forEach((img, idx) => {
      setTimeout(() => {
        const link = document.createElement('a');
        const isVid = img.mediaType === 'video' || !!img.videoUrl || (img.originalUrl && img.originalUrl.includes('.mp4'));
        const ext = isVid ? 'mp4' : (img.isAnimated ? 'gif' : 'jpg');
        const fname = `${img.title || (isVid ? `video-${idx + 1}` : `foto-${idx + 1}`)}.${ext}`;
        let rawVid = img.rawOriginalUrl || img.originalUrl || img.videoUrl || '';
        if (rawVid.includes('/api/proxy-video-stream') && rawVid.includes('url=')) {
          const m = rawVid.match(/[?&]url=([^&]+)/);
          if (m) rawVid = decodeURIComponent(m[1]);
        }
        let defaultRef = '';
        try {
          defaultRef = new URL(album.sourceUrl || rawVid).origin;
        } catch {
          defaultRef = '';
        }
        const vRef = album.sourceUrl || (img as any).sourcePage || defaultRef;
        const dlUrl = isVid
          ? `/api/proxy-video-stream?url=${encodeURIComponent(rawVid)}&referer=${encodeURIComponent(vRef)}&download=true&filename=${encodeURIComponent(fname)}`
          : `/api/download-image?url=${encodeURIComponent(img.rawOriginalUrl || img.originalUrl || img.previewUrl || '')}&referer=${encodeURIComponent(album.sourceUrl || '')}&filename=${encodeURIComponent(fname)}`;
        link.href = dlUrl;
        link.download = fname;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, idx * 250);
    });
  };

  const selectedVideos = (album?.images || []).filter(
    img => selectedImageIds.includes(img.id) && (img.mediaType === 'video' || !!img.videoUrl)
  );

  const executeBatchSaveVideos = async (targetFolder: string) => {
    if (selectedVideos.length === 0 || isBatchSavingVideos) return;
    setIsBatchSavingVideos(true);
    try {
      const itemsToSave = selectedVideos.map(v => ({
        url: v.rawOriginalUrl || v.videoUrl || v.originalUrl,
        title: v.title || (t.extractedVideo || 'Vídeo Extraído'),
        thumbnailUrl: v.posterUrl || v.thumbnailUrl || '',
        duration: (v as any).duration || '',
        candidateId: v.candidateId
      }));
      await backendApi.batchSaveVideos(itemsToSave, targetFolder, 2);
      addNotification({
        title: t.saveVideosStarted || 'Salvamento de Vídeos Iniciado',
        message: `${itemsToSave.length} vídeo(s) estão sendo baixados em segundo plano para "${targetFolder}". Acompanhe na Gestão de Tarefas.`,
        type: 'info'
      });
      triggerJobsPollingLoop();
    } catch (err) {
      console.error('Failed to batch save selected videos:', err);
    } finally {
      setIsBatchSavingVideos(false);
    }
  };

  const handleInitiateBatchSaveVideos = () => {
    if (selectedVideos.length === 0 || isBatchSavingVideos) return;
    if (settings.askFolderOnSave) {
      setFolderModalState({
        isOpen: true,
        mode: 'batch'
      });
    } else {
      executeBatchSaveVideos(settings.defaultVideoFolder || 'Extraídos');
    }
  };

  const executeSaveSingleVideo = async (img: any, targetFolder: string) => {
    setSavingVideoId(img.id);
    await saveExtractedVideoToGallery(
      img.rawOriginalUrl || img.videoUrl!,
      img.title,
      targetFolder,
      album.sourceUrl,
      img.rawThumbnailUrl || img.thumbnailUrl || img.posterUrl
    );
    setTimeout(() => setSavingVideoId(null), 1500);
  };

  const handleInitiateSaveSingleVideo = (img: any) => {
    const savedStatus = checkItemSavedStatus({
      url: img.rawOriginalUrl || img.videoUrl || img.originalUrl,
      title: img.title,
      mediaType: 'video'
    });

    if (savedStatus.isSaved && !savedStatus.hasAlternativeResolution) {
      const proceed = window.confirm(
        (t.videoAlreadySavedConfirm || 'Este vídeo já está salvo na pasta "{folder}". Deseja salvar outra cópia mesmo assim?').replace('{folder}', savedStatus.folder || '')
      );
      if (!proceed) return;
    }

    if (settings.askFolderOnSave) {
      setFolderModalState({
        isOpen: true,
        mode: 'single',
        targetVideo: img
      });
    } else {
      executeSaveSingleVideo(img, settings.defaultVideoFolder || 'Extraídos');
    }
  };

  const handleDeleteSelected = () => {
    if (window.confirm((t.removeImagesConfirm || 'Deseja remover {count} foto(s) do álbum?').replace('{count}', String(selectedImageIds.length)))) {
      removeImagesFromAlbum(album.id, selectedImageIds);
      clearSelectedImages();
    }
  };

  const hasVideos = (album?.images || []).some(
    img => img.mediaType === 'video' || !!img.videoUrl || !!(img as any).videoStreamUrl || !!(img as any).is_video || /\.(mp4|webm|m4v)(\?|$)/i.test(img.originalUrl || '')
  );

  const handleRefreshStreams = async () => {
    if (!album || isRefreshingStreams) return;
    setIsRefreshingStreams(true);
    try {
      await refreshAlbumStreams(album.id);
    } finally {
      setIsRefreshingStreams(false);
    }
  };

  const handleRefreshSingleVideo = async (img: any) => {
    const targetCid = img.candidateId || img.id;
    if (!album || refreshingStreamId === img.id) return;
    setRefreshingStreamId(img.id);
    try {
      let renewed = false;
      if (targetCid) {
        const newUrl = await backendApi.refreshSingleStream(album.id, targetCid);
        if (newUrl) renewed = true;
      }
      if (!renewed) {
        renewed = await backendApi.refreshAlbumStreams(album.id);
      }
      if (renewed) {
        const fresh = await backendApi.fetchAlbumDetails(album.id);
        if (fresh) {
          useAppStore.setState(state => ({
            albums: state.albums.map(a => a.id === album.id ? fresh : a)
          }));
        }
        addNotification({
          title: t.streamRenewed || 'Stream Renovado',
          message: t.streamRenewedMsg || 'O link do vídeo foi renovado com sucesso.',
          type: 'success'
        });
      } else {
        addNotification({
          title: t.streamRenewFailed || 'Falha na Renovação',
          message: t.streamRenewFailedMsg || 'Não foi possível renovar o link de stream no momento.',
          type: 'error'
        });
      }
    } catch (err) {
      console.error('Error refreshing video stream:', err);
    } finally {
      setRefreshingStreamId(null);
    }
  };

  const handleSyncMetadata = async () => {
    if (!album || isSyncingMetadata) return;
    setIsSyncingMetadata(true);
    try {
      const fresh = await backendApi.syncAlbumMetadata(album.id);
      if (fresh) {
        useAppStore.setState(state => ({
          albums: state.albums.map(a => a.id === album.id ? fresh : a)
        }));
      }
    } catch (err) {
      console.error('Failed to sync metadata:', err);
    } finally {
      setIsSyncingMetadata(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full">
      {/* Hero Header Card */}
      <div className="p-4 sm:p-6 rounded-3xl glass-panel-elevated border border-border flex flex-col lg:flex-row gap-4 sm:gap-6 items-start lg:items-center justify-between min-w-0 max-w-full overflow-hidden">
        <div className="space-y-2 flex-1 min-w-0 max-w-full overflow-hidden">
          {/* Breadcrumb Navigation with Folder Redirect & Videos Button */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
            <button
              onClick={() => {
                setActiveAlbumFolder(null);
                navigateToView('gallery');
              }}
              className="hover:text-brand-300 transition-colors flex items-center gap-1 cursor-pointer"
              title={t.backToGalleryTitle || 'Voltar para a Galeria de Álbuns'}
            >
              <span>{t.backToGallery || 'Galeria de Álbuns'}</span>
            </button>
            <span className="text-slate-600">/</span>
            <button
              onClick={() => {
                setActiveAlbumFolder(album.folder || 'Geral');
                navigateToView('gallery');
              }}
              className="px-2.5 py-0.5 rounded-lg bg-surface-elevated hover:bg-violet-950/60 border border-violet-500/40 text-violet-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title={`Ver todos os álbuns da pasta "${album.folder || 'Geral'}"`}
            >
              <Folder size={12} className="text-violet-400" />
              <span>{(t.folderPrefix || 'Pasta: ') + (album.folder || 'Geral')}</span>
            </button>

            {/* Direct Link to open this folder in Videos Gallery only if videos actually exist */}
            {(() => {
              if (!album?.folder) return null;
              const normKey = (s: string) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
              const targetKey = normKey(album.folder);
              const matchedFolder = (videoFolders || []).find(vf => normKey(vf.name) === targetKey);
              const count = matchedFolder ? matchedFolder.videoCount : (videos || []).filter(v => normKey(v.folder || 'Geral') === targetKey).length;
              if (count === 0) return null;

              return (
                <button
                  onClick={() => {
                    setActiveVideoFolder(matchedFolder?.name || album.folder || null);
                    navigateToView('videos');
                  }}
                  className="px-2.5 py-0.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer ml-1"
                  title={`Abrir os ${count} vídeos da pasta "${matchedFolder?.name || album.folder}" na Galeria de Vídeos`}
                >
                  <Film size={12} className="text-violet-400" />
                  <span>{(t.viewVideosInFolder || 'Ver Vídeos ({count})').replace('{count}', String(count))}</span>
                </button>
              );
            })()}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              {t.allOriginalsResolved || '100% ORIGINAIS RESOLVIDOS'}
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded bg-surface-elevated text-slate-400 border border-border shrink-0">
              {(album.images || []).length} {t.photosLabel || 'Fotos'}
            </span>
            {album.totalSizeBytes > 0 && (
              <span className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded bg-surface-elevated text-cyan-400 border border-border shrink-0">
                {formatFileSize(album.totalSizeBytes)}
              </span>
            )}
            <span className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 shrink-0">
              {album.aiModel}
            </span>
          </div>

          {/* Editable Title with Strict Width Containment */}
          {isEditingTitle ? (
            <div className="flex items-center gap-2 min-w-0 max-w-full">
              <input
                type="text"
                value={editedTitle}
                onChange={e => setEditedTitle(e.target.value)}
                className="text-base sm:text-xl font-extrabold bg-surface-elevated px-3 py-1 rounded-xl border border-brand-500 text-slate-100 outline-none w-full min-w-0"
              />
              <button
                onClick={handleSaveTitle}
                className="px-3 py-1 rounded-xl bg-brand-600 text-white text-xs font-bold shrink-0"
              >
                Salvar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0 max-w-full overflow-hidden">
              <h1 className="text-base sm:text-2xl font-extrabold text-slate-100 tracking-tight truncate min-w-0 flex-1">
                {album.title}
              </h1>
              <button
                onClick={() => {
                  setEditedTitle(album.title);
                  setIsEditingTitle(true);
                }}
                className="p-1 text-slate-400 hover:text-slate-200 shrink-0"
                title={t.editTitle || 'Editar Título'}
              >
                <Edit2 size={14} />
              </button>
            </div>
          )}

          <p className="text-xs text-slate-400 flex items-center gap-1.5 truncate min-w-0 max-w-full">
            <span className="shrink-0">{t.source}</span>
            <a
              href={album.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-400 hover:underline flex items-center gap-1 truncate min-w-0"
            >
              <span className="truncate">{album.sourceDomain}</span> <ExternalLink size={11} className="shrink-0" />
            </a>
          </p>
        </div>

        {/* Hero Toolbar Actions */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto">
          <button
            onClick={() => setSlideshowOpen(true)}
            className="px-3 py-2 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Play size={13} />
            <span>{t.slideshow}</span>
          </button>

          <button
            onClick={() => setContactSheetOpen(true)}
            className="px-3 py-2 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <LayoutGrid size={13} />
            <span>{t.contactSheet}</span>
          </button>

          <button
            onClick={() => openExportModal(album)}
            className="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-glow-brand transition-colors whitespace-nowrap"
          >
            <Download size={14} />
            <span>{t.downloadZip}</span>
          </button>

          <button
            onClick={() => setIsConfirmingDeleteAlbum(true)}
            className="px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            title="Excluir este Álbum"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">Excluir Álbum</span>
          </button>

          {hasVideos && (
            <button
              onClick={handleRefreshStreams}
              disabled={isRefreshingStreams}
              className="px-3 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
              title="Renovar links de stream dos vídeos"
            >
              <RefreshCw size={13} className={isRefreshingStreams ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{isRefreshingStreams ? 'Renovando...' : 'Renovar Streams'}</span>
            </button>
          )}

          <button
            onClick={handleSyncMetadata}
            disabled={isSyncingMetadata}
            className="px-3 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
            title="Sincronizar tamanhos e metadados reais dos arquivos"
          >
            <Sparkles size={13} className={isSyncingMetadata ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{isSyncingMetadata ? 'Sincronizando...' : 'Sincronizar Metadados'}</span>
            <span className="sm:hidden">{isSyncingMetadata ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>

      {/* Media Type Filter & View Mode Bar */}
      {(() => {
        const albumImages = album?.images || [];
        const videosCount = albumImages.filter(img => img.mediaType === 'video' || !!img.videoUrl || !!(img as any).videoStreamUrl || !!(img as any).is_video || /\.(mp4|webm|m4v)(\?|$)/i.test(img.originalUrl || '')).length;
        const gifsCount = albumImages.filter(img => img.mediaType === 'gif' || img.isAnimated || img.format === 'gif' || img.format === 'webp' || /\.(gif|webp)(\?|$)/i.test(img.originalUrl || '')).length;
        const photosCount = Math.max(0, albumImages.length - videosCount - gifsCount);

        return (
          <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl glass-panel border border-border">
            {/* Media Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setMediaFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                  mediaFilter === 'all'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-surface-elevated text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos ({albumImages.length})
              </button>
              <button
                type="button"
                onClick={() => setMediaFilter('photos')}
                className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mediaFilter === 'photos'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-surface-elevated text-slate-400 hover:text-slate-200'
                }`}
              >
                <ImageIcon size={13} />
                <span>{(t.photosCount || 'Fotos ({count})').replace('{count}', String(photosCount))}</span>
              </button>
              {gifsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setMediaFilter('gifs')}
                  className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    mediaFilter === 'gifs'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-surface-elevated text-amber-300/80 hover:text-amber-200'
                  }`}
                >
                  <Clapperboard size={13} />
                  <span>{(t.gifsCount || 'GIFs Animados ({count})').replace('{count}', String(gifsCount))}</span>
                </button>
              )}
              {videosCount > 0 && (
                <button
                  type="button"
                  onClick={() => setMediaFilter('videos')}
                  className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    mediaFilter === 'videos'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-surface-elevated text-violet-300/80 hover:text-violet-200'
                  }`}
                >
                  <Film size={13} />
                  <span>{(t.videosCount || 'Vídeos ({count})').replace('{count}', String(videosCount))}</span>
                </button>
              )}
            </div>

            {/* Chromatic Palette Filter - Estilo 3 Popover Dinâmico (Escopo Interno) */}
            <div className="flex items-center gap-2 overflow-x-visible shrink-0">
              <ColorFilterPopover
                activeColor={albumColorFilter}
                onSelectColor={setAlbumColorFilter}
                items={albumImages || []}
                language={settings.language}
                totalMatchedCount={albumColorFilter ? (albumImages || []).filter(img => {
                  const pal = (img.colorPalette && img.colorPalette.length > 0)
                    ? img.colorPalette
                    : (colorPaletteCache.get(img.previewUrl || img.originalUrl || img.thumbnailUrl) || []);
                  return matchesPaletteFuzzy(pal, albumColorFilter);
                }).length : undefined}
                singularLabel={settings.language === 'pt-BR' ? 'foto' : 'photo'}
                pluralLabel={settings.language === 'pt-BR' ? 'fotos encontradas' : 'photos found'}
              />
            </div>

            {/* 4 Card Viewing Modes Selector */}
            <div className="flex items-center gap-1 bg-surface-elevated p-1 rounded-xl border border-border text-xs">
              <button
                type="button"
                onClick={() => setCardViewMode('adaptive')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  cardViewMode === 'adaptive'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t.viewAdaptiveTitle || "Adaptativo Inteligente: GIFs e vídeos em 16:9 sem cortes horizontais; fotos em 4:5"}
              >
                <span>{t.viewAdaptive || 'Adaptativo'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCardViewMode('contain')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  cardViewMode === 'contain'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t.viewPanoramicTitle || "Panorâmico Sem Cortes: Todos os cards em 16:9 com enquadramento completo (contain)"}
              >
                <span>{t.viewPanoramic || 'Panorâmico'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCardViewMode('masonry')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  cardViewMode === 'masonry'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Masonry: Proporção Real de cada arquivo sem cortar nada"
              >
                <span>{t.viewMasonry || 'Masonry'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCardViewMode('standard')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  cardViewMode === 'standard'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Vertical 4:5: Formato vertical clássico"
              >
                <span>4:5</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Grid Controls & Selection Toolbar */}
      <div className="glass-panel p-3 sm:p-4 rounded-2xl border border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Selection Tools */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
          <button
            onClick={() => selectAllImages((album.images || []).map(i => i.id))}
            className="px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-hover text-slate-300 font-medium text-xs"
          >
            {t.selectAll}
          </button>
          <button
            onClick={clearSelectedImages}
            className="px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-hover text-slate-300 font-medium text-xs"
          >
            {t.deselectAll}
          </button>
          <button
            onClick={handleAutoCurate}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1 text-xs"
          >
            <Sparkles size={12} />
            <span>{t.autoCurate}</span>
          </button>

          {selectedImageIds.length > 0 && (
            <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
              <span className="text-[11px] font-mono text-brand-400 font-bold">
                {selectedImageIds.length} selecionadas
              </span>
              {selectedVideos.length > 0 && (
                <button
                  onClick={handleInitiateBatchSaveVideos}
                  disabled={isBatchSavingVideos}
                  className="px-2 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs flex items-center gap-1 shadow-sm transition-colors disabled:opacity-50"
                  title="Salvar vídeos selecionados na Galeria de Vídeos do App"
                >
                  {isBatchSavingVideos ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Save size={11} />
                  )}
                  <span>Salvar {selectedVideos.length} Vídeo{selectedVideos.length > 1 ? 's' : ''}</span>
                </button>
              )}
              <button
                onClick={handleDownloadSelected}
                className="px-2 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs flex items-center gap-1 shadow-sm transition-colors"
                title="Baixar arquivos selecionados (.jpg ou .mp4)"
              >
                <Download size={11} />
                <span>Baixar</span>
              </button>
              <button
                onClick={handleDeleteSelected}
                className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-medium text-xs flex items-center gap-1 transition-colors"
                title="Remover itens selecionados do álbum"
              >
                <Trash2 size={11} />
                <span>Excluir</span>
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Zoom Column Slider */}
        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
          <span className="text-slate-400 font-semibold">{t.zoomColumns}</span>
          <input
            type="range"
            min="1"
            max="6"
            value={albumDetailZoomCols}
            onChange={e => setAlbumDetailZoomCols(Number(e.target.value))}
            className="w-28 sm:w-32"
          />
          <span className="font-mono text-slate-200 font-bold w-4 text-center">
            {albumDetailZoomCols}
          </span>
        </div>
      </div>

      {/* Image Grid */}
      <div
        className={`grid gap-3 sm:gap-4 ${
          albumDetailZoomCols === 1
            ? 'grid-cols-1'
            : albumDetailZoomCols === 2
            ? 'grid-cols-1 sm:grid-cols-2'
            : albumDetailZoomCols === 3
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            : albumDetailZoomCols === 4
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
            : albumDetailZoomCols === 5
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
            : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6'
        }`}
      >
        {(() => {
          const albumImages = album.images || [];
          const filteredImages = albumImages.filter(img => {
            const isVideo = img.mediaType === 'video' || !!img.videoUrl || !!(img as any).videoStreamUrl || !!(img as any).is_video || /\.(mp4|webm|m4v)(\?|$)/i.test(img.originalUrl || '');
            const isGif = img.mediaType === 'gif' || img.isAnimated || img.format === 'gif' || img.format === 'webp' || /\.(gif|webp)(\?|$)/i.test(img.originalUrl || '');
            if (mediaFilter === 'photos') if (isVideo || isGif) return false;
            if (mediaFilter === 'gifs') if (!isGif) return false;
            if (mediaFilter === 'videos') if (!isVideo) return false;
            if (albumColorFilter) {
              const pal = (img.colorPalette && img.colorPalette.length > 0)
                ? img.colorPalette
                : (colorPaletteCache.get(img.previewUrl || img.originalUrl || img.thumbnailUrl) || []);
              if (!matchesPaletteFuzzy(pal, albumColorFilter)) {
                return false;
              }
            }
            return true;
          });

          // Deduplicate: some extractors save both thumbnail + original as separate entries
          const seenUrls = new Set<string>();
          const deduplicatedImages = filteredImages.filter(img => {
            const key = img.rawOriginalUrl || img.originalUrl || img.thumbnailUrl || img.id;
            if (!key || seenUrls.has(key)) return false;
            seenUrls.add(key);
            return true;
          });

          if (deduplicatedImages.length === 0) {
            return (
              <div className="col-span-full p-12 text-center glass-panel rounded-3xl border border-border">
                <p className="text-slate-400 text-sm font-medium">Nenhum item encontrado para o filtro selecionado.</p>
              </div>
            );
          }

          return deduplicatedImages.map((img, idx) => {
            const isSelected = selectedImageIds.includes(img.id);
            const isVideo = img.mediaType === 'video' || !!img.videoUrl || !!(img as any).videoStreamUrl || !!(img as any).is_video || /\.(mp4|webm|m4v)(\?|$)/i.test(img.originalUrl || '');
            const rawVideoLink = img.videoUrl || (img as any).videoStreamUrl || (isVideo ? img.originalUrl : undefined);
            const videoLink = getProxiedStreamUrl(rawVideoLink, (img as any).sourcePage || album.sourceUrl);
            const isGif = img.mediaType === 'gif' || img.isAnimated || img.format === 'gif' || img.format === 'webp' || /\.(gif|webp)(\?|$)/i.test(img.originalUrl || '');
            const isInlinePlaying = isVideo && playingVideoIds.includes(img.id);

            let containerAspectClass = 'aspect-[4/5]';
            let imageFitClass = 'object-cover';

            if (cardViewMode === 'adaptive') {
              if (isVideo || isGif) {
                containerAspectClass = 'aspect-video';
                imageFitClass = 'object-contain bg-slate-950';
              } else {
                containerAspectClass = 'aspect-[4/5]';
                imageFitClass = 'object-cover';
              }
            } else if (cardViewMode === 'contain') {
              containerAspectClass = 'aspect-video';
              imageFitClass = 'object-contain bg-slate-950';
            } else if (cardViewMode === 'masonry') {
              containerAspectClass = 'min-h-[160px] max-h-[420px]';
              imageFitClass = 'object-contain bg-slate-950/80 w-full h-auto max-h-[420px]';
            } else if (cardViewMode === 'standard') {
              containerAspectClass = 'aspect-[4/5]';
              imageFitClass = 'object-cover';
            }

            const handleCardClick = () => {
              if (isVideo && videoLink) {
                toggleInlinePlay(img.id);
              } else {
                openLightbox(img, album);
              }
            };

            return (
              <div
                key={img.id}
                onClick={handleCardClick}
                className={`group relative glass-panel rounded-2xl border overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-card-elevated flex flex-col justify-between ${
                  isSelected
                    ? 'border-brand-500 ring-2 ring-brand-500/50 shadow-glow-brand'
                    : isVideo
                    ? 'border-violet-500/30 hover:border-violet-500/60'
                    : isGif
                    ? 'border-amber-500/30 hover:border-amber-500/60'
                    : 'border-border hover:border-brand-500/40'
                }`}
              >
                {/* Image/Video Preview Surface */}
                <div className={`relative ${containerAspectClass} overflow-hidden bg-slate-950 flex items-center justify-center`}>
                {isVideo && videoLink ? (
                  isInlinePlaying ? (
                    <div
                      className="w-full h-full relative bg-black flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <InlineStreamPlayer
                        key={`${img.id}-${img.videoUrl || img.originalUrl || ''}`}
                        url={videoLink}
                        poster={img.posterUrl || img.thumbnailUrl}
                        referer={(img as any).sourcePage || album.sourceUrl}
                        onRefresh={() => handleRefreshSingleVideo(img)}
                        isRefreshing={refreshingStreamId === img.id}
                      />

                      {(img.candidateId || img.id) && (
                        <button
                          type="button"
                          onClick={() => handleRefreshSingleVideo(img)}
                          disabled={refreshingStreamId === img.id}
                          className="absolute top-2 right-11 z-30 p-1.5 rounded-full bg-violet-600/90 text-white hover:bg-violet-500 border border-violet-400/40 transition-all shadow-lg disabled:opacity-50"
                          title="Renovar Link deste Vídeo (Caso mostre mensagem de expirado)"
                        >
                          <RefreshCw size={14} className={refreshingStreamId === img.id ? 'animate-spin' : ''} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeInlinePlay(img.id);
                          let rawVidSrc = img.rawOriginalUrl || img.originalUrl || videoLink || '';
                          let unwrapCount = 0;
                          while (rawVidSrc.includes('/api/proxy-video-stream') && rawVidSrc.includes('url=') && unwrapCount < 5) {
                            unwrapCount++;
                            const m = rawVidSrc.match(/[?&]url=([^&]+)/);
                            if (m) rawVidSrc = decodeURIComponent(m[1]);
                            else break;
                          }
                          let defaultRef = '';
                          try {
                            defaultRef = new URL(album.sourceUrl || rawVidSrc).origin;
                          } catch {
                            defaultRef = '';
                          }
                          const vRef = (img as any).sourcePage || album.sourceUrl || defaultRef;
                          setActivePlayingVideo({
                            id: img.id,
                            title: img.title || 'Vídeo',
                            filename: `${img.title || 'video'}.mp4`,
                            folder: album.title || 'Álbum',
                            fileSizeBytes: img.fileSizeBytes || (img as any).file_size || 0,
                            format: 'MP4',
                            isFavorite: false,
                            createdAt: new Date().toISOString(),
                            relPath: '',
                            streamUrl: videoLink,
                            downloadUrl: `/api/proxy-video-stream?url=${encodeURIComponent(rawVidSrc)}&referer=${encodeURIComponent(vRef)}&download=true&filename=${encodeURIComponent(img.title || 'video')}`,
                            thumbnailUrl: img.posterUrl || img.thumbnailUrl || '',
                            sourceUrl: vRef,
                            width: img.width,
                            height: img.height,
                            durationSeconds: img.durationSeconds || (img as any).duration_seconds
                          });
                        }}
                        className="absolute top-2 right-20 z-30 p-1.5 rounded-full bg-black/80 text-white hover:bg-violet-600 border border-white/30 transition-all shadow-lg"
                        title="Expandir Vídeo (Modo Cinema)"
                      >
                        <Maximize2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => closeInlinePlay(img.id)}
                        className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-black/80 text-white hover:bg-white hover:text-black border border-white/30 transition-all shadow-lg"
                        title="Fechar Reprodutor"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    // Show poster or thumbnail for video with play overlay
                    <div className="w-full h-full relative">
                      <img
                        src={img.posterUrl || img.thumbnailUrl}
                        alt={img.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      {/* Play overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-violet-600/90 text-white shadow-glow-brand flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Play size={22} className="translate-x-0.5" />
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <img
                    src={isGif ? (img.originalUrl || img.thumbnailUrl) : img.thumbnailUrl}
                    alt={img.title}
                    loading="lazy"
                    decoding="async"
                    className={`w-full h-full ${imageFitClass} group-hover:scale-105 transition-transform duration-500`}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (img.originalUrl && target.src !== img.originalUrl) {
                        target.src = img.originalUrl;
                      } else if (img.rawOriginalUrl && target.src !== img.rawOriginalUrl) {
                        target.src = img.rawOriginalUrl;
                      } else if (img.thumbnailUrl && target.src !== img.thumbnailUrl) {
                        target.src = img.thumbnailUrl;
                      }
                    }}
                  />
                )}
                {!isInlinePlaying && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                )}

                {/* Selection Checkbox */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelectImage(img.id);
                  }}
                  className="absolute top-2.5 left-2.5 z-10"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-brand-500 cursor-pointer"
                  />
                </div>

                {/* Saved Redirect Badge for Videos */}
                {isVideo && !isInlinePlaying && (() => {
                  const sInfo = checkItemSavedStatus({
                    url: img.rawOriginalUrl || img.videoUrl || img.originalUrl,
                    title: img.title,
                    mediaType: 'video'
                  });
                  if (!sInfo.isSaved) return null;
                  return (
                    <div className="absolute top-2.5 left-9 z-10">
                      <SavedRedirectBadge savedInfo={sInfo} />
                    </div>
                  );
                })()}

                {/* Media Type / Resolution Badge */}
                {!isInlinePlaying && (
                  isVideo ? (() => {
                    const vInfo = getVideoResolutionInfo(img);
                    const is4k = vInfo.label.includes('4K');
                    return (
                      <span className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full backdrop-blur-md border text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-md group-hover:opacity-0 transition-opacity ${vInfo.badgeClass}`}>
                        <Film size={11} className={is4k ? 'text-amber-400' : 'text-violet-300'} />
                        {vInfo.label}
                      </span>
                    );
                  })() : isGif ? (
                    <span className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-amber-950/90 backdrop-blur-md border border-amber-500/50 text-[10px] font-mono font-bold text-amber-300 flex items-center gap-1.5 group-hover:opacity-0 transition-opacity shadow-md">
                      <Clapperboard size={11} className="text-amber-400" />
                      <span>GIF{img.width && img.height ? ` • ${img.width}×${img.height}` : ''}{img.fileSizeBytes ? ` • ${formatFileSize(img.fileSizeBytes)}` : ''}</span>
                    </span>
                  ) : (() => {
                    const dynamicDims = loadedDimensions[img.id];
                    const w = img.width || dynamicDims?.w || 0;
                    const h = img.height || dynamicDims?.h || 0;
                    const resLabel = w >= 3840 ? 'UHD' : w >= 1920 ? 'FHD' : (w > 0 ? 'HD' : 'ORIGINAL HD');
                    return (
                      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[9px] font-mono font-bold text-emerald-400 group-hover:opacity-0 transition-opacity">
                        {w > 0 && h > 0 ? `${w}×${h} • ${resLabel}` : 'ORIGINAL HD'}
                      </span>
                    );
                  })()
                )}

                {/* Hover Quick Actions */}
                {!isInlinePlaying && (
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Renovar Stream individual */}
                    {isVideo && (img.candidateId || img.id) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRefreshSingleVideo(img);
                        }}
                        disabled={refreshingStreamId === img.id}
                        className="p-1.5 rounded-lg bg-cyan-900/90 hover:bg-cyan-800 text-cyan-200 hover:text-white border border-cyan-500/40 transition-colors shadow-sm disabled:opacity-50"
                        title="Renovar link de stream (expirado)"
                      >
                        <RefreshCw size={13} className={refreshingStreamId === img.id ? 'animate-spin' : ''} />
                      </button>
                    )}
                    {isVideo && img.videoUrl && (() => {
                      const isSavingThisVideo = savingVideoId === img.id || jobs.some(j =>
                        j.status === 'active' &&
                        (j.mode === 'video_save' || (j.mode as string) === 'video_downloader') &&
                        (j.url === (img.rawOriginalUrl || img.videoUrl) || (img.title && j.title.toLowerCase().includes(img.title.toLowerCase())))
                      );
                      const savedStatus = checkItemSavedStatus({
                        url: img.rawOriginalUrl || img.videoUrl || img.originalUrl,
                        title: img.title,
                        mediaType: 'video'
                      });

                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSavingThisVideo) return;
                            handleInitiateSaveSingleVideo(img);
                          }}
                          disabled={isSavingThisVideo}
                          className={`p-1.5 rounded-lg border transition-colors shadow-sm disabled:opacity-80 ${
                            isSavingThisVideo
                              ? 'bg-violet-900/90 text-violet-200 border-violet-500/60'
                              : savedStatus.isSaved
                              ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border-emerald-500/40'
                              : 'bg-violet-900/90 hover:bg-violet-800 text-violet-200 hover:text-white border border-violet-500/40'
                          }`}
                          title={
                            isSavingThisVideo
                              ? 'Salvando em segundo plano... Acompanhe o progresso na Gestão de Tarefas'
                              : savedStatus.isSaved
                              ? `Vídeo salvo na pasta "${savedStatus.folder}" (clique para escolher pasta ou salvar cópia)`
                              : 'Salvar na Galeria de Vídeos'
                          }
                        >
                          {isSavingThisVideo ? (
                            <Loader2 size={13} className="animate-spin text-violet-300" />
                          ) : savedStatus.isSaved ? (
                            <Check size={13} className="text-emerald-400" />
                          ) : (
                            <Save size={13} />
                          )}
                        </button>
                      );
                    })()}
                    {/* Definir como Capa do Álbum */}
                    {(() => {
                      const imgTargetUrl = img.rawOriginalUrl || img.originalUrl || img.rawThumbnailUrl || img.thumbnailUrl;
                      const isCurrentCover = !!(
                        (album.rawCoverImage && (img.rawOriginalUrl === album.rawCoverImage || img.originalUrl === album.rawCoverImage || img.rawThumbnailUrl === album.rawCoverImage || img.thumbnailUrl === album.rawCoverImage)) ||
                        (album.coverImage && (img.originalUrl === album.coverImage || img.thumbnailUrl === album.coverImage || img.rawOriginalUrl === album.coverImage))
                      );

                      return (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (imgTargetUrl) {
                              setCoverUpdatingId(img.id);
                              await setAlbumCover(album.id, imgTargetUrl);
                              setTimeout(() => setCoverUpdatingId(null), 1000);
                            }
                          }}
                          disabled={coverUpdatingId === img.id}
                          className={`p-1.5 rounded-lg border transition-all shadow-sm ${
                            isCurrentCover
                              ? 'bg-amber-500/90 hover:bg-amber-500 border-amber-400 text-white shadow-glow-brand'
                              : 'bg-black/80 hover:bg-amber-600/80 text-slate-300 hover:text-white border-white/20'
                          }`}
                          title={isCurrentCover ? 'Esta foto é a capa atual da galeria' : 'Definir como miniatura/capa do álbum na galeria'}
                        >
                          {coverUpdatingId === img.id ? (
                            <Loader2 size={13} className="animate-spin text-amber-300" />
                          ) : (
                            <BookmarkCheck size={13} className={isCurrentCover ? 'text-white' : 'text-amber-300'} />
                          )}
                        </button>
                      );
                    })()}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenRename(img);
                      }}
                      className="p-1.5 rounded-lg bg-black/80 hover:bg-brand-600 text-slate-200 hover:text-white border border-white/20 transition-colors shadow-sm"
                      title={isVideo ? 'Renomear Vídeo' : isGif ? 'Renomear GIF' : 'Renomear Foto'}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const ext = isVideo ? 'mp4' : isGif ? 'gif' : 'jpg';
                        const fname = `${img.title || 'media'}.${ext}`;
                        let vRaw = img.rawOriginalUrl || img.originalUrl || '';
                        let unwrapCount = 0;
                        while (vRaw.includes('/api/proxy-video-stream') && vRaw.includes('url=') && unwrapCount < 5) {
                          unwrapCount++;
                          const m = vRaw.match(/[?&]url=([^&]+)/);
                          if (m) vRaw = decodeURIComponent(m[1]);
                          else break;
                        }
                        let defaultRef = '';
                        try {
                          defaultRef = new URL(album.sourceUrl || vRaw).origin;
                        } catch {
                          defaultRef = '';
                        }
                        const vRef = album.sourceUrl || (img as any).sourcePage || defaultRef;
                        const dlUrl = isVideo
                          ? `/api/proxy-video-stream?url=${encodeURIComponent(vRaw)}&referer=${encodeURIComponent(vRef)}&download=true&filename=${encodeURIComponent(img.title || 'video')}`
                          : `/api/download-image?url=${encodeURIComponent(img.rawOriginalUrl || img.originalUrl || img.previewUrl)}&referer=${encodeURIComponent(album.sourceUrl || '')}&filename=${encodeURIComponent(fname)}`;
                        const link = document.createElement('a');
                        link.href = dlUrl;
                        link.setAttribute('download', fname);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="p-1.5 rounded-lg bg-black/80 hover:bg-black text-slate-200 hover:text-white border border-white/20 transition-colors shadow-sm"
                      title={isVideo ? 'Baixar Vídeo MP4' : isGif ? 'Baixar GIF' : 'Baixar Foto Original'}
                    >
                      <Download size={13} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Deseja remover este item do álbum?')) {
                          removeImagesFromAlbum(album.id, [img.id]);
                        }
                      }}
                      className="p-1.5 rounded-lg bg-black/80 hover:bg-rose-900/90 text-rose-300 hover:text-rose-100 border border-white/20 transition-colors shadow-sm"
                      title="Remover do Álbum"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}

                {/* Capa Atual Badge */}
                {(() => {
                  const isCurrentCover = !!(
                    (album.rawCoverImage && (img.rawOriginalUrl === album.rawCoverImage || img.originalUrl === album.rawCoverImage || img.rawThumbnailUrl === album.rawCoverImage || img.thumbnailUrl === album.rawCoverImage)) ||
                    (album.coverImage && (img.originalUrl === album.coverImage || img.thumbnailUrl === album.coverImage || img.rawOriginalUrl === album.coverImage))
                  );
                  if (!isCurrentCover || isInlinePlaying) return null;
                  return (
                    <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-full bg-amber-500/90 backdrop-blur-md border border-amber-400/50 text-[9px] font-bold text-white flex items-center gap-1 shadow-md z-10">
                      <Check size={10} className="stroke-[3]" /> Capa do Álbum
                    </span>
                  );
                })()}

                {/* Aesthetic Star Score (only for images) */}
                {!isVideo && (
                  <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-amber-400 flex items-center gap-1 font-bold">
                    <Star size={10} className="fill-amber-400" />
                    {img.aestheticScore}
                  </div>
                )}
                {/* Duration badge for videos */}
                {isVideo && img.durationSeconds && !isInlinePlaying && (
                  <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-slate-300 font-bold">
                    {Math.floor(img.durationSeconds / 60)}:{String(Math.round(img.durationSeconds % 60)).padStart(2, '0')}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="p-2.5 sm:p-3 text-xs">
                <div className="flex items-center justify-between gap-1 group/title">
                  <h4
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenRename(img);
                    }}
                    className="font-semibold text-slate-100 truncate group-hover/title:text-brand-300 transition-colors cursor-pointer flex-1"
                    title="Clique para renomear este item"
                  >
                    {img.title && img.title.startsWith('#') ? img.title : `#${idx + 1} ${img.title || (isVideo ? 'Vídeo' : 'Foto')}`}
                  </h4>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenRename(img);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-brand-300 hover:bg-white/10 rounded transition-all shrink-0"
                    title="Renomear item"
                  >
                    <Edit2 size={11} />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1.5 pt-1.5 border-t border-white/5">
                  {img.fileSizeBytes > 0 ? (
                    <span className="px-2 py-0.5 rounded-md bg-cyan-950/70 border border-cyan-500/30 text-cyan-300 font-mono text-[9px] font-bold flex items-center gap-1 shadow-sm">
                      <HardDrive size={10} className="text-cyan-400 shrink-0" />
                      {formatFileSize(img.fileSizeBytes)}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/50 text-slate-400 font-mono text-[9px] font-medium flex items-center gap-1 shadow-sm" title="Tamanho do arquivo pendente de sincronização">
                      <Clock size={10} className="text-slate-500 shrink-0" />
                      Pendente
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded-md bg-surface-elevated/90 border border-border text-slate-300 font-mono text-[9px] flex items-center gap-1">
                    {isVideo ? getVideoResolutionInfo(img).dimensions : (img.height ? `${img.width}×${img.height}` : img.aspectRatio)}
                  </span>
                </div>
              </div>
            </div>
          );
        });
      })()}
      </div>

      {/* Modal de Confirmação de Exclusão do Álbum */}
      {isConfirmingDeleteAlbum && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={() => setIsConfirmingDeleteAlbum(false)}
        >
          <div
            className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h4 className="font-bold text-base text-white">Excluir este Álbum?</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Tem certeza que deseja apagar o álbum <span className="font-semibold text-slate-200">"{album.title}"</span>? Ele será movido para a lixeira do app.
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmingDeleteAlbum(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-surface-elevated text-slate-300 text-xs font-semibold border border-border transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteAlbum(album.id);
                  setIsConfirmingDeleteAlbum(false);
                  navigateToView('gallery');
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-colors"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Renomear Item Individual (Vídeo ou Foto) */}
      {imageToRename && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={() => !isSavingImageTitle && setImageToRename(null)}
        >
          <div
            className="bg-slate-900 border border-border rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-4 shadow-2xl animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
                  {imageToRename.isVideo ? <Video size={18} /> : <Edit2 size={18} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {imageToRename.isVideo ? 'Renomear Vídeo' : 'Renomear Item'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Altere o título para organização e salvamento na galeria
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImageToRename(null)}
                disabled={isSavingImageTitle}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                handleSaveImageTitle();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nome / Título
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newImageTitle}
                  onChange={e => setNewImageTitle(e.target.value)}
                  placeholder={imageToRename.isVideo ? "Nome do vídeo..." : "Título da foto..."}
                  className="w-full bg-surface border border-border rounded-2xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSavingImageTitle}
                  onClick={() => setImageToRename(null)}
                  className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-surface-elevated text-slate-300 text-xs font-semibold border border-border transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newImageTitle.trim() || isSavingImageTitle}
                  className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-bold shadow-glow-brand transition-all flex items-center justify-center gap-1.5"
                >
                  {isSavingImageTitle ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Folder Select Modal for Saving Video(s) */}
      <FolderSelectModal
        isOpen={folderModalState.isOpen}
        onClose={() => setFolderModalState({ isOpen: false, mode: 'single' })}
        title={folderModalState.mode === 'batch' ? `Salvar ${selectedVideos.length} Vídeos na Pasta` : 'Escolha a Pasta para Salvar o Vídeo'}
        subtitle="Selecione uma pasta existente da Galeria de Vídeos ou crie uma nova pasta."
        existingFolders={videoFolders.map(f => f.name)}
        defaultFolder={settings.defaultVideoFolder || 'Extraídos'}
        type="video"
        onConfirm={(selectedFolder: string) => {
          if (folderModalState.mode === 'batch') {
            executeBatchSaveVideos(selectedFolder);
          } else if (folderModalState.targetVideo) {
            executeSaveSingleVideo(folderModalState.targetVideo, selectedFolder);
          }
        }}
      />
    </div>
  );
};
