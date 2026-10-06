import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Palette, ChevronDown, Check, Layers, SlidersHorizontal } from 'lucide-react';
import {
  aggregateCollectionSwatches,
  hslToHex,
  CollectionSwatch,
  CHROMATIC_PALETTE_COLORS
} from '../../services/colorExtractor';

export interface ColorFilterPopoverProps {
  activeColor: string | null;
  onSelectColor: (hex: string | null) => void;
  items: Array<{
    colorPalette?: string[];
    coverColorPalette?: string[];
    previewUrl?: string;
    originalUrl?: string;
    thumbnailUrl?: string;
    coverImage?: string;
    images?: Array<{ colorPalette?: string[] }>;
  }>;
  language?: 'pt-BR' | 'en-US';
  totalMatchedCount?: number;
  singularLabel?: string;
  pluralLabel?: string;
  className?: string;
}

export const ColorFilterPopover: React.FC<ColorFilterPopoverProps> = ({
  activeColor,
  onSelectColor,
  items,
  language = 'pt-BR',
  totalMatchedCount,
  singularLabel,
  pluralLabel,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sliderHue, setSliderHue] = useState(38);
  const [continuousHex, setContinuousHex] = useState('#f59e0b');
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const popoverMenuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const isPt = language === 'pt-BR';

  // Compute authentic swatches present in this specific collection
  const swatches: CollectionSwatch[] = useMemo(() => {
    return aggregateCollectionSwatches(items, 8);
  }, [items]);

  // Dynamically calculate viewport position for the portal dropdown
  const updatePosition = () => {
    if (triggerButtonRef.current) {
      const rect = triggerButtonRef.current.getBoundingClientRect();
      const popoverWidth = Math.min(320, window.innerWidth - 24);
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - popoverWidth - 12);
      }
      if (left < 12) left = 12;

      let top = rect.bottom + 8;
      const estimatedHeight = 360;
      if (top + estimatedHeight > window.innerHeight - 12 && rect.top > estimatedHeight + 12) {
        top = Math.max(12, rect.top - estimatedHeight - 8);
      }

      setCoords({ top, left });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen]);

  // Click-outside listener to close popover smoothly
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerButtonRef.current && !triggerButtonRef.current.contains(target) &&
        popoverMenuRef.current && !popoverMenuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Resolve human-readable name of the active color
  const activeColorName = useMemo(() => {
    if (!activeColor) return '';
    const matchSwatch = swatches.find(s => s.hex.toLowerCase() === activeColor.toLowerCase());
    if (matchSwatch) return isPt ? matchSwatch.labelPt : matchSwatch.labelEn;
    const matchStandard = CHROMATIC_PALETTE_COLORS.find(c => c.hex.toLowerCase() === activeColor.toLowerCase());
    if (matchStandard) return isPt ? matchStandard.namePt : matchStandard.nameEn;
    return activeColor.toUpperCase();
  }, [activeColor, swatches, isPt]);

  return (
    <div className={`relative inline-flex items-center gap-2.5 ${className}`}>
      {/* Trigger Button - Estilo 3 */}
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-sm ${
          activeColor
            ? 'bg-zinc-900 text-white border-brand-500 shadow-glow-brand ring-1 ring-brand-400/30'
            : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-800 hover:border-zinc-700'
        }`}
        title={isPt ? 'Filtrar coleção por tonalidade' : 'Filter collection by color'}
      >
        <Palette size={13} className={activeColor ? 'text-brand-400' : 'text-slate-400'} />
        <span>{isPt ? 'Filtrar por Cor' : 'Filter by Color'}</span>

        {activeColor ? (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800 text-white font-mono text-[11px] border border-white/20">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: activeColor }}
            />
            <span className="truncate max-w-[85px]">{activeColorName}</span>
          </span>
        ) : null}

        <ChevronDown
          size={12}
          className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Active filter badge beside button */}
      {activeColor && (
        <div className="flex items-center gap-1.5 text-xs animate-fade-in shrink-0">
          <span className="text-zinc-400">{isPt ? 'Filtro ativo:' : 'Active filter:'}</span>
          <span className="font-semibold text-white">{activeColorName}</span>
          {totalMatchedCount !== undefined && (
            <span className="text-zinc-400 font-mono text-[11px]">
              ({totalMatchedCount} {totalMatchedCount === 1 ? (singularLabel || (isPt ? 'item' : 'item')) : (pluralLabel || (isPt ? 'itens' : 'items'))})
            </span>
          )}
          <button
            type="button"
            onClick={() => onSelectColor(null)}
            className="text-xs text-brand-400 hover:text-brand-300 font-semibold underline ml-1 cursor-pointer"
            title={isPt ? 'Limpar filtro de cor' : 'Clear color filter'}
          >
            {isPt ? 'Limpar' : 'Clear'}
          </button>
        </div>
      )}

      {/* Floating Popover via React Portal - Attached to document.body with z-[99999] so it ALWAYS overlays everything */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverMenuRef}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            zIndex: 99999
          }}
          className="w-76 sm:w-80 bg-zinc-950/95 backdrop-blur-2xl border border-white/20 rounded-2xl p-4 shadow-2xl space-y-3.5 animate-scale-up"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800/90 pb-2.5">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={13} className="text-brand-400" />
              <span>{isPt ? 'Cores da Coleção' : 'Collection Colors'}</span>
            </span>

            {activeColor && (
              <button
                type="button"
                onClick={() => {
                  onSelectColor(null);
                  setIsOpen(false);
                }}
                className="text-[11px] text-zinc-400 hover:text-white underline cursor-pointer"
              >
                {isPt ? 'Limpar Filtro' : 'Clear Filter'}
              </button>
            )}
          </div>

          {/* Collection Swatches Grid */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-zinc-400 font-medium">
              {isPt ? 'Tons encontrados nesta tela:' : 'Tones found on this screen:'}
            </span>

            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {swatches.map(item => {
                const isSelected = activeColor?.toLowerCase() === item.hex.toLowerCase();
                const label = isPt ? item.labelPt : item.labelEn;
                return (
                  <button
                    key={item.hex}
                    type="button"
                    onClick={() => {
                      onSelectColor(isSelected ? null : item.hex);
                      setIsOpen(false);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                      isSelected
                        ? 'bg-brand-600 text-white shadow-glow-brand ring-1 ring-white/30'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm border border-black/30"
                      style={{ backgroundColor: item.hex }}
                    />
                    <span className="truncate">{label}</span>
                    {item.count > 0 && (
                      <span className="text-[10px] opacity-75 ml-auto font-mono shrink-0">
                        ({item.count})
                      </span>
                    )}
                    {isSelected && <Check size={12} className="text-white shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Continuous Spectrum Color Picker Slider */}
          <div className="pt-2 border-t border-zinc-800/90 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 text-[11px] font-medium flex items-center gap-1">
                <SlidersHorizontal size={11} className="text-slate-400" />
                <span>{isPt ? 'Ou escolha no espectro livre:' : 'Or free spectrum slider:'}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-white/30 shadow-sm shrink-0"
                  style={{ backgroundColor: continuousHex }}
                />
                <span className="font-mono text-[10px] text-zinc-300 font-bold">{continuousHex}</span>
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="360"
              value={sliderHue}
              onChange={(e) => {
                const hue = Number(e.target.value);
                setSliderHue(hue);
                const hex = hslToHex(hue, 85, 50);
                setContinuousHex(hex);
                onSelectColor(hex);
              }}
              className="w-full h-2.5 rounded-full appearance-none cursor-pointer color-track focus:outline-none"
              title={isPt ? 'Arraste para selecionar qualquer matiz' : 'Drag to pick any hue'}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
