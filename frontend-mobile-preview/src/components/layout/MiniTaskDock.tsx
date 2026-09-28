import React from 'react';
import { X, ExternalLink, Activity, CheckCircle2, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { translations } from '../../i18n/translations';

export const MiniTaskDock: React.FC = () => {
  const {
    activeJob,
    activeJobs,
    isDockMinimized,
    setDockMinimized,
    setActiveJobById,
    navigateToView,
    settings,
    cancelJob
  } = useAppStore();
  const t = translations[settings.language].dock;

  if (!activeJob) return null;

  const isCompleted = activeJob.status === 'completed';
  const isPaused = activeJob.status === 'paused';
  const isVideoSave = (activeJob.mode as string) === 'video_save' || (activeJob.mode as string) === 'video_downloader';

  // Compact floating pill when minimized
  if (isDockMinimized) {
    return (
      <div className="fixed bottom-20 md:bottom-4 right-4 z-40 animate-fade-in">
        <button
          onClick={() => setDockMinimized(false)}
          className="glass-panel-elevated rounded-full py-2 px-3.5 sm:px-4 flex items-center gap-2 border border-brand-500/40 shadow-2xl bg-surface/95 backdrop-blur-xl hover:border-brand-400 hover:scale-105 active:scale-95 transition-all text-xs font-semibold text-slate-200 group"
          title="Expandir barra de tarefas em segundo plano"
        >
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isCompleted
                ? 'bg-emerald-400'
                : isPaused
                ? 'bg-amber-400'
                : 'bg-brand-400 animate-pulse'
            }`}
          />
          <span className="font-mono text-brand-300 font-bold">
            {activeJob.progressPercent}%
          </span>
          <span className="text-slate-300 text-[11px] truncate max-w-[140px] sm:max-w-[200px]">
            {activeJobs.length > 1
              ? `${activeJobs.length} tarefas ativas`
              : activeJob.title}
          </span>
          <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-200 transition-colors shrink-0 ml-0.5" />
        </button>
      </div>
    );
  }

  // Expanded full dock
  return (
    <div className="fixed bottom-20 md:bottom-4 right-3 left-3 sm:left-68 z-40 animate-fade-in">
      <div className="glass-panel-elevated rounded-2xl p-2.5 sm:p-3 sm:px-5 flex flex-col gap-2 border border-brand-500/30 shadow-2xl bg-surface/95 backdrop-blur-xl">
        {/* If multiple active jobs, show job switcher pills */}
        {activeJobs.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 border-b border-border/40 scrollbar-none">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
              <Layers size={11} className="text-brand-400" />
              Tarefas ({activeJobs.length}):
            </span>
            {activeJobs.map((j) => {
              const isCurrent = j.id === activeJob.id;
              return (
                <button
                  key={j.id}
                  onClick={() => setActiveJobById(j.id)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                    isCurrent
                      ? 'bg-brand-500/30 text-brand-300 border border-brand-500/50 shadow-sm font-semibold'
                      : 'bg-surface-elevated/70 text-slate-400 hover:text-slate-200 hover:bg-surface-elevated border border-transparent'
                  }`}
                  title={j.title}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${j.status === 'completed' ? 'bg-emerald-400' : 'bg-brand-400 animate-pulse'}`} />
                  <span className="truncate max-w-[100px] sm:max-w-[130px]">{j.title}</span>
                  <span className="font-mono text-[9px] text-slate-400">{j.progressPercent}%</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2.5 sm:gap-4">
          {/* Left Status & Title */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isCompleted
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : isPaused
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-brand-500/20 text-brand-400 animate-pulse'
              }`}
            >
              {isCompleted ? <CheckCircle2 size={16} /> : <Activity size={16} />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate max-w-[110px] sm:max-w-none">
                  {isPaused ? t.paused : (isVideoSave ? 'Download de Vídeo' : t.activeExtraction)}
                </span>
                <span className="text-xs font-mono font-bold text-brand-400 shrink-0">
                  {activeJob.progressPercent}%
                </span>
                <span className="text-[10px] text-slate-500 hidden md:inline font-mono">
                  {activeJob.throughputMbps} MB/s
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-200 truncate">
                {activeJob.title}
              </div>
              <div className="text-[11px] text-slate-400 truncate hidden sm:block">
                {activeJob.currentStage}
              </div>
            </div>
          </div>

          {/* Center Progress Bar */}
          <div className="hidden lg:block w-48 shrink-0">
            <div className="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden border border-border">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isCompleted
                    ? 'bg-emerald-500'
                    : isPaused
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-brand-500 to-accent-purple'
                }`}
                style={{ width: `${activeJob.progressPercent}%` }}
              ></div>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => {
                if (activeJob.resultAlbumId) {
                  navigateToView('album-detail', activeJob.resultAlbumId);
                } else if (isVideoSave) {
                  navigateToView(isCompleted ? 'videos' : 'job-history');
                } else {
                  navigateToView('live-monitor');
                }
              }}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors shadow-glow-brand whitespace-nowrap"
            >
              <ExternalLink size={12} className="shrink-0" />
              <span>{isCompleted ? (isVideoSave ? 'Ver Vídeos' : 'Ver Álbum') : (isVideoSave ? 'Ver Tarefas' : t.viewLive)}</span>
            </button>

            {/* Minimize toggle */}
            <button
              onClick={() => setDockMinimized(true)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-surface-elevated transition-colors"
              title="Minimizar dock"
            >
              <ChevronDown size={14} />
            </button>

            {/* Close/Cancel button */}
            <button
              onClick={() => {
                if (!isCompleted) cancelJob(activeJob.id);
                useAppStore.getState().setActiveJob(null);
              }}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-surface-elevated transition-colors"
              title={t.cancel}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
