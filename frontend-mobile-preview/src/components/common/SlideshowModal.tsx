import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Gauge,
  Sparkles
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const SlideshowModal: React.FC = () => {
  const { slideshowOpen, setSlideshowOpen, albums, activeAlbumId } = useAppStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedSeconds, setSpeedSeconds] = useState(3); // 1s, 2s, 3s, 5s, 10s
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const currentAlbum = albums.find(a => a.id === activeAlbumId) || albums[0];
  const images = currentAlbum?.images || [];

  // Interval timer based on dynamic speed
  useEffect(() => {
    if (!slideshowOpen || !isPlaying || images.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(i => (i + 1) % images.length);
    }, speedSeconds * 1000);
    return () => clearInterval(interval);
  }, [slideshowOpen, isPlaying, images.length, speedSeconds]);

  // Fullscreen state listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        setIsImmersive(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Full desktop keyboard navigation (Escape, Space, ArrowLeft, ArrowRight, F)
  useEffect(() => {
    if (!slideshowOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        setSlideshowOpen(false);
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex(i => (i + 1) % images.length);
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex(i => (i > 0 ? i - 1 : images.length - 1));
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slideshowOpen, images.length]);

  if (!slideshowOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];
  const dominantColor = currentImage?.colorPalette?.[0] || '#3b82f6';

  const toggleFullscreen = () => {
    // Check if browser supports HTML5 Fullscreen API (Desktop / Android / Mac)
    if (document.fullscreenEnabled || (document.documentElement as any).webkitRequestFullscreen) {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        const el = document.documentElement as any;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (req) {
          req.call(el).then(() => {
            setIsFullscreen(true);
            setIsImmersive(true);
          }).catch(() => {
            // Fallback for iOS Safari
            setIsImmersive(prev => !prev);
          });
        } else {
          setIsImmersive(prev => !prev);
        }
      } else {
        const doc = document as any;
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
        if (exit) exit.call(doc).catch(() => {});
        setIsFullscreen(false);
        setIsImmersive(false);
      }
    } else {
      // iOS Safari iPhone Immersive Fallback (Auto-hides UI for 100% borderless theater view)
      setIsImmersive(prev => !prev);
    }
  };

  const speedOptions = [1, 2, 3, 5, 10];

  return (
    <div
      onClick={() => isImmersive && setIsImmersive(false)}
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center select-none animate-fade-in overflow-hidden"
    >
      {/* Ambient Glow matching dominant color */}
      <div
        className="absolute inset-0 opacity-40 filter blur-[120px] transition-all duration-1000 pointer-events-none scale-125"
        style={{ backgroundColor: dominantColor }}
      ></div>

      {/* Top Floating Bar with iOS Safe Area & Immersive Fade */}
      <div
        onClick={e => e.stopPropagation()}
        className={`absolute top-4 inset-x-4 sm:inset-x-6 flex items-center justify-between z-20 pt-safe transition-opacity duration-300 ${
          isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="text-white text-xs font-semibold bg-black/60 px-3.5 py-1.5 rounded-full backdrop-blur-md border border-white/10 flex items-center gap-2 max-w-[260px] sm:max-w-md truncate shadow-lg">
          <span className="truncate">{currentAlbum.title}</span>
          <span className="text-brand-400 font-mono font-bold shrink-0">
            ({currentIndex + 1}/{images.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Fullscreen / Immersive Button */}
          <button
            onClick={toggleFullscreen}
            className={`p-2 rounded-full transition-all border active:scale-95 shadow-lg ${
              isImmersive || isFullscreen
                ? 'bg-brand-600 text-white border-brand-400 shadow-glow-brand'
                : 'bg-black/60 text-white hover:bg-black/90 border-white/10'
            }`}
            title={isImmersive || isFullscreen ? 'Sair do Modo Imersivo' : 'Tela Cheia / Modo Imersivo'}
          >
            {isImmersive || isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          {/* Close Button */}
          <button
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => {});
              }
              setSlideshowOpen(false);
            }}
            className="p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-all border border-white/10 active:scale-95 shadow-lg"
            title="Fechar Apresentação"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Slide with Ken Burns Effect */}
      <div className="relative max-w-6xl max-h-[88vh] w-full h-full flex items-center justify-center p-3 sm:p-6 z-10">
        <img
          key={currentImage.id}
          src={currentImage.originalUrl}
          alt={currentImage.title}
          className={`object-contain rounded-2xl shadow-2xl animate-fade-in transition-all duration-700 pointer-events-none ${
            isImmersive ? 'max-h-[96vh] max-w-[96vw]' : 'max-h-[78vh] max-w-[90vw]'
          }`}
        />
      </div>

      {/* Bottom Floating Control Pill with Velocity & Immersive Fade */}
      <div
        onClick={e => e.stopPropagation()}
        className={`absolute bottom-6 flex items-center gap-2 sm:gap-3 bg-black/80 backdrop-blur-xl px-4 sm:px-5 py-2 rounded-full border border-white/15 z-20 shadow-2xl pb-safe transition-opacity duration-300 ${
          isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <button
          onClick={() => setCurrentIndex(i => (i > 0 ? i - 1 : images.length - 1))}
          className="text-slate-300 hover:text-white p-1.5 transition-transform active:scale-90"
          title="Anterior"
        >
          <ChevronLeft size={20} />
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-10 h-10 rounded-full bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center shadow-glow-brand transition-all active:scale-95"
          title={isPlaying ? 'Pausar' : 'Reproduzir'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>

        <button
          onClick={() => setCurrentIndex(i => (i + 1) % images.length)}
          className="text-slate-300 hover:text-white p-1.5 transition-transform active:scale-90"
          title="Próxima"
        >
          <ChevronRight size={20} />
        </button>

        <div className="h-5 w-px bg-white/20 mx-1"></div>

        {/* Speed Selector */}
        <div className="relative">
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="flex items-center gap-1 text-slate-200 text-xs font-mono px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
            title="Ajustar Velocidade do Slideshow"
          >
            <Gauge size={13} className="text-brand-400" />
            <span className="font-bold">{speedSeconds}s</span>
          </button>

          {/* Speed Dropdown Menu */}
          {showSpeedMenu && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-surface-elevated/95 backdrop-blur-xl border border-white/15 rounded-2xl p-1.5 shadow-2xl flex items-center gap-1 z-30 animate-scale-up">
              {speedOptions.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setSpeedSeconds(s);
                    setShowSpeedMenu(false);
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                    speedSeconds === s
                      ? 'bg-brand-600 text-white shadow-glow-brand'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
