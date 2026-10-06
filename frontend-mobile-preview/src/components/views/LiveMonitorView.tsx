import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  Bot,
  ShieldAlert,
  Layers,
  CheckCircle2,
  Terminal,
  Crosshair,
  Zap,
  Globe,
  Radio,
  Trash2,
  Copy,
  Check,
  Pause,
  Play,
  Lock,
  Search,
  ExternalLink,
  Code
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { SetOfMarkCandidate, LogEntry } from '../../types';
import { translations } from '../../i18n/translations';
import { IconBadge } from '../common/IconBadge';

type LogTab = 'all' | 'ai' | 'dom' | 'network';

export const LiveMonitorView: React.FC = () => {
  const {
    setOfMarks,
    inspectingMarkId,
    logs,
    activeJob,
    jobs,
    activeJobs,
    setActiveJobById,
    subscribeToJob,
    setCoPilotOpen,
    navigateToView,
    settings,
    clearActiveJob,
    clearLogs
  } = useAppStore();

  const t = translations[settings.language].liveMonitor;

  const [activeTab, setActiveTab] = useState<LogTab>('all');
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Filter logs relevant to extraction and agent reasoning
  const agentLogs = logs.filter(
    l =>
      l.category.includes('AGENT') ||
      l.category.includes('QWEN') ||
      l.category.includes('DOM') ||
      l.category.includes('Original_RESOLVED') ||
      l.category.includes('INSPECTING') ||
      l.category.includes('AI_THOUGHT') ||
      l.category.includes('SELECTOR') ||
      l.category.includes('CANDIDATE') ||
      l.level === 'ai' ||
      l.level === 'dom'
  );

  const aiLogs = agentLogs.filter(
    l =>
      l.level === 'ai' ||
      l.category.includes('AI') ||
      l.category.includes('QWEN') ||
      l.category.includes('THOUGHT') ||
      l.category.includes('REASON')
  );

  const domLogs = agentLogs.filter(
    l =>
      l.level === 'dom' ||
      l.category.includes('DOM') ||
      l.category.includes('INSPECT') ||
      l.category.includes('SELECTOR') ||
      l.category.includes('MARK')
  );

  const networkLogs = agentLogs.filter(
    l =>
      l.level === 'network' ||
      l.category.includes('RESOLVED') ||
      l.category.includes('DOWNLOAD') ||
      l.category.includes('HTTP') ||
      l.category.includes('NETWORK')
  );

  const filteredLogs =
    activeTab === 'ai'
      ? aiLogs
      : activeTab === 'dom'
      ? domLogs
      : activeTab === 'network'
      ? networkLogs
      : agentLogs;

  // Auto-scroll to bottom of log stream unless paused
  useEffect(() => {
    if (!isAutoScrollPaused && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, isAutoScrollPaused]);

  const handleCopyLogs = () => {
    if (filteredLogs.length === 0) return;
    const text = filteredLogs
      .map(l => `[${l.timestamp}] [${l.category}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectJob = (jobId: string) => {
    setActiveJobById(jobId);
    const target = jobs.find(j => j.id === jobId);
    if (target) {
      subscribeToJob(target.id, target.url);
    }
  };

  const displayMarks: SetOfMarkCandidate[] = setOfMarks;
  const approvedCount = displayMarks.filter(m => m.type === 'album_item').length;
  const noiseCount = displayMarks.filter(m => m.type === 'banner_noise').length;

  // Derive target URL from active job
  const currentUrl = activeJob?.url || 'https://browser.virtual.playwright/session/standby';

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0 max-w-full">
        <div className="min-w-0 max-w-full">
          <h1 className="text-lg sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2.5 flex-wrap">
            <IconBadge variant="emerald" size="md">
              <Activity size={18} />
            </IconBadge>
            <span className="truncate">{t.title}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 break-words">
            {t.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => setCoPilotOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center gap-2 shadow-glow-brand transition-colors active:scale-95"
          >
            <Bot size={15} />
            <span className="hidden sm:inline">{t.coPilotBtn}</span>
            <span className="sm:hidden">Co-Pilot</span>
          </button>

          <button
            onClick={() => {
              clearActiveJob();
              clearLogs();
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600/30 text-rose-300 text-xs font-bold flex items-center gap-2 transition-colors active:scale-95"
            title={t.clearBtn}
          >
            <Trash2 size={15} />
            <span className="hidden sm:inline">{t.clearBtn}</span>
          </button>
        </div>
      </div>

      {/* Concurrent Jobs Switcher (if more than 1 active/queued job exists) */}
      {activeJobs && activeJobs.length > 1 && (
        <div className="glass-panel p-2.5 sm:p-3 rounded-2xl border border-white/10 flex items-center gap-2 overflow-x-auto touch-scroll">
          <span className="text-[11px] font-bold text-slate-400 shrink-0 font-mono flex items-center gap-1.5 pl-1">
            <Radio size={13} className="text-brand-400 animate-pulse" />
            {t.activeJobSelector}
          </span>
          <div className="flex items-center gap-1.5 min-w-0">
            {activeJobs.map(job => {
              const isSelected = activeJob?.id === job.id;
              return (
                <button
                  key={job.id}
                  onClick={() => handleSelectJob(job.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 flex items-center gap-2 transition-all ${
                    isSelected
                      ? 'bg-brand-600 text-white font-bold shadow-glow-brand border border-brand-400'
                      : 'bg-surface-elevated/70 text-slate-300 hover:bg-surface-elevated border border-white/5'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="truncate max-w-[140px] sm:max-w-[200px]">{job.title || job.url}</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/30 text-slate-300">
                    {job.progressPercent}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Job Status Banner */}
      {activeJob && (
        <div className="glass-panel p-3 sm:p-4 rounded-2xl border border-brand-500/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-brand-500/5 shadow-sm min-w-0 max-w-full overflow-hidden">
          <div className="flex items-center gap-2.5 min-w-0 max-w-full flex-1">
            <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 animate-pulse">
              <Radio size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="font-bold text-slate-100 truncate">{activeJob.title}</span>
                <span className="font-mono text-brand-400 font-bold px-2 py-0.5 rounded bg-brand-500/20 text-[10px] shrink-0">
                  {activeJob.progressPercent}%
                </span>
                <span className="text-[10px] text-slate-400 font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/5 truncate max-w-[260px]">
                  {activeJob.url}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate w-full min-w-0 font-mono mt-0.5">
                {activeJob.currentStage}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end sm:justify-center gap-2 shrink-0 font-mono text-[11px] text-slate-300 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
            <span>
              {t.resolved}{' '}
              <strong className="text-emerald-400">{activeJob.resolvedOriginalCount}</strong>/
              {activeJob.discoveredImagesCount}
            </span>
          </div>
        </div>
      )}

      {/* Main Split Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0 max-w-full">
        {/* Left 2 Cols: True Virtual Browser Canvas (Playwright Screencast) */}
        <div className="lg:col-span-2 glass-panel p-3.5 sm:p-4 rounded-3xl border border-border flex flex-col space-y-3 min-w-0 max-w-full overflow-hidden shadow-2xl">
          {/* Virtual Browser Window Frame Chrome */}
          <div className="flex flex-col gap-2 px-1 pb-2.5 border-b border-border/80">
            {/* Top Chrome: Traffic Light Buttons, Window Title & Viewport Info */}
            <div className="flex items-center justify-between text-xs text-slate-300 gap-2">
              <div className="flex items-center gap-2">
                {/* Traffic light dots */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                </div>
                <span className="text-xs font-semibold text-slate-200 ml-1.5 truncate">
                  {t.browserWindowLabel}
                </span>
              </div>

              {/* Viewport & Playwright Badges */}
              <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
                  {t.viewport1080}
                </span>
                <span className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1.5 ${
                  activeJob
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border border-white/5'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${activeJob ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {activeJob ? 'Playwright Chromium' : 'Standby'}
                </span>
              </div>
            </div>

            {/* Omnibox URL Navigation Bar */}
            <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 min-w-0">
              <div className="flex items-center gap-1 text-emerald-400 shrink-0 font-mono text-[10px] font-bold" title={t.secureHttps}>
                <Lock size={12} />
                <span className="hidden sm:inline">HTTPS</span>
              </div>
              <div className="h-3.5 w-px bg-white/10 shrink-0" />
              <div className="flex-1 truncate font-mono text-[11px] text-slate-200 select-all">
                {currentUrl}
              </div>
              <div className="shrink-0 font-mono text-[10px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/20">
                {t.statusHttp200}
              </div>
            </div>
          </div>

          {/* Screencast Viewport Container */}
          <div className="flex-1 bg-zinc-950 rounded-2xl border border-white/10 p-4 relative min-h-[420px] max-h-[580px] overflow-y-auto flex flex-col justify-start touch-scroll">
            {displayMarks.length > 0 ? (
              <div className="space-y-4 opacity-95">
                {/* Active Reticle Target Banner if currently inspecting a node */}
                {inspectingMarkId !== null && (
                  <div className="bg-brand-950/40 border border-brand-500/40 px-3 py-2 rounded-xl flex items-center justify-between text-xs text-brand-300 shadow-glow-brand animate-pulse">
                    <div className="flex items-center gap-2 font-mono font-bold">
                      <Crosshair size={15} className="animate-spin text-cyan-400" />
                      <span>{t.inspectingNode.replace('{id}', String(inspectingMarkId))}</span>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                      DOM Selector Engine
                    </span>
                  </div>
                )}

                {/* Annotated Set-of-Marks Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-1">
                  {displayMarks.map(som => {
                    const isInspecting = som.id === inspectingMarkId;
                    const isApproved = som.type === 'album_item';
                    const isNoise = som.type === 'banner_noise';

                    return (
                      <div
                        key={som.id}
                        className={`relative p-2 rounded-xl border-2 transition-all group flex flex-col justify-between ${
                          isInspecting
                            ? 'border-cyan-400 bg-cyan-950/30 shadow-glow-brand ring-2 ring-cyan-500/50 scale-[1.02]'
                            : isApproved
                            ? 'border-emerald-500/60 bg-emerald-950/20 hover:border-emerald-400'
                            : isNoise
                            ? 'border-rose-500/40 bg-rose-950/20 opacity-40 hover:opacity-75'
                            : 'border-amber-500/40 bg-amber-950/20'
                        }`}
                      >
                        {/* Dynamic Neon Inspector Reticle (Active on inspectingMarkId) */}
                        {isInspecting && (
                          <div className="absolute inset-0 pointer-events-none rounded-xl border-2 border-cyan-400 ring-2 ring-cyan-300/40 animate-pulse z-20 flex items-center justify-center">
                            <div className="absolute -top-3.5 right-2 z-30 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500 text-black font-mono font-black text-[9px] shadow-lg border border-cyan-300">
                              <Crosshair size={11} className="animate-spin" />
                              <span>{t.inspectingTag}</span>
                            </div>
                          </div>
                        )}

                        {/* Top Number Badge */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-black z-10 shadow-md ${
                              isApproved
                                ? 'bg-emerald-400 text-black'
                                : isNoise
                                ? 'bg-rose-400 text-white'
                                : 'bg-amber-400 text-black'
                            }`}
                          >
                            #{som.id < 10 ? `0${som.id}` : som.id}
                          </span>

                          <span
                            className={`font-mono text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              isApproved
                                ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-500/30'
                                : isNoise
                                ? 'text-rose-300 bg-rose-950/60 border border-rose-500/30'
                                : 'text-amber-300 bg-amber-950/60 border border-amber-500/30'
                            }`}
                          >
                            {isApproved ? t.targetMediaTag : isNoise ? t.noiseTag : t.inspectingTag}
                          </span>
                        </div>

                        {/* Candidate Thumbnail Viewport */}
                        <div className="w-full h-28 sm:h-32 rounded-lg bg-zinc-900 overflow-hidden relative">
                          <img
                            src={som.thumbnailUrl}
                            alt={som.label}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            onError={e => {
                              (e.target as HTMLElement).style.opacity = '0.4';
                            }}
                          />
                        </div>

                        {/* Technical Metadata Footer */}
                        <div className="mt-2 space-y-1">
                          <div className="text-[10px] font-mono text-slate-300 truncate font-semibold" title={som.label}>
                            {som.label}
                          </div>
                          {som.selector && (
                            <div className="text-[9px] font-mono text-slate-400 truncate flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded border border-white/5" title={som.selector}>
                              <Code size={10} className="text-brand-400 shrink-0" />
                              <span className="truncate">{som.selector}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* High-Tech Standby Canvas */
              <div className="text-center space-y-3 py-16 my-auto">
                <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-border flex items-center justify-center mx-auto text-slate-400 shadow-inner">
                  <Crosshair
                    size={28}
                    className={activeJob ? 'text-brand-400 animate-spin' : 'text-slate-500'}
                  />
                </div>
                <div className="max-w-sm mx-auto space-y-1">
                  <h3 className="text-sm font-bold text-slate-200">
                    {activeJob ? t.analyzingDomNodes : t.monitorStandby}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {activeJob ? t.analyzingDomNodesDesc : t.monitorStandbyDesc}
                  </p>
                </div>
                {!activeJob && (
                  <div className="flex items-center justify-center gap-2.5 pt-2">
                    <button
                      onClick={() => navigateToView('extractor')}
                      className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all shadow-glow-brand inline-flex items-center gap-1.5"
                    >
                      <Zap size={13} />
                      <span>{t.openExtractor}</span>
                    </button>
                    <button
                      onClick={() => navigateToView('batch-queue')}
                      className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-elevated/80 border border-white/10 text-slate-300 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    >
                      <Layers size={13} />
                      <span>{t.goToBatchQueue}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Telemetry HUD */}
          <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
            <div className="glass-panel p-2 rounded-xl border border-white/5 text-center">
              <span className="text-[10px] text-slate-400 block">{t.totalNodes}</span>
              <strong className="text-sm text-slate-100 font-bold">{displayMarks.length}</strong>
            </div>
            <div className="glass-panel p-2 rounded-xl border border-emerald-500/20 text-center">
              <span className="text-[10px] text-emerald-400 block">{t.approvedMedia}</span>
              <strong className="text-sm text-emerald-300 font-bold">{approvedCount}</strong>
            </div>
            <div className="glass-panel p-2 rounded-xl border border-rose-500/20 text-center">
              <span className="text-[10px] text-rose-400 block">{t.filteredNoise}</span>
              <strong className="text-sm text-rose-300 font-bold">{noiseCount}</strong>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Granular Technical Thought Chain (Chain-of-Thought Stream) */}
        <div className="glass-panel p-4 rounded-3xl border border-border flex flex-col space-y-3 min-w-0 max-w-full shadow-2xl">
          {/* Header & Controls */}
          <div className="flex items-center justify-between pb-2 border-b border-border text-xs font-semibold text-slate-200">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-brand-400" />
              <span>{t.thoughtChain}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/20">
                {activeJob ? t.liveStatus : t.readyStatus}
              </span>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-black/40 rounded-xl border border-white/5 text-[10px] font-mono">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-1 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'all'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{t.tabAll}</span>
              <span className="text-[9px] opacity-75">({agentLogs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`py-1 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'ai'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{t.tabAi}</span>
              <span className="text-[9px] opacity-75">({aiLogs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('dom')}
              className={`py-1 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'dom'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{t.tabDom}</span>
              <span className="text-[9px] opacity-75">({domLogs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('network')}
              className={`py-1 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'network'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{t.tabNetwork}</span>
              <span className="text-[9px] opacity-75">({networkLogs.length})</span>
            </button>
          </div>

          {/* Action Toolbar: Pause Scroll, Copy Logs, Clear Logs */}
          <div className="flex items-center justify-between text-xs px-1 text-slate-400">
            <button
              onClick={() => setIsAutoScrollPaused(!isAutoScrollPaused)}
              className={`px-2 py-1 rounded-lg border text-[10px] font-mono flex items-center gap-1 transition-colors ${
                isAutoScrollPaused
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10'
              }`}
              title={isAutoScrollPaused ? t.resumeScrollBtn : t.pauseScrollBtn}
            >
              {isAutoScrollPaused ? <Play size={11} /> : <Pause size={11} />}
              <span>{isAutoScrollPaused ? t.resumeScrollBtn : t.pauseScrollBtn}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyLogs}
                className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-[10px] font-mono flex items-center gap-1 transition-colors"
                title={t.copyLogsBtn}
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                <span>{copied ? t.logsCopied : t.copyLogsBtn}</span>
              </button>

              <button
                onClick={clearLogs}
                className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors"
                title={t.clearLogsBtn}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Thought Log Stream */}
          <div
            ref={logContainerRef}
            className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs max-h-[500px] min-h-[380px] touch-scroll"
          >
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log, idx) => {
                const isAi =
                  log.level === 'ai' ||
                  log.category.includes('AI') ||
                  log.category.includes('QWEN') ||
                  log.category.includes('THOUGHT');
                const isDom =
                  log.level === 'dom' ||
                  log.category.includes('DOM') ||
                  log.category.includes('INSPECT') ||
                  log.category.includes('SELECTOR');
                const isResolved =
                  log.category.includes('RESOLVED') ||
                  log.category.includes('Original_RESOLVED');
                const isError = log.level === 'error' || log.category.includes('ERROR');
                const isWarning = log.level === 'warning' || log.category.includes('FILTER');

                return (
                  <div
                    key={log.id || idx}
                    className={`p-2.5 rounded-xl border space-y-1 transition-all ${
                      isAi
                        ? 'bg-purple-950/20 border-purple-500/30 text-purple-200'
                        : isDom
                        ? 'bg-cyan-950/20 border-cyan-500/30 text-cyan-200'
                        : isResolved
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                        : isError
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                        : isWarning
                        ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                        : 'bg-surface-elevated/70 border-border text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[9px] font-mono font-bold">
                      <span
                        className={`px-1.5 py-0.2 rounded uppercase tracking-wider ${
                          isAi
                            ? 'bg-purple-500/20 text-purple-300'
                            : isDom
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : isResolved
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {log.category}
                      </span>
                      <span className="text-slate-400">{log.timestamp}</span>
                    </div>
                    <p className="text-slate-200 text-xs leading-relaxed font-sans break-words">
                      {log.message}
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="p-6 rounded-xl bg-surface-elevated/40 border border-white/5 text-center space-y-2 text-slate-400 my-auto">
                <Terminal size={22} className="mx-auto text-slate-500" />
                <p className="text-[11px]">
                  {activeJob ? t.receivingReasoning : t.waitingJobLogs}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
