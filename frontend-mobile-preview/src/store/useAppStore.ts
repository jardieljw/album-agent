import { create } from 'zustand';
import {
  Album,
  AlbumFolder,
  AppSettings,
  ChatMessage,
  DomainPattern,
  ExtractionJob,
  GalleryViewMode,
  ImageItem,
  LogEntry,
  NotificationItem,
  SessionTab,
  SetOfMarkCandidate,
  ViewId,
  AiEngineType,
  VideoItem,
  VideoFolder,
  TrashItem,
  TrashStats,
  WebScraperState
} from '../types';
import {
  INITIAL_ALBUMS,
  INITIAL_JOBS,
  INITIAL_LOGS,
  INITIAL_PATTERNS,
  INITIAL_SET_OF_MARKS
} from '../services/mockData';
import { soundEffects } from '../services/soundEffects';
import { ambientAudio } from '../services/ambientAudio';
import { backendApi } from '../services/realApi';
import { scrollRestorationManager, getViewScrollKey } from '../services/scrollRestoration';

const DEFAULT_SETTINGS: AppSettings = {
  aiModel: 'qwen2.5:32b',
  geminiModel: 'gemini-3.6-flash',
  reasoningBudget: 3,
  temperature: 0.2,
  maxConcurrency: 6,
  requestTimeoutSeconds: 30,
  antiBotDelayMs: 500,
  userAgentRotation: true,
  minWidth: 1920,
  minHeight: 1080,
  discardDuplicates: true,
  theme: 'dark-slate',
  accent: 'blue',
  language: 'pt-BR',
  soundEnabled: true,
  ambientSoundVolume: 0.3,
  ambientSoundType: 'none',
  defaultFilenamePattern: '{album}_{index}_{res}.jpg',
  autoSaveToGallery: true,
  zipCompressionLevel: 6,
  removeExifOnExport: false,
  askFolderOnSave: true,
  defaultVideoFolder: 'Extraídos',
  defaultAlbumFolder: 'Geral',
  redirectTagBehavior: 'navigate',
};

interface AppState {
  // Navigation & Sessions
  currentView: ViewId;
  openTabs: SessionTab[];
  activeTabId: string;
  activeAlbumId: string | null;

  // Data
  albums: Album[];
  jobs: ExtractionJob[];
  logs: LogEntry[];
  domainPatterns: DomainPattern[];
  setOfMarks: SetOfMarkCandidate[];
  inspectingMarkId: number | null;
  notifications: NotificationItem[];
  settings: AppSettings;
  activeAiEngine: AiEngineType;

  // Active Background Job (Spotify Dock)
  activeJob: ExtractionJob | null;
  activeJobs: ExtractionJob[];
  isDockMinimized: boolean;
  setDockMinimized: (minimized: boolean) => void;
  setActiveJobById: (id: string) => void;
  isMobileBottomBarMinimized: boolean;
  setIsMobileBottomBarMinimized: (minimized: boolean) => void;

  // Gallery Filters & View Controls
  galleryViewMode: GalleryViewMode;
  gallerySearchQuery: string;
  galleryColorFilter: string | null;
  galleryTagFilter: string | null;
  gallerySortBy: 'date' | 'name' | 'count' | 'resolution' | 'size';
  gallerySortOrder: 'asc' | 'desc';
  selectedAlbumIds: string[];

  // Album Detail Controls
  albumDetailZoomCols: number;
  selectedImageIds: string[];

  // Modals & Drawers
  lightboxImage: ImageItem | null;
  lightboxAlbum: Album | null;
  slideshowOpen: boolean;
  contactSheetOpen: boolean;
  coPilotOpen: boolean;
  exportModalOpen: boolean;
  exportModalAlbum: Album | null;
  keybindingsModalOpen: boolean;
  webhookModalOpen: boolean;
  commandPaletteOpen: boolean;
  notificationDrawerOpen: boolean;
  albumDiffModalOpen: boolean;
  colorHarmonyOpen: boolean;
  aiChatOpen: boolean;
  aiChatMessages: ChatMessage[];
  backendOnline: boolean;
  availableModels: string[];

  // Videos Module
  videos: VideoItem[];
  videoFolders: VideoFolder[];
  activeVideoFolder: string | null;
  videoSearchQuery: string;
  videoFilterFavoritesOnly: boolean;
  activePlayingVideo: VideoItem | null;
  activeFolderModal: { type: 'create' | 'rename' | 'move'; folderName?: string; videoId?: string; videoIds?: string[] } | null;
  selectedVideoIds: string[];
  uploadProgress: {
    isUploading: boolean;
    filename: string;
    percent: number;
    loaded: number;
    total: number;
    speed: number;
    currentFileIndex: number;
    totalFiles: number;
  } | null;

  // Video Actions
  syncVideos: () => Promise<void>;
  uploadVideo: (file: File, folder?: string, fileIndex?: number, totalFiles?: number) => Promise<boolean>;
  importLocalPath: (path: string, folder?: string, mode?: 'copy' | 'move') => Promise<boolean>;
  openVideosFolder: (folder?: string) => Promise<boolean>;
  addVideoByUrl: (url: string, folder?: string, title?: string, streamOnly?: boolean) => Promise<boolean>;
  uploadPhotoAlbum: (title: string, files: File[], folder?: string) => Promise<boolean>;
  createVideoFolder: (name: string) => Promise<boolean>;
  renameVideoFolder: (oldName: string, newName: string) => Promise<boolean>;
  deleteVideoFolder: (folderName: string) => Promise<boolean>;
  renameVideo: (videoId: string, title: string) => Promise<boolean>;
  moveVideo: (videoId: string, targetFolder: string) => Promise<boolean>;
  toggleVideoFavorite: (videoId: string) => Promise<boolean>;
  deleteVideo: (videoId: string) => Promise<boolean>;
  toggleSelectVideo: (id: string) => void;
  selectAllVideos: (allIds: string[]) => void;
  clearSelectedVideos: () => void;
  batchDeleteVideos: (videoIds: string[]) => Promise<boolean>;
  batchMoveVideos: (videoIds: string[], targetFolder: string) => Promise<boolean>;
  setActiveVideoFolder: (folder: string | null) => void;
  setVideoSearchQuery: (query: string) => void;
  setVideoFilterFavoritesOnly: (favOnly: boolean) => void;
  setActivePlayingVideo: (video: VideoItem | null) => void;
  setActiveFolderModal: (modal: { type: 'create' | 'rename' | 'move'; folderName?: string; videoId?: string; videoIds?: string[] } | null) => void;

  // Trash Bin State & Actions
  trashItems: TrashItem[];
  trashStats: TrashStats;
  selectedTrashIds: string[];
  trashFilterType: 'all' | 'photo' | 'video' | 'album';
  trashSearchQuery: string;
  fetchTrash: () => Promise<void>;
  restoreTrashItems: (trashIds: string[]) => Promise<boolean>;
  permanentDeleteTrashItems: (trashIds: string[]) => Promise<boolean>;
  emptyTrashBin: () => Promise<boolean>;
  toggleSelectTrashItem: (id: string) => void;
  selectAllTrashItems: (allIds: string[]) => void;
  clearSelectedTrashItems: () => void;
  setTrashFilterType: (type: 'all' | 'photo' | 'video' | 'album') => void;
  setTrashSearchQuery: (query: string) => void;

  // Actions
  syncBackendData: () => Promise<void>;
  syncJobs: () => Promise<void>;
  setAiChatOpen: (open: boolean) => void;
  sendAiChatMessage: (text: string) => void;
  navigateToView: (viewId: ViewId, albumId?: string) => void;
  openTab: (tab: Omit<SessionTab, 'id'>) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Data Actions
  addAlbum: (album: Album) => void;
  updateAlbum: (id: string, updates: Partial<Album>) => void;
  setAlbumCover: (albumId: string, coverImageUrl: string) => Promise<boolean>;
  deleteAlbum: (id: string) => Promise<void> | void;
  refreshAlbumStreams: (albumId: string) => Promise<boolean>;
  removeImagesFromAlbum: (albumId: string, imageIds: string[]) => Promise<void> | void;
  renameAlbumImage: (albumId: string, imageId: string, newTitle: string) => Promise<boolean>;
  toggleFavoriteAlbum: (id: string) => void;

  addJob: (job: ExtractionJob) => void;
  updateJob: (id: string, updates: Partial<ExtractionJob>) => void;
  setActiveJob: (job: ExtractionJob | null) => void;
  cancelJob: (id: string) => Promise<void>;
  pauseJob: (id: string) => Promise<void>;
  resumeJob: (id: string) => Promise<void>;
  deleteJob: (id: string) => void;
  clearCompletedJobs: () => void;
  clearActiveJob: () => void;
  subscribeToJob: (sessionId: string, url: string) => void;

  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;

  addNotification: (notif: Omit<NotificationItem, 'id' | 'timestamp' | 'isRead'>) => void;
  markNotificationsAsRead: () => void;

  updateSettings: (updates: Partial<AppSettings>) => void;
  setActiveAiEngine: (engine: AiEngineType) => void;

  // Selection Actions
  toggleSelectImage: (id: string) => void;
  selectAllImages: (allIds: string[]) => void;
  clearSelectedImages: () => void;
  selectOnlyOriginalImages: (images: ImageItem[]) => void;

  toggleSelectAlbum: (id: string) => void;
  selectAllAlbums: (allIds: string[]) => void;
  clearSelectedAlbums: () => void;

  // Modal Triggers
  openLightbox: (image: ImageItem, album?: Album) => void;
  closeLightbox: () => void;
  setSlideshowOpen: (open: boolean) => void;
  setContactSheetOpen: (open: boolean) => void;
  setCoPilotOpen: (open: boolean) => void;
  openExportModal: (album: Album) => void;
  closeExportModal: () => void;
  setKeybindingsModalOpen: (open: boolean) => void;
  setWebhookModalOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setNotificationDrawerOpen: (open: boolean) => void;
  setAlbumDiffModalOpen: (open: boolean) => void;
  setColorHarmonyOpen: (open: boolean) => void;

  // View Controls
  setGalleryViewMode: (mode: GalleryViewMode) => void;
  setGallerySearchQuery: (query: string) => void;
  setGalleryColorFilter: (color: string | null) => void;
  setGalleryTagFilter: (tag: string | null) => void;
  setGallerySortBy: (sortBy: 'date' | 'name' | 'count' | 'resolution' | 'size') => void;
  toggleGallerySortOrder: () => void;
  setAlbumDetailZoomCols: (cols: number) => void;

  // Extractor Media Filter
  mediaTypeFilter: 'all' | 'images' | 'videos' | 'gifs';
  setMediaTypeFilter: (filter: 'all' | 'images' | 'videos' | 'gifs') => void;
  saveExtractedVideoToGallery: (videoUrl: string, title?: string, folder?: string, sourceUrl?: string) => Promise<boolean>;

  // Multi-Album Persistent State & Actions
  multiAlbumState: {
    url: string;
    performerName: string;
    maxRelated: number;
    results: any[];
    streamingStatus: string;
    lastSearchedPerformer: string | null;
    selectedUrls: string[];
  };
  setMultiAlbumState: (partial: Partial<{
    url: string;
    performerName: string;
    maxRelated: number;
    results: any[];
    streamingStatus: string;
    lastSearchedPerformer: string | null;
    selectedUrls: string[];
  }>) => void;
  clearMultiAlbumState: () => void;
  syncAlbums: () => Promise<void>;

  // Album Folders State & Actions
  albumFolders: AlbumFolder[];
  activeAlbumFolder: string | null;
  activeAlbumFolderModal: { type: 'create' | 'rename' | 'move'; folderName?: string; albumId?: string; albumIds?: string[] } | null;
  syncAlbumFolders: () => Promise<void>;
  setActiveAlbumFolder: (folder: string | null) => void;
  setActiveAlbumFolderModal: (modal: { type: 'create' | 'rename' | 'move'; folderName?: string; albumId?: string; albumIds?: string[] } | null) => void;
  createAlbumFolder: (name: string) => Promise<boolean>;
  renameAlbumFolder: (oldName: string, newName: string) => Promise<boolean>;
  deleteAlbumFolder: (name: string) => Promise<boolean>;
  moveAlbumsToFolder: (albumIds: string[], targetFolder: string) => Promise<boolean>;

  // Web Video Scraper Persistent State & Actions
  webScraperState: WebScraperState;
  setWebScraperState: (partial: Partial<WebScraperState>) => void;
  clearWebScraperState: () => void;

  // Highlight & Cross-Tab Navigation
  highlightedItemId: string | null;
  setHighlightedItemId: (id: string | null) => void;
  navigateToSavedItem: (targetView: 'videos' | 'gallery', folder: string, itemId: string) => void;
  checkItemSavedStatus: (params: {
    url?: string;
    title?: string;
    height?: number;
    width?: number;
    candidateId?: string;
    mediaType?: 'photo' | 'video' | 'album' | string;
  }) => {
    isSaved: boolean;
    isExactDuplicate: boolean;
    hasAlternativeResolution: boolean;
    savedFolder: string;
    folder: string;
    targetId: string;
    targetView: 'videos' | 'gallery';
    qualityLabel?: string;
  };

  // Optimistic Saved Registry
  optimisticSavedItems: Record<string, { folder: string; targetId: string; targetView: 'videos' | 'gallery'; timestamp: number }>;
  markItemAsSavedOptimistically: (params: { url?: string; title?: string; folder: string; targetId?: string; targetView?: 'videos' | 'gallery' }) => void;
}

export const mapServerJobToExtractionJob = (raw: any): ExtractionJob => {
  const isVideoSave = raw.mode === 'video_save' || raw.engine_type === 'video_downloader';
  const isFinished = raw.status === 'completed';
  const isCancelled = raw.status === 'cancelled';
  const isError = raw.status === 'error';
  const total = isVideoSave ? (raw.total_bytes || raw.progress?.total_bytes || 1) : (raw.progress?.total || raw.resolved_count || 1);
  const current = isVideoSave ? (raw.downloaded_bytes || raw.progress?.downloaded_bytes || 0) : (raw.progress?.current || raw.resolved_count || 0);
  const percent = isFinished ? 100 : (raw.progress?.percent !== undefined ? raw.progress.percent : Math.round((current / Math.max(1, total)) * 100));
  let domain = 'web-source';
  try {
    domain = new URL(raw.url.startsWith('http') ? raw.url : 'https://' + raw.url).hostname;
  } catch (_) {}

  return {
    id: raw.session_id,
    url: raw.url,
    title: raw.progress?.title || (isVideoSave ? 'Salvar Vídeo' : `Extração: ${domain}`),
    status: isFinished ? 'completed' : isCancelled ? 'cancelled' : isError ? 'failed' : 'active',
    mode: (raw.mode || raw.engine_type || 'ai_react') as any,
    progressPercent: isFinished ? 100 : Math.min(99, Math.max(1, percent)),
    discoveredImagesCount: isVideoSave ? 1 : total,
    resolvedOriginalCount: isVideoSave ? (isFinished ? 1 : 0) : current,
    failedCount: 0,
    currentStage: isFinished ? (isVideoSave ? 'Vídeo Salvo com Sucesso!' : 'Extração 100% Concluída!') : (raw.progress?.status || 'Processando em segundo plano...'),
    startTime: raw.started_at || new Date().toISOString(),
    durationSeconds: raw.duration_seconds || (isFinished ? Math.max(2, current * 1.5) : 0),
    throughputMbps: raw.throughput_mbps || raw.progress?.throughput_mbps || (current > 0 && (raw.duration_seconds || 1) > 0 ? parseFloat(((current * 2.8) / (raw.duration_seconds || 1)).toFixed(1)) : 0),
    fps: 60,
    aiModel: raw.model || (isVideoSave ? 'Direct Stream Downloader' : 'qwen2.5:32b'),
    resultAlbumId: isVideoSave ? undefined : (isFinished ? raw.session_id : undefined),
    downloadedBytes: raw.downloaded_bytes || raw.progress?.downloaded_bytes || 0,
    totalBytes: raw.total_bytes || raw.progress?.total_bytes || 0,
    folder: raw.folder || 'Extraídos',
    videoId: raw.video_id
  };
};

let isPollingJobs = false;
const activeSSESubscriptions = new Map<string, () => void>();

export const triggerJobsPollingLoop = () => {
  if (isPollingJobs) return;
  isPollingJobs = true;

  const tick = async () => {
    try {
      await useAppStore.getState().syncJobs();
    } catch (_) {}
    const hasActive = useAppStore.getState().jobs.some(j => j.status === 'active');
    setTimeout(tick, hasActive ? 1200 : 5000);
  };
  setTimeout(tick, 1000);
};

export const getCanonicalMediaFingerprint = (title?: string, url?: string, height?: number): string => {
  // 1. Limpeza de Título (remove extensões, timestamps, resoluções e sufixos de sites)
  let cleanTitle = (title || '').trim().toLowerCase();
  cleanTitle = cleanTitle.replace(/\.(mp4|m4v|mkv|webm|avi|mov)$/i, '');
  // Remove sufixos de timestamp (ex: _1790476557, 1790476557 ou 1790494749)
  cleanTitle = cleanTitle.replace(/[_\s-]\d{9,12}(\s|$)/g, '$1');
  cleanTitle = cleanTitle.replace(/\d{9,12}$/g, '');
  // Remove marcas de resolução anexadas no título
  cleanTitle = cleanTitle.replace(/[_\s-](4k|2160p|1440p|1080p(\s*fhd|\s*hd)?|720p(\s*hd)?|480p|360p|240p)(\s|$)/gi, '$3');
  // Remove sufixos de sites e buscadores (Yandex, Pornhub, Redtube, etc.)
  cleanTitle = cleanTitle.replace(/\s*[-–|•]\s*(watch online in yandex video search|yandex(\s*video\s*search)?|pornhub(\.com)?|redtube(\.com)?|spankbang(\.com)?|eporner(\.com)?|hardx|hqporner|xvideos(\.com)?|tnaflix).*$/i, '');
  // Remove pontuações e compacta espaços
  cleanTitle = cleanTitle.replace(/[_\-\.\,\:\;\|\(\)\[\]\/\\]+/g, ' ').replace(/\s+/g, ' ').trim();

  // 2. Chave Canônica de Origem / URL
  let canonicalKey = '';
  if (url && !url.includes('/api/videos/')) {
    const mPh = url.match(/viewkey=([a-zA-Z0-9]+)/i);
    const mEp = url.match(/video-([a-zA-Z0-9]{6,})/i);
    const mPvv = url.match(/\/videos\/(-?\d+\/\d+\/[a-zA-Z0-9_]+)/i);
    if (mPh) {
      canonicalKey = `ph:${mPh[1]}`;
    } else if (mEp) {
      canonicalKey = `ep:${mEp[1]}`;
    } else if (mPvv) {
      canonicalKey = `pvv:${mPvv[1]}`;
    } else {
      try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        canonicalKey = parsed.pathname.toLowerCase().replace(/\/$/, '');
      } catch {
        canonicalKey = url.split('?')[0].toLowerCase();
      }
    }
  }

  // 3. Faixa de Resolução (balde de 100px para separar 720p de 1080p)
  const resBucket = height ? Math.round(height / 100) * 100 : 'any';

  if (canonicalKey && !canonicalKey.endsWith('/stream')) {
    return `${canonicalKey}::${resBucket}`;
  }

  return `${cleanTitle}::${resBucket}`;
};

export const useAppStore = create<AppState>((set, get) => {
  // Load initial settings, tabs, filters, and history from localStorage if available
  let savedSettings = DEFAULT_SETTINGS;
  let savedTabs: SessionTab[] = [];
  let savedActiveTabId = '';
  let savedCurrentView: ViewId = 'gallery';
  let savedActiveAlbumId: string | null = null;
  let savedLogs: LogEntry[] = [];
  let savedGalleryViewMode: GalleryViewMode = 'grid-lg';
  let savedGallerySortBy: 'date' | 'name' | 'count' | 'resolution' | 'size' = 'date';
  let savedGallerySortOrder: 'asc' | 'desc' = 'desc';
  let savedAlbumZoomCols = 4;
  let savedChatMessages: ChatMessage[] = [];
  let savedNotifications: NotificationItem[] = [];
  let savedDomainPatterns: DomainPattern[] = [];
  let savedActiveJob: ExtractionJob | null = null;
  let savedDockMinimized = false;
  let savedMultiAlbumState = {
    url: '',
    performerName: '',
    maxRelated: 0,
    results: [] as any[],
    streamingStatus: '',
    lastSearchedPerformer: null as string | null,
    selectedUrls: [] as string[]
  };
  let savedWebScraperState: WebScraperState = {
    url: '',
    scanResult: null,
    selectedIds: [],
    targetFolder: 'Extraídos',
    errorMsg: null
  };

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('imagex_settings');
      if (stored) savedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };

      const storedTabs = localStorage.getItem('imagex_open_tabs');
      if (storedTabs) {
        const parsed = JSON.parse(storedTabs);
        if (Array.isArray(parsed)) savedTabs = parsed;
      }

      const storedActiveTab = localStorage.getItem('imagex_active_tab');
      if (storedActiveTab) savedActiveTabId = storedActiveTab;

      const storedView = localStorage.getItem('imagex_current_view');
      if (storedView) savedCurrentView = storedView as ViewId;

      const storedAlbum = localStorage.getItem('imagex_active_album');
      if (storedAlbum) savedActiveAlbumId = storedAlbum;

      const storedLogs = localStorage.getItem('imagex_logs');
      if (storedLogs) {
        const parsed = JSON.parse(storedLogs);
        if (Array.isArray(parsed)) savedLogs = parsed;
      }

      const storedGMode = localStorage.getItem('imagex_gallery_view_mode');
      if (storedGMode) savedGalleryViewMode = storedGMode as GalleryViewMode;

      const storedGSort = localStorage.getItem('imagex_gallery_sort_by');
      if (storedGSort) savedGallerySortBy = storedGSort as any;

      const storedGOrder = localStorage.getItem('imagex_gallery_sort_order');
      if (storedGOrder) savedGallerySortOrder = storedGOrder as any;

      const storedZoom = localStorage.getItem('imagex_album_zoom_cols');
      if (storedZoom) savedAlbumZoomCols = Number(storedZoom) || 4;

      const storedChat = localStorage.getItem('imagex_ai_chat');
      if (storedChat) {
        const parsed = JSON.parse(storedChat);
        if (Array.isArray(parsed)) savedChatMessages = parsed;
      }

      const storedNotifs = localStorage.getItem('imagex_notifications');
      if (storedNotifs) {
        const parsed = JSON.parse(storedNotifs);
        if (Array.isArray(parsed)) savedNotifications = parsed;
      }

      const storedPatterns = localStorage.getItem('imagex_domain_patterns');
      if (storedPatterns) {
        const parsed = JSON.parse(storedPatterns);
        if (Array.isArray(parsed)) savedDomainPatterns = parsed;
      }

      const storedJob = localStorage.getItem('imagex_active_job');
      if (storedJob) {
        savedActiveJob = JSON.parse(storedJob);
      }

      const storedMinimized = localStorage.getItem('imagex_dock_minimized');
      if (storedMinimized !== null) {
        savedDockMinimized = storedMinimized === 'true';
      }

      const storedMulti = localStorage.getItem('imagex_multi_album_state');
      if (storedMulti) {
        const parsed = JSON.parse(storedMulti);
        if (parsed && typeof parsed === 'object') {
          savedMultiAlbumState = { ...savedMultiAlbumState, ...parsed };
        }
      }

      const storedWebScraper = localStorage.getItem('imagex_web_scraper_state');
      if (storedWebScraper) {
        const parsed = JSON.parse(storedWebScraper);
        if (parsed && typeof parsed === 'object') {
          savedWebScraperState = { ...savedWebScraperState, ...parsed };
        }
      }
    } catch (_) {}
  }

  const persistNav = (tabs: SessionTab[], activeTab: string, view: ViewId, albumId: string | null) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('imagex_open_tabs', JSON.stringify(tabs));
        localStorage.setItem('imagex_active_tab', activeTab);
        localStorage.setItem('imagex_current_view', view);
        if (albumId) localStorage.setItem('imagex_active_album', albumId);
        else localStorage.removeItem('imagex_active_album');
      } catch (_) {}
    }
  };

  return {
    currentView: savedCurrentView,
    openTabs: savedTabs,
    activeTabId: savedActiveTabId,
    activeAlbumId: savedActiveAlbumId,

    multiAlbumState: savedMultiAlbumState,
    webScraperState: savedWebScraperState,

    albums: [],
    jobs: [],
    logs: savedLogs,
    domainPatterns: savedDomainPatterns,
    setOfMarks: [],
    inspectingMarkId: null,
    notifications: savedNotifications,
    settings: savedSettings,
    activeAiEngine: (savedSettings.defaultAiEngine as AiEngineType) || 'gemini_surgical_scout',

    activeJob: savedActiveJob,
    activeJobs: savedActiveJob ? [savedActiveJob] : [],
    isDockMinimized: savedDockMinimized,
    isMobileBottomBarMinimized: false,

    setDockMinimized: (minimized: boolean) => {
      set({ isDockMinimized: minimized });
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('imagex_dock_minimized', minimized ? 'true' : 'false');
        } catch (_) {}
      }
    },

    setIsMobileBottomBarMinimized: (minimized: boolean) => {
      set({ isMobileBottomBarMinimized: minimized });
    },

    setActiveJobById: (id: string) => {
      const target = get().jobs.find(j => j.id === id);
      if (target) {
        set({ activeJob: target });
      }
    },

    galleryViewMode: savedGalleryViewMode,
    gallerySearchQuery: '',
    galleryColorFilter: null,
    galleryTagFilter: null,
    gallerySortBy: savedGallerySortBy,
    gallerySortOrder: savedGallerySortOrder,
    selectedAlbumIds: [],

    albumDetailZoomCols: savedAlbumZoomCols,
    selectedImageIds: [],

    lightboxImage: null,
    lightboxAlbum: null,
    slideshowOpen: false,
    contactSheetOpen: false,
    coPilotOpen: false,
    exportModalOpen: false,
    exportModalAlbum: null,
    keybindingsModalOpen: false,
    webhookModalOpen: false,
    commandPaletteOpen: false,
    notificationDrawerOpen: false,
    albumDiffModalOpen: false,
    colorHarmonyOpen: false,
    aiChatOpen: false,
    backendOnline: false,
    availableModels: ['qwen2.5:32b', 'qwen3:14b', 'qwen3:8b', 'qwen2.5:14b', 'qwen2.5:7b', 'qwen2.5:3b'],
    albumFolders: [
      { id: 'Geral', name: 'Geral', count: 0 },
      { id: 'Angel wicky', name: 'Angel wicky', count: 0 },
      { id: 'Brett Rossi', name: 'Brett Rossi', count: 0 },
      { id: 'Payton Preslee', name: 'Payton Preslee', count: 0 },
      { id: 'savannah', name: 'savannah', count: 0 }
    ],
    activeAlbumFolder: null,
    activeAlbumFolderModal: null,
    highlightedItemId: null,
    optimisticSavedItems: {},
    videos: [],
    videoFolders: [],
    activeVideoFolder: null,
    videoSearchQuery: '',
    videoFilterFavoritesOnly: false,
    activePlayingVideo: null,
    activeFolderModal: null,
    selectedVideoIds: [],
    uploadProgress: null,
    trashItems: [],
    trashStats: {
      total_items: 0,
      photos_count: 0,
      videos_count: 0,
      albums_count: 0,
      total_size_bytes: 0
    },
    selectedTrashIds: [],
    trashFilterType: 'all',
    trashSearchQuery: '',
    mediaTypeFilter: 'all',
    aiChatMessages: savedChatMessages.length > 0 ? savedChatMessages : [
      {
        id: 'msg-1',
        sender: 'agent',
        text: 'Olá! Sou o **Agente Co-Pilot IMAGEX.AI** alimentado pelo motor Qwen 2.5:32b. Posso executar ações autônomas na sua galeria, filtrar fotos por iluminação/orientação, disparar upscales Original e analisar métricas.',
        timestamp: '17:45',
        reasoning: 'Co-Pilot conversacional online com acesso direto ao grafo de álbuns e telemetria.'
      }
    ],

    syncBackendData: async () => {
      try {
        const isOnline = await backendApi.checkBackendHealth();
        set({ backendOnline: isOnline });
        if (isOnline) {
          const [realAlbums, models, allServerJobs, patterns] = await Promise.all([
            backendApi.fetchRealAlbums(),
            backendApi.fetchAvailableModels(),
            backendApi.fetchAllJobs(),
            backendApi.fetchDomainPatterns()
          ]);
          await get().syncVideos();
          await get().syncAlbumFolders();
          await get().fetchTrash();
          if (models && models.length > 0) {
            set({ availableModels: models });
          }
          if (patterns && patterns.length > 0) {
            set({ domainPatterns: patterns });
          }
          if (realAlbums && realAlbums.length > 0) {
            set(state => {
              const existingIds = new Set(state.albums.map(a => a.id));
              const newReal = realAlbums.filter(a => !existingIds.has(a.id));
              return { albums: [...newReal, ...state.albums] };
            });
          }
          if (allServerJobs && Array.isArray(allServerJobs)) {
            const mappedJobs: ExtractionJob[] = allServerJobs.map(mapServerJobToExtractionJob);
            const runningMapped = mappedJobs.filter(j => j.status === 'active');

            // Clean up subscriptions for sessions that are no longer running on server
            const runningIds = new Set(allServerJobs.filter((j: any) => j.status === 'running').map((j: any) => j.session_id));
            for (const [sessId, unsubscribe] of activeSSESubscriptions.entries()) {
              if (!runningIds.has(sessId)) {
                try { unsubscribe(); } catch (_) {}
                activeSSESubscriptions.delete(sessId);
              }
            }

            // Determine activeJob without clobbering
            let currentActive = get().activeJob;
            if (!currentActive || currentActive.status === 'completed') {
              if (runningMapped.length > 0) {
                currentActive = runningMapped[0];
              }
            } else {
              const activeId = currentActive.id;
              const fresh = mappedJobs.find(j => j.id === activeId);
              if (fresh) currentActive = fresh;
            }

            set({
              jobs: mappedJobs,
              activeJobs: runningMapped,
              activeJob: currentActive
            });

            // Safely subscribe to each running session with its own isolated handler
            const runningServerJobs = allServerJobs.filter((j: any) => j.status === 'running');
            for (const running of runningServerJobs) {
              const sessId = running.session_id;
              if (activeSSESubscriptions.has(sessId)) continue;

              const unsub = backendApi.subscribeToSessionEvents(
                sessId,
                (eventData) => {
                  if (eventData.type === 'log') {
                    get().addLog({
                      level: eventData.level || 'info',
                      category: eventData.category || 'AGENT_EVENT',
                      message: eventData.message || ''
                    });
                  } else if (eventData.type === 'status') {
                    get().addLog({
                      level: 'info',
                      category: 'STATUS',
                      message: eventData.message || ''
                    });
                    get().updateJob(sessId, { currentStage: eventData.message });
                  } else if (eventData.type === 'album_init') {
                    get().updateJob(sessId, { discoveredImagesCount: eventData.total_candidates });
                  } else if (eventData.type === 'image_resolved' || eventData.type === 'candidate_processed') {
                    const pos = eventData.position || eventData.image?.position || 1;
                    const rawThumb = eventData.thumbnail_url || eventData.image?.thumbnail_url || eventData.image?.src || '';
                    const rawOrig = eventData.original_url || eventData.image?.original_url || '';
                    const safeThumb = rawThumb.startsWith('http')
                      ? `/api/proxy-image?url=${encodeURIComponent(rawThumb)}&referer=${encodeURIComponent(running.url || rawThumb)}`
                      : rawThumb;
                    const isPass = eventData.validation_status === 'PASS' || eventData.image?.validation_status === 'PASS';
                    const isNoise = eventData.image?.classification === 'banner_noise' || eventData.validation_status === 'REJECTED';
                    const dims = eventData.dimensions || (eventData.image?.width ? `${eventData.image.width}x${eventData.image.height}` : 'Original');

                    get().addLog({
                      level: isPass ? 'ai' : 'warning',
                      category: isPass ? 'Original_RESOLVED' : 'INSPECTING',
                      message: `Foto #${pos} ${isPass ? 'validada em alta resolução' : 'sendo analisada'} (${dims})`
                    });

                    // Only update setOfMarks if this job is the currently active one being inspected
                    if (get().activeJob?.id === sessId) {
                      const newMark: SetOfMarkCandidate = {
                        id: pos,
                        thumbnailUrl: safeThumb,
                        resolvedOriginalUrl: rawOrig,
                        label: isPass ? `Foto #${pos} (${dims})` : (isNoise ? `Banner Rejeitado #${pos}` : `Candidato #${pos}`),
                        type: isPass ? 'album_item' : (isNoise ? 'banner_noise' : 'unresolved'),
                        confidence: 0.98,
                        box: { top: 0, left: 0, width: 200, height: 200 }
                      };

                      set(state => {
                        const existingIdx = state.setOfMarks.findIndex(m => m.id === pos);
                        const updatedMarks = [...state.setOfMarks];
                        if (existingIdx >= 0) {
                          updatedMarks[existingIdx] = newMark;
                        } else {
                          updatedMarks.push(newMark);
                        }
                        return {
                          setOfMarks: updatedMarks,
                          inspectingMarkId: pos
                        };
                      });
                    }

                    const curJob = get().jobs.find(j => j.id === sessId);
                    if (curJob) {
                      const maxTotal = curJob.discoveredImagesCount || 1;
                      get().updateJob(sessId, {
                        resolvedOriginalCount: isPass ? Math.max(curJob.resolvedOriginalCount, pos) : curJob.resolvedOriginalCount,
                        progressPercent: Math.min(99, Math.round((pos / Math.max(1, maxTotal)) * 100))
                      });
                    }
                  }
                },
                (finishedAlbum) => {
                  get().addAlbum(finishedAlbum);
                  get().updateJob(sessId, {
                    status: 'completed',
                    progressPercent: 100,
                    currentStage: 'Extração 100% Concluída!',
                    resultAlbumId: finishedAlbum.id,
                    resolvedOriginalCount: finishedAlbum.images.length,
                    discoveredImagesCount: finishedAlbum.images.length
                  });
                  const u = activeSSESubscriptions.get(sessId);
                  if (u) {
                    try { u(); } catch (_) {}
                    activeSSESubscriptions.delete(sessId);
                  }
                },
                (err) => {
                  console.warn(`SSE error on session ${sessId}:`, err);
                }
              );

              activeSSESubscriptions.set(sessId, unsub);
            }
          }
        }
        triggerJobsPollingLoop();
      } catch (err) {
        console.warn('Backend sync failed:', err);
      }
    },

    syncJobs: async () => {
      try {
        const allServerJobs = await backendApi.fetchAllJobs();
        if (allServerJobs && Array.isArray(allServerJobs)) {
          const mappedJobs = allServerJobs.map(mapServerJobToExtractionJob);
          const currentJobs = get().jobs;
          const hadActiveVideoJobs = currentJobs.some(j => j.status === 'active' && (j.mode as any) === 'video_save');
          const stillHasActiveVideoJobs = mappedJobs.some(j => j.status === 'active' && (j.mode as any) === 'video_save');

          const hadActiveAlbumJobs = currentJobs.some(j => j.status === 'active' && (j.mode as any) !== 'video_save');
          const stillHasActiveAlbumJobs = mappedJobs.some(j => j.status === 'active' && (j.mode as any) !== 'video_save');

          const runningMapped = mappedJobs.filter(j => j.status === 'active');

          let currentActive = get().activeJob;
          if (currentActive) {
            const activeId = currentActive.id;
            const fresh = mappedJobs.find(j => j.id === activeId);
            if (fresh) currentActive = fresh;
            else if (runningMapped.length > 0) currentActive = runningMapped[0];
          } else if (runningMapped.length > 0) {
            currentActive = runningMapped[0];
          }

          set({
            jobs: mappedJobs,
            activeJobs: runningMapped,
            activeJob: currentActive
          });

          // Detecta tarefas que acabaram de transicionar para 'completed' individualmente
          const justCompletedJobs = mappedJobs.filter(newJ => {
            if (newJ.status !== 'completed') return false;
            const oldJ = currentJobs.find(oj => oj.id === newJ.id);
            return oldJ && oldJ.status !== 'completed';
          });

          for (const cj of justCompletedJobs) {
            const isVid = (cj.mode as string) === 'video_save' || (cj.mode as string) === 'video_downloader';
            if (isVid) {
              await get().syncVideos();
              get().addNotification({
                title: 'Vídeo Salvo na Galeria',
                message: `"${cj.title.replace(/^Salvar Vídeo:\s*/, '')}" foi salvo com sucesso na pasta "${cj.folder || 'Extraídos'}".`,
                type: 'success',
                linkViewId: 'videos'
              });
              soundEffects.success(get().settings.soundEnabled);
            } else {
              await get().syncAlbums();
              get().addNotification({
                title: 'Extração Concluída',
                message: `"${cj.title.replace(/^Extração:\s*/, '')}" foi salvo com sucesso na Galeria.`,
                type: 'success',
                linkViewId: 'gallery'
              });
              soundEffects.success(get().settings.soundEnabled);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to sync jobs:', err);
      }
    },

    syncAlbums: async () => {
      try {
        const freshAlbums = await backendApi.fetchRealAlbums();
        if (freshAlbums && Array.isArray(freshAlbums)) {
          set({ albums: freshAlbums });
        }
        await get().syncAlbumFolders();
      } catch (err) {
        console.warn('Failed to sync albums:', err);
      }
    },

    syncAlbumFolders: async () => {
      try {
        const res = await backendApi.fetchAlbumFolders();
        const apiFolders = (res && Array.isArray(res.folders)) ? res.folders : [];
        const { albums } = get();

        // 1. Contagens reais baseadas nos álbuns carregados
        const folderCounts = new Map<string, number>();
        folderCounts.set('Geral', 0);

        albums.forEach(a => {
          const f = (a.folder || 'Geral').trim() || 'Geral';
          folderCounts.set(f, (folderCounts.get(f) || 0) + 1);
        });

        // 2. Mescla pastas retornadas pela API (mantendo maior contagem entre memória e backend)
        apiFolders.forEach(f => {
          const name = (f.name || f.id || '').trim();
          if (name) {
            if (!folderCounts.has(name)) {
              folderCounts.set(name, f.count || 0);
            } else {
              folderCounts.set(name, Math.max(folderCounts.get(name) || 0, f.count || 0));
            }
          }
        });

        // 3. Pastas conhecidas persistidas em data/album_folders.json
        ['Angel wicky', 'Brett Rossi', 'Payton Preslee', 'savannah'].forEach(known => {
          if (!folderCounts.has(known)) {
            folderCounts.set(known, 0);
          }
        });

        // 4. Cache persistido do localStorage
        try {
          const cached = JSON.parse(localStorage.getItem('app_custom_album_folders_cache') || '[]');
          if (Array.isArray(cached)) {
            cached.forEach((name: string) => {
              if (name && !folderCounts.has(name)) {
                folderCounts.set(name, 0);
              }
            });
          }
        } catch (_) {}

        // 5. Ordenação: "Geral" sempre em primeiro, seguido pelas demais em ordem alfabética
        const sortedNames = ['Geral', ...Array.from(folderCounts.keys()).filter(k => k !== 'Geral').sort((a, b) => a.localeCompare(b))];
        const mergedFolders: AlbumFolder[] = sortedNames.map(name => ({
          id: name,
          name: name,
          count: folderCounts.get(name) || 0
        }));

        set({ albumFolders: mergedFolders });

        try {
          localStorage.setItem('app_custom_album_folders_cache', JSON.stringify(sortedNames.filter(n => n !== 'Geral')));
        } catch (_) {}
      } catch (err) {
        console.warn('Failed to sync album folders:', err);
      }
    },

    setActiveAlbumFolder: (folder) => set({ activeAlbumFolder: folder }),

    setActiveAlbumFolderModal: (modal) => set({ activeAlbumFolderModal: modal }),

    createAlbumFolder: async (name) => {
      const clean = name.trim();
      if (!clean) return false;
      try {
        const res = await backendApi.createAlbumFolder(clean);
        if (res.success) {
          set({ albumFolders: res.folders, activeAlbumFolder: clean });
          get().addNotification({
            title: 'Pasta Criada',
            message: `Pasta "${clean}" criada com sucesso.`,
            type: 'success',
          });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    renameAlbumFolder: async (oldName, newName) => {
      const clean = newName.trim();
      if (!clean || clean === oldName) return false;
      try {
        const res = await backendApi.renameAlbumFolder(oldName, clean);
        if (res.success) {
          const { activeAlbumFolder, albums } = get();
          const updatedAlbums = albums.map(a => (a.folder === oldName ? { ...a, folder: clean } : a));
          set({
            albumFolders: res.folders,
            albums: updatedAlbums,
            activeAlbumFolder: activeAlbumFolder === oldName ? clean : activeAlbumFolder,
          });
          get().addNotification({
            title: 'Pasta Renomeada',
            message: `Pasta renomeada para "${clean}".`,
            type: 'success',
          });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    deleteAlbumFolder: async (folderName) => {
      try {
        const res = await backendApi.deleteAlbumFolder(folderName);
        if (res.success) {
          const { activeAlbumFolder, albums } = get();
          const updatedAlbums = albums.map(a => (a.folder === folderName ? { ...a, folder: 'Geral' } : a));
          set({
            albumFolders: res.folders,
            albums: updatedAlbums,
            activeAlbumFolder: activeAlbumFolder === folderName ? null : activeAlbumFolder,
          });
          get().addNotification({
            title: 'Pasta Excluída',
            message: `Pasta "${folderName}" excluída. Álbuns movidos para "Geral".`,
            type: 'info',
          });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    moveAlbumsToFolder: async (albumIds, targetFolder) => {
      try {
        const res = await backendApi.moveAlbumsToFolder(albumIds, targetFolder);
        if (res.success) {
          const { albums } = get();
          const idSet = new Set(albumIds);
          const updatedAlbums = albums.map(a => (idSet.has(a.id) ? { ...a, folder: targetFolder } : a));
          set({ albums: updatedAlbums });
          await get().syncAlbumFolders();
          get().addNotification({
            title: 'Álbuns Movidos',
            message: `${res.moved} álbum(ns) movido(s) para "${targetFolder}".`,
            type: 'success',
          });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    setMultiAlbumState: (partial) => {
      set((state) => {
        const next = { ...state.multiAlbumState, ...partial };
        try {
          localStorage.setItem('imagex_multi_album_state', JSON.stringify(next));
        } catch (_) {}
        return { multiAlbumState: next };
      });
    },

    clearMultiAlbumState: () => {
      const reset = {
        url: '',
        performerName: '',
        maxRelated: 0,
        results: [],
        streamingStatus: '',
        lastSearchedPerformer: null,
        selectedUrls: []
      };
      try {
        localStorage.removeItem('imagex_multi_album_state');
      } catch (_) {}
      set({ multiAlbumState: reset });
    },

    setWebScraperState: (partial) => {
      set((state) => {
        const next = { ...state.webScraperState, ...partial };
        try {
          localStorage.setItem('imagex_web_scraper_state', JSON.stringify(next));
        } catch (_) {}
        return { webScraperState: next };
      });
    },

    clearWebScraperState: () => {
      const reset: WebScraperState = {
        url: '',
        scanResult: null,
        selectedIds: [],
        targetFolder: 'Extraídos',
        errorMsg: null
      };
      try {
        localStorage.removeItem('imagex_web_scraper_state');
      } catch (_) {}
      set({ webScraperState: reset });
    },

    setAiChatOpen: (open) => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);
      set({ aiChatOpen: open });
    },

    sendAiChatMessage: (text) => {
      const { settings, albums, activeAlbumId } = get();
      soundEffects.click(settings.soundEnabled);
      const userMsg: ChatMessage = {
        id: `msg-u-${Date.now()}`,
        sender: 'user',
        text,
        timestamp: new Date().toLocaleTimeString().slice(0, 5)
      };

      set(state => ({ aiChatMessages: [...state.aiChatMessages, userMsg] }));

      // Intelligent Agent Response via Backend
      const asyncAiCall = async () => {
        let agentReply = '';
        let reasoning = '';
        let actionExecuted: ChatMessage['actionExecuted'];

        try {
          const reply = await backendApi.sendChatMessage(text);
          if (reply) {
            agentReply = reply;
            reasoning = 'Resposta gerada via Backend AI';
          } else {
            agentReply = `Falha na comunicação com a IA Backend. Verifique a conexão com o servidor.`;
            reasoning = 'API Timeout / Failure';
          }
        } catch (e) {
          agentReply = `Erro ao contactar o servidor de IA.`;
          reasoning = 'Network Exception';
        }

        const agentMsg: ChatMessage = {
          id: `msg-a-${Date.now()}`,
          sender: 'agent',
          text: agentReply,
          timestamp: new Date().toLocaleTimeString().slice(0, 5),
          reasoning,
          actionExecuted
        };

        set(state => ({ aiChatMessages: [...state.aiChatMessages, agentMsg] }));
        soundEffects.click(settings.soundEnabled);
      };

      // Fire and forget
      asyncAiCall();
    },

    navigateToView: (viewId: ViewId, albumId?: string) => {
      // Snapshot scroll position of outgoing tab/view before navigating
      scrollRestorationManager.snapshotCurrentPosition(get().activeTabId, get().currentView, get().activeAlbumId);

      const { settings, openTabs } = get();
      soundEffects.click(settings.soundEnabled);

      let tabTitle = viewId.replace('-', ' ').toUpperCase();
      if (viewId === 'extractor') tabTitle = 'Media Extractor';
      else if (viewId === 'gallery') tabTitle = 'Album Library';
      else if (viewId === 'album-detail' && albumId) {
        const album = get().albums.find(a => a.id === albumId);
        tabTitle = album ? album.title.slice(0, 24) + '...' : 'Album Detail';
      }

      const existingTab = openTabs.find(t => t.viewId === viewId && (!albumId || t.albumId === albumId));
      let activeTabId = existingTab ? existingTab.id : `tab-${viewId}-${Date.now()}`;

      let updatedTabs = openTabs;
      if (!existingTab) {
        updatedTabs = [
          ...openTabs,
          { id: activeTabId, title: tabTitle, viewId, albumId, isClosable: true }
        ];
      }

      persistNav(updatedTabs, activeTabId, viewId, albumId || null);
      set({
        currentView: viewId,
        activeAlbumId: albumId || null,
        openTabs: updatedTabs,
        activeTabId
      });
    },

    openTab: (tab) => {
      // Snapshot scroll position of outgoing tab/view before opening new tab
      scrollRestorationManager.snapshotCurrentPosition(get().activeTabId, get().currentView, get().activeAlbumId);

      const { openTabs, settings } = get();
      soundEffects.click(settings.soundEnabled);
      const id = `tab-${tab.viewId}-${Date.now()}`;
      scrollRestorationManager.initNewTabPosition(id, 0);
      const newTabs = [...openTabs, { ...tab, id, isClosable: true }];
      persistNav(newTabs, id, tab.viewId, tab.albumId || null);
      set({
        openTabs: newTabs,
        activeTabId: id,
        currentView: tab.viewId,
        activeAlbumId: tab.albumId || null
      });
    },

    closeTab: (tabId) => {
      scrollRestorationManager.deleteTabPosition(tabId);
      const { openTabs, activeTabId, settings } = get();
      soundEffects.click(settings.soundEnabled);

      const remaining = openTabs.filter(t => t.id !== tabId);
      let nextActive = activeTabId;
      let nextView = get().currentView;
      let nextAlbumId = get().activeAlbumId;

      if (remaining.length === 0) {
        nextActive = '';
        nextView = 'gallery';
        nextAlbumId = null;
      } else if (activeTabId === tabId) {
        const lastTab = remaining[remaining.length - 1];
        nextActive = lastTab.id;
        nextView = lastTab.viewId;
        nextAlbumId = lastTab.albumId || null;
      }

      persistNav(remaining, nextActive, nextView, nextAlbumId);
      set({
        openTabs: remaining,
        activeTabId: nextActive,
        currentView: nextView,
        activeAlbumId: nextAlbumId
      });
    },

    setActiveTab: (tabId) => {
      // Snapshot scroll position of outgoing tab/view before switching
      scrollRestorationManager.snapshotCurrentPosition(get().activeTabId, get().currentView, get().activeAlbumId);

      const { openTabs, settings } = get();
      soundEffects.click(settings.soundEnabled);
      const tab = openTabs.find(t => t.id === tabId);
      if (tab) {
        persistNav(openTabs, tab.id, tab.viewId, tab.albumId || null);
        set({
          activeTabId: tab.id,
          currentView: tab.viewId,
          activeAlbumId: tab.albumId || null
        });
      }
    },

    addAlbum: (album) => {
      set(state => {
        const exists = state.albums.some(a => a.id === album.id);
        if (exists) {
          return { albums: state.albums.map(a => a.id === album.id ? album : a) };
        }
        return { albums: [album, ...state.albums] };
      });
    },

    updateAlbum: async (id, updates) => {
      if (updates.title) {
        try {
          await backendApi.renameAlbum(id, updates.title);
        } catch (_) {}
      }
      set(state => ({
        albums: state.albums.map(a => (a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a))
      }));
    },

    renameAlbumImage: async (albumId: string, imageId: string, newTitle: string) => {
      const clean = newTitle.trim();
      if (!clean) return false;
      try {
        await backendApi.renameAlbumImage(albumId, imageId, clean);
      } catch (_) {}

      set(state => ({
        albums: state.albums.map(a => {
          if (a.id !== albumId) return a;
          const updatedImages = (a.images || []).map(img =>
            img.id === imageId ? { ...img, title: clean } : img
          );
          return {
            ...a,
            images: updatedImages,
            updatedAt: new Date().toISOString()
          };
        })
      }));
      return true;
    },

    setAlbumCover: async (albumId: string, coverImageUrl: string) => {
      try {
        const success = await backendApi.setAlbumCover(albumId, coverImageUrl);
        if (success) {
          const safeUrl = (coverImageUrl.startsWith('http') && !coverImageUrl.includes('unsplash.com') && !coverImageUrl.includes('static-ca-cdn.eporner.com') && !coverImageUrl.includes('pornpics.com'))
            ? `/api/proxy-image?url=${encodeURIComponent(coverImageUrl)}&referer=${encodeURIComponent(coverImageUrl)}`
            : coverImageUrl;

          set(state => ({
            albums: state.albums.map(a =>
              a.id === albumId
                ? { ...a, coverImage: safeUrl, rawCoverImage: coverImageUrl, updatedAt: new Date().toISOString() }
                : a
            )
          }));

          get().addNotification({
            title: 'Capa do Álbum Atualizada',
            message: 'A miniatura deste álbum na galeria foi alterada com sucesso.',
            type: 'success'
          });
          return true;
        }
      } catch (err) {
        console.error('Failed to set album cover:', err);
      }
      return false;
    },

    deleteAlbum: async (id) => {
      try {
        await backendApi.deleteAlbum(id);
        await get().fetchTrash();
      } catch (_) {}
      scrollRestorationManager.deletePosition(getViewScrollKey('album-detail', id));
      set(state => ({
        albums: state.albums.filter(a => a.id !== id),
        openTabs: state.openTabs.filter(t => t.albumId !== id)
      }));
      get().addNotification({
        title: 'Álbum Movido para a Lixeira',
        message: 'O álbum foi enviado para a lixeira do app e pode ser restaurado a qualquer momento.',
        type: 'warning'
      });
    },

    refreshAlbumStreams: async (albumId) => {
      const ok = await backendApi.refreshAlbumStreams(albumId);
      if (ok) {
        // Reload the album details to get fresh stream URLs
        const fresh = await backendApi.fetchAlbumDetails(albumId);
        if (fresh) {
          set(state => ({
            albums: state.albums.map(a => a.id === albumId ? fresh : a)
          }));
        }
        get().addNotification({
          title: 'Streams Renovados',
          message: 'Os links de vídeo foram atualizados com sucesso.',
          type: 'success'
        });
      } else {
        get().addNotification({
          title: 'Falha ao Renovar Streams',
          message: 'Não foi possível obter novos links. Tente novamente mais tarde.',
          type: 'error'
        });
      }
      return ok;
    },

    removeImagesFromAlbum: async (albumId, imageIds) => {
      try {
        await backendApi.deleteAlbumImages(albumId, imageIds);
        await get().fetchTrash();
      } catch (_) {}
      set(state => ({
        albums: state.albums.map(a => {
          if (a.id !== albumId) return a;
          const updatedImages = (a.images || []).filter(img => !imageIds.includes(img.id));
          const updatedBytes = updatedImages.reduce((sum, img) => sum + (img.fileSizeBytes || 0), 0);
          return {
            ...a,
            images: updatedImages,
            imageCount: updatedImages.length,
            totalSizeBytes: updatedBytes,
            coverImage: updatedImages[0]?.thumbnailUrl || a.coverImage,
            updatedAt: new Date().toISOString()
          };
        })
      }));
      get().addNotification({
        title: 'Fotos Movidas para a Lixeira',
        message: `${imageIds.length} foto(s) enviada(s) para a lixeira do app.`,
        type: 'warning'
      });
    },

    toggleFavoriteAlbum: (id) => {
      set(state => ({
        albums: state.albums.map(a => (a.id === id ? { ...a, isFavorite: !a.isFavorite } : a))
      }));
    },

    addJob: (job) => {
      set(state => {
        const existing = state.jobs.some(j => j.id === job.id);
        const newJobs = existing ? state.jobs.map(j => j.id === job.id ? job : j) : [job, ...state.jobs];
        const activeJobs = newJobs.filter(j => j.status === 'active');
        return {
          jobs: newJobs,
          activeJob: (!state.activeJob || state.activeJob.status === 'completed') ? job : state.activeJob,
          activeJobs
        };
      });
    },

    updateJob: (id, updates) => {
      set(state => {
        const updatedJobs = state.jobs.map(j => (j.id === id ? { ...j, ...updates } : j));
        const updatedActive = state.activeJob?.id === id ? { ...state.activeJob, ...updates } : state.activeJob;
        const activeJobs = updatedJobs.filter(j => j.status === 'active');
        return { jobs: updatedJobs, activeJob: updatedActive, activeJobs };
      });
    },

    setActiveJob: (job) => set({ activeJob: job }),

    cancelJob: async (id) => {
      try {
        await backendApi.cancelJob(id);
      } catch (_) {}
      const unsub = activeSSESubscriptions.get(id);
      if (unsub) {
        try { unsub(); } catch (_) {}
        activeSSESubscriptions.delete(id);
      }
      set(state => {
        const updatedJobs = state.jobs.map(j => (j.id === id ? { ...j, status: 'cancelled' as const, currentStage: 'Cancelado pelo usuário' } : j));
        const activeJobs = updatedJobs.filter(j => j.status === 'active');
        const updatedActive = state.activeJob?.id === id ? (activeJobs[0] || null) : state.activeJob;
        return { jobs: updatedJobs, activeJob: updatedActive, activeJobs };
      });
      get().addNotification({
        title: 'Job Cancelado',
        message: `A tarefa #${id} foi abortada com sucesso.`,
        type: 'warning'
      });
    },

    pauseJob: async (id) => {
      set(state => {
        const updatedJobs = state.jobs.map(j => (j.id === id ? { ...j, status: 'paused' as any, currentStage: 'Pausado' } : j));
        const activeJobs = updatedJobs.filter(j => j.status === 'active');
        const updatedActive = state.activeJob?.id === id ? { ...state.activeJob, status: 'paused' as any, currentStage: 'Pausado' } : state.activeJob;
        return { jobs: updatedJobs, activeJob: updatedActive, activeJobs };
      });
    },

    resumeJob: async (id) => {
      set(state => {
        const updatedJobs = state.jobs.map(j => (j.id === id ? { ...j, status: 'active' as const, currentStage: 'Retomando...' } : j));
        const activeJobs = updatedJobs.filter(j => j.status === 'active');
        const updatedActive = state.activeJob?.id === id ? { ...state.activeJob, status: 'active' as const, currentStage: 'Retomando...' } : state.activeJob;
        return { jobs: updatedJobs, activeJob: updatedActive, activeJobs };
      });
    },

    deleteJob: async (id) => {
      try {
        await backendApi.deleteJob(id);
      } catch (_) {}
      const unsub = activeSSESubscriptions.get(id);
      if (unsub) {
        try { unsub(); } catch (_) {}
        activeSSESubscriptions.delete(id);
      }
      set(state => {
        const remaining = state.jobs.filter(j => j.id !== id);
        const activeJobs = remaining.filter(j => j.status === 'active');
        return {
          jobs: remaining,
          activeJob: state.activeJob?.id === id ? (activeJobs[0] || null) : state.activeJob,
          activeJobs
        };
      });
    },

    clearCompletedJobs: () => {
      set(state => {
        const activeJobs = state.jobs.filter(j => j.status === 'active');
        return {
          jobs: activeJobs,
          activeJobs
        };
      });
    },

    clearActiveJob: () => {
      set(state => {
        const activeJobs = state.jobs.filter(j => j.status === 'active');
        return {
          activeJob: null,
          activeJobs,
          setOfMarks: [],
          inspectingMarkId: null
        };
      });
    },

    subscribeToJob: (sessionId: string, url: string) => {
      if (activeSSESubscriptions.has(sessionId)) return;
      const unsub = backendApi.subscribeToSessionEvents(
        sessionId,
        (eventData) => {
          if (eventData.type === 'log') {
            get().addLog({ level: eventData.level || 'info', category: eventData.category || 'AGENT_EVENT', message: eventData.message || '' });
          } else if (eventData.type === 'status') {
            get().updateJob(sessionId, { currentStage: eventData.message });
          } else if (eventData.type === 'album_init') {
            get().updateJob(sessionId, { discoveredImagesCount: eventData.total_candidates });
          } else if (eventData.type === 'image_resolved' || eventData.type === 'candidate_processed') {
            const pos = eventData.position || eventData.image?.position || 1;
            const isPass = eventData.validation_status === 'PASS' || eventData.image?.validation_status === 'PASS';
            const jobState = get().jobs.find(j => j.id === sessionId);
            if (jobState) {
              const maxTotal = jobState.discoveredImagesCount || 1;
              get().updateJob(sessionId, {
                resolvedOriginalCount: isPass ? Math.max(jobState.resolvedOriginalCount || 0, pos) : jobState.resolvedOriginalCount,
                progressPercent: Math.min(99, Math.round((pos / Math.max(1, maxTotal)) * 100))
              });
            }
          }
        },
        (finishedAlbum) => {
          get().addAlbum(finishedAlbum);
          get().updateJob(sessionId, {
            status: 'completed',
            progressPercent: 100,
            currentStage: 'Extração 100% Concluída!',
            resultAlbumId: finishedAlbum.id,
            resolvedOriginalCount: finishedAlbum.images.length,
            discoveredImagesCount: finishedAlbum.images.length
          });
          const u = activeSSESubscriptions.get(sessionId);
          if (u) {
            try { u(); } catch (_) {}
            activeSSESubscriptions.delete(sessionId);
          }
        },
        (err) => {
          get().updateJob(sessionId, { status: 'failed', currentStage: `Erro: ${err}` });
          const u = activeSSESubscriptions.get(sessionId);
          if (u) {
            try { u(); } catch (_) {}
            activeSSESubscriptions.delete(sessionId);
          }
        }
      );
      activeSSESubscriptions.set(sessionId, unsub);
    },

    addLog: (log) => {
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
      const entry: LogEntry = {
        ...log,
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp
      };
      set(state => {
        const updatedLogs = [entry, ...state.logs.slice(0, 1999)];
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('imagex_logs', JSON.stringify(updatedLogs.slice(0, 500)));
          } catch (_) {}
        }
        return { logs: updatedLogs };
      });
    },

    clearLogs: () => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('imagex_logs');
        } catch (_) {}
      }
      set({ logs: [] });
    },

    addNotification: (notif) => {
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const item: NotificationItem = {
        ...notif,
        id: `notif-${Date.now()}`,
        timestamp,
        isRead: false
      };
      set(state => {
        const updated = [item, ...state.notifications].slice(0, 50);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('imagex_notifications', JSON.stringify(updated));
          } catch (_) {}
        }
        return { notifications: updated };
      });
    },

    markNotificationsAsRead: () => {
      set(state => {
        const updated = state.notifications.map(n => ({ ...n, isRead: true }));
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('imagex_notifications', JSON.stringify(updated));
          } catch (_) {}
        }
        return { notifications: updated };
      });
    },

    updateSettings: (updates) => {
      set(state => {
        const newSettings = { ...state.settings, ...updates };
        try {
          localStorage.setItem('imagex_settings', JSON.stringify(newSettings));
        } catch (_) {}

        if (updates.ambientSoundType !== undefined || updates.ambientSoundVolume !== undefined) {
          ambientAudio.play(newSettings.ambientSoundType, newSettings.ambientSoundVolume);
        }

        return { settings: newSettings };
      });
    },

    setActiveAiEngine: (engine) => {
      set({ activeAiEngine: engine });
      const { settings, updateSettings } = get();
      updateSettings({ defaultAiEngine: engine });
    },

    toggleSelectImage: (id) => {
      set(state => ({
        selectedImageIds: state.selectedImageIds.includes(id)
          ? state.selectedImageIds.filter(i => i !== id)
          : [...state.selectedImageIds, id]
      }));
    },

    selectAllImages: (allIds) => set({ selectedImageIds: allIds }),
    clearSelectedImages: () => set({ selectedImageIds: [] }),
    selectOnlyOriginalImages: (images) => {
      set({ selectedImageIds: images.filter(i => i.isResolvedOriginal).map(i => i.id) });
    },

    toggleSelectAlbum: (id) => {
      set(state => ({
        selectedAlbumIds: state.selectedAlbumIds.includes(id)
          ? state.selectedAlbumIds.filter(i => i !== id)
          : [...state.selectedAlbumIds, id]
      }));
    },

    selectAllAlbums: (allIds) => set({ selectedAlbumIds: allIds }),
    clearSelectedAlbums: () => set({ selectedAlbumIds: [] }),

    openLightbox: (image, album) => {
      const { settings } = get();
      soundEffects.whoosh(settings.soundEnabled);
      set({ lightboxImage: image, lightboxAlbum: album || null });
    },
    closeLightbox: () => set({ lightboxImage: null, lightboxAlbum: null }),

    setSlideshowOpen: (open) => set({ slideshowOpen: open }),
    setContactSheetOpen: (open) => set({ contactSheetOpen: open }),

    setCoPilotOpen: (open) => set({ coPilotOpen: open }),

    openExportModal: (album) => {
      const { settings } = get();
      soundEffects.whoosh(settings.soundEnabled);
      set({ exportModalOpen: true, exportModalAlbum: album });
    },
    closeExportModal: () => set({ exportModalOpen: false, exportModalAlbum: null }),

    setKeybindingsModalOpen: (open) => set({ keybindingsModalOpen: open }),
    setWebhookModalOpen: (open) => set({ webhookModalOpen: open }),
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    setNotificationDrawerOpen: (open) => set({ notificationDrawerOpen: open }),
    setAlbumDiffModalOpen: (open) => set({ albumDiffModalOpen: open }),
    setColorHarmonyOpen: (open) => set({ colorHarmonyOpen: open }),

    setGalleryViewMode: (mode) => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('imagex_gallery_view_mode', mode);
        } catch (_) {}
      }
      set({ galleryViewMode: mode });
    },
    setGallerySearchQuery: (query) => set({ gallerySearchQuery: query }),
    setGalleryColorFilter: (color) => set({ galleryColorFilter: color }),
    setGalleryTagFilter: (tag) => set({ galleryTagFilter: tag }),
    setGallerySortBy: (sortBy) => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('imagex_gallery_sort_by', sortBy);
        } catch (_) {}
      }
      set({ gallerySortBy: sortBy });
    },
    toggleGallerySortOrder: () =>
      set(state => {
        const next = state.gallerySortOrder === 'asc' ? 'desc' : 'asc';
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('imagex_gallery_sort_order', next);
          } catch (_) {}
        }
        return { gallerySortOrder: next };
      }),
    setAlbumDetailZoomCols: (cols) => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('imagex_album_zoom_cols', String(cols));
        } catch (_) {}
      }
      set({ albumDetailZoomCols: cols });
    },

    // ==========================================
    // Video Gallery Actions
    // ==========================================
    syncVideos: async () => {
      try {
        const { videos, folders } = await backendApi.fetchVideos();
        set({ videos, videoFolders: folders });
      } catch (err) {
        console.warn('Failed to sync videos:', err);
      }
    },

    uploadVideo: async (file: File, folder: string = 'Geral', fileIndex: number = 1, totalFiles: number = 1) => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);

      set({
        uploadProgress: {
          isUploading: true,
          filename: file.name,
          percent: 0,
          loaded: 0,
          total: file.size,
          speed: 0,
          currentFileIndex: fileIndex,
          totalFiles: totalFiles
        }
      });

      const res = await backendApi.uploadVideo(file, folder, (percent, loaded, total, speed) => {
        set({
          uploadProgress: {
            isUploading: true,
            filename: file.name,
            percent,
            loaded,
            total,
            speed,
            currentFileIndex: fileIndex,
            totalFiles: totalFiles
          }
        });
      });

      set({ uploadProgress: null });

      if (res) {
        await get().syncVideos();
        soundEffects.success(settings.soundEnabled);
        get().addNotification({
          title: 'Vídeo Importado',
          message: `O vídeo "${res.title}" foi importado com sucesso na pasta ${res.folder}.`,
          type: 'success'
        });
        return true;
      } else {
        get().addNotification({
          title: 'Falha na Importação',
          message: `Não foi possível importar o vídeo "${file.name}".`,
          type: 'error'
        });
        return false;
      }
    },

    importLocalPath: async (path: string, folder: string = 'Geral', mode: 'copy' | 'move' = 'copy') => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);
      const res = await backendApi.importLocalPath(path, folder, mode);
      if (res.success && res.count > 0) {
        await get().syncVideos();
        soundEffects.success(settings.soundEnabled);
        get().addNotification({
          title: 'Importação Instantânea',
          message: `${res.count} vídeo(s) importado(s) com sucesso na pasta ${folder}.`,
          type: 'success'
        });
        return true;
      } else {
        get().addNotification({
          title: 'Erro na Importação Local',
          message: res.error || 'Nenhum vídeo compatível encontrado no caminho especificado.',
          type: 'error'
        });
        return false;
      }
    },

    openVideosFolder: async (folder: string = 'Geral') => {
      const res = await backendApi.openVideosFolder(folder);
      if (res.success) {
        get().addNotification({
          title: 'Pasta Aberta',
          message: `A pasta data/videos/${res.folder || 'Geral'} foi aberta no Windows Explorer.`,
          type: 'info'
        });
        return true;
      }
      return false;
    },

    addVideoByUrl: async (url: string, folder: string = 'Geral', title?: string, streamOnly: boolean = false) => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);
      const res = await backendApi.addVideoUrl(url, folder, title, streamOnly);
      if (res) {
        await get().syncVideos();
        get().addNotification({
          title: streamOnly ? 'Stream Remoto Adicionado' : 'Vídeo Baixado',
          message: streamOnly
            ? `Vídeo remoto "${res.title}" adicionado para reprodução sem ocupar espaço local.`
            : `Vídeo "${res.title}" salvo na pasta ${res.folder}.`,
          type: 'success'
        });
        return true;
      }
      return false;
    },

    uploadPhotoAlbum: async (title: string, files: File[], folder?: string) => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);
      const targetFolder = (folder || 'Geral').trim() || 'Geral';
      const res = await backendApi.uploadPhotoAlbum(title, files, targetFolder);
      if (res && res.success) {
        const albums = await backendApi.fetchRealAlbums();
        set({ albums });
        await get().syncAlbumFolders();
        soundEffects.success(settings.soundEnabled);
        get().addNotification({
          title: 'Álbum Criado!',
          message: `O álbum "${title}" com ${files.length} fotos foi adicionado na pasta "${targetFolder}".`,
          type: 'success'
        });
        return true;
      } else {
        get().addNotification({
          title: 'Erro ao Criar Álbum',
          message: res?.error || 'Falha no envio das imagens.',
          type: 'error'
        });
        return false;
      }
    },

    createVideoFolder: async (name: string) => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);
      const ok = await backendApi.createVideoFolder(name);
      if (ok) {
        await get().syncVideos();
        get().addNotification({
          title: 'Pasta Criada',
          message: `A pasta "${name}" foi criada com sucesso no armazenamento.`,
          type: 'success'
        });
        return true;
      }
      return false;
    },

    renameVideoFolder: async (oldName: string, newName: string) => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);
      const ok = await backendApi.renameVideoFolder(oldName, newName);
      if (ok) {
        await get().syncVideos();
        if (get().activeVideoFolder === oldName) {
          set({ activeVideoFolder: newName });
        }
        get().addNotification({
          title: 'Pasta Renomeada',
          message: `Pasta renomeada de "${oldName}" para "${newName}".`,
          type: 'success'
        });
        return true;
      }
      return false;
    },

    deleteVideoFolder: async (folderName: string) => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);
      const ok = await backendApi.deleteVideoFolder(folderName);
      if (ok) {
        if (get().activeVideoFolder === folderName) {
          set({ activeVideoFolder: null });
        }
        await get().syncVideos();
        get().addNotification({
          title: 'Pasta Excluída',
          message: `Pasta "${folderName}" excluída. Os vídeos foram movidos para a pasta Geral.`,
          type: 'info'
        });
        return true;
      }
      return false;
    },

    renameVideo: async (videoId: string, title: string) => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);
      const ok = await backendApi.renameVideo(videoId, title);
      if (ok) {
        await get().syncVideos();
        get().addNotification({
          title: 'Vídeo Renomeado',
          message: `Título alterado para "${title}".`,
          type: 'success'
        });
        return true;
      }
      return false;
    },

    moveVideo: async (videoId: string, targetFolder: string) => {
      const { settings } = get();
      soundEffects.click(settings.soundEnabled);
      const ok = await backendApi.moveVideo(videoId, targetFolder);
      if (ok) {
        await get().syncVideos();
        get().addNotification({
          title: 'Vídeo Movido',
          message: `Vídeo movido para a pasta "${targetFolder}".`,
          type: 'success'
        });
        return true;
      }
      return false;
    },

    toggleVideoFavorite: async (videoId: string) => {
      const { settings } = get();
      soundEffects.star(settings.soundEnabled);
      const isFav = await backendApi.toggleVideoFavorite(videoId);
      set(state => ({
        videos: state.videos.map(v => v.id === videoId ? { ...v, isFavorite: isFav } : v),
        activePlayingVideo: state.activePlayingVideo?.id === videoId ? { ...state.activePlayingVideo, isFavorite: isFav } : state.activePlayingVideo
      }));
      return isFav;
    },

    deleteVideo: async (videoId: string) => {
      const { settings } = get();
      soundEffects.trash(settings.soundEnabled);
      const ok = await backendApi.deleteVideo(videoId);
      if (ok) {
        set(state => ({
          videos: state.videos.filter(v => v.id !== videoId),
          selectedVideoIds: state.selectedVideoIds.filter(id => id !== videoId),
          activePlayingVideo: state.activePlayingVideo?.id === videoId ? null : state.activePlayingVideo
        }));
        await get().syncVideos();
        await get().fetchTrash();
        get().addNotification({
          title: 'Vídeo Movido para a Lixeira',
          message: 'O vídeo foi enviado para a lixeira do app e pode ser restaurado a qualquer momento.',
          type: 'warning'
        });
        return true;
      }
      return false;
    },

    toggleSelectVideo: (id: string) => {
      set(state => {
        const isSelected = state.selectedVideoIds.includes(id);
        return {
          selectedVideoIds: isSelected
            ? state.selectedVideoIds.filter(item => item !== id)
            : [...state.selectedVideoIds, id]
        };
      });
    },

    selectAllVideos: (allIds: string[]) => set({ selectedVideoIds: allIds }),

    clearSelectedVideos: () => set({ selectedVideoIds: [] }),

    batchDeleteVideos: async (videoIds: string[]) => {
      const { settings } = get();
      soundEffects.trash(settings.soundEnabled);
      const deleted = await backendApi.batchDeleteVideos(videoIds);
      if (deleted.length > 0) {
        set(state => ({
          videos: state.videos.filter(v => !deleted.includes(v.id)),
          selectedVideoIds: state.selectedVideoIds.filter(id => !deleted.includes(id)),
          activePlayingVideo: state.activePlayingVideo && deleted.includes(state.activePlayingVideo.id) ? null : state.activePlayingVideo
        }));
        await get().syncVideos();
        await get().fetchTrash();
        get().addNotification({
          title: 'Vídeos Movidos para a Lixeira',
          message: `${deleted.length} vídeo(s) foram enviados para a lixeira do app.`,
          type: 'warning'
        });
        return true;
      }
      return false;
    },

    batchMoveVideos: async (videoIds: string[], targetFolder: string) => {
      const moved = await backendApi.batchMoveVideos(videoIds, targetFolder);
      if (moved.length > 0) {
        await get().syncVideos();
        set({ selectedVideoIds: [] });
        get().addNotification({
          title: 'Vídeos Transferidos',
          message: `${moved.length} vídeo(s) movido(s) para a pasta "${targetFolder}".`,
          type: 'success'
        });
        return true;
      }
      return false;
    },

    setActiveVideoFolder: (folder) => set({ activeVideoFolder: folder }),
    setVideoSearchQuery: (query) => set({ videoSearchQuery: query }),
    setVideoFilterFavoritesOnly: (favOnly) => set({ videoFilterFavoritesOnly: favOnly }),
    setActivePlayingVideo: (video) => set({ activePlayingVideo: video }),
    setActiveFolderModal: (modal) => set({ activeFolderModal: modal }),

    // Trash Bin Actions
    fetchTrash: async () => {
      try {
        const res = await backendApi.getTrash();
        set({ trashItems: res.items, trashStats: res.stats });
      } catch (err) {
        console.error('Failed to sync trash:', err);
      }
    },

    restoreTrashItems: async (trashIds: string[]) => {
      const { settings } = get();
      soundEffects.success(settings.soundEnabled);
      try {
        const restored = await backendApi.restoreTrash(trashIds);
        if (restored.length > 0) {
          const freshAlbums = await backendApi.fetchRealAlbums();
          set(state => ({
            albums: freshAlbums,
            selectedTrashIds: state.selectedTrashIds.filter(id => !restored.includes(id))
          }));
          await Promise.all([get().fetchTrash(), get().syncVideos()]);
          get().addNotification({
            title: 'Itens Restaurados',
            message: `${restored.length} item(ns) restaurado(s) com sucesso para o local original.`,
            type: 'success'
          });
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to restore trash items:', err);
        return false;
      }
    },

    permanentDeleteTrashItems: async (trashIds: string[]) => {
      const { settings } = get();
      soundEffects.trash(settings.soundEnabled);
      try {
        const deleted = await backendApi.permanentDeleteTrash(trashIds);
        if (deleted.length > 0) {
          await get().fetchTrash();
          set(state => ({
            selectedTrashIds: state.selectedTrashIds.filter(id => !deleted.includes(id))
          }));
          get().addNotification({
            title: 'Exclusão Permanente',
            message: `${deleted.length} item(ns) excluído(s) definitivamente do disco.`,
            type: 'info'
          });
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to permanently delete trash items:', err);
        return false;
      }
    },

    emptyTrashBin: async () => {
      const { settings } = get();
      soundEffects.trash(settings.soundEnabled);
      try {
        const ok = await backendApi.emptyTrash();
        if (ok) {
          set({
            trashItems: [],
            trashStats: {
              total_items: 0,
              photos_count: 0,
              videos_count: 0,
              albums_count: 0,
              total_size_bytes: 0
            },
            selectedTrashIds: []
          });
          get().addNotification({
            title: 'Lixeira Esvaziada',
            message: 'Todos os arquivos foram apagados permanentemente do disco.',
            type: 'info'
          });
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to empty trash:', err);
        return false;
      }
    },

    toggleSelectTrashItem: (id: string) => {
      set(state => ({
        selectedTrashIds: state.selectedTrashIds.includes(id)
          ? state.selectedTrashIds.filter(i => i !== id)
          : [...state.selectedTrashIds, id]
      }));
    },

    selectAllTrashItems: (allIds: string[]) => {
      set({ selectedTrashIds: allIds });
    },

    clearSelectedTrashItems: () => {
      set({ selectedTrashIds: [] });
    },

    setTrashFilterType: (type: 'all' | 'photo' | 'video' | 'album') => {
      set({ trashFilterType: type });
    },

    setTrashSearchQuery: (query: string) => {
      set({ trashSearchQuery: query });
    },

    setMediaTypeFilter: (filter: 'all' | 'images' | 'videos' | 'gifs') => {
      set({ mediaTypeFilter: filter });
    },

    saveExtractedVideoToGallery: async (videoUrl: string, title?: string, folder?: string, sourceUrl?: string) => {
      const { settings } = get();
      try {
        const result = await backendApi.saveExtractedVideoToGallery(videoUrl, title, folder, sourceUrl);
        if (result.success && result.job_id) {
          const newJob: ExtractionJob = {
            id: result.job_id,
            url: videoUrl,
            title: `Salvar Vídeo: ${title || 'Vídeo Extraído'}`,
            status: 'active',
            mode: 'video_save' as any,
            progressPercent: 1,
            discoveredImagesCount: 1,
            resolvedOriginalCount: 0,
            failedCount: 0,
            currentStage: 'Iniciando download em segundo plano...',
            startTime: new Date().toISOString(),
            durationSeconds: 0,
            throughputMbps: 0,
            fps: 60,
            aiModel: 'Direct Stream Downloader',
            folder: folder || 'Extraídos'
          };

          // Marcação imediata no estado otimista da UI para exibir a tag Salvo em [Pasta] na hora
          get().markItemAsSavedOptimistically({
            url: videoUrl,
            title,
            folder: folder || 'Extraídos',
            targetId: result.job_id,
            targetView: 'videos'
          });

          set(state => ({
            jobs: [newJob, ...state.jobs.filter(j => j.id !== result.job_id)],
            activeJob: newJob,
            activeJobs: [newJob, ...state.activeJobs.filter(j => j.id !== result.job_id)]
          }));
          get().addNotification({
            title: 'Download Iniciado em 2º Plano',
            message: `"${title || 'Vídeo'}" está sendo salvo. Acompanhe o progresso na Gestão de Tarefas.`,
            type: 'info'
          });
          triggerJobsPollingLoop();
          return true;
        } else if (result.success) {
          get().markItemAsSavedOptimistically({
            url: videoUrl,
            title,
            folder: folder || 'Extraídos',
            targetId: result.video?.id,
            targetView: 'videos'
          });
          soundEffects.success(settings.soundEnabled);
          await get().syncVideos();
          get().addNotification({
            title: 'Vídeo Salvo na Galeria',
            message: `"${title || 'Vídeo'}" foi salvo na pasta "${folder || 'Extraídos'}".`,
            type: 'success'
          });
          return true;
        } else {
          get().addNotification({
            title: 'Erro ao Iniciar Salvamento',
            message: result.error || 'Não foi possível iniciar o download do vídeo.',
            type: 'error'
          });
          return false;
        }
      } catch (err) {
        console.error('saveExtractedVideoToGallery failed:', err);
        return false;
      }
    },

    markItemAsSavedOptimistically: (params: { url?: string; title?: string; folder: string; targetId?: string; targetView?: 'videos' | 'gallery' }) => {
      const { url, title, folder, targetId, targetView = 'videos' } = params;
      const targetFolder = folder || (targetView === 'videos' ? 'Extraídos' : 'Geral');
      const now = Date.now();
      const newEntries: Record<string, { folder: string; targetId: string; targetView: 'videos' | 'gallery'; timestamp: number }> = {};
      const entry = { folder: targetFolder, targetId: targetId || '', targetView, timestamp: now };

      if (url) {
        newEntries[url] = entry;
        newEntries[url.split('?')[0].toLowerCase()] = entry;
      }
      if (title) {
        const fp = getCanonicalMediaFingerprint(title, url);
        newEntries[fp] = entry;
        newEntries[title.toLowerCase().trim()] = entry;
      }

      set(state => ({
        optimisticSavedItems: {
          ...state.optimisticSavedItems,
          ...newEntries
        }
      }));
    },

    setHighlightedItemId: (id: string | null) => set({ highlightedItemId: id }),

    navigateToSavedItem: (targetView: 'videos' | 'gallery', folder: string, itemId: string) => {
      set({
        highlightedItemId: itemId,
        activeAlbumFolder: targetView === 'gallery' ? (folder || null) : null,
        activeVideoFolder: targetView === 'videos' ? (folder || null) : null,
      });

      if (targetView === 'videos') {
        set({ videoSearchQuery: '', videoFilterFavoritesOnly: false });
        get().navigateToView('videos');
      } else {
        set({ gallerySearchQuery: '', galleryTagFilter: null, galleryColorFilter: null });
        get().navigateToView('gallery');
      }

      // Automatically clear highlight after 5 seconds
      setTimeout(() => {
        if (get().highlightedItemId === itemId) {
          set({ highlightedItemId: null });
        }
      }, 5000);
    },

    checkItemSavedStatus: (params: {
      url?: string;
      title?: string;
      height?: number;
      width?: number;
      candidateId?: string;
      mediaType?: 'photo' | 'video' | 'album' | string;
    }) => {
      const { videos, albums, optimisticSavedItems } = get();
      const { url, title, height } = params;

      // 0. Verificação Otimista Imediata (exibe a tag "Salvo em [Pasta]" sem esperar o download)
      if (url && optimisticSavedItems[url]) {
        const opt = optimisticSavedItems[url];
        return {
          isSaved: true,
          isExactDuplicate: true,
          hasAlternativeResolution: false,
          savedFolder: opt.folder,
          folder: opt.folder,
          targetId: opt.targetId,
          targetView: opt.targetView
        };
      }
      if (url && optimisticSavedItems[url.split('?')[0].toLowerCase()]) {
        const opt = optimisticSavedItems[url.split('?')[0].toLowerCase()];
        return {
          isSaved: true,
          isExactDuplicate: true,
          hasAlternativeResolution: false,
          savedFolder: opt.folder,
          folder: opt.folder,
          targetId: opt.targetId,
          targetView: opt.targetView
        };
      }
      const targetFingerprint = getCanonicalMediaFingerprint(title, url, height);
      if (optimisticSavedItems[targetFingerprint]) {
        const opt = optimisticSavedItems[targetFingerprint];
        return {
          isSaved: true,
          isExactDuplicate: true,
          hasAlternativeResolution: false,
          savedFolder: opt.folder,
          folder: opt.folder,
          targetId: opt.targetId,
          targetView: opt.targetView
        };
      }

      const cleanTitle = (title || '').toLowerCase().trim();
      const normTitle = cleanTitle.replace(/[_\-\.\s]+/g, ' ');

      const extractKey = (u?: string) => {
        if (!u) return '';
        const mPh = u.match(/viewkey=([a-zA-Z0-9]+)/i);
        if (mPh) return mPh[1];
        const mEp = u.match(/video-([a-zA-Z0-9]{6,})/i);
        if (mEp) return mEp[1];
        const mPvv = u.match(/\/videos\/(-?\d+\/\d+\/[a-zA-Z0-9_]+)/i);
        if (mPvv) return mPvv[1];
        return u.split('?')[0].toLowerCase();
      };

      const targetKey = extractKey(url);

      // 1. Verificar em Vídeos Salvos na Galeria
      for (const v of videos) {
        const vKey = extractKey(v.sourceUrl || v.url);
        const vFingerprint = getCanonicalMediaFingerprint(v.title, v.sourceUrl || v.url, v.height);
        const sameFingerprint = Boolean(targetFingerprint && vFingerprint && targetFingerprint === vFingerprint);
        const vTitleNorm = (v.title || '').toLowerCase().replace(/[_\-\.\s]+/g, ' ');
        const sameSource = Boolean(targetKey && vKey && targetKey === vKey);
        const sameTitle = Boolean(normTitle && vTitleNorm && (normTitle === vTitleNorm || normTitle.includes(vTitleNorm) || vTitleNorm.includes(normTitle)));

        if (sameFingerprint || sameSource || (sameTitle && normTitle.length > 8)) {
          const vH = (v as any).height || ((v as any).resolution && parseInt(String((v as any).resolution).split('x')[1] || String((v as any).resolution))) || 0;
          const targetH = height || 0;

          if (targetH > 0 && vH > 0 && Math.abs(targetH - vH) > 50) {
            const qual = vH >= 1080 ? '1080p HD' : (vH >= 720 ? '720p HD' : `${vH}p`);
            return {
              isSaved: true,
              isExactDuplicate: false,
              hasAlternativeResolution: true,
              savedFolder: v.folder || 'Extraídos',
              folder: v.folder || 'Extraídos',
              targetId: v.id,
              targetView: 'videos' as const,
              qualityLabel: qual,
            };
          } else {
            return {
              isSaved: true,
              isExactDuplicate: true,
              hasAlternativeResolution: false,
              savedFolder: v.folder || 'Extraídos',
              folder: v.folder || 'Extraídos',
              targetId: v.id,
              targetView: 'videos' as const,
            };
          }
        }
      }

      // 2. Verificar em Álbuns Salvos na Galeria
      for (const a of albums) {
        const aKey = extractKey(a.sourceUrl);
        const aFingerprint = getCanonicalMediaFingerprint(a.title, a.sourceUrl);
        const sameFingerprint = Boolean(targetFingerprint && aFingerprint && targetFingerprint === aFingerprint);
        const aTitleNorm = (a.title || '').toLowerCase().replace(/[_\-\.\s]+/g, ' ');
        const sameSource = Boolean(targetKey && aKey && targetKey === aKey);
        const sameTitle = Boolean(normTitle && aTitleNorm && normTitle === aTitleNorm);

        if (sameFingerprint || sameSource || (sameTitle && normTitle.length > 8)) {
          return {
            isSaved: true,
            isExactDuplicate: true,
            hasAlternativeResolution: false,
            savedFolder: a.folder || 'Geral',
            folder: a.folder || 'Geral',
            targetId: a.id,
            targetView: 'gallery' as const,
          };
        }
      }

      return {
        isSaved: false,
        isExactDuplicate: false,
        hasAlternativeResolution: false,
        savedFolder: '',
        folder: '',
        targetId: '',
        targetView: 'videos' as const,
      };
    },
  };
});
