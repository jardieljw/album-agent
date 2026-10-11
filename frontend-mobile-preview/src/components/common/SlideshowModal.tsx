import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Maximize,
  Minimize,
  Gauge,
  Check,
  Layers,
  SunMedium,
  Blend,
  Film,
  Lock,
  Unlock,
  Heart,
  FolderHeart
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { isDesktopApp, toggleAppFullscreen, exitAllFullscreen } from '../../services/desktopService';
import {
  extractDominantColors,
  extractSpatialDualColors,
  blendHexColors,
  colorPaletteCache,
  hexToRgb,
  rgbToHex,
} from '../../services/colorExtractor';

import { useImagePreloader, isImagePreloaded } from '../../hooks/useImagePreloader';
import { getSlideshowAnimationClass, getSpeedClass, getDistanceClass } from '../../services/motionConfig';

export type SlideshowBackdropMode = 'mirror' | 'single' | 'dual' | 'cinema';

export const SlideshowModal: React.FC = () => {
  const { slideshowOpen, slideshowInitialIndex, setSlideshowOpen, albums, activeAlbumId, toggleFavoriteAlbum, toggleFavoriteImage, settings } = useAppStore();
  const [currentIndex, setCurrentIndex] = useState(slideshowInitialIndex || 0);
  useEffect(() => {
    if (slideshowOpen) {
      setCurrentIndex(slideshowInitialIndex || 0);
    }
  }, [slideshowOpen, slideshowInitialIndex]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedSeconds, setSpeedSeconds] = useState(3); // 1s, 2s, 3s, 5s, 10s
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [isImmersive, setIsImmersive] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(isLocked);
  const [unlockButtonVisible, setUnlockButtonVisible] = useState(true);
  const unlockTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isLockedRef.current = isLocked;
    if (isLocked) {
      resetUnlockTimer();
    } else {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }
      setUnlockButtonVisible(false);
    }
  }, [isLocked]);

  const resetUnlockTimer = () => {
    setUnlockButtonVisible(true);
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
    }
    unlockTimerRef.current = setTimeout(() => {
      setUnlockButtonVisible(false);
    }, 2500);
  };
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showBackdropMenu, setShowBackdropMenu] = useState(false);
  const [backdropMode, setBackdropMode] = useState<SlideshowBackdropMode>(() => {
    return (localStorage.getItem('slideshow_backdrop_mode') as SlideshowBackdropMode) || 'mirror';
  });

  // Dynamic Inactivity Auto-Hide Engine (Desktop & iOS)
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMousePosRef = useRef({ x: -1, y: -1 });
  const lastArrowNavTimeRef = useRef(0);
  const isFullscreenRef = useRef(isFullscreen);
  const isImmersiveRef = useRef(isImmersive);

  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  useEffect(() => {
    isImmersiveRef.current = isImmersive;
  }, [isImmersive]);

  const HIDE_TIMEOUT_MS = 2500;

  const resetHideTimer = () => {
    if (isLocked) return;
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

  // Restore desktop window state when closing slideshow
  useEffect(() => {
    return () => {
      exitAllFullscreen();
    };
  }, []);

  useEffect(() => {
    if (!slideshowOpen) return;

    resetHideTimer();

    const handlePointerActivity = (e: MouseEvent | PointerEvent) => {
      // Ignora eventos de mouse sintéticos disparados após navegação por setas ou sem deslocamento físico
      if (Date.now() - lastArrowNavTimeRef.current < 500) return;
      if (e.clientX === lastMousePosRef.current.x && e.clientY === lastMousePosRef.current.y) return;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      if (isLockedRef.current) {
        resetUnlockTimer();
      } else {
        resetHideTimer();
      }
    };

    const handleTouchActivity = () => {
      if (isLockedRef.current) {
        resetUnlockTimer();
      } else {
        resetHideTimer();
      }
    };

    const handleKeyActivity = (e: KeyboardEvent) => {
      const isArrowKey = e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown';
      if ((isFullscreenRef.current || isImmersiveRef.current) && isArrowKey) {
        lastArrowNavTimeRef.current = Date.now();
        // As setas do teclado não ativam o retorno dos botões no modo fullscreen / slides
        return;
      }
      resetHideTimer();
    };

    window.addEventListener('mousemove', handlePointerActivity, { passive: true });
    window.addEventListener('pointermove', handlePointerActivity, { passive: true });
    window.addEventListener('mousedown', handlePointerActivity);
    window.addEventListener('wheel', handlePointerActivity, { passive: true });
    window.addEventListener('touchstart', handleTouchActivity, { passive: true });
    window.addEventListener('touchmove', handleTouchActivity, { passive: true });
    window.addEventListener('keydown', handleKeyActivity);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }
      window.removeEventListener('mousemove', handlePointerActivity);
      window.removeEventListener('pointermove', handlePointerActivity);
      window.removeEventListener('mousedown', handlePointerActivity);
      window.removeEventListener('wheel', handlePointerActivity);
      window.removeEventListener('touchstart', handleTouchActivity);
      window.removeEventListener('touchmove', handleTouchActivity);
      window.removeEventListener('keydown', handleKeyActivity);
    };
  }, [slideshowOpen]);

  const currentAlbum = albums.find(a => a.id === activeAlbumId) || albums[0];
  const images = currentAlbum?.images || [];
  const currentImage = images[currentIndex];

  const [slideHighResLoaded, setSlideHighResLoaded] = useState(() => {
    return isImagePreloaded(currentImage?.originalUrl || '');
  });

  const fullSlideUrl = currentImage?.originalUrl || currentImage?.rawOriginalUrl;
  const isSlidePreloaded = Boolean(fullSlideUrl && isImagePreloaded(fullSlideUrl));
  const isSlideHdReady = slideHighResLoaded || isSlidePreloaded;

  // Preload preditivo em background dos próximos slides com foco ativo e cancelamento imediato
  useImagePreloader({
    images,
    currentIndex,
    enabled: slideshowOpen,
    windowSize: 2,
    mode: 'original',
    debounceMs: 200,
    waitForCurrentLoaded: true,
    isCurrentLoaded: isSlideHdReady,
  });

  useEffect(() => {
    if (currentImage?.originalUrl && isImagePreloaded(currentImage.originalUrl)) {
      setSlideHighResLoaded(true);
    } else {
      setSlideHighResLoaded(false);
    }
  }, [currentImage?.id]);
  // Efeito de transição e velocidade configurados pelo usuário (Motion Engine)
  const slideshowAnimSetting = settings.slideshowAnimation || 'switch';
  const slideshowAnimClass = getSlideshowAnimationClass(slideshowAnimSetting, settings.disableAllAnimations);
  const speedClass = getSpeedClass(settings.animationSpeed || 'normal');
  const distanceClass = getDistanceClass(settings.animationDistance || 'normal');

  const isImageFav = Boolean((currentImage as any)?.isFavorite);
  const isAlbumFav = Boolean(currentAlbum?.isFavorite);

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
    const timer1 = setTimeout(updateImageDimensions, 60);
    const timer2 = setTimeout(updateImageDimensions, 520);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [currentIndex, isImmersive, isFullscreen, imageAspect, controlsVisible, isLocked]);

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
      const isFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFs);
      if (!isFs) {
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
      const isArrowKey = e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown';
      if ((isFullscreenRef.current || isImmersiveRef.current) && isArrowKey) {
        lastArrowNavTimeRef.current = Date.now();
        // Não acorda nem restaura os botões quando estiver navegando pelas setas em tela cheia
      } else {
        resetHideTimer();
      }

      if (e.key === 'Escape') {
        if (isLocked) {
          setIsLocked(false);
          resetHideTimer();
          return;
        }
        exitAllFullscreen(setIsFullscreen);
        setSlideshowOpen(false);
      } else if (e.key.toLowerCase() === 'l') {
        setIsLocked(prev => {
          if (prev) resetHideTimer();
          return !prev;
        });
      } else if (e.key === 'ArrowRight') {
        lastArrowNavTimeRef.current = Date.now();
        setCurrentIndex(i => (i + 1) % images.length);
      } else if (e.key === 'ArrowLeft') {
        lastArrowNavTimeRef.current = Date.now();
        setCurrentIndex(i => (i > 0 ? i - 1 : images.length - 1));
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setFitMode(m => (m === 'contain' ? 'cover' : 'contain'));
      } else if (e.key.toLowerCase() === 'f' || e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slideshowOpen, images.length, isFullscreen, isImmersive, isLocked]);

  if (!slideshowOpen || images.length === 0) return null;

  const toggleFullscreen = () => {
    resetHideTimer();
    const nextState = !isFullscreen;
    toggleAppFullscreen(isFullscreen, setIsFullscreen);
    if (nextState) {
      setControlsVisible(false);
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
  const isEn = settings?.language === 'en-US';
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
        if (isLocked) return;
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
      className={`fixed inset-0 w-full h-full bg-black flex flex-col items-center justify-center select-none animate-backdrop-fade overflow-hidden transition-all duration-300 ease-out ${
        isFullscreen ? 'z-[9999] m-0 p-0 border-0' : 'z-50'
      } ${
        !controlsVisible ? 'fullscreen-cursor-hidden cursor-none' : 'cursor-default'
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

      {/* Floating Unlock Button when locked with dynamic auto-hide */}
      {isLocked && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-4 left-4 z-40 transition-all duration-500 ease-out ${
            unlockButtonVisible
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}
        >
          <button
            onClick={() => {
              setIsLocked(false);
              resetHideTimer();
            }}
            className="px-3.5 py-2 rounded-full bg-black/80 hover:bg-black/95 text-amber-300 hover:text-amber-200 border border-amber-500/50 backdrop-blur-md transition-all shadow-2xl active:scale-95 flex items-center gap-2 text-xs font-semibold cursor-pointer"
            title={isPt ? "Clique para destravar os controles do slider (ou pressione 'L' / 'Esc')" : "Click to unlock slider controls (or press 'L' / 'Esc')"}
          >
            <Unlock size={14} className="animate-pulse" />
            <span>Controles Travados • Destravar</span>
          </button>
        </div>
      )}

      {/* Top Floating Bar with iOS Safe Area & Dynamic Auto-Hide Fade */}
      <div
        onClick={e => e.stopPropagation()}
        className={`absolute top-4 inset-x-4 sm:inset-x-6 flex items-center justify-between z-20 pt-safe transition-all duration-500 ease-out ${
          controlsVisible && !isLocked
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-12 pointer-events-none'
        }`}
      >
        <div className="text-white text-xs font-semibold bg-black/60 px-3.5 py-1.5 rounded-full backdrop-blur-md border-0 flex items-center gap-2 max-w-[260px] sm:max-w-md truncate shadow-2xl">
          <span className="truncate">{currentAlbum?.title || ""}</span>
          <span className="text-brand-400 font-mono font-bold shrink-0">
            ({currentIndex + 1}/{images.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Fit / Fill Toggle Button */}
          <button
            onClick={() => setFitMode(m => m === 'contain' ? 'cover' : 'contain')}
            className={`p-2.5 rounded-full transition-all border-0 active:scale-95 shadow-2xl cursor-pointer ${
              fitMode === 'cover'
                ? 'bg-brand-600 text-white border-brand-400 shadow-glow-brand ring-2 ring-brand-400/50'
                : 'bg-black/60 text-white hover:bg-black/90 border-white/10'
            }`}
            title={fitMode === 'cover' ? (isPt ? 'Ajustar à Tela (P)' : 'Fit to Screen (P)') : (isPt ? 'Preencher Tela Inteira (P)' : 'Fill Screen (P)')}
          >
            {fitMode === 'cover' ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          {/* Fullscreen / Immersive Button */}
          <button
            onClick={toggleFullscreen}
            className={`p-2.5 rounded-full transition-all border-0 active:scale-95 shadow-2xl ${
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
            className="p-2.5 rounded-full bg-black/60 text-white hover:bg-black/90 transition-all border-0 active:scale-95 shadow-2xl"
            title={isPt ? "Fechar Apresentação" : "Close Slideshow"}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Slide with Dynamic Aspect Ratio & Backlight Halo */}
      <div
        onDoubleClick={toggleFullscreen}
        className={`relative w-full h-full min-h-0 min-w-0 flex items-center justify-center z-10 overflow-hidden transition-all duration-500 ease-out ${
          isFullscreen ? 'p-0' : 'p-2 sm:p-6'
        } ${!controlsVisible ? 'cursor-none' : 'cursor-pointer'}`}
      >
        {/* Camada 1: Miniatura Instantânea (0ms LQIP) com transição suave */}
        {currentImage.thumbnailUrl &&
          currentImage.originalUrl &&
          currentImage.thumbnailUrl !== currentImage.originalUrl &&
          !isSlideHdReady && (
            <img
              key={`slide-thumb-${currentImage.id}-${slideshowAnimClass}`}
              src={currentImage.thumbnailUrl}
              alt=""
              className={`pointer-events-none border-0 absolute z-10 ${slideshowAnimClass} ${speedClass} ${distanceClass} ${
                isFullscreen
                  ? (fitMode === 'cover' ? 'w-full h-full object-cover rounded-none' : 'w-full h-full object-contain rounded-none')
                  : (!controlsVisible || isImmersive || isLocked
                      ? (fitMode === 'cover' ? 'w-full h-full object-cover rounded-2xl' : 'max-h-[96vh] max-w-[96vw] object-contain rounded-2xl')
                      : (fitMode === 'cover' ? 'w-full h-full object-cover rounded-2xl' : 'max-h-[80vh] max-w-[90vw] object-contain rounded-2xl'))
              }`}
            />
          )}

        {/* Camada 2: Imagem Principal em Alta Resolução com Encaixe Integral Proporcional */}
        <img
          ref={slideImgRef}
          key={`slide-hd-${currentImage.id}-${slideshowAnimClass}`}
          src={currentImage.originalUrl}
          alt={currentImage.title}
          decoding="async"
          {...({ fetchPriority: 'high' } as any)}
          onLoad={(e) => {
            setSlideHighResLoaded(true);
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
            filter: isFullscreen ? 'none' : `drop-shadow(0 0 35px ${backdropMode === 'dual' ? normalizedCenterColor + '35' : normalizedColor + '30'})`,
            willChange: 'max-height, max-width, transform, opacity',
          }}
          className={`${slideshowAnimClass} ${speedClass} ${distanceClass} ${
            isSlideHdReady ? '' : 'transition-opacity duration-150'
          } pointer-events-none border-0 relative z-10 ${
            !isSlideHdReady && currentImage.thumbnailUrl && currentImage.thumbnailUrl !== currentImage.originalUrl
              ? 'opacity-0'
              : 'opacity-100'
          } ${
            isFullscreen
              ? (fitMode === 'cover'
                  ? 'w-full h-full object-cover rounded-none shadow-none'
                  : 'w-full h-full object-contain rounded-none shadow-none')
              : (!controlsVisible || isImmersive || isLocked
                  ? (fitMode === 'cover' ? 'w-full h-full object-cover rounded-2xl shadow-2xl' : 'max-h-[96vh] max-w-[96vw] object-contain rounded-2xl shadow-2xl')
                  : (fitMode === 'cover' ? 'w-full h-full object-cover rounded-2xl shadow-2xl' : 'max-h-[80vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl'))
          }`}
        />
      </div>

      {/* Bottom Floating Control Pill with Velocity & Dynamic Auto-Hide Fade */}
      <div
        onClick={e => e.stopPropagation()}
        className={`absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 max-w-[calc(100vw-1.5rem)] xl:max-w-fit flex items-center justify-center gap-1.5 xl:gap-3 bg-black/80 backdrop-blur-2xl px-3 xl:px-5 py-2 xl:py-2.5 rounded-full border-0 z-20 shadow-2xl pb-safe transition-all duration-500 ease-out ${
          controlsVisible && !isLocked
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-16 pointer-events-none'
        }`}
      >
        <button
          onClick={() => {
            setCurrentIndex(i => (i > 0 ? i - 1 : images.length - 1));
            resetHideTimer();
          }}
          className="text-slate-300 hover:text-white p-1 sm:p-1.5 transition-transform active:scale-90 shrink-0"
          title={isEn ? "Previous" : "Anterior"}
        >
          <ChevronLeft size={18} className="sm:w-5 sm:h-5" />
        </button>

        <button
          onClick={() => {
            setIsPlaying(!isPlaying);
            resetHideTimer();
          }}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center shadow-glow-brand transition-all active:scale-95 shrink-0"
          title={isPlaying ? 'Pausar' : 'Reproduzir'}
        >
          {isPlaying ? <Pause size={15} className="sm:w-[18px] sm:h-[18px]" /> : <Play size={15} className="ml-0.5 sm:w-[18px] sm:h-[18px]" />}
        </button>

        <button
          onClick={() => {
            setCurrentIndex(i => (i + 1) % images.length);
            resetHideTimer();
          }}
          className="text-slate-300 hover:text-white p-1 sm:p-1.5 transition-transform active:scale-90 shrink-0"
          title={isPt ? "Próxima" : "Next"}
        >
          <ChevronRight size={18} className="sm:w-5 sm:h-5" />
        </button>

        <div className="h-4 sm:h-5 w-px bg-white/20 mx-0.5 sm:mx-1 shrink-0"></div>

        {/* Speed Selector */}
        <div className="relative shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSpeedMenu(prev => !prev);
              setShowBackdropMenu(false);
              resetHideTimer();
            }}
            className="flex items-center gap-1 text-slate-200 text-[11px] sm:text-xs font-mono px-2 sm:px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors shrink-0"
            title={isPt ? "Ajustar Velocidade do Slideshow" : "Adjust Slideshow Speed"}
          >
            <Gauge size={13} className="text-brand-400" />
            <span className="font-bold">{speedSeconds}s</span>
          </button>

          {/* Speed Dropdown Menu - Frosted Glass Blur with 50% opacity */}
          {showSpeedMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-2xl border border-white/20 rounded-2xl p-1.5 shadow-2xl flex items-center gap-1 z-50 animate-scale-up"
            >
              {speedOptions.map(s => (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
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

        <div className="h-4 sm:h-5 w-px bg-white/20 mx-0.5 sm:mx-1 shrink-0"></div>

        {/* Favoritar Imagem Atual */}
        <button
          onClick={() => {
            if (currentAlbum && currentImage) {
              toggleFavoriteImage(currentAlbum.id, currentImage.id);
            }
            resetHideTimer();
          }}
          className={`flex items-center gap-1.5 text-xs p-1.5 sm:px-3 sm:py-1.5 rounded-full border transition-all cursor-pointer shrink-0 ${
            isImageFav
              ? 'bg-rose-600/90 border-rose-400 text-white shadow-glow-brand'
              : 'bg-white/10 hover:bg-rose-500/20 border-white/10 hover:border-rose-400/50 text-slate-200 hover:text-rose-300'
          }`}
          title={isImageFav ? (isPt ? 'Remover imagem dos Favoritos' : 'Remove image from Favorites') : (isPt ? 'Favoritar Imagem Atual' : 'Favorite Current Image')}
        >
          <Heart size={13} className={isImageFav ? 'fill-white text-white' : 'text-slate-300'} />
          <span className="font-semibold hidden xl:inline">{isImageFav ? 'Favoritada' : 'Favoritar'}</span>
        </button>

        {/* Favoritar Álbum */}
        <button
          onClick={() => {
            if (currentAlbum) {
              toggleFavoriteAlbum(currentAlbum.id);
            }
            resetHideTimer();
          }}
          className={`flex items-center gap-1.5 text-xs p-1.5 sm:px-3 sm:py-1.5 rounded-full border transition-all cursor-pointer shrink-0 ${
            isAlbumFav
              ? 'bg-rose-500/30 border-rose-500/50 text-rose-300 shadow-glow-brand'
              : 'bg-white/10 hover:bg-violet-600/20 border-white/10 hover:border-violet-400/50 text-slate-200 hover:text-violet-300'
          }`}
          title={isAlbumFav ? (isPt ? 'Remover álbum dos Favoritos' : 'Remove from Favorites') : (isPt ? 'Favoritar este Álbum' : 'Favorite this Album')}
        >
          <FolderHeart size={13} className={isAlbumFav ? 'fill-rose-400 text-rose-400' : 'text-slate-300'} />
          <span className="font-semibold hidden xl:inline">{isAlbumFav ? (isPt ? 'Álbum Favorito' : 'Favorite Album') : (isPt ? 'Favoritar Álbum' : 'Favorite Album')}</span>
        </button>

        <div className="h-4 sm:h-5 w-px bg-white/20 mx-0.5 sm:mx-1 shrink-0"></div>

        {/* Lock Controls Button (Modo Travado) */}
        <button
          onClick={() => {
            setIsLocked(true);
            setControlsVisible(false);
            setShowSpeedMenu(false);
            setShowBackdropMenu(false);
          }}
          className="flex items-center gap-1.5 text-slate-200 text-xs p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-white/10 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer shrink-0"
          title={isEn ? "Lock Controls (Pure Immersive Mode • Press 'L' to toggle)" : "Travar Controles (Modo Imersivo Puro • Pressione 'L' para alternar)"}
        >
          <Lock size={13} className="text-amber-400" />
          <span className="font-semibold hidden xl:inline">Travar</span>
        </button>

        {/* Backdrop Lighting Mode Selector - Clean Single Icon, Zero Emojis */}
        <div className="relative shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowBackdropMenu(prev => !prev);
              setShowSpeedMenu(false);
              resetHideTimer();
            }}
            className="flex items-center gap-1.5 sm:gap-2 text-slate-200 text-xs p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors shrink-0 cursor-pointer"
            title={isPt ? "Modo de Iluminação de Fundo" : "Ambient Lighting Mode"}
          >
            <CurrentModeIcon size={14} className={currentBackdropOpt.iconColor} />
            <span className="font-semibold hidden xl:inline">{currentBackdropOpt.label}</span>
          </button>

          {/* Backdrop Dropdown Menu - Frosted Glass Blur with 80% opacity, elevated z-index */}
          {showBackdropMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-12 sm:bottom-14 right-0 bg-black/90 backdrop-blur-2xl border border-white/20 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 z-50 min-w-[220px] sm:min-w-[240px] max-w-[calc(100vw-2rem)] animate-scale-up"
            >
              {backdropOptions.map(opt => {
                const Icon = opt.icon;
                const isSelected = backdropMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBackdropMode(opt.key);
                      setShowBackdropMenu(false);
                      localStorage.setItem('slideshow_backdrop_mode', opt.key);
                      resetHideTimer();
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${
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
