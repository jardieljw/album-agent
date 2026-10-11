import React, { useEffect } from 'react';
import { X, Keyboard, Command } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  getModalAnimationClass,
  getSpeedClass,
  getDistanceClass
} from '../../services/motionConfig';

export const KeybindingsModal: React.FC = () => {
  const { keybindingsModalOpen, setKeybindingsModalOpen, settings } = useAppStore();
  const isPt = settings?.language === 'pt-BR';

  useEffect(() => {
    if (!keybindingsModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setKeybindingsModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keybindingsModalOpen, setKeybindingsModalOpen]);

  if (!keybindingsModalOpen) return null;

  const shortcuts = [
    { key: 'Ctrl + K / Cmd + K', desc: isPt ? 'Abrir Command Palette global' : 'Open global Command Palette' },
    { key: isPt ? 'Seta Direita (->)' : 'Right Arrow (->)', desc: isPt ? 'Próxima foto no Lightbox / Slideshow' : 'Next photo in Lightbox / Slideshow' },
    { key: isPt ? 'Seta Esquerda (<-)' : 'Left Arrow (<-)', desc: isPt ? 'Foto anterior no Lightbox / Slideshow' : 'Previous photo in Lightbox / Slideshow' },
    { key: isPt ? 'Espaço' : 'Space', desc: isPt ? 'Pausar ou Retomar Apresentação de Slides' : 'Pause or Resume Slideshow' },
    { key: 'Z', desc: isPt ? 'Alternar zoom 100% / 250% no Lightbox' : 'Toggle 100% / 250% zoom in Lightbox' },
    { key: 'C', desc: isPt ? 'Alternar Split Comparador Original' : 'Toggle Split Original Comparator' },
    { key: 'D', desc: isPt ? 'Download direto do Original ativo' : 'Direct download of active Original' },
    { key: 'F', desc: isPt ? 'Modo Tela Cheia (Fullscreen)' : 'Fullscreen mode' },
    { key: 'P / A', desc: isPt ? 'Alternar Ajustar à Tela / Preencher Tela (Fit / Fill)' : 'Toggle Fit to Screen / Fill Screen (Fit / Fill)' },
    { key: 'Esc', desc: isPt ? 'Fechar modais, Lightbox, Slideshow ou busca' : 'Close modals, Lightbox, Slideshow, or search' },
  ];

  return (
    <div
      onClick={() => setKeybindingsModalOpen(false)}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`bg-surface border border-border shadow-2xl rounded-2xl w-full max-w-xl overflow-hidden flex flex-col ${getModalAnimationClass(settings.modalAnimation || 'scale', settings.disableAllAnimations)} ${getSpeedClass(settings.animationSpeed || 'normal')} ${getDistanceClass(settings.animationDistance || 'normal')}`}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-brand-400" />
            <h3 className="font-bold text-sm text-slate-100">{isPt ? 'Atalhos de Teclado (Power User)' : 'Keyboard Shortcuts (Power User)'}</h3>
          </div>
          <button onClick={() => setKeybindingsModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-96 space-y-2 text-xs">
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-surface-elevated/60 border border-border flex items-center justify-between"
            >
              <span className="text-slate-300 font-medium">{s.desc}</span>
              <kbd className="px-2.5 py-1 rounded bg-surface border border-border text-[11px] font-mono text-brand-300 font-semibold shadow-inner">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
