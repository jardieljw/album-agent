import React, { useState, useEffect } from 'react';
import {
  FolderHeart,
  Folder,
  FolderPlus,
  MoreVertical,
  Edit2,
  Search,
  Download,
  Trash2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  Grid,
  List,
  LayoutList as LayoutListIcon,
  CheckSquare,
  Check,
  Square,
  X,
  Image as ImageIcon,
  Video as VideoIcon,
  HardDrive,
  Globe,
  Copy,
  Clapperboard
} from 'lucide-react';
import { useAppStore, getCanonicalMediaFingerprint } from '../../store/useAppStore';
import { GalleryViewMode, Album } from '../../types';
import { translations } from '../../i18n/translations';
import { matchesPaletteFuzzy } from '../../services/colorExtractor';
import { formatFileSize } from '../../utils/formatters';

export const GalleryView: React.FC = () => {
  const {
    albums,
    albumFolders,
    syncAlbums,
    syncAlbumFolders,
    activeAlbumFolder,
    setActiveAlbumFolder,
    activeAlbumFolderModal,
    setActiveAlbumFolderModal,
    createAlbumFolder,
    renameAlbumFolder,
    deleteAlbumFolder,
    moveAlbumsToFolder,
    galleryViewMode,
    setGalleryViewMode,
    gallerySearchQuery,
    setGallerySearchQuery,
    galleryColorFilter,
    setGalleryColorFilter,
    galleryTagFilter,
    setGalleryTagFilter,
    gallerySortBy,
    setGallerySortBy,
    gallerySortOrder,
    toggleGallerySortOrder,
    selectedAlbumIds,
    toggleSelectAlbum,
    selectAllAlbums,
    clearSelectedAlbums,
    navigateToView,
    deleteAlbum,
    openExportModal,
    openLightbox,
    settings,
    highlightedItemId
  } = useAppStore();

  const t = translations[settings.language].gallery;
  const { uploadPhotoAlbum } = useAppStore();

  // Sync albums and folders on mount
  useEffect(() => {
    syncAlbums();
    syncAlbumFolders();
  }, [syncAlbums, syncAlbumFolders]);

  // Scroll to highlighted item if coming from redirect badge
  useEffect(() => {
    if (highlightedItemId) {
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-album-id="${highlightedItemId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [highlightedItemId]);

  const [coverflowIndex, setCoverflowIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [localDomainFilter, setLocalDomainFilter] = useState<string>('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'photo' | 'video' | 'gif'>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'local' | 'remote'>('all');

  // Detect duplicate albums
  const duplicateAlbumMap = React.useMemo(() => {
    const counts = new Map<string, number>();
    albums.forEach(a => {
      const key = getCanonicalMediaFingerprint(a.title, a.sourceUrl);
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    return counts;
  }, [albums]);

  // Manual Photo Album Upload States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadFolder, setUploadFolder] = useState<string>('Geral');
  const [uploadCustomFolder, setUploadCustomFolder] = useState<string>('');
  const [isUploadingAlbum, setIsUploadingAlbum] = useState(false);
  const [albumToDelete, setAlbumToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isConfirmingBatchDelete, setIsConfirmingBatchDelete] = useState(false);

  // Album Folders UI States
  const [activeFolderMenuName, setActiveFolderMenuName] = useState<string | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [targetMoveFolder, setTargetMoveFolder] = useState('Geral');

  // Filter Albums
  let filtered = albums.filter(album => {
    const matchesSearch =
      album.title.toLowerCase().includes(gallerySearchQuery.toLowerCase()) ||
      album.sourceDomain.toLowerCase().includes(gallerySearchQuery.toLowerCase()) ||
      album.tags.some(t => t.toLowerCase().includes(gallerySearchQuery.toLowerCase()));

    const matchesTag = galleryTagFilter ? album.tags.includes(galleryTagFilter) : true;
    const matchesDomain = localDomainFilter ? album.sourceDomain === localDomainFilter : true;

    const isVideo = album.mediaType === 'video' ||
      album.tags.some(t => t.toLowerCase().includes('vídeo') || t.toLowerCase().includes('video')) ||
      (album.images || []).some(img => img.mediaType === 'video');

    const isGif = album.hasGifs ||
      album.mediaType === 'gif' ||
      album.tags.some(t => t.toLowerCase().includes('gif') || t.toLowerCase().includes('animad')) ||
      (album.images || []).some(img => img.mediaType === 'gif' || img.isAnimated || /\.(gif|webp)(\?|$)/i.test(img.originalUrl || ''));

    const matchesMediaType =
      mediaTypeFilter === 'all'
        ? true
        : mediaTypeFilter === 'video'
        ? isVideo
        : mediaTypeFilter === 'gif'
        ? isGif
        : (!isVideo && !isGif);

    const isLocal = album.sourceOrigin === 'local' ||
      album.sourceDomain === 'Upload Local' ||
      album.sourceUrl.startsWith('local://') ||
      album.id.startsWith('manual-') ||
      album.id.startsWith('local-');

    const matchesOrigin =
      originFilter === 'all'
        ? true
        : originFilter === 'local'
        ? isLocal
        : !isLocal;

    const matchesColor = galleryColorFilter
      ? (album.images || []).some(img => matchesPaletteFuzzy(img.colorPalette || [], galleryColorFilter))
      : true;

    const matchesFolder = activeAlbumFolder
      ? (album.folder || 'Geral') === activeAlbumFolder
      : true;

    return matchesSearch && matchesTag && matchesColor && matchesDomain && matchesMediaType && matchesOrigin && matchesFolder;
  });

  // Sort Albums
  filtered.sort((a, b) => {
    let cmp = 0;
    if (gallerySortBy === 'name') {
      cmp = a.title.localeCompare(b.title);
    } else if (gallerySortBy === 'count') {
      cmp = a.imageCount - b.imageCount;
    } else if (gallerySortBy === 'size') {
      cmp = a.totalSizeBytes - b.totalSizeBytes;
    } else {
      // Download order sort: compares exact millisecond timestamp (hour:minute:second on the same day)
      const parseTime = (dateStr?: string) => {
        if (!dateStr) return 0;
        const parsed = new Date(dateStr).getTime();
        if (!isNaN(parsed) && parsed > 0) return parsed;
        const clean = dateStr.replace(' UTC', 'Z').replace(' ', 'T');
        const fallback = new Date(clean).getTime();
        return !isNaN(fallback) ? fallback : 0;
      };

      // STRICTLY use createdAt for sorting, fallback to updatedAt only if missing
      const timeA = parseTime(a.createdAt) || parseTime(a.updatedAt);
      const timeB = parseTime(b.createdAt) || parseTime(b.updatedAt);
      cmp = timeA - timeB;
      
      // Se houver empate, usar o ID como desempate numérico secundário (se tiver timestamp no ID)
      if (cmp === 0) {
        cmp = (a.id || '').localeCompare(b.id || '');
      }
    }

    return gallerySortOrder === 'asc' ? cmp : -cmp;
  });

  const allTags = Array.from(new Set(albums.flatMap(a => a.tags))).filter(Boolean).sort();
  const allDomains = Array.from(new Set(albums.map(a => a.sourceDomain))).filter(Boolean).sort();
  const paletteColors = ['#facc15', '#dc2626', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6'];

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 45 && coverflowIndex < filtered.length - 1) {
      setCoverflowIndex(c => c + 1);
    } else if (diff < -45 && coverflowIndex > 0) {
      setCoverflowIndex(c => c - 1);
    }
    setTouchStartX(null);
  };

  // Keyboard navigation for 3D Coverflow (ArrowLeft / ArrowRight)
  useEffect(() => {
    if (galleryViewMode !== 'coverflow-3d') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setCoverflowIndex(c => Math.min(filtered.length - 1, c + 1));
      } else if (e.key === 'ArrowLeft') {
        setCoverflowIndex(c => Math.max(0, c - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [galleryViewMode, filtered.length]);

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full">

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <FolderHeart size={22} className="text-accent-purple shrink-0" />
            <span>{t.title}</span>
          </h1>
          <p className="text-xs text-slate-400">
            {filtered.length === albums.length
              ? `${albums.length} ${t.totalAlbums} • ${albums.reduce((acc, a) => acc + a.imageCount, 0)} ${t.totalImages} originais em disco`
              : `Exibindo ${filtered.length} de ${albums.length} ${t.totalAlbums} (${filtered.reduce((acc, a) => acc + a.imageCount, 0)} itens)`
            }
          </p>
        </div>

        {/* Action Buttons: Batch, Select Mode or Upload New Album */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Botão de Modo Seleção */}
          <button
            type="button"
            onClick={() => {
              if (isSelectionMode) {
                setIsSelectionMode(false);
                clearSelectedAlbums();
              } else {
                setIsSelectionMode(true);
              }
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              isSelectionMode || selectedAlbumIds.length > 0
                ? 'bg-violet-600 text-white border-violet-500 shadow-glow-brand'
                : 'bg-surface-elevated hover:bg-surface-hover border-border text-slate-200'
            }`}
          >
            <CheckSquare size={15} className={isSelectionMode || selectedAlbumIds.length > 0 ? 'text-white' : 'text-violet-400'} />
            <span>{isSelectionMode || selectedAlbumIds.length > 0 ? 'Concluir' : 'Selecionar'}</span>
          </button>

          {/* Botão Selecionar Todos / Desmarcar quando em modo seleção */}
          {(isSelectionMode || selectedAlbumIds.length > 0) && (
            <button
              type="button"
              onClick={() => {
                if (selectedAlbumIds.length === filtered.length) {
                  clearSelectedAlbums();
                } else {
                  selectAllAlbums(filtered.map(a => a.id));
                }
              }}
              className="px-3 py-2 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span>{selectedAlbumIds.length === filtered.length ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
            </button>
          )}

          {selectedAlbumIds.length > 0 && (
            <div className="flex items-center gap-2 animate-scale-up">
              <button
                onClick={() => openExportModal(albums.find(a => a.id === selectedAlbumIds[0]) || albums[0])}
                className="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-glow-brand transition-all"
              >
                <Download size={13} />
                <span>{t.batchZip} ({selectedAlbumIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetMoveFolder('Geral');
                  setActiveAlbumFolderModal({ type: 'move', albumIds: selectedAlbumIds });
                }}
                className="px-3.5 py-2 rounded-xl bg-violet-600/20 border border-violet-500/40 hover:bg-violet-600/30 text-violet-300 text-xs font-bold flex items-center gap-1.5 transition-all"
                title="Mover álbuns selecionados para uma pasta"
              >
                <Folder size={13} />
                <span>Mover ({selectedAlbumIds.length})</span>
              </button>
              <button
                onClick={() => setIsConfirmingBatchDelete(true)}
                className="px-3.5 py-2 rounded-xl bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Trash2 size={13} />
                <span>{t.batchDelete} ({selectedAlbumIds.length})</span>
              </button>
            </div>
          )}

          {/* Botão Novo Álbum */}
          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-glow-brand transition-all"
          >
            <FolderPlus size={15} />
            <span>Novo Álbum / Upload de Fotos</span>
          </button>
        </div>
      </div>

      {/* Album Folders Navigation Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-surface-elevated">
        {/* All Albums Folder */}
        <button
          type="button"
          onClick={() => setActiveAlbumFolder(null)}
          className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 border ${
            !activeAlbumFolder
              ? 'bg-brand-600 text-white border-brand-500 shadow-glow-brand'
              : 'bg-surface/60 hover:bg-surface-hover text-slate-300 border-border'
          }`}
        >
          <Folder size={14} />
          <span>Todas as Pastas</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-black/30">
            {albums.length}
          </span>
        </button>

        {/* Dynamic Folders */}
        {albumFolders.map(folder => {
          const isActive = activeAlbumFolder === folder.name;
          const isCustom = folder.name !== 'Geral';

          return (
            <div key={folder.id} className="relative flex items-center group">
              <button
                type="button"
                onClick={() => setActiveAlbumFolder(folder.name)}
                className={`px-3.5 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 border ${
                  isActive
                    ? 'bg-purple-600 text-white border-purple-500 shadow-glow-accent'
                    : 'bg-surface/60 hover:bg-surface-hover text-slate-300 border-border'
                }`}
              >
                <Folder size={14} className={isActive ? 'text-white' : 'text-purple-400'} />
                <span>{folder.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-black/30">
                  {folder.count}
                </span>
              </button>

              {/* Folder Actions Menu Trigger for Custom Folders */}
              {isCustom && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveFolderMenuName(activeFolderMenuName === folder.name ? null : folder.name);
                    }}
                    className={`ml-1 p-1.5 rounded-xl border transition-colors ${
                      activeFolderMenuName === folder.name
                        ? 'bg-brand-600 text-white border-brand-500'
                        : 'opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-white border-transparent'
                    }`}
                    title="Ações da Pasta"
                  >
                    <MoreVertical size={13} />
                  </button>

                  {/* Dropdown Menu */}
                  {activeFolderMenuName === folder.name && (
                    <div
                      className="absolute left-0 mt-2 w-44 rounded-2xl bg-slate-900 border border-border shadow-2xl p-1.5 z-50 animate-scale-up"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFolderNameInput(folder.name);
                          setActiveAlbumFolderModal({ type: 'rename', folderName: folder.name });
                          setActiveFolderMenuName(null);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-xl flex items-center gap-2"
                      >
                        <Edit2 size={13} className="text-brand-400" />
                        <span>Renomear Pasta</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(`Tem certeza que deseja excluir a pasta "${folder.name}"? Os álbuns dentro dela serão mantidos e movidos para "Geral".`)) {
                            await deleteAlbumFolder(folder.name);
                          }
                          setActiveFolderMenuName(null);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl flex items-center gap-2"
                      >
                        <Trash2 size={13} />
                        <span>Excluir Pasta</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* New Folder Button */}
        <button
          type="button"
          onClick={() => {
            setFolderNameInput('');
            setActiveAlbumFolderModal({ type: 'create' });
          }}
          className="px-3.5 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 bg-surface/40 hover:bg-surface-elevated text-purple-300 border border-purple-500/30 hover:border-purple-500"
          title="Criar nova pasta para organizar álbuns"
        >
          <FolderPlus size={14} />
          <span>+ Nova Pasta</span>
        </button>
      </div>

      {/* Search & Explorer Toolbar */}
      <div className="glass-panel p-3 sm:p-4 rounded-2xl border border-border space-y-3">
        <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center justify-between">
          {/* Search Box */}
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={gallerySearchQuery}
              onChange={e => setGallerySearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-surface-elevated border border-border text-slate-100 placeholder-slate-500 text-xs outline-none focus:border-brand-500"
            />
          </div>

          {/* Explicit Dropdowns for Filters */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap min-w-0">
            <select
              value={localDomainFilter}
              onChange={e => setLocalDomainFilter(e.target.value)}
              className="h-10 px-3 rounded-xl bg-surface-elevated border border-border text-slate-200 text-xs outline-none focus:border-brand-500 max-w-[140px] sm:max-w-none truncate"
            >
              <option value="">Todos os Websites</option>
              {allDomains.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            
            <select
              value={galleryTagFilter || ''}
              onChange={e => setGalleryTagFilter(e.target.value || null)}
              className="h-10 px-3 rounded-xl bg-surface-elevated border border-border text-slate-200 text-xs outline-none focus:border-brand-500 max-w-[140px] sm:max-w-none truncate"
            >
              <option value="">Atores/Atrizes (Tags)</option>
              {allTags.map(tag => (
                <option key={tag} value={tag}>#{tag}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Filters: Media Type & Storage Origin */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter: Tipo de Mídia (Fotos vs Vídeos) */}
            <div className="flex items-center p-1 rounded-xl bg-surface-elevated border border-border text-xs">
              <button
                type="button"
                onClick={() => setMediaTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  mediaTypeFilter === 'all'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos ({albums.length})
              </button>
              <button
                type="button"
                onClick={() => setMediaTypeFilter('photo')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  mediaTypeFilter === 'photo'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ImageIcon size={13} />
                <span>Álbuns de Fotos ({albums.filter(a => a.mediaType !== 'video' && !a.tags?.some(t => t.toLowerCase().includes('video'))).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setMediaTypeFilter('video')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  mediaTypeFilter === 'video'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <VideoIcon size={13} />
                <span>Álbuns de Vídeos ({albums.filter(a => a.mediaType === 'video' || a.tags?.some(t => t.toLowerCase().includes('video'))).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setMediaTypeFilter('gif')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  mediaTypeFilter === 'gif'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clapperboard size={13} />
                <span>Com GIFs ({albums.filter(a => a.hasGifs || a.mediaType === 'gif' || a.tags?.some(t => t.toLowerCase().includes('gif')) || (a.images || []).some(img => img.mediaType === 'gif' || img.isAnimated || /\.(gif|webp)(\?|$)/i.test(img.originalUrl || ''))).length})</span>
              </button>
            </div>

            {/* Filter: Origem (PC Local vs Nuvem / Render) */}
            <div className="flex items-center p-1 rounded-xl bg-surface-elevated border border-border text-xs">
              <button
                type="button"
                onClick={() => setOriginFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  originFilter === 'all'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todas Origens
              </button>
              <button
                type="button"
                onClick={() => setOriginFilter('local')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  originFilter === 'local'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Álbuns extraídos pelo servidor local da sua máquina (Localhost)"
              >
                <HardDrive size={13} />
                <span>Servidor Local ({albums.filter(a => a.sourceOrigin === 'local' || a.sourceDomain === 'Upload Local' || a.sourceUrl?.startsWith('local://') || a.id.startsWith('manual-') || a.id.startsWith('local-')).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setOriginFilter('remote')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  originFilter === 'remote'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Extrações feitas na nuvem"
              >
                <Globe size={13} />
                <span>Nuvem ({albums.filter(a => !(a.sourceOrigin === 'local' || a.sourceDomain === 'Upload Local' || a.sourceUrl?.startsWith('local://') || a.id.startsWith('manual-') || a.id.startsWith('local-'))).length})</span>
              </button>
            </div>
          </div>

          {(mediaTypeFilter !== 'all' || originFilter !== 'all' || localDomainFilter || galleryTagFilter) && (
            <button
              type="button"
              onClick={() => {
                setMediaTypeFilter('all');
                setOriginFilter('all');
                setLocalDomainFilter('');
                setGalleryTagFilter(null);
                setGallerySearchQuery('');
              }}
              className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1"
            >
              <X size={12} />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center justify-between min-w-0">
            <div className="flex items-center justify-between sm:justify-start gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elevated border border-border text-xs text-slate-300 min-w-0 shrink-0">
              <span className="text-slate-500 shrink-0">{t.sortBy}</span>
              <select
                value={gallerySortBy}
                onChange={e => setGallerySortBy(e.target.value as any)}
                className="bg-transparent font-semibold text-slate-200 outline-none cursor-pointer text-xs truncate max-w-[165px] sm:max-w-none"
              >
                <option value="date" className="bg-surface">{t.sortDate}</option>
                <option value="name" className="bg-surface">{t.sortName}</option>
                <option value="count" className="bg-surface">{t.sortCount}</option>
                <option value="size" className="bg-surface">{t.sortSize}</option>
              </select>
              <button onClick={toggleGallerySortOrder} className="p-0.5 hover:text-brand-400 shrink-0" title="Inverter Ordem">
                <ArrowUpDown size={13} />
              </button>
            </div>

            {/* View Mode Switcher with ALL 6 Modes */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-elevated border border-border overflow-x-auto no-scrollbar touch-scroll min-w-0 max-w-full">
              <button
                onClick={() => setGalleryViewMode('grid-xl')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  galleryViewMode === 'grid-xl' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Ícones Extra Grandes"
              >
                <Grid size={13} /> XL
              </button>
              <button
                onClick={() => setGalleryViewMode('grid-lg')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  galleryViewMode === 'grid-lg' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Ícones Grandes"
              >
                <Grid size={13} /> L
              </button>
              <button
                onClick={() => setGalleryViewMode('grid-md')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  galleryViewMode === 'grid-md' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Ícones Médios"
              >
                <Grid size={13} /> M
              </button>
              <button
                onClick={() => setGalleryViewMode('details')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  galleryViewMode === 'details' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Tabela Detalhes (Windows Explorer)"
              >
                <List size={13} /> Detalhes
              </button>
              <button
                onClick={() => setGalleryViewMode('list')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  galleryViewMode === 'list' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Lista com Carrossel"
              >
                <LayoutListIcon size={13} /> Lista
              </button>
              <button
                onClick={() => setGalleryViewMode('coverflow-3d')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  galleryViewMode === 'coverflow-3d' ? 'bg-accent-purple text-white shadow-glow-accent' : 'text-accent-purple hover:text-accent-purple/80'
                }`}
                title="3D Spatial Coverflow"
              >
                <Layers size={13} /> 3D Coverflow
              </button>
            </div>
          </div>

        {/* Color Wheel & Tag Cloud Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-border text-xs">
          {/* Semantic Color Palette Search */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-slate-500 text-[11px] font-semibold shrink-0">{t.colorSearchTitle}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {paletteColors.map(color => (
                <button
                  key={color}
                  onClick={() => setGalleryColorFilter(galleryColorFilter === color ? null : color)}
                  className={`w-5 h-5 rounded-full border transition-transform shrink-0 ${
                    galleryColorFilter === color ? 'scale-125 border-white shadow-md ring-2 ring-brand-400' : 'border-white/20 hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                  title={`Filtrar por ${color}`}
                ></button>
              ))}
              {galleryColorFilter && (
                <button
                  onClick={() => setGalleryColorFilter(null)}
                  className="text-[10px] text-slate-400 hover:text-slate-200 ml-1 underline shrink-0"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* AI Tag Filter Chips with Horizontal Mouse Scroll */}
          <div
            onWheel={(e) => {
              e.currentTarget.scrollLeft += e.deltaY;
            }}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-scroll max-w-full sm:max-w-md py-0.5"
          >
            <span className="text-slate-500 text-[11px] font-semibold shrink-0">{t.tagCloudTitle}</span>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setGalleryTagFilter(galleryTagFilter === tag ? null : tag)}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-all shrink-0 ${
                  galleryTagFilter === tag
                    ? 'bg-brand-500 text-white shadow-glow-brand'
                    : 'bg-surface-elevated text-slate-400 hover:text-slate-200'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Visual Presentation Area by ViewMode */}
      {galleryViewMode === 'coverflow-3d' ? (
        /* 3D Spatial Coverflow Mode with Touch Swipe & Mouse Wheel */
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onWheel={(e) => {
            if (e.deltaY > 0) setCoverflowIndex(c => Math.min(filtered.length - 1, c + 1));
            else if (e.deltaY < 0) setCoverflowIndex(c => Math.max(0, c - 1));
          }}
          className="py-8 sm:py-12 px-2 sm:px-4 flex flex-col items-center justify-center relative perspective-1000 overflow-hidden select-none"
        >
          <div className="flex items-center justify-center gap-3 sm:gap-6 preserve-3d">
            {filtered.map((album, idx) => {
              const offset = idx - coverflowIndex;
              const isCenter = offset === 0;
              return (
                <div
                  key={album.id}
                  onClick={() => {
                    if (isCenter) navigateToView('album-detail', album.id);
                    else setCoverflowIndex(idx);
                  }}
                  className={`transition-all duration-500 cursor-pointer rounded-3xl overflow-hidden border-2 shadow-2xl ${
                    isCenter
                      ? 'w-64 sm:w-80 h-80 sm:h-96 scale-105 sm:scale-110 border-brand-400 z-30 shadow-glow-brand ring-4 ring-brand-500/30'
                      : 'w-48 sm:w-64 h-64 sm:h-80 opacity-40 border-border z-10 hidden sm:block'
                  }`}
                  style={{
                    transform: `rotateY(${offset * -25}deg) translateZ(${isCenter ? 30 : -100}px) scale(${isCenter ? 1 : 0.85})`,
                  }}
                >
                {album.coverImage ? (
                  <img 
                    src={album.coverImage} 
                    alt={album.title} 
                    className="w-full h-full object-cover pointer-events-none"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (album.rawCoverImage && e.currentTarget.src !== album.rawCoverImage) {
                        e.currentTarget.src = album.rawCoverImage;
                      } else {
                        e.currentTarget.style.display = 'none';
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 p-4 text-center">
                    <ImageIcon size={48} className="text-slate-600 mb-2" />
                    <span className="text-xs font-medium text-slate-400">{album.sourceDomain}</span>
                  </div>
                )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-4 sm:p-5 flex flex-col justify-end">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-500 text-white font-bold w-max mb-1">
                      {album.resolvedOriginalCount} Fotos Originais
                    </span>
                    <h3 className="font-bold text-sm text-white truncate">{album.title}</h3>
                    <p className="text-[11px] text-slate-300 truncate">{album.sourceDomain}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3D Navigation Controls */}
          <div className="flex items-center gap-4 mt-6">
            <button
              onClick={() => setCoverflowIndex(i => Math.max(0, i - 1))}
              className="p-2.5 sm:p-3 rounded-full bg-surface-elevated hover:bg-surface-hover text-slate-200 border border-border"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="font-mono text-xs text-slate-400 font-bold">
              {coverflowIndex + 1} de {filtered.length}
            </span>
            <button
              onClick={() => setCoverflowIndex(i => Math.min(filtered.length - 1, i + 1))}
              className="p-2.5 sm:p-3 rounded-full bg-surface-elevated hover:bg-surface-hover text-slate-200 border border-border"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      ) : galleryViewMode === 'details' ? (
        /* Windows Explorer Detailed Table Mode with Touch Scroll Container */
        <div className="glass-panel rounded-2xl border border-border overflow-x-auto touch-scroll shadow-sm">
          <table className="w-full text-left text-xs min-w-[700px] border-collapse">
            <thead className="bg-surface-elevated border-b border-border text-slate-400 font-semibold font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedAlbumIds.length === filtered.length && filtered.length > 0}
                    onChange={e => {
                      if (e.target.checked) selectAllAlbums(filtered.map(a => a.id));
                      else clearSelectedAlbums();
                    }}
                    className="rounded text-brand-500 cursor-pointer w-4 h-4"
                  />
                </th>
                <th className="p-3 w-[250px]">Título do Álbum</th>
                <th className="p-3">Qtd Fotos</th>
                <th className="p-3">% Resolução</th>
                <th className="p-3">Tamanho</th>
                <th className="p-3">Domínio</th>
                <th className="p-3">Data</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(album => (
                <tr
                  key={album.id}
                  onClick={() => navigateToView('album-detail', album.id)}
                  className="hover:bg-brand-500/10 transition-colors cursor-pointer group"
                >
                  <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedAlbumIds.includes(album.id)}
                      onChange={() => toggleSelectAlbum(album.id)}
                      className="rounded text-brand-500 cursor-pointer w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity"
                    />
                  </td>
                  <td className="p-3 font-semibold text-slate-100">
                    <div className="flex items-center gap-3">
                      <img
                        src={album.coverImage}
                        alt={album.title}
                        className="w-10 h-10 rounded-lg object-cover border border-border shrink-0 shadow-sm"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          if (album.rawCoverImage && e.currentTarget.src !== album.rawCoverImage) {
                            e.currentTarget.src = album.rawCoverImage;
                          }
                        }}
                      />
                      <span className="truncate max-w-[200px] text-sm group-hover:text-brand-300 transition-colors">{album.title}</span>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-slate-300">{album.imageCount}</td>
                  <td className="p-3 font-mono text-emerald-400 font-bold bg-emerald-500/5 px-2 rounded">
                    100% Original
                  </td>
                  <td className="p-3 font-mono text-slate-400">
                    {album.totalSizeBytes > 0 ? formatFileSize(album.totalSizeBytes) : 'Tam. N/D'}
                  </td>
                  <td className="p-3 text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-accent-purple/50"></span>
                      <span className="truncate max-w-[120px]">{album.sourceDomain}</span>
                    </div>
                  </td>
                  <td className="p-3 text-slate-500 font-mono text-[11px]">
                    {new Date(album.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openExportModal(album)}
                        className="p-2 rounded-xl bg-surface-elevated border border-border hover:bg-brand-600 hover:border-brand-500 hover:text-white text-slate-400 transition-all shadow-sm"
                        title="Download ZIP"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => setAlbumToDelete({ id: album.id, title: album.title })}
                        className="p-2 rounded-xl bg-surface-elevated border border-border hover:bg-rose-600 hover:border-rose-500 hover:text-white text-slate-400 transition-all shadow-sm"
                        title="Excluir Álbum"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : galleryViewMode === 'list' ? (
        /* List with Interactive Thumbnail Carousel Mode (Restored in Full!) */
        <div className="space-y-4">
          {filtered.map(album => (
            <div
              key={album.id}
              onClick={() => navigateToView('album-detail', album.id)}
              className="glass-panel p-4 rounded-2xl border border-border hover:border-brand-500/50 transition-all cursor-pointer flex flex-col md:flex-row gap-4 items-start md:items-center justify-between"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <img
                  src={album.coverImage}
                  alt={album.title}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-border shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    if (album.rawCoverImage && e.currentTarget.src !== album.rawCoverImage) {
                      e.currentTarget.src = album.rawCoverImage;
                    }
                  }}
                />
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-100 truncate hover:text-brand-300 transition-colors">
                    {album.title}
                  </h3>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {album.sourceDomain} • {album.imageCount} fotos originais • {album.totalSizeBytes > 0 ? formatFileSize(album.totalSizeBytes) : 'Tam. N/D'}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex gap-1">
                      {album.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[9px] font-mono px-2 py-0.5 rounded bg-surface-elevated text-slate-400 border border-border">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAlbumToDelete({ id: album.id, title: album.title });
                      }}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Excluir Álbum"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Horizontal Interactive Carousel of Thumbnails */}
              <div
                onWheel={(e) => {
                  e.currentTarget.scrollLeft += e.deltaY;
                }}
                className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-scroll max-w-full md:max-w-md py-1"
                onClick={e => e.stopPropagation()}
              >
                {(album.images || []).slice(0, 15).map((img, i) => (
                  <img
                    key={img.id}
                    src={img.thumbnailUrl}
                    alt={img.title}
                    loading="lazy"
                    decoding="async"
                    onClick={() => openLightbox(img, album)}
                    className="w-12 h-12 rounded-xl object-cover border border-border hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer shadow-sm"
                    title={`Abrir foto #${i + 1}`}
                  />
                ))}
                {(album.images || []).length > 15 && (
                  <span className="text-[10px] font-mono text-slate-400 px-2 shrink-0">
                    +{album.images.length - 15} mais
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Standard Grid Views (XL, LG, MD) Responsive */
        <div
          className={`grid gap-3 sm:gap-5 ${
            galleryViewMode === 'grid-xl'
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              : galleryViewMode === 'grid-md'
              ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {filtered.map(album => {
            const isSelected = selectedAlbumIds.includes(album.id);
            const albumKey = getCanonicalMediaFingerprint(album.title, album.sourceUrl);
            const isDuplicateAlbum = Boolean(albumKey && (duplicateAlbumMap.get(albumKey) || 0) > 1);

            return (
            <div
              key={album.id}
              data-album-id={album.id}
              onClick={() => {
                if (isSelectionMode || selectedAlbumIds.length > 0) {
                  toggleSelectAlbum(album.id);
                } else {
                  navigateToView('album-detail', album.id);
                }
              }}
              className={`group glass-panel rounded-2xl border overflow-hidden transition-all duration-300 cursor-pointer flex flex-col justify-between ${
                highlightedItemId === album.id
                  ? 'ring-4 ring-brand-500 shadow-glow-brand animate-pulse'
                  : ''
              } ${
                isSelected
                  ? 'border-violet-500 ring-2 ring-violet-500/50 bg-violet-950/20 shadow-glow-brand'
                  : 'border-border hover:border-brand-500/50 hover:shadow-card-elevated'
              }`}
            >
              {/* Cover Image & Hover Badges */}
              <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                {album.coverImage ? (
                  <img
                    src={album.coverImage}
                    alt={album.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (album.rawCoverImage && e.currentTarget.src !== album.rawCoverImage) {
                        e.currentTarget.src = album.rawCoverImage;
                      } else {
                        e.currentTarget.style.display = 'none';
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 p-4 text-center">
                    <ImageIcon size={32} className="text-slate-600 mb-2" />
                    <span className="text-[11px] font-medium text-slate-400 line-clamp-1">{album.sourceDomain}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none"></div>

                {/* Checkbox de Seleção */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelectAlbum(album.id);
                  }}
                  className={`absolute top-2.5 left-2.5 z-20 p-1.5 rounded-xl border backdrop-blur-md transition-all ${
                    isSelected
                      ? 'bg-violet-600 text-white border-violet-400 shadow-glow-brand opacity-100 scale-100'
                      : isSelectionMode || selectedAlbumIds.length > 0
                      ? 'bg-black/60 text-slate-400 hover:text-white border-white/20 opacity-100'
                      : 'bg-black/50 text-slate-400 hover:text-white border-white/10 opacity-0 group-hover:opacity-100'
                  }`}
                  title={isSelected ? 'Desmarcar álbum' : 'Selecionar álbum'}
                >
                  {isSelected ? <Check size={14} strokeWidth={3} /> : <Square size={13} />}
                </button>

                <span className={`absolute top-2.5 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 font-mono text-[9px] sm:text-[10px] font-bold text-emerald-400 transition-all ${
                  isSelected || isSelectionMode || selectedAlbumIds.length > 0 ? 'left-11' : 'left-2.5 group-hover:left-11'
                }`}>
                  {album.mediaType === 'video' ? 'Vídeo' : `${album.resolvedOriginalCount} / ${album.imageCount} Originais`}
                </span>

                {/* Badge de Origem Local, Vídeo ou Duplicado no canto superior direito */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-10 flex-wrap justify-end">
                  {isDuplicateAlbum && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/90 text-slate-950 font-bold text-[9px] shadow-sm" title="Álbum duplicado detectado na biblioteca">
                      <Copy size={10} />
                      <span>Duplicado</span>
                    </span>
                  )}
                  {album.sourceOrigin === 'local' && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/90 text-slate-950 font-bold text-[9px] shadow-sm" title="Álbum do Servidor PC Local">
                      <HardDrive size={10} />
                      <span>PC</span>
                    </span>
                  )}
                  {album.mediaType === 'video' && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-600 text-white font-bold text-[9px] shadow-sm">
                      <VideoIcon size={10} />
                    </span>
                  )}
                  {(album.hasGifs || (album.gifCount && album.gifCount > 0) || album.mediaType === 'gif' || (album.images || []).some(img => img.mediaType === 'gif' || img.isAnimated)) && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-600 text-white font-bold text-[9px] shadow-sm backdrop-blur-md" title={`Álbum contém ${album.gifCount || ''} animações GIF`}>
                      <Clapperboard size={10} />
                      <span>{album.gifCount ? `${album.gifCount} GIFs` : 'GIF'}</span>
                    </span>
                  )}
                </div>

                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white text-xs">
                  <span className="text-[10px] sm:text-[11px] font-mono text-slate-300 font-semibold">
                    {album.totalSizeBytes > 0 ? formatFileSize(album.totalSizeBytes) : 'Tam. N/D'}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/30 text-brand-300 font-mono font-bold border border-brand-500/40">
                    {album.aiModel}
                  </span>
                </div>
              </div>

              {/* Title, Domain & Action Footer */}
              <div className="p-3 sm:p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-xs sm:text-sm text-slate-100 truncate group-hover:text-brand-400 transition-colors">
                      {album.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5">
                      <span className="truncate">{album.sourceDomain}</span>
                      <span className="text-slate-600">•</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveAlbumFolder(album.folder || 'Geral');
                        }}
                        className="text-purple-400 hover:text-purple-200 font-medium flex items-center gap-0.5 shrink-0 hover:underline cursor-pointer"
                        title={`Filtrar biblioteca pela pasta "${album.folder || 'Geral'}"`}
                      >
                        <Folder size={10} />
                        <span>{album.folder || 'Geral'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetMoveFolder(album.folder || 'Geral');
                        setActiveAlbumFolderModal({ type: 'move', albumId: album.id, albumIds: [album.id] });
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                      title="Mover Álbum para outra Pasta"
                    >
                      <Folder size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAlbumToDelete({ id: album.id, title: album.title });
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Excluir Álbum"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {album.tags.slice(0, 3).map(tag => (
                    <span
                      key={tag}
                      className="text-[8px] sm:text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated text-slate-400 border border-border"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Empty State when no albums match filters or folder */}
      {filtered.length === 0 && (
        <div className="col-span-full py-16 px-4 text-center glass-panel rounded-3xl border border-border my-6 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-surface-elevated text-slate-400 border border-border flex items-center justify-center mx-auto">
            <Folder size={22} />
          </div>
          <h4 className="text-sm font-bold text-slate-200">Nenhum álbum encontrado</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {activeAlbumFolder
              ? `Não há álbuns cadastrados na pasta "${activeAlbumFolder}".`
              : 'Nenhum álbum corresponde aos filtros selecionados.'}
          </p>
          {activeAlbumFolder && (
            <button
              onClick={() => setActiveAlbumFolder(null)}
              className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-all inline-flex items-center gap-1.5 shadow-sm"
            >
              <span>Ver Todos os Álbuns</span>
            </button>
          )}
        </div>
      )}

      {/* Modal de Criação / Upload de Álbum de Fotos */}
      {isUploadModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={() => {
            if (!isUploadingAlbum) setIsUploadModalOpen(false);
          }}
        >
          <div
            className="bg-slate-900 border border-brand-500/40 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-brand-500/20 text-brand-400 border border-brand-500/30">
                <FolderHeart size={20} />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Criar Novo Álbum de Fotos</h4>
                <p className="text-xs text-slate-400">Faça upload de fotos do seu dispositivo para a galeria</p>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!uploadTitle.trim() || uploadFiles.length === 0 || isUploadingAlbum) return;
                setIsUploadingAlbum(true);
                const targetFolder = uploadFolder === '__custom__' ? (uploadCustomFolder.trim() || 'Geral') : (uploadFolder || 'Geral');
                try {
                  const success = await uploadPhotoAlbum(uploadTitle.trim(), uploadFiles, targetFolder);
                  if (success) {
                    setUploadTitle('');
                    setUploadFiles([]);
                    setUploadCustomFolder('');
                    setIsUploadModalOpen(false);
                  }
                } finally {
                  setIsUploadingAlbum(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Título do Álbum:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Férias de Verão, Sessão de Fotos..."
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full bg-surface border border-border rounded-2xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center justify-between">
                  <span>Pasta de Destino:</span>
                  <span className="text-[10px] text-slate-400 font-normal">Organize seus álbuns</span>
                </label>
                <select
                  value={uploadFolder}
                  onChange={(e) => setUploadFolder(e.target.value)}
                  className="w-full bg-surface border border-border rounded-2xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                >
                  {albumFolders.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.name} ({f.count})
                    </option>
                  ))}
                  <option value="__custom__">+ Nova Pasta Personalizada...</option>
                </select>
                {uploadFolder === '__custom__' && (
                  <input
                    type="text"
                    placeholder="Nome da nova pasta..."
                    value={uploadCustomFolder}
                    onChange={(e) => setUploadCustomFolder(e.target.value)}
                    className="mt-2 w-full bg-surface border border-brand-500/60 rounded-2xl px-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                    autoFocus
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Selecionar Fotos (JPEG, PNG, WebP):
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  required
                  onChange={(e) => {
                    if (e.target.files) {
                      setUploadFiles(Array.from(e.target.files));
                    }
                  }}
                  className="w-full bg-surface border border-border rounded-2xl px-3 py-2 text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-600 file:text-white hover:file:bg-brand-500 cursor-pointer"
                />
                {uploadFiles.length > 0 && (
                  <p className="text-[11px] text-emerald-400 font-mono mt-1.5 flex items-center gap-1">
                    <Check size={12} strokeWidth={3} />
                    <span>{uploadFiles.length} foto(s) selecionada(s)</span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isUploadingAlbum}
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-surface hover:bg-surface-elevated text-slate-300 text-xs font-semibold border border-border transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploadingAlbum || !uploadTitle.trim() || uploadFiles.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-glow-brand flex items-center gap-1.5"
                >
                  {isUploadingAlbum ? 'Enviando Fotos...' : 'Criar Álbum Agora'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Álbum */}
      {albumToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={() => setAlbumToDelete(null)}
        >
          <div
            className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h4 className="font-bold text-base text-white">Excluir Álbum?</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Tem certeza que deseja apagar o álbum <span className="font-semibold text-slate-200">"{albumToDelete.title}"</span>? O álbum será movido para a lixeira.
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAlbumToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-surface-elevated text-slate-300 text-xs font-semibold border border-border transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteAlbum(albumToDelete.id);
                  setAlbumToDelete(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-colors"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão em Lote */}
      {isConfirmingBatchDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={() => setIsConfirmingBatchDelete(false)}
        >
          <div
            className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h4 className="font-bold text-base text-white">Excluir {selectedAlbumIds.length} Álbuns?</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Tem certeza que deseja apagar os <span className="font-semibold text-rose-300">{selectedAlbumIds.length}</span> álbuns selecionados? Todos serão movidos para a lixeira.
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmingBatchDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-surface-elevated text-slate-300 text-xs font-semibold border border-border transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  for (const id of selectedAlbumIds) {
                    await deleteAlbum(id);
                  }
                  clearSelectedAlbums();
                  setIsConfirmingBatchDelete(false);
                  setIsSelectionMode(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-colors"
              >
                Sim, Excluir Todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação de Pasta */}
      {activeAlbumFolderModal?.type === 'create' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={() => setActiveAlbumFolderModal(null)}
        >
          <div
            className="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                <FolderPlus size={20} />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Nova Pasta de Álbuns</h4>
                <p className="text-xs text-slate-400">Organize seus álbuns por modelo ou categoria</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nome da Pasta:</label>
              <input
                type="text"
                autoFocus
                value={folderNameInput}
                onChange={e => setFolderNameInput(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && folderNameInput.trim()) {
                    await createAlbumFolder(folderNameInput.trim());
                    setActiveAlbumFolderModal(null);
                  }
                }}
                placeholder="Ex: Alexis Texas, Favoritas..."
                className="w-full h-10 px-3.5 rounded-xl bg-surface-elevated border border-border text-slate-100 text-xs outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActiveAlbumFolderModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-surface-elevated text-slate-300 text-xs font-semibold border border-border transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!folderNameInput.trim()}
                onClick={async () => {
                  if (folderNameInput.trim()) {
                    await createAlbumFolder(folderNameInput.trim());
                    setActiveAlbumFolderModal(null);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-colors"
              >
                Criar Pasta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Renomear Pasta */}
      {activeAlbumFolderModal?.type === 'rename' && activeAlbumFolderModal.folderName && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={() => setActiveAlbumFolderModal(null)}
        >
          <div
            className="bg-slate-900 border border-brand-500/40 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center">
                <Edit2 size={20} />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Renomear Pasta</h4>
                <p className="text-xs text-slate-400">Atualize o nome da pasta selecionada</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Novo Nome:</label>
              <input
                type="text"
                autoFocus
                value={folderNameInput}
                onChange={e => setFolderNameInput(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && folderNameInput.trim()) {
                    await renameAlbumFolder(activeAlbumFolderModal.folderName!, folderNameInput.trim());
                    setActiveAlbumFolderModal(null);
                  }
                }}
                placeholder={activeAlbumFolderModal.folderName}
                className="w-full h-10 px-3.5 rounded-xl bg-surface-elevated border border-border text-slate-100 text-xs outline-none focus:border-brand-500"
              />
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActiveAlbumFolderModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-surface-elevated text-slate-300 text-xs font-semibold border border-border transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!folderNameInput.trim() || folderNameInput.trim() === activeAlbumFolderModal.folderName}
                onClick={async () => {
                  if (folderNameInput.trim() && folderNameInput.trim() !== activeAlbumFolderModal.folderName) {
                    await renameAlbumFolder(activeAlbumFolderModal.folderName!, folderNameInput.trim());
                    setActiveAlbumFolderModal(null);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-brand-600/30 transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Mover Álbum(ns) */}
      {activeAlbumFolderModal?.type === 'move' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={() => setActiveAlbumFolderModal(null)}
        >
          <div
            className="bg-slate-900 border border-violet-500/40 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-500/20 text-violet-400 border border-violet-500/30 flex items-center justify-center">
                <Folder size={20} />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Mover para Pasta</h4>
                <p className="text-xs text-slate-400">
                  Movendo {activeAlbumFolderModal.albumIds?.length || 1} álbum(ns) selecionado(s)
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Selecione ou digite o nome da pasta:</label>
              <input
                type="text"
                autoFocus
                value={targetMoveFolder}
                onChange={e => setTargetMoveFolder(e.target.value)}
                list="gallery-move-folder-options"
                placeholder="Geral"
                className="w-full h-10 px-3.5 rounded-xl bg-surface-elevated border border-border text-slate-100 text-xs outline-none focus:border-violet-500"
              />
              <datalist id="gallery-move-folder-options">
                <option value="Geral" />
                {albumFolders.map(f => (
                  <option key={f.name} value={f.name} />
                ))}
              </datalist>
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActiveAlbumFolderModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-surface-elevated text-slate-300 text-xs font-semibold border border-border transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ids = activeAlbumFolderModal.albumIds || (activeAlbumFolderModal.albumId ? [activeAlbumFolderModal.albumId] : []);
                  if (ids.length > 0) {
                    await moveAlbumsToFolder(ids, targetMoveFolder.trim() || 'Geral');
                    clearSelectedAlbums();
                    setActiveAlbumFolderModal(null);
                    setIsSelectionMode(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-lg shadow-violet-600/30 transition-colors"
              >
                Confirmar e Mover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
