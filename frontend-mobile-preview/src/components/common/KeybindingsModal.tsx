import React, { useEffect } from 'react';
import { X, Keyboard, Command } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const KeybindingsModal: React.FC = () => {
  const { keybindingsModalOpen, setKeybindingsModalOpen } = useAppStore();

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
    { key: 'Ctrl + K / Cmd + K', desc: 'Abrir Command Palette global' },
    { key: 'Seta Direita (->)', desc: 'Próxima foto no Lightbox / Slideshow' },
    { key: 'Seta Esquerda (<-)', desc: 'Foto anterior no Lightbox / Slideshow' },
    { key: 'Espaço', desc: 'Pausar ou Retomar Apresentação de Slides' },
    { key: 'Z', desc: 'Alternar zoom 100% / 250% no Lightbox' },
    { key: 'C', desc: 'Alternar Split Comparador Original' },
    { key: 'D', desc: 'Download direto do Original ativo' },
    { key: 'F', desc: 'Modo Tela Cheia (Fullscreen)' },
    { key: 'Esc', desc: 'Fechar modais, Lightbox, Slideshow ou busca' },
  ];

  return (
    <div
      onClick={() => setKeybindingsModalOpen(false)}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-surface border border-border shadow-2xl rounded-2xl w-full max-w-xl overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-brand-400" />
            <h3 className="font-bold text-sm text-slate-100">Atalhos de Teclado (Power User)</h3>
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
