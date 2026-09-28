import React from 'react';
import { Search, Bell, Menu, Command, Bot, Folder, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { translations } from '../../i18n/translations';

interface TopHeaderProps {
  onOpenMobileMenu?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onOpenMobileMenu }) => {
  const {
    settings,
    notifications,
    setNotificationDrawerOpen,
    setCommandPaletteOpen,
    setAiChatOpen,
    currentView,
    activeAlbumId,
    albums,
    activeAlbumFolder,
    setActiveAlbumFolder,
    navigateToView
  } = useAppStore();

  const t = translations[settings.language].header;
  const unreadCount = notifications.filter(n => !n.isRead).length;
  const currentAlbum = currentView === 'album-detail' ? albums.find(a => a.id === activeAlbumId) : null;

  return (
    <header className="h-14 border-b border-border glass-panel px-3 sm:px-4 flex items-center justify-between gap-3 select-none relative z-20 max-w-full">
      {/* Left: Mobile Menu & Active Folder Breadcrumb */}
      <div className="flex items-center gap-2 shrink-0">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-xl bg-surface-elevated border border-border text-slate-300 hover:text-white shrink-0 active:scale-95 transition-transform"
            title="Menu de Navegação"
            aria-label="Abrir Menu"
          >
            <Menu size={18} />
          </button>
        )}

        {/* Top Bar Folder Breadcrumb if viewing an album or filtered gallery folder */}
        {currentAlbum ? (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-surface-elevated/70 px-2.5 py-1 rounded-xl border border-border">
            <button
              onClick={() => {
                setActiveAlbumFolder(null);
                navigateToView('gallery');
              }}
              className="hover:text-brand-300 transition-colors"
              title="Ir para todos os álbuns"
            >
              Álbuns
            </button>
            <span className="text-slate-600">/</span>
            <button
              onClick={() => {
                setActiveAlbumFolder(currentAlbum.folder || 'Geral');
                navigateToView('gallery');
              }}
              className="text-violet-400 hover:text-violet-200 font-semibold flex items-center gap-1 cursor-pointer"
              title={`Ver todos os álbuns da pasta "${currentAlbum.folder || 'Geral'}"`}
            >
              <Folder size={12} />
              <span>{currentAlbum.folder || 'Geral'}</span>
            </button>
          </div>
        ) : activeAlbumFolder && currentView === 'gallery' ? (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-surface-elevated/70 pl-2.5 pr-1.5 py-1 rounded-xl border border-border">
            <span>Pasta:</span>
            <span className="text-violet-400 font-semibold flex items-center gap-1">
              <Folder size={12} />
              {activeAlbumFolder}
            </span>
            <button
              onClick={() => setActiveAlbumFolder(null)}
              className="p-0.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
              title="Limpar filtro de pasta"
            >
              <X size={12} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Center: Search & Raycast Trigger (Fluid responsive sizing) */}
      <div className="flex-1 min-w-0 max-w-2xl">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-surface-elevated/80 border border-border text-slate-400 hover:text-slate-200 hover:border-slate-700 text-xs transition-all shadow-inner truncate group"
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            <Search size={14} className="text-slate-400 group-hover:text-brand-400 transition-colors shrink-0" />
            <span className="truncate text-xs">{t.searchPlaceholder}</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-slate-400 shrink-0">
            <Command size={10} /> K
          </kbd>
        </button>
      </div>

      {/* Right: AI Chat & Notification Bell */}
      <div className="flex items-center gap-2 shrink-0">
        {/* AI Co-Pilot Chat Drawer Trigger */}
        <button
          onClick={() => setAiChatOpen(true)}
          className="p-2 sm:px-3 sm:py-2 rounded-xl bg-surface-elevated border border-border text-slate-300 hover:text-white hover:border-brand-500/40 relative transition-all shrink-0 active:scale-95 flex items-center gap-1.5 group"
          title="Abrir AI Chat Co-Pilot"
          aria-label="Abrir AI Chat Co-Pilot"
        >
          <Bot size={16} className="text-brand-400 group-hover:scale-110 transition-transform" />
          <span className="hidden md:inline text-xs font-semibold text-slate-200">AI Chat</span>
        </button>

        <button
          onClick={() => setNotificationDrawerOpen(true)}
          className="p-2 sm:p-2.5 rounded-xl bg-surface-elevated border border-border text-slate-400 hover:text-slate-200 hover:border-slate-700 relative transition-all shrink-0 active:scale-95"
          title={t.notifications}
          aria-label="Notificações"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
          )}
        </button>
      </div>
    </header>
  );
};
