import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  Info,
  Sparkles,
  Sliders,
  Columns,
  Star,
  MapPin,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Play,
  Maximize2,
  Minimize2,
  BookmarkCheck,
  Loader2
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { formatFileSize } from '../../utils/formatters';

export const LightboxModal: React.FC = () => {
  const {
    lightboxImage,
    lightboxAlbum,
    closeLightbox,
    openLightbox,
    setSlideshowOpen,
    setAlbumCover
  } = useAppStore();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [splitPos, setSplitPos] = useState(50); // 0 to 100%
  const [showSplitCompare, setShowSplitCompare] = useState(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCoverUpdating, setIsCoverUpdating] = useState(false);

  // Filmstrip Carousel Interactive Controls
  const filmstripRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);
  const [isFilmstripDragging, setIsFilmstripDragging] = useState(false);
  const [filmstripStartX, setFilmstripStartX] = useState(0);
  const [filmstripScrollLeft, setFilmstripScrollLeft] = useState(0);

  // Auto-scroll filmstrip to keep active thumbnail smoothly centered
  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    }
  }, [lightboxImage?.id]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      const el = document.documentElement as any;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        req.call(el).then(() => setIsFullscreen(true)).catch(() => setIsFullscreen(true));
      } else {
        setIsFullscreen(true);
      }
    } else {
      const ex = document.exitFullscreen || (document as any).webkitExitFullscreen;
      if (ex) {
        ex.call(document).then(() => setIsFullscreen(false)).catch(() => setIsFullscreen(false));
      } else {
        setIsFullscreen(false);
      }
    }
  };

  const handleStartSlideshow = () => {
    if (!lightboxAlbum) return;
    closeLightbox();
    useAppStore.setState({ activeAlbumId: lightboxAlbum.id });
    setSlideshowOpen(true);
  };

  // Reset zoom & pan when image changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [lightboxImage]);

  // Keyboard controls with full support for shortcuts
  useEffect(() => {
    if (!lightboxImage || !lightboxAlbum) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key.toLowerCase() === 'z') {
        setZoom(z => (z === 1 ? 2.5 : 1));
        setPan({ x: 0, y: 0 });
      } else if (e.key.toLowerCase() === 'c') {
        setShowSplitCompare(s => !s);
      } else if (e.key.toLowerCase() === 'd') {
        handleDownload();
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, lightboxAlbum]);

  if (!lightboxImage || !lightboxAlbum) return null;

  const albumImages = lightboxAlbum.images || [];
  const currentIndex = albumImages.findIndex(i => i.id === lightboxImage.id);

  const isVideoItem =
    lightboxImage.mediaType === 'video' ||
    !!lightboxImage.videoUrl ||
    !!(lightboxImage as any).videoStreamUrl ||
    !!(lightboxImage as any).is_video ||
    /\.(mp4|webm|m4v|mov)(\?|$)/i.test(lightboxImage.originalUrl || '') ||
    (lightboxImage.originalUrl || '').includes('/stream');

  const videoSrc = lightboxImage.videoUrl || (lightboxImage as any).videoStreamUrl || lightboxImage.originalUrl;

  const isGifItem =
    lightboxImage.mediaType === 'gif' ||
    lightboxImage.isAnimated ||
    lightboxImage.format === 'gif' ||
    lightboxImage.format === 'webp' ||
    /\.(gif|webp)(\?|$)/i.test(lightboxImage.originalUrl || '') ||
    /\.(gif|webp)(\?|$)/i.test(lightboxImage.thumbnailUrl || '');

  const handleNext = () => {
    if (albumImages.length === 0) return;
    if (currentIndex >= 0 && currentIndex < albumImages.length - 1) {
      openLightbox(albumImages[currentIndex + 1], lightboxAlbum);
    } else {
      openLightbox(albumImages[0], lightboxAlbum);
    }
  };

  const handlePrev = () => {
    if (albumImages.length === 0) return;
    if (currentIndex > 0) {
      openLightbox(albumImages[currentIndex - 1], lightboxAlbum);
    } else {
      openLightbox(albumImages[albumImages.length - 1], lightboxAlbum);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const scrollFilmstrip = (direction: 'left' | 'right') => {
    if (filmstripRef.current) {
      const scrollAmount = direction === 'left' ? -260 : 260;
      filmstripRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleFilmstripWheel = (e: React.WheelEvent) => {
    if (filmstripRef.current) {
      filmstripRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleFilmstripMouseDown = (e: React.MouseEvent) => {
    if (!filmstripRef.current) return;
    setIsFilmstripDragging(true);
    setFilmstripStartX(e.pageX - filmstripRef.current.offsetLeft);
    setFilmstripScrollLeft(filmstripRef.current.scrollLeft);
  };

  const handleFilmstripMouseMove = (e: React.MouseEvent) => {
    if (!isFilmstripDragging || !filmstripRef.current) return;
    e.preventDefault();
    const x = e.pageX - filmstripRef.current.offsetLeft;
    const walk = (x - filmstripStartX) * 1.5;
    filmstripRef.current.scrollLeft = filmstripScrollLeft - walk;
  };

  const handleFilmstripMouseUp = () => {
    setIsFilmstripDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      setZoom(z => Math.min(8, z + 0.25));
    } else {
      setZoom(z => Math.max(1, z - 0.25));
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 45) {
      handleNext();
    } else if (diff < -45) {
      handlePrev();
    }
    setTouchStartX(null);
  };

  const handleCopyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1500);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    const fileExt = isVideoItem ? 'mp4' : isGifItem ? (lightboxImage.format || 'gif') : 'jpg';
    link.href = isVideoItem ? videoSrc : (lightboxImage.originalUrl || lightboxImage.rawOriginalUrl || lightboxImage.thumbnailUrl);
    link.download = `${lightboxImage.title || (isVideoItem ? 'video' : isGifItem ? 'animacao' : 'original-image')}.${fileExt}`;
    link.target = '_blank';
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col select-none animate-fade-in">
      {/* Top Floating Toolbar with iOS Safe Area */}
      <div className="pt-safe px-3 sm:px-4 py-2 border-b border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 z-20 bg-black/60 backdrop-blur-md">
        {/* Left Info Cluster */}
        <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={closeLightbox}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 shrink-0"
              title="Fechar (Esc)"
            >
              <X size={18} />
            </button>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-extrabold text-white truncate max-w-[200px] sm:max-w-md">
                {lightboxImage.title}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400 font-mono truncate">
                {currentIndex + 1} de {(lightboxAlbum.images || []).length} • {lightboxImage.width && lightboxImage.height ? `${lightboxImage.width}×${lightboxImage.height}` : 'Dim. N/D'} ({lightboxImage.aspectRatio || 'auto'}) • {formatFileSize(lightboxImage.fileSizeBytes)} • <span className={isVideoItem ? "text-violet-400 font-bold" : isGifItem ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>{isVideoItem ? "VÍDEO" : isGifItem ? "GIF ANIMADO" : "ORIGINAL"}</span>
              </p>
            </div>
          </div>

          {/* Mobile Quick Info Toggle */}
          <button
            onClick={() => setShowInfoDrawer(!showInfoDrawer)}
            className={`sm:hidden p-2 rounded-xl border transition-all shrink-0 ${
              showInfoDrawer ? 'bg-brand-500 border-brand-400 text-white shadow-glow-brand' : 'bg-white/10 border-white/10 text-slate-300'
            }`}
            title="Especificações Técnicas"
          >
            <Info size={16} />
          </button>
        </div>

        {/* Center & Right Action Tools in Spotify/Instagram Style Touch-Scroll Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar touch-scroll py-0.5">
          {/* Split Comparator (Only for still images) */}
          {!isVideoItem && (
            <button
              onClick={() => setShowSplitCompare(!showSplitCompare)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                showSplitCompare
                  ? 'bg-brand-500 text-white shadow-glow-brand ring-2 ring-brand-400/50'
                  : 'bg-white/10 hover:bg-white/20 text-slate-200'
              }`}
              title="Comparar miniatura vs Original Full-Res (Tecla C)"
            >
              <Columns size={14} className="shrink-0" />
              <span>Comparador Split (Original)</span>
            </button>
          )}

          {/* Zoom In/Out Controls */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-white/10 shrink-0">
            <button
              onClick={() => setZoom(z => Math.max(1, z - 0.5))}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              title="Reduzir Zoom"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-xs font-mono text-slate-200 w-11 text-center font-bold">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(8, z + 0.5))}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              title="Aumentar Zoom"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          {/* Slideshow Mode Button */}
          <button
            onClick={handleStartSlideshow}
            className="px-3 py-1.5 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-300 hover:bg-brand-500/30 text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-sm"
            title="Iniciar Apresentação Automática de Slides"
          >
            <Play size={13} className="fill-current shrink-0" />
            <span>Slideshow</span>
          </button>

          {/* Fullscreen Toggle Button */}
          <button
            onClick={toggleFullscreen}
            className={`p-2 rounded-xl border transition-all shrink-0 ${
              isFullscreen
                ? 'bg-brand-500 border-brand-400 text-white shadow-glow-brand'
                : 'bg-white/10 border-white/10 text-slate-300 hover:text-white'
            }`}
            title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>



          {/* Definir como Capa do Álbum */}
          {(() => {
            const imgTargetUrl = lightboxImage.rawOriginalUrl || lightboxImage.originalUrl || lightboxImage.rawThumbnailUrl || lightboxImage.thumbnailUrl;
            const isCurrentCover = !!(
              (lightboxAlbum.rawCoverImage && (lightboxImage.rawOriginalUrl === lightboxAlbum.rawCoverImage || lightboxImage.originalUrl === lightboxAlbum.rawCoverImage || lightboxImage.rawThumbnailUrl === lightboxAlbum.rawCoverImage || lightboxImage.thumbnailUrl === lightboxAlbum.rawCoverImage)) ||
              (lightboxAlbum.coverImage && (lightboxImage.originalUrl === lightboxAlbum.coverImage || lightboxImage.thumbnailUrl === lightboxAlbum.coverImage || lightboxImage.rawOriginalUrl === lightboxAlbum.coverImage))
            );

            return (
              <button
                onClick={async () => {
                  if (imgTargetUrl) {
                    setIsCoverUpdating(true);
                    await setAlbumCover(lightboxAlbum.id, imgTargetUrl);
                    setTimeout(() => setIsCoverUpdating(false), 1000);
                  }
                }}
                disabled={isCoverUpdating}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-sm ${
                  isCurrentCover
                    ? 'bg-amber-500 border-amber-400 text-white shadow-glow-brand'
                    : 'bg-white/10 border-white/10 text-slate-300 hover:text-white hover:bg-amber-600/30 hover:border-amber-500/50'
                }`}
                title={isCurrentCover ? 'Esta foto é a capa atual da galeria' : 'Definir esta foto como miniatura/capa do álbum'}
              >
                {isCoverUpdating ? (
                  <Loader2 size={13} className="animate-spin text-amber-300" />
                ) : (
                  <BookmarkCheck size={14} className={isCurrentCover ? 'text-white' : 'text-amber-300'} />
                )}
                <span className="hidden sm:inline">{isCurrentCover ? 'Capa Atual' : 'Definir Capa'}</span>
              </button>
            );
          })()}

          {/* Download Original Button */}
          <button
            onClick={handleDownload}
            className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-glow-brand whitespace-nowrap shrink-0"
            title="Download Imagem Resolução Original (Tecla D)"
          >
            <Download size={14} className="shrink-0" />
            <span>Baixar Original</span>
          </button>

          {/* Desktop Info Toggle */}
          <button
            onClick={() => setShowInfoDrawer(!showInfoDrawer)}
            className={`hidden sm:flex p-2 rounded-xl border transition-all shrink-0 ${
              showInfoDrawer ? 'bg-white/20 border-white/40 text-white' : 'bg-white/10 border-white/10 text-slate-400 hover:text-white'
            }`}
            title="Painel EXIF & Metadados"
          >
            <Info size={16} />
          </button>
        </div>
      </div>

      {/* Main Viewport Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas Center Area */}
        <div
          className="flex-1 relative flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Split Resolution Comparator Mode (Images only) */}
          {showSplitCompare && !isVideoItem ? (
            <div className="relative max-w-4xl max-h-[80vh] w-full h-full flex items-center justify-center p-3 sm:p-4">
              <div className="relative overflow-hidden rounded-3xl border border-white/20 shadow-2xl max-h-[75vh] flex items-center justify-center">
                {/* Original High-Res Original (Bottom) */}
                <img
                  src={lightboxImage.originalUrl}
                  alt="Resolução Original"
                  className="max-h-[75vh] w-auto object-contain pointer-events-none select-none"
                />

                {/* Web Thumbnail (Top Clipped with authentic pixels) */}
                <img
                  src={lightboxImage.thumbnailUrl}
                  alt="Source Thumbnail"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                  style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                />

                {/* Vertical Divider Line */}
                <div
                  className="absolute inset-y-0 w-0.5 bg-brand-400 pointer-events-none shadow-glow-brand"
                  style={{ left: `${splitPos}%` }}
                />

                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-black/80 backdrop-blur-md text-[10px] font-mono text-amber-400 font-bold border border-amber-500/30 shadow-lg pointer-events-none">
                  Origem da Página (Miniatura)
                </div>

                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-xl bg-black/80 backdrop-blur-md text-[10px] font-mono text-emerald-400 font-bold border border-emerald-500/30 shadow-lg pointer-events-none">
                  Original Descoberto ({lightboxImage.width}×{lightboxImage.height})
                </div>

                {/* Slider Handle */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={splitPos}
                  onChange={e => setSplitPos(Number(e.target.value))}
                  className="absolute inset-x-0 bottom-5 w-3/4 mx-auto cursor-ew-resize z-30"
                />
              </div>
            </div>
          ) : isVideoItem ? (
            /* Full Native Video Player Surface */
            <div
              className="max-h-[78vh] max-w-[92vw] w-full flex flex-col items-center justify-center relative rounded-2xl overflow-hidden bg-black shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                key={lightboxImage.id || videoSrc}
                src={videoSrc}
                controls
                autoPlay
                playsInline
                preload="auto"
                className="max-h-[78vh] max-w-[92vw] object-contain rounded-2xl"
              >
                Seu navegador não suporta reprodução deste vídeo.
              </video>
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-black/80 backdrop-blur-md text-[10px] font-mono text-violet-300 font-bold border border-violet-500/40 shadow-lg pointer-events-none flex items-center gap-1.5 z-20">
                <Play size={12} className="fill-violet-400" />
                <span>VÍDEO ({lightboxImage.width && lightboxImage.height ? `${lightboxImage.width}×${lightboxImage.height}` : 'HD'})</span>
              </div>
            </div>
          ) : (
            <div
              className="relative transition-transform duration-75 flex items-center justify-center"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <img
                src={lightboxImage.originalUrl || lightboxImage.rawOriginalUrl || lightboxImage.thumbnailUrl}
                alt={lightboxImage.title}
                className="max-h-[82vh] max-w-[92vw] min-w-[280px] object-contain rounded-2xl shadow-2xl pointer-events-none select-none"
              />
              {isGifItem && (
                <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-black/85 backdrop-blur-md text-[11px] font-mono text-amber-300 font-bold border border-amber-500/40 shadow-lg pointer-events-none flex items-center gap-2 z-20">
                  <Play size={12} className="fill-amber-400 text-amber-400" />
                  <span>GIF ANIMADO ({lightboxImage.width && lightboxImage.height ? `${lightboxImage.width}×${lightboxImage.height}` : 'HD'} • {formatFileSize(lightboxImage.fileSizeBytes)})</span>
                </div>
              )}
            </div>

          )}

          {/* Navigation Arrows */}
          <button
            onClick={handlePrev}
            className="absolute left-3 sm:left-4 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/10 transition-all hover:scale-110 active:scale-95 shadow-xl"
            title="Anterior (Seta Esquerda)"
          >
            <ChevronLeft size={22} />
          </button>

          <button
            onClick={handleNext}
            className="absolute right-3 sm:right-4 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/10 transition-all hover:scale-110 active:scale-95 shadow-xl"
            title="Próxima (Seta Direita)"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Right EXIF & Metadata Inspector Drawer */}
        {showInfoDrawer && (
          <aside className="absolute md:relative inset-y-0 right-0 z-30 w-full sm:w-80 border-l border-white/10 bg-surface-elevated/95 backdrop-blur-2xl p-4 overflow-y-auto space-y-5 text-xs text-slate-300 shadow-2xl touch-scroll">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Info size={14} className="text-brand-400" />
                Especificações Técnicas
              </h4>
              <button
                onClick={() => setShowInfoDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            {/* Clickable Source Link Card (New Feature!) */}
            {lightboxAlbum.sourceUrl && (
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ExternalLink size={14} className="text-brand-400" />
                  Origem do Álbum
                </h4>
                <a
                  href={lightboxAlbum.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 rounded-2xl bg-brand-600/10 border border-brand-500/30 hover:bg-brand-600/20 text-brand-300 hover:text-brand-200 transition-all group shadow-sm"
                  title="Abrir página web de origem em nova aba"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-bold text-xs block truncate text-slate-100 group-hover:text-brand-300">
                      {lightboxAlbum.sourceDomain}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono block truncate">
                      {lightboxAlbum.sourceUrl}
                    </span>
                  </div>
                  <ExternalLink size={14} className="shrink-0 text-brand-400 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            )}

            {/* Technical Resolution Specs */}
            <div className="grid grid-cols-2 gap-2 bg-surface/60 p-3 rounded-2xl border border-white/5 font-mono text-[11px]">
              <div>
                <span className="text-slate-500 block">Resolução</span>
                <span className="text-emerald-400 font-bold">{lightboxImage.width} × {lightboxImage.height}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Megapixels</span>
                <span className="text-slate-200 font-bold">{lightboxImage.megapixels} MP</span>
              </div>
              <div>
                <span className="text-slate-500 block">Proporção</span>
                <span className="text-slate-200">{lightboxImage.aspectRatio}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Tamanho em Disco</span>
                <span className="text-slate-200 font-mono">{formatFileSize(lightboxImage.fileSizeBytes, 'Não informado')}</span>
              </div>
            </div>

            {/* Quality & Aesthetic Scores */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Star size={14} className="text-amber-400" />
                Avaliação de Qualidade IA
              </h4>
              <div className="space-y-2 bg-surface/60 p-3 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">Score Estético:</span>
                  <span className="font-bold text-amber-400 font-mono">{lightboxImage.aestheticScore} / 10</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">Nitidez / Sharpness:</span>
                  <span className="font-bold text-emerald-400 font-mono">{lightboxImage.sharpnessScore}%</span>
                </div>
              </div>
            </div>

            {/* Dominant Color Palette */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
                Paleta de Cores Dominantes
              </h4>
              <div className="grid grid-cols-4 gap-1.5">
                {(lightboxImage.colorPalette || []).map(hex => (
                  <button
                    key={hex}
                    onClick={() => handleCopyHex(hex)}
                    className="h-9 rounded-xl border border-white/10 relative group transition-transform hover:scale-105 active:scale-95 shadow-sm"
                    style={{ backgroundColor: hex }}
                    title={`Copiar ${hex}`}
                  >
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/60 text-[9px] font-mono text-white rounded-xl">
                      {copiedHex === hex ? <Check size={10} /> : <Copy size={10} />}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Geolocation GPS */}
            {lightboxImage.gps && (
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MapPin size={14} className="text-rose-400" />
                  Localização GPS
                </h4>
                <div className="bg-surface/60 p-3 rounded-2xl border border-white/5 text-[11px]">
                  <div className="font-semibold text-slate-100">{lightboxImage.gps.locationName}</div>
                  <div className="text-slate-400 font-mono text-[10px] mt-0.5">
                    {lightboxImage.gps.latitude.toFixed(4)}, {lightboxImage.gps.longitude.toFixed(4)}
                  </div>
                </div>
              </div>
            )}

            {/* In-Image OCR Text */}
            {lightboxImage.inImageText && (
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText size={14} className="text-brand-400" />
                  Texto Detectado (OCR)
                </h4>
                <div className="bg-surface/60 p-3 rounded-2xl border border-white/5 text-[11px] font-mono text-slate-300">
                  "{lightboxImage.inImageText}"
                </div>
              </div>
            )}


          </aside>
        )}
      </div>

      {/* Bottom Filmstrip Carousel with Side Navigation Arrows */}
      <div className="h-16 sm:h-20 border-t border-white/10 px-2 sm:px-4 flex items-center gap-1.5 sm:gap-2 bg-black/80 backdrop-blur-xl z-20 pb-safe relative select-none">
        {/* Scroll Left Button */}
        <button
          onClick={() => scrollFilmstrip('left')}
          className="h-10 w-7 sm:w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all shrink-0 active:scale-95 z-10"
          title="Rolar miniaturas para esquerda"
        >
          <ChevronLeft size={18} />
        </button>

        {/* Scrollable Track */}
        <div
          ref={filmstripRef}
          onWheel={handleFilmstripWheel}
          onMouseDown={handleFilmstripMouseDown}
          onMouseMove={handleFilmstripMouseMove}
          onMouseUp={handleFilmstripMouseUp}
          onMouseLeave={handleFilmstripMouseUp}
          className={`flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar touch-scroll py-2 ${
            isFilmstripDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {(lightboxAlbum.images || []).map((img, idx) => {
            const isActive = img.id === lightboxImage.id;
            return (
              <button
                key={img.id}
                ref={isActive ? activeThumbRef : null}
                onClick={() => openLightbox(img, lightboxAlbum)}
                className={`relative flex-shrink-0 h-11 w-11 sm:h-14 sm:w-14 rounded-xl overflow-hidden border transition-all duration-200 ${
                  isActive
                    ? 'border-brand-400 scale-105 shadow-glow-brand ring-2 ring-brand-500/50 opacity-100 z-10'
                    : 'border-white/10 opacity-50 hover:opacity-90 hover:border-white/30'
                }`}
                title={`Foto #${idx + 1} - ${img.title || 'Sem título'}`}
              >
                <img
                  src={img.thumbnailUrl}
                  alt={img.title}
                  className="w-full h-full object-cover pointer-events-none"
                  onError={(e) => {
                    if (img.rawThumbnailUrl && e.currentTarget.src !== img.rawThumbnailUrl) {
                      e.currentTarget.src = img.rawThumbnailUrl;
                    }
                  }}
                />
                <span className="absolute bottom-0.5 right-1 text-[8px] font-mono font-bold text-white/90 bg-black/70 px-1 rounded">
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Scroll Right Button */}
        <button
          onClick={() => scrollFilmstrip('right')}
          className="h-10 w-7 sm:w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all shrink-0 active:scale-95 z-10"
          title="Rolar miniaturas para direita"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};
