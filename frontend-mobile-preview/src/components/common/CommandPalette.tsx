import React, { useState, useEffect } from 'react';
import {
  Search,
  Zap,
  FolderHeart,
  Activity,
  Layers,
  MapPin,
  Copy,
  Terminal,
  BarChart3,
  Settings,
  X,
  Sparkles,
  Sliders,
  BookOpen,
  Film
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ViewId } from '../../types';

export const CommandPalette: React.FC = () => {
  const [query, setQuery] = useState('');
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    navigateToView,
    albums,
    openLightbox
  } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      } else if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const navCommands = [
    { label: 'Ir para Extrator de Mídia', viewId: 'extractor' as ViewId, icon: Zap, category: 'Navegação' },
    { label: 'Ir para Galeria de Álbuns', viewId: 'gallery' as ViewId, icon: FolderHeart, category: 'Navegação' },
    { label: 'Ir para Galeria de Vídeos', viewId: 'videos' as ViewId, icon: Film, category: 'Navegação' },
    { label: 'Abrir Monitor da IA ao Vivo', viewId: 'live-monitor' as ViewId, icon: Activity, category: 'Navegação' },
    { label: 'Abrir Detector de Duplicatas', viewId: 'duplicates' as ViewId, icon: Copy, category: 'Navegação' },
    { label: 'Inspecionar Regras por Site', viewId: 'domain-patterns' as ViewId, icon: BookOpen, category: 'Navegação' },
    { label: 'Ver Terminal de Logs em Tempo Real', viewId: 'realtime-logs' as ViewId, icon: Terminal, category: 'Navegação' },
    { label: 'Métricas & Armazenamento', viewId: 'performance-metrics' as ViewId, icon: BarChart3, category: 'Navegação' },
    { label: 'Preferências do Sistema', viewId: 'settings' as ViewId, icon: Settings, category: 'Navegação' },
  ];

  const filteredNav = navCommands.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  const filteredAlbums = albums.filter(a =>
    a.title.toLowerCase().includes(query.toLowerCase()) ||
    a.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={() => setCommandPaletteOpen(false)}
      ></div>

      <div className="relative w-full max-w-2xl bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col z-10 animate-scale-up">
        {/* Search Input */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Search size={18} className="text-brand-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Digite um comando, nome de página ou título de álbum..."
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm outline-none font-medium"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-elevated transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-4">
          {/* Navigation Items */}
          {filteredNav.length > 0 && (
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Comandos & Navegação
              </div>
              {filteredNav.map((cmd, idx) => {
                const Icon = cmd.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      navigateToView(cmd.viewId);
                      setCommandPaletteOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-brand-600/20 hover:text-brand-300 hover:border-brand-500/30 border border-transparent transition-all text-left"
                  >
                    <Icon size={16} className="text-brand-400" />
                    <span className="flex-1 font-medium">{cmd.label}</span>
                    <span className="text-[10px] font-mono text-slate-400">↵ Abrir</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Albums Matching Query */}
          {filteredAlbums.length > 0 && (
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Álbuns na Biblioteca ({filteredAlbums.length})
              </div>
              {filteredAlbums.slice(0, 5).map(album => (
                <button
                  key={album.id}
                  onClick={() => {
                    navigateToView('album-detail', album.id);
                    setCommandPaletteOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-surface-elevated hover:text-slate-100 border border-transparent transition-all text-left"
                >
                  <img
                    src={album.coverImage}
                    alt={album.title}
                    className="w-8 h-8 rounded-lg object-cover border border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-100 truncate">{album.title}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {album.imageCount} fotos • {album.sourceDomain}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-brand-500/20 text-brand-400 font-mono">
                    Original Verificado
                  </span>
                </button>
              ))}
            </div>
          )}

          {filteredNav.length === 0 && filteredAlbums.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-xs">
              Nenhum resultado encontrado para "{query}".
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-surface-elevated/40 flex items-center justify-between text-[11px] text-slate-400 px-4">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px]">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px]">↓</kbd>
            <span>para navegar</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px]">Esc</kbd>
            <span>para fechar</span>
          </div>
        </div>
      </div>
    </div>
  );
};
