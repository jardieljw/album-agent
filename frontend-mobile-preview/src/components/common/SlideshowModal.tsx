import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Gauge,
  Check,
  Layers,
  SunMedium,
  Blend,
  Film
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  extractDominantColors,
  extractSpatialDualColors,
  blendHexColors,
  colorPaletteCache,
  hexToRgb,
  rgbToHex,
} from '../../services/colorExtractor';

export type SlideshowBackdropMode = 'mirror' | 'single' | 'dual' | 'cinema';

export const SlideshowModal: React.FC = () => {
  const { slideshowOpen, setSlideshowOpen, albums, activeAlbumId, settings } = useAppStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedSeconds, setSpeedSeconds] = useState(3); // 1s, 2s, 3s, 5s, 10s
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showBackdropMenu, setShowBackdropMenu] = useState(false);
  const [backdropMode, setBackdropMode] = useState<SlideshowBackdropMode>(() => {
    return (localStorage.getItem('slideshow_backdrop_mode') as SlideshowBackdropMode) || 'mirror';
  });

  // Dynamic Inactivity Auto-Hide Engine (Desktop & iOS)
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const HIDE_TIMEOUT_MS = 2500;

  const resetHideTimer = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      setShowSpeedMenu(false);
      setShowBackdropMenu(false);
    }, HIDE_TIMEOUT_MS);
  };

  useEffect(() => {
    if (!slideshowOpen) return;

    resetHideTimer();

    const handleActivity = () => {
      resetHideTimer();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('touchmove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('touchmove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [slideshowOpen]);

  const currentAlbum = albums.find(a => a.id === activeAlbumId) || albums[0];
  const images = currentAlbum?.images || [];
  const currentImage = images[currentIndex];

  const getInitialColors = (img?: typeof currentImage) => {
    const pal = img?.colorPalette;
    if (pal && pal.length >= 8) {
      return {
        dom: pal[0],
        sec: pal[1] || pal[0],
        center: blendHexColors(pal.slice(0, 4)),
        lateral: blendHexColors(pal.slice(4, 8)),
      };
    } else if (pal && pal.length >= 2) {
      return {
        dom: pal[0],
        sec: pal[1],
        center: pal[0],
        lateral: pal[1],
      };
    } else if (pal && pal.length === 1) {
      return {
        dom: pal[0],
        sec: pal[0],
        center: pal[0],
        lateral: pal[0],
      };
    }
    return {
      dom: '#3b82f6',
      sec: '#10b981',
      center: '#3b82f6',
      lateral: '#10b981',
    };
  };

  const initialColors = getInitialColors(currentImage);
  const [dominantColor, setDominantColor] = useState<string>(initialColors.dom);
  const [secondaryColor, setSecondaryColor] = useState<string>(initialColors.sec);
  const [centerColor, setCenterColor] = useState<string>(initialColors.center);
  const [lateralColor, setLateralColor] = useState<string>(initialColors.lateral);
  const [imageAspect, setImageAspect] = useState<number>(1.33);

  const slideImgRef = useRef<HTMLImageElement>(null);
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const updateImageDimensions = () => {
    if (slideImgRef.current) {
      const rect = slideImgRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setRenderedSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }
  };

  useEffect(() => {
    window.addEventListener('resize', updateImageDimensions);
    return () => window.removeEventListener('resize', updateImageDimensions);
  }, []);

  useEffect(() => {
    const timer = setTimeout(updateImageDimensions, 60);
    return () => clearTimeout(timer);
  }, [currentIndex, isImmersive, isFullscreen, imageAspect, controlsVisible]);

  // Dynamically synchronize authentic dominant & spatial dual colors (Meio vs Laterais)
  useEffect(() => {
    if (!currentImage) return;
    if (currentImage.width && currentImage.height) {
      setImageAspect(currentImage.width / currentImage.height);
    }
    const url = currentImage.previewUrl || currentImage.originalUrl || currentImage.thumbnailUrl;
    const pal = (currentImage.colorPalette && currentImage.colorPalette.length > 0)
      ? currentImage.colorPalette
      : (url ? colorPaletteCache.get(url) : undefined);

    if (pal && pal.length > 0) {
      const dom = pal[0];
      const sec = pal[1] || pal[0];
      setDominantColor(dom);
      setSecondaryColor(sec);
      if (pal.length >= 8) {
        // Authentic 8-sampling: 1-4 Core/Inner average, 5-8 Periphery/Outer average
        setCenterColor(blendHexColors(pal.slice(0, 4)));
        setLateralColor(blendHexColors(pal.slice(4, 8)));
      } else {
        setCenterColor(dom);
        setLateralColor(sec);
      }
    } else if (url) {
      extractDominantColors(url).then(colors => {
        if (colors && colors.length > 0) {
          const dom = colors[0];
          const sec = colors[1] || colors[0];
          setDominantColor(dom);
          setSecondaryColor(sec);
          if (colors.length >= 8) {
            setCenterColor(blendHexColors(colors.slice(0, 4)));
            setLateralColor(blendHexColors(colors.slice(4, 8)));
          } else {
            setCenterColor(dom);
            setLateralColor(sec);
          }
        }
      });
    }

    // Only query spatial dual if we didn't already have an 8-color palette
    if (url && (!pal || pal.length < 8)) {
      extractSpatialDualColors(url).then(dual => {
        if (dual && dual.center && dual.lateral) {
          if (dual.center !== '#3b82f6' || dual.lateral !== '#10b981') {
            setCenterColor(dual.center);
            setLateralColor(dual.lateral);
          }
        }
      });
    }
  }, [currentIndex, currentImage?.id, currentImage?.colorPalette]);

  // Automated slideshow playback interval
  useEffect(() => {
    if (!slideshowOpen || !isPlaying || images.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % images.length);
    }, speedSeconds * 1000);

    return () => clearInterval(interval);
  }, [slideshowOpen, isPlaying, speedSeconds, images.length]);

  // Fullscreen change listener
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
      resetHideTimer();
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

  const toggleFullscreen = () => {
    resetHideTimer();
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

  const normalizeHex = (hex: string, fallback: string) => {
    let c = (hex || fallback).trim();
    if (!c.startsWith('#')) c = `#${c}`;
    if (c.length === 4) {
      c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    } else if (c.length === 9) {
      c = c.slice(0, 7);
    }
    return c.length === 7 ? c : fallback;
  };

  const normalizedColor = normalizeHex(dominantColor, '#3b82f6');
  const normalizedSecColor = normalizeHex(secondaryColor, '#10b981');
  const normalizedCenterColor = normalizeHex(centerColor, normalizedColor);
  const normalizedLateralColor = normalizeHex(lateralColor, normalizedSecColor);

  const isPt = settings?.language === 'pt-BR';
  const backdropOptions = [
    {
      key: 'mirror' as SlideshowBackdropMode,
      icon: Layers,
      iconColor: 'text-cyan-400',
      label: isPt ? 'Ambilight Orgânico' : 'Organic Ambilight',
      desc: isPt ? 'Espelho com blur suave (Apple & YouTube)' : 'Soft blurred mirror effect',
    },
    {
      key: 'single' as SlideshowBackdropMode,
      icon: SunMedium,
      iconColor: 'text-amber-400',
      label: isPt ? 'Luz Dominante Viva' : 'Vibrant Aura',
      desc: isPt ? 'Projeção radial dinâmica na cor dominante' : 'Primary color with dynamic radial glow',
    },
    {
      key: 'dual' as SlideshowBackdropMode,
      icon: Blend,
      iconColor: 'text-purple-400',
      label: isPt ? 'Gradiente Dual' : 'Dual Gradient',
      desc: isPt ? 'Média do miolo no centro + Média das laterais' : 'Core center average + Outer edges',
    },
    {
      key: 'cinema' as SlideshowBackdropMode,
      icon: Film,
      iconColor: 'text-slate-400',
      label: isPt ? 'Cinema Escuro' : 'Dark Cinema',
      desc: isPt ? 'Luz ambiente sutil clássica e fundo escuro' : 'Subtle classic dark ambient glow',
    },
  ];

  const currentBackdropOpt = backdropOptions.find(o => o.key === backdropMode) || backdropOptions[0];
  const CurrentModeIcon = currentBackdropOpt.icon;

  // Helpers to blend and darken colors for seamless ambient illumination
  const computeBlendedDarkColor = (hex1: string, hex2: string, darkenFactor: number = 0.40): string => {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    const avgR = (c1.r + c2.r) / 2;
    const avgG = (c1.g + c2.g) / 2;
    const avgB = (c1.b + c2.b) / 2;
    const darkR = Math.max(12, Math.min(255, Math.round(avgR * darkenFactor)));
    const darkG = Math.max(12, Math.min(255, Math.round(avgG * darkenFactor)));
    const darkB = Math.max(12, Math.min(255, Math.round(avgB * darkenFactor)));
    return rgbToHex(darkR, darkG, darkB);
  };

  const darkenHex = (hex: string, darkenFactor: number = 0.35): string => {
    const c = hexToRgb(hex);
    const darkR = Math.max(10, Math.min(255, Math.round(c.r * darkenFactor)));
    const darkG = Math.max(10, Math.min(255, Math.round(c.g * darkenFactor)));
    const darkB = Math.max(10, Math.min(255, Math.round(c.b * darkenFactor)));
    return rgbToHex(darkR, darkG, darkB);
  };

  // Dynamic light projection geometry: contours hug the real rendered size of the photo on screen
  const auraWidth = renderedSize.width > 0
    ? Math.max(Math.round(renderedSize.width * 1.85), renderedSize.width + 260)
    : Math.round(typeof window !== 'undefined' ? window.innerWidth * (imageAspect < 0.88 ? 0.65 : 0.95) : 850);

  const auraHeight = renderedSize.height > 0
    ? Math.max(Math.round(renderedSize.height * 1.70), renderedSize.height + 240)
    : Math.round(typeof window !== 'undefined' ? window.innerHeight * (imageAspect < 0.88 ? 0.95 : 0.75) : 850);

  // 3rd gradient: exact sum of both center & lateral lights, darkened for full-bleed ambient contour without black voids
  const thirdBlendedDark = computeBlendedDarkColor(normalizedCenterColor, normalizedLateralColor, 0.40);

  // Dual Gradient: 1st (Center - 4 Core Colors) extending visibly around the image + 2nd (Lateral - Backlight) soft aura + 3rd (Blended dark)
  const dualGradientStyle = [
    `radial-gradient(ellipse ${auraWidth}px ${auraHeight}px at 50% 50%, ${normalizedCenterColor}ff 0%, ${normalizedCenterColor}e6 36%, ${normalizedCenterColor}bf 56%, ${normalizedLateralColor}88 78%, ${thirdBlendedDark}55 92%, transparent 100%)`,
    `radial-gradient(ellipse at 50% 50%, ${thirdBlendedDark}99 0%, ${thirdBlendedDark}66 45%, ${thirdBlendedDark}38 75%, ${thirdBlendedDark}18 100%)`
  ].join(', ');

  const darkSingle = darkenHex(normalizedColor, 0.35);
  const singleGradientStyle = [
    `radial-gradient(ellipse ${auraWidth}px ${auraHeight}px at 50% 50%, ${normalizedColor}e6 0%, ${normalizedColor}a0 45%, ${darkSingle}60 80%, transparent 100%)`,
    `radial-gradient(ellipse at 50% 50%, ${darkSingle}80 0%, ${darkSingle}50 50%, ${darkSingle}25 80%, ${darkSingle}12 100%)`
  ].join(', ');

  const cinemaGradientStyle = `radial-gradient(ellipse ${Math.round(auraWidth * 0.85)}px ${Math.round(auraHeight * 0.85)}px at 50% 50%, ${normalizedColor}55 0%, ${normalizedColor}1a 60%, transparent 100%)`;

  return (
    <div
      onClick={() => {
        if (showBackdropMenu) {
          setShowBackdropMenu(false);
          resetHideTimer();
          return;
        }
        if (showSpeedMenu) {
          setShowSpeedMenu(false);
          resetHideTimer();
          return;
        }
        if (!controlsVisible) {
          resetHideTimer();
        } else {
          setControlsVisible(false);
        }
      }}
      className={`fixed inset-0 h-[100dvh] max-h-[100dvh] z-50 bg-black flex flex-col items-center justify-center select-none animate-fade-in overflow-hidden ${
        !controlsVisible ? 'cursor-none' : 'cursor-default'
      }`}
    >
      {/* 4 Backdrop Lighting Modes */}
      {backdropMode === 'mirror' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden scale-125 transition-all duration-700 ease-out opacity-75">
          <img
            key={`mirror-${currentImage.id}`}
            src={currentImage.previewUrl || currentImage.originalUrl || currentImage.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover filter blur-[75px] saturate-150 transform transition-all duration-700 ease-out"
          />
          <div className="absolute inset-0 bg-black/25" />
        </div>
      )}

      {backdropMode === 'single' && (
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-700 ease-out scale-110"
          style={{ background: singleGradientStyle }}
        />
      )}

      {backdropMode === 'dual' && (
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-700 ease-out scale-110"
          style={{ background: dualGradientStyle }}
        />
      )}

      {backdropMode === 'cinema' && (
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-700 ease-out scale-110"
          style={{ background: cinemaGradientStyle }}
        />
      )}

      {/* Top Floating Bar with iOS Safe Area & Dynamic Auto-Hide Fade */}
      <div
        onClick={e => e.stopPropagation()}
        className={`absolute top-4 inset-x-4 sm:inset-x-6 flex items-center justify-between z-20 pt-safe transition-all duration-500 ease-out ${
          controlsVisible && !isImmersive
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-12 pointer-events-none'
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

      {/* Main Slide with Dynamic Aspect Ratio & Backlight Halo */}
      <div className="relative w-full h-full min-h-0 min-w-0 flex items-center justify-center p-2 sm:p-6 z-10 overflow-hidden">
        <img
          ref={slideImgRef}
          key={currentImage.id}
          src={currentImage.originalUrl}
          alt={currentImage.title}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setImageAspect(img.naturalWidth / img.naturalHeight);
            }
            const rect = img.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              setRenderedSize({
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              });
            }
          }}
          style={{
            filter: `drop-shadow(0 0 35px ${backdropMode === 'dual' ? normalizedCenterColor + '35' : normalizedColor + '30'})`
          }}
          className={`object-contain rounded-2xl shadow-2xl animate-fade-in transition-all duration-700 pointer-events-none ${
            !controlsVisible || isImmersive ? 'max-h-[96vh] max-w-[96vw]' : 'max-h-[80vh] max-w-[90vw]'
          }`}
        />
      </div>

      {/* Bottom Floating Control Pill with Velocity & Dynamic Auto-Hide Fade */}
      <div
        onClick={e => e.stopPropagation()}
        className={`absolute bottom-6 flex items-center gap-2 sm:gap-3 bg-black/85 backdrop-blur-xl px-4 sm:px-5 py-2 rounded-full border border-white/15 z-20 shadow-2xl pb-safe transition-all duration-500 ease-out ${
          controlsVisible && !isImmersive
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-16 pointer-events-none'
        }`}
      >
        <button
          onClick={() => {
            setCurrentIndex(i => (i > 0 ? i - 1 : images.length - 1));
            resetHideTimer();
          }}
          className="text-slate-300 hover:text-white p-1.5 transition-transform active:scale-90"
          title="Anterior"
        >
          <ChevronLeft size={20} />
        </button>

        <button
          onClick={() => {
            setIsPlaying(!isPlaying);
            resetHideTimer();
          }}
          className="w-10 h-10 rounded-full bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center shadow-glow-brand transition-all active:scale-95"
          title={isPlaying ? 'Pausar' : 'Reproduzir'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>

        <button
          onClick={() => {
            setCurrentIndex(i => (i + 1) % images.length);
            resetHideTimer();
          }}
          className="text-slate-300 hover:text-white p-1.5 transition-transform active:scale-90"
          title="Próxima"
        >
          <ChevronRight size={20} />
        </button>

        <div className="h-5 w-px bg-white/20 mx-1"></div>

        {/* Speed Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setShowSpeedMenu(!showSpeedMenu);
              setShowBackdropMenu(false);
              resetHideTimer();
            }}
            className="flex items-center gap-1 text-slate-200 text-xs font-mono px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
            title="Ajustar Velocidade do Slideshow"
          >
            <Gauge size={13} className="text-brand-400" />
            <span className="font-bold">{speedSeconds}s</span>
          </button>

          {/* Speed Dropdown Menu - Frosted Glass Blur with 50% opacity */}
          {showSpeedMenu && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-2xl border border-white/20 rounded-2xl p-1.5 shadow-2xl flex items-center gap-1 z-30 animate-scale-up">
              {speedOptions.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setSpeedSeconds(s);
                    setShowSpeedMenu(false);
                    resetHideTimer();
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

        <div className="h-5 w-px bg-white/20 mx-1"></div>

        {/* Backdrop Lighting Mode Selector - Clean Single Icon, Zero Emojis */}
        <div className="relative">
          <button
            onClick={() => {
              setShowBackdropMenu(!showBackdropMenu);
              setShowSpeedMenu(false);
              resetHideTimer();
            }}
            className="flex items-center gap-2 text-slate-200 text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
            title="Modo de Iluminação de Fundo"
          >
            <CurrentModeIcon size={14} className={currentBackdropOpt.iconColor} />
            <span className="font-semibold">{currentBackdropOpt.label}</span>
          </button>

          {/* Backdrop Dropdown Menu - Frosted Glass Blur with 50% opacity */}
          {showBackdropMenu && (
            <div className="absolute bottom-12 right-0 sm:left-1/2 sm:-translate-x-1/2 bg-black/50 backdrop-blur-2xl border border-white/20 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 z-30 min-w-[240px] animate-scale-up">
              {backdropOptions.map(opt => {
                const Icon = opt.icon;
                const isSelected = backdropMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setBackdropMode(opt.key);
                      setShowBackdropMenu(false);
                      localStorage.setItem('slideshow_backdrop_mode', opt.key);
                      resetHideTimer();
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left flex items-center justify-between ${
                      isSelected
                        ? 'bg-brand-600 text-white shadow-glow-brand'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={16} className={isSelected ? 'text-white' : opt.iconColor} />
                      <div className="flex flex-col">
                        <span className="font-bold">{opt.label}</span>
                        <span className="text-[10px] opacity-75 font-normal">{opt.desc}</span>
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-white shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
