import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, Trash2, Download, Search, Filter, Check, Code, LayoutList, ArrowDown } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const RealtimeLogsView: React.FC = () => {
  const { logs, clearLogs } = useAppStore();
  const [levelFilter, setLevelFilter] = useState<'all' | 'ai' | 'network' | 'dom' | 'warning' | 'error'>('all');
  const [viewMode, setViewMode] = useState<'cli' | 'cards'>('cli');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalTopRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter(l => {
    const matchesLevel = levelFilter === 'all' || l.level === levelFilter;
    const matchesSearch =
      l.message.toLowerCase().includes(search.toLowerCase()) ||
      l.category.toLowerCase().includes(search.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  // Auto-scroll to top where newest live logs arrive
  useEffect(() => {
    if (autoScroll && terminalTopRef.current) {
      terminalTopRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs.length, autoScroll]);

  const handleCopyLogs = () => {
    const text = logs
      .map(l => `${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportLog = () => {
    const text = logs
      .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `imagex_terminal_${Date.now()}.log`;
    link.click();
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0 max-w-full">
        <div>
          <h1 className="text-lg sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Terminal size={22} className="text-cyan-400 shrink-0" />
            <span>Terminal de Logs em Tempo Real</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Streaming ao vivo de comandos Playwright, raciocínio ReAct do Qwen e decisões do agente ({logs.length} linhas salvas)
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {/* Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-surface-elevated border border-border shrink-0">
            <button
              onClick={() => setViewMode('cli')}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-colors ${
                viewMode === 'cli' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Visualização Console CLI (Windows Stream)"
            >
              <Code size={13} />
              <span>Console CLI</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'cards' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Visualização em Cartões Formatados"
            >
              <LayoutList size={13} />
              <span>Formatado</span>
            </button>
          </div>

          <button
            onClick={handleCopyLogs}
            className="px-3 py-1.5 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5 transition-colors shrink-0"
            title="Copiar todo o log"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>
          <button
            onClick={handleExportLog}
            className="px-3 py-1.5 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5 transition-colors shrink-0"
            title="Exportar arquivo .log"
          >
            <Download size={13} />
            <span>.log</span>
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1.5 rounded-xl bg-surface-elevated hover:bg-rose-950/40 border border-border text-xs font-semibold text-rose-400 flex items-center justify-center gap-1.5 transition-colors shrink-0"
            title="Limpar Terminal (Permanente)"
          >
            <Trash2 size={13} />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel p-3 sm:p-4 rounded-2xl border border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs min-w-0 max-w-full">
        <div className="flex-1 relative min-w-0">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar nos eventos do terminal..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-surface-elevated border border-border text-slate-100 placeholder-slate-500 text-xs outline-none focus:border-brand-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-elevated border border-border overflow-x-auto no-scrollbar touch-scroll shrink-0">
          {(['all', 'ai', 'network', 'dom', 'warning', 'error'] as const).map(lvl => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`px-2.5 py-1 rounded-lg font-mono uppercase text-[10px] font-bold whitespace-nowrap transition-all ${
                levelFilter === lvl
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Centralized Terminal Display */}
      {viewMode === 'cli' ? (
        /* Pure Windows CLI Terminal Console Mode */
        <div className="bg-black/95 rounded-3xl border border-white/10 p-3 sm:p-5 font-mono text-[11px] sm:text-xs overflow-y-auto max-h-[580px] shadow-2xl touch-scroll min-h-[320px] flex flex-col space-y-1.5 border-t-2 border-t-cyan-500/60 leading-relaxed select-text">
          <div ref={terminalTopRef} />
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log) => {
              const msg = log.message;
              const isAi = log.level === 'ai' || msg.includes('Hypothesis') || msg.includes('AI') || msg.includes('[AI]');
              const isNet = log.level === 'network' || msg.includes('Navigating') || msg.includes('HTTP');
              const isDom = log.level === 'dom' || msg.includes('DOM') || msg.includes('Discovered');
              const isSuccess = msg.includes('aprovada') || msg.includes('salvo') || msg.includes('100%') || msg.includes('concluido');
              const isWarn = log.level === 'warning' || log.level === 'error' || msg.includes('Rejeitado') || msg.includes('falha');

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2 hover:bg-white/5 px-2 py-0.5 rounded transition-colors group"
                >
                  <span className="text-slate-600 select-none text-[10px] shrink-0 pt-0.5 font-mono">
                    {log.timestamp}
                  </span>
                  <span className="text-[10px] text-cyan-400/80 font-bold shrink-0 font-mono">
                    [{log.category}]
                  </span>
                  <div
                    className={`break-words break-all min-w-0 flex-1 font-mono ${
                      isWarn
                        ? 'text-rose-400 font-semibold'
                        : isSuccess
                        ? 'text-emerald-400 font-semibold'
                        : isAi
                        ? 'text-purple-300'
                        : isNet
                        ? 'text-cyan-300'
                        : isDom
                        ? 'text-amber-300'
                        : 'text-slate-200'
                    }`}
                  >
                    {msg}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="my-auto py-12 text-center text-slate-500 font-sans space-y-2">
              <Terminal size={32} className="mx-auto text-slate-600 opacity-60" />
              <p className="text-xs font-semibold text-slate-400">Terminal em espera. Nenhum log registrado.</p>
              <p className="text-[10px] text-slate-600 font-mono">
                Dispare uma extração para acompanhar o streaming linha por linha de todos os comandos.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Rich Structured Cards Mode */
        <div className="bg-zinc-950 rounded-3xl border border-white/10 p-3.5 sm:p-4 font-mono text-xs overflow-y-auto max-h-[580px] space-y-2 shadow-2xl touch-scroll min-h-[320px] flex flex-col">
          <div ref={terminalTopRef} />
          {filteredLogs.length > 0 ? (
            filteredLogs.map(log => (
              <div
                key={log.id}
                className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-2.5 leading-relaxed hover:bg-white/5 p-2 rounded-xl transition-colors border-b border-white/5 sm:border-0"
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                      log.level === 'ai'
                        ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40'
                        : log.level === 'network'
                        ? 'bg-brand-500/20 text-brand-400 border border-brand-500/40'
                        : log.level === 'dom'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : log.level === 'warning'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : log.level === 'error'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-slate-400 text-[10px] font-semibold">[{log.category}]</span>
                </div>

                <div className="text-slate-200 text-xs break-words break-all min-w-0 flex-1 pl-1 sm:pl-0">
                  {log.message}
                </div>
              </div>
            ))
          ) : (
            <div className="my-auto py-12 text-center text-slate-500 font-sans space-y-2">
              <Terminal size={32} className="mx-auto text-slate-600 opacity-60" />
              <p className="text-xs font-semibold text-slate-400">Nenhum evento registrado no momento.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
