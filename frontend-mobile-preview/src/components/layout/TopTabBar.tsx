import React from 'react';
import { X, Plus, Zap, FolderHeart, Activity, Terminal, Sliders, Layers, Film } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ViewId } from '../../types';

export const TopTabBar: React.FC = () => {
  const { openTabs, activeTabId, setActiveTab, closeTab, navigateToView } = useAppStore();

  const getTabIcon = (viewId: ViewId) => {
    switch (viewId) {
      case 'extractor': return <Zap size={13} className="text-brand-400" />;
      case 'gallery': return <FolderHeart size={13} className="text-accent-purple" />;
      case 'videos': return <Film size={13} className="text-violet-400" />;
      case 'live-monitor': return <Activity size={13} className="text-emerald-400" />;
      case 'album-detail': return <Sliders size={13} className="text-amber-400" />;
      case 'realtime-logs': return <Terminal size={13} className="text-cyan-400" />;
      default: return <Layers size={13} className="text-slate-400" />;
    }
  };

  return (
    <div
      onWheel={(e) => {
        e.currentTarget.scrollLeft += e.deltaY;
      }}
      className="h-10 bg-surface/90 border-b border-border flex items-center px-2 gap-1 overflow-x-auto no-scrollbar touch-scroll select-none"
    >
      {openTabs.map(tab => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group h-8 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 sm:gap-2 text-xs font-medium cursor-pointer transition-all border shrink-0 max-w-[160px] ${
              isActive
                ? 'bg-surface-elevated text-slate-100 border-border shadow-sm'
                : 'text-slate-400 hover:bg-surface-elevated/40 hover:text-slate-200 border-transparent'
            }`}
          >
            <span className="shrink-0">{getTabIcon(tab.viewId)}</span>
            <span className="max-w-[110px] sm:max-w-[140px] truncate">{tab.title}</span>
            {tab.isClosable && openTabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition-opacity"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={() => navigateToView('extractor')}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-elevated transition-colors"
        title="Nova Sessão"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};
