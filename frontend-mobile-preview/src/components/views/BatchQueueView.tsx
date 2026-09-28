import React, { useState } from 'react';
import { Layers, Plus, Clock, Play, Pause, Trash2, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ExtractionJob, AiEngineType } from '../../types';
import { AiEngineSelector } from '../common/AiEngineSelector';

import { backendApi } from '../../services/realApi';

export const BatchQueueView: React.FC = () => {
  const { jobs, addJob, activeAiEngine, settings, cancelJob, deleteJob } = useAppStore();
  const [newUrl, setNewUrl] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [batchEngine, setBatchEngine] = useState<AiEngineType>(activeAiEngine || 'gemini_layout_explorer');

  const queuedJobs = jobs.filter(j => j.status === 'queued' || j.status === 'active');
  const finishedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');

  const handleCancelJob = async (jobId: string) => {
    await cancelJob(jobId);
    deleteJob(jobId);
  };

  const handleClearActiveQueue = async () => {
    try {
      await fetch('/api/jobs/clear-queue', { method: 'POST' });
    } catch (_) {}
    for (const j of queuedJobs) {
      await cancelJob(j.id);
      deleteJob(j.id);
    }
  };

  const handleAddQueued = async () => {
    if (!newUrl.trim()) return;
    
    // Send to backend batch queue
    const batchJobs = await backendApi.startBatchExtraction(
      [newUrl],
      batchEngine,
      settings.aiModel,
      settings.geminiModel || 'gemini-3.7-flash',
      settings.reasoningBudget || 3,
      settings.maxConcurrency || 3,
      settings.antiBotDelayMs || 500,
      'all',
      settings.defaultAlbumFolder || 'Geral'
    );

    if (batchJobs && batchJobs.length > 0) {
      batchJobs.forEach((bJob: any) => {
        const job: ExtractionJob = {
          id: bJob.session_id,
          url: bJob.url,
          title: `Batch: ${bJob.url.slice(0, 30)}...`,
          status: 'queued',
          progressPercent: 0,
          discoveredImagesCount: 0,
          resolvedOriginalCount: 0,
          failedCount: 0,
          currentStage: `Na fila de espera (${batchEngine})`,
          startTime: new Date().toISOString(),
          durationSeconds: 0,
          throughputMbps: 0,
          fps: 0,
          mode: batchEngine as any,
          aiModel: settings.aiModel,
          priority
        };
        addJob(job);
        // Start live sync
        useAppStore.getState().subscribeToJob(bJob.session_id, bJob.url);
      });
    }

    setNewUrl('');
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Layers size={22} className="text-brand-400" />
            Batch Processor & Queue Planner
          </h1>
          <p className="text-xs text-slate-400">
            Planejador em lote com controle de concorrência, prioridades e agendamento noturno
          </p>
        </div>
      </div>

      {/* Add to Queue Bar */}
      <div className="p-4 glass-panel rounded-2xl border border-border flex flex-col sm:flex-row gap-3">
        <input
          type="url"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          placeholder="Adicionar URL à fila de extração em segundo plano..."
          className="flex-1 px-4 py-2 rounded-xl bg-surface-elevated border border-border text-slate-100 text-xs outline-none focus:border-brand-500"
        />
        <AiEngineSelector
          variant="compact"
          selectedEngine={batchEngine}
          onChange={(eng) => setBatchEngine(eng)}
        />
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as any)}
          className="px-3 py-2 rounded-xl bg-surface-elevated border border-border text-slate-300 text-xs outline-none"
        >
          <option value="high">Prioridade Alta (Top)</option>
          <option value="medium">Prioridade Média</option>
          <option value="low">Prioridade Baixa (Madrugada)</option>
        </select>
        <button
          onClick={handleAddQueued}
          className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-glow-brand transition-colors"
        >
          <Plus size={14} />
          <span>Enfileirar URL</span>
        </button>
      </div>

      {/* Kanban / Multi-Column Queue Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column 1: Active & Queued */}
        <div className="glass-panel p-4 rounded-2xl border border-border space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={14} className="text-amber-400" />
              Fila Ativa ({queuedJobs.length})
            </h3>
            <div className="flex items-center gap-2">
              {queuedJobs.length > 0 && (
                <button
                  onClick={handleClearActiveQueue}
                  className="flex items-center gap-1 text-[10px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded-lg border border-rose-500/30 transition-colors"
                  title="Cancelar e limpar todos os processos da fila ativa"
                >
                  <Trash2 size={12} />
                  <span>Limpar Fila</span>
                </button>
              )}
              <span className="text-[10px] font-mono text-slate-500">Concorrência: 4 Workers</span>
            </div>
          </div>

          <div className="space-y-2">
            {queuedJobs.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                Nenhuma extração enfileirada no momento.
              </div>
            ) : (
              queuedJobs.map(job => (
                <div
                  key={job.id}
                  className="p-3.5 rounded-xl bg-surface-elevated border border-border flex items-center justify-between gap-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded uppercase ${
                          job.priority === 'high'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-brand-500/20 text-brand-400'
                        }`}
                      >
                        {job.priority || 'medium'}
                      </span>
                      <span className="text-xs font-bold text-slate-100 truncate">{job.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{job.url}</div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-brand-400 font-bold">
                      {job.progressPercent}%
                    </span>
                    <button
                      onClick={() => handleCancelJob(job.id)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 transition-colors"
                      title="Cancelar e remover processo da fila"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: Completed / History */}
        <div className="glass-panel p-4 rounded-2xl border border-border space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={14} className="text-emerald-400" />
              Processados Recentemente ({finishedJobs.length})
            </h3>
            <span className="text-[10px] font-mono text-emerald-400">100% Original Yield</span>
          </div>

          <div className="space-y-2">
            {finishedJobs.map(job => (
              <div
                key={job.id}
                className="p-3.5 rounded-xl bg-surface-elevated border border-border flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs text-slate-100 truncate">{job.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {job.resolvedOriginalCount} fotos Original • {job.durationSeconds}s • {job.aiModel}
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                  CONCLUÍDO
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
