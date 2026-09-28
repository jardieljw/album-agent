import React from 'react';
import { Zap, FolderHeart, ListTodo, Bot, Menu, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ViewId } from '../../types';

interface MobileBottomBarProps {
  onOpenMobileMenu: () => void;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({ onOpenMobileMenu }) => {
  const {
    currentView,
    navigateToView,
    setAiChatOpen,
    albums,
    jobs,
    isMobileBottomBarMinimized,
    setIsMobileBottomBarMinimized
  } = useAppStore();
  const activeJobsCount = jobs.filter(j => j.status === 'active').length;

  const tabs: { id: ViewId | 'ai-chat' | 'menu'; label: string; icon: any; badge?: string | null }[] = [
    { id: 'extractor', label: 'Extrator', icon: Zap },
    { id: 'gallery', label: 'Galeria', icon: FolderHeart, badge: albums.length > 0 ? albums.length.toString() : null },
    { id: 'job-history', label: 'Tarefas', icon: ListTodo, badge: activeJobsCount > 0 ? 'LIVE' : null },
    { id: 'ai-chat', label: 'Co-Pilot', icon: Bot },
    { id: 'menu', label: 'Menu', icon: Menu },
  ];

  // Minimized Compact Floating Trigger
  if (isMobileBottomBarMinimized) {
    return (
      <div className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-40 animate-fade-in">
        <button
          onClick={() => setIsMobileBottomBarMinimized(false)}
          className="px-3.5 py-1.5 rounded-full bg-surface/90 border border-brand-500/40 shadow-2xl backdrop-blur-xl flex items-center gap-2 text-xs font-semibold text-slate-200 hover:border-brand-400 active:scale-95 transition-all group"
          title="Expandir menu de navegação inferior"
        >
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-[11px] text-slate-300 capitalize">{currentView}</span>
          <ChevronUp size={14} className="text-slate-400 group-hover:text-white transition-colors" />
        </button>
      </div>
    );
  }

  // Full Expanded Bar with Collapse Handle
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 animate-fade-in">
      {/* Collapse Handle Button */}
      <div className="flex justify-center -mb-2 relative z-50 pointer-events-auto">
        <button
          onClick={() => setIsMobileBottomBarMinimized(true)}
          className="px-3 py-0.5 rounded-t-lg bg-surface/95 border-t border-x border-border/80 text-slate-400 hover:text-slate-200 text-[10px] flex items-center gap-1 shadow-md backdrop-blur-md"
          title="Minimizar barra inferior para tela cheia"
        >
          <ChevronDown size={12} />
          <span className="text-[9px] font-mono">Minimizar</span>
        </button>
      </div>

      <nav className="bg-surface/95 backdrop-blur-xl border-t border-border px-2 pt-1 pb-safe flex items-center justify-around shadow-2xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === currentView;

          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'ai-chat') {
                  setAiChatOpen(true);
                } else if (tab.id === 'menu') {
                  onOpenMobileMenu();
                } else {
                  navigateToView(tab.id as ViewId);
                }
              }}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all relative ${
                isActive
                  ? 'text-brand-400 font-bold scale-105'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon size={20} className={isActive ? 'text-brand-400' : 'text-slate-400'} />
                {tab.badge && (
                  <span className="absolute -top-1 -right-2.5 px-1.5 py-0.2 rounded-full bg-brand-500 text-white font-mono text-[9px] font-bold">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
