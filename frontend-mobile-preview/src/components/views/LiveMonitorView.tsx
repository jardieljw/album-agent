import React from 'react';
import {
  Activity,
  Bot,
  ShieldAlert,
  Sparkles,
  Layers,
  CheckCircle2,
  Terminal,
  Send,
  Eye,
  Crosshair,
  Zap,
  Globe,
  Radio,
  Trash2
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { SetOfMarkCandidate } from '../../types';

export const LiveMonitorView: React.FC = () => {
  const { setOfMarks, inspectingMarkId, logs, activeJob, albums, activeAlbumId, setCoPilotOpen, navigateToView, settings, clearActiveJob } = useAppStore();

  const agentLogs = logs.filter(
    l => l.category.includes('AGENT') ||
         l.category.includes('QWEN') ||
         l.category.includes('DOM') ||
         l.category.includes('Original_RESOLVED') ||
         l.category.includes('INSPECTING') ||
         l.level === 'ai' ||
         l.level === 'dom'
  );

  // Only display real live marks from active/recent sessions
  const displayMarks: SetOfMarkCandidate[] = setOfMarks;

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0 max-w-full">
        <div className="min-w-0 max-w-full">
          <h1 className="text-lg sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2 flex-wrap">
            <Activity size={20} className="text-emerald-400 shrink-0" />
            <span className="truncate">AI Live Monitor & Screencast</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 break-words">
            Acompanhamento em tempo real das decisões de visão computacional do agente
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setCoPilotOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center gap-2 shadow-glow-brand transition-colors"
          >
            <Bot size={15} />
            <span className="hidden sm:inline">Intervir com Co-Pilot</span>
            <span className="sm:hidden">Co-Pilot</span>
          </button>
          
          <button
            onClick={clearActiveJob}
            className="px-3.5 py-2 rounded-xl bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600/30 text-rose-300 text-xs font-bold flex items-center gap-2 transition-colors active:scale-95"
            title="Limpar Monitor e resetar tela de visualização"
          >
            <Trash2 size={15} />
            <span>Limpar Monitor</span>
          </button>
        </div>
      </div>

      {/* Active Job Status Banner (if running or completed) */}
      {activeJob && (
        <div className="glass-panel p-3 sm:p-4 rounded-2xl border border-brand-500/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-brand-500/5 shadow-sm min-w-0 max-w-full overflow-hidden">
          <div className="flex items-center gap-2.5 min-w-0 max-w-full flex-1">
            <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 animate-pulse">
              <Radio size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-100 truncate">{activeJob.title}</span>
                <span className="font-mono text-brand-400 font-bold px-2 py-0.5 rounded bg-brand-500/20 text-[10px] shrink-0">
                  {activeJob.progressPercent}%
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate w-full min-w-0 font-mono mt-0.5">
                {activeJob.currentStage}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end sm:justify-center gap-2 shrink-0 font-mono text-[11px] text-slate-300 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
            <span>Resolvidos: <strong className="text-emerald-400">{activeJob.resolvedOriginalCount}</strong>/{activeJob.discoveredImagesCount}</span>
          </div>
        </div>
      )}

      {/* Main Split Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0 max-w-full">
        {/* Left 2 Cols: Visual Screencast & Set-of-Marks Canvas */}
        <div className="lg:col-span-2 glass-panel p-3.5 sm:p-4 rounded-3xl border border-border flex flex-col space-y-3 min-w-0 max-w-full overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-1 pb-2 border-b border-border text-xs font-semibold text-slate-300 gap-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeJob ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></span>
              <span className="truncate">Virtual Browser Canvas (Set-of-Marks)</span>
            </div>
            <span className="text-[10px] font-mono text-brand-400 shrink-0">
              {activeJob ? 'Playwright Chromium • 1920×1080' : 'Standby • Aguardando Job'}
            </span>
          </div>

          {/* Screencast Viewport Container */}
          <div className="flex-1 bg-zinc-950 rounded-2xl border border-white/10 p-4 relative min-h-[380px] max-h-[520px] overflow-y-auto flex flex-col justify-start touch-scroll">
            {displayMarks.length > 0 ? (
              <div className="space-y-4 opacity-95">
                {/* Annotated Set-of-Marks Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-2">
                  {displayMarks.map(som => (
                    <div
                      key={som.id}
                      className={`relative p-1.5 rounded-xl border-2 transition-all ${
                        som.id === inspectingMarkId
                          ? 'border-brand-400 bg-brand-950/30 shadow-glow-brand ring-2 ring-brand-500/50 scale-[1.02]'
                          : som.type === 'album_item'
                          ? 'border-emerald-500 bg-emerald-950/20 shadow-glow-emerald'
                          : som.type === 'banner_noise'
                          ? 'border-rose-500 bg-rose-950/20 opacity-40'
                          : 'border-amber-500 bg-amber-950/20'
                      }`}
                    >
                      {/* Top Focus Reticle Badge (The blue spinning inspector) */}
                      {som.id === inspectingMarkId && (
                        <div className="absolute -top-3 right-1 z-30 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-500 text-white font-mono font-black text-[9px] shadow-lg border border-brand-300 animate-pulse">
                          <Crosshair size={11} className="animate-spin" />
                          <span>Agent Inspecting DOM #{som.id < 10 ? `0${som.id}` : som.id}</span>
                        </div>
                      )}

                      {/* Number Tag */}
                      <span
                        className={`absolute -top-2.5 -left-2 px-2 py-0.5 rounded-full font-mono text-[10px] font-black text-black z-20 shadow-md ${
                          som.type === 'album_item'
                            ? 'bg-emerald-400'
                            : som.type === 'banner_noise'
                            ? 'bg-rose-400 text-white'
                            : 'bg-amber-400'
                        }`}
                      >
                        #{som.id}
                      </span>

                      <img
                        src={som.thumbnailUrl}
                        alt={som.label}
                        className="w-full h-24 sm:h-28 object-cover rounded-lg bg-zinc-900"
                        onError={(e) => {
                          (e.target as HTMLElement).style.opacity = '0.5';
                        }}
                      />
                      <div className="mt-1 text-[10px] font-medium text-slate-300 truncate font-mono">
                        {som.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* High-tech Standby Canvas */
              <div className="text-center space-y-3 py-12 my-auto">
                <div className="w-14 h-14 rounded-2xl bg-surface-elevated border border-border flex items-center justify-center mx-auto text-slate-400 shadow-inner">
                  <Crosshair size={26} className={activeJob ? 'text-brand-400 animate-spin' : 'text-slate-500'} />
                </div>
                <div className="max-w-sm mx-auto space-y-1">
                  <h3 className="text-sm font-bold text-slate-200">
                    {activeJob ? 'Analisando Nós do DOM...' : 'Monitor em Espera (Standby)'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {activeJob
                      ? 'O agente Playwright está inspecionando seletores e capturando candidatos visuais.'
                      : 'Nenhuma extração em andamento. Inicie um processo no Extrator para visualizar o screencast ao vivo.'}
                  </p>
                </div>
                {!activeJob && (
                  <button
                    onClick={() => navigateToView('extractor')}
                    className="mt-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all shadow-glow-brand inline-flex items-center gap-1.5"
                  >
                    <Zap size={13} />
                    <span>Abrir Extrator</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Live Human-Readable Thought Stream */}
        <div className="glass-panel p-4 rounded-3xl border border-border flex flex-col space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border text-xs font-semibold text-slate-200">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-brand-400" />
              <span>Cadeia de Raciocínio (ReAct)</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400">
              {activeJob ? 'Ao Vivo' : 'Pronto'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs max-h-[420px] touch-scroll">
            {agentLogs.length > 0 ? (
              agentLogs.map((log, idx) => (
                <div
                  key={log.id || idx}
                  className={`p-3 rounded-xl border space-y-1 ${
                    log.level === 'ai'
                      ? 'bg-accent-purple/10 border-accent-purple/30 text-accent-purple'
                      : log.level === 'dom'
                      ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                      : 'bg-surface-elevated/80 border-border text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold">
                    <span className="uppercase tracking-wider">{log.category}</span>
                    <span className="text-slate-400">{log.timestamp}</span>
                  </div>
                  <p className="text-slate-200 text-xs leading-relaxed">
                    {log.message}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-4 rounded-xl bg-surface-elevated/40 border border-white/5 text-center space-y-2 text-slate-400">
                <Terminal size={20} className="mx-auto text-slate-500" />
                <p className="text-[11px]">
                  {activeJob
                    ? 'Recebendo raciocínio do modelo Qwen 2.5...'
                    : 'Aguardando início de tarefas para transmitir a cadeia de pensamento.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
