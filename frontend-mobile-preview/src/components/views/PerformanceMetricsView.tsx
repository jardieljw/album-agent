import { translations } from '../../i18n/translations';
import React from 'react';
import { BarChart3, HardDrive, Sparkles, Image as ImageIcon, CheckCircle, FileImage, Layers, Cloud, Server, RefreshCw, AlertTriangle, Link2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const PerformanceMetricsView: React.FC = () => {
  const { albums, jobs, settings } = useAppStore();
  const isEn = settings?.language === 'en-US';
  const tPerf = translations[settings.language].performance;

  const allImages = albums.flatMap(a => a.images || []);
  const totalImages = allImages.length || albums.reduce((acc, a) => acc + a.imageCount, 0);
  const totalBytes = albums.reduce((acc, a) => acc + (a.totalSizeBytes || 0), 0);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const resolvedImages = allImages.filter(img => img.isResolvedOriginal || img.status === 'resolved');
  const yieldPercent = totalImages > 0 ? Math.round((resolvedImages.length / totalImages) * 100) : 0;

  // Real Resolution breakdown
  const uhdCount = allImages.filter(img => (img.width >= 3840 || img.height >= 2160)).length;
  const fhdCount = allImages.filter(img => (img.width >= 1920 || img.height >= 1080) && !(img.width >= 3840 || img.height >= 2160)).length;
  const hdCount = allImages.filter(img => (img.width >= 1280 || img.height >= 720) && !(img.width >= 1920 || img.height >= 1080)).length;
  const otherCount = allImages.length - uhdCount - fhdCount - hdCount;

  const getPct = (count: number) => allImages.length > 0 ? Math.round((count / allImages.length) * 100) : 0;
  const uhdPct = getPct(uhdCount);
  const fhdPct = getPct(fhdCount);
  const hdPct = getPct(hdCount);
  const otherPct = Math.max(0, 100 - uhdPct - fhdPct - hdPct);

  // Format Breakdown
  const formatCounts = allImages.reduce((acc: Record<string, number>, img) => {
    const fmt = (img.format || 'jpeg').toUpperCase();
    acc[fmt] = (acc[fmt] || 0) + 1;
    return acc;
  }, {});

  // Average size and megapixels
  const avgSizeBytes = allImages.length > 0 ? totalBytes / allImages.length : 0;
  const avgMp = allImages.length > 0
    ? (allImages.reduce((acc, img) => acc + (img.megapixels || 0), 0) / allImages.length).toFixed(1)
    : '0';

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full">
      <div>
        <h1 className="text-lg sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2">
          <BarChart3 size={22} className="text-brand-400 shrink-0" />
          <span>{tPerf.title || 'Performance & Storage Analytics'}</span>
        </h1>
        <p className="text-xs text-slate-400">
          {tPerf.subtitle || (isEn ? "Consolidated real-time metrics based on extracted albums and media" : "Métricas consolidadas em tempo real com base nos álbuns e imagens extraídos no sistema")}
        </p>
      </div>

      {/* Metric Cards Top Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 sm:p-5 glass-panel rounded-3xl border border-border space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Volume Armazenado</span>
            <HardDrive size={16} className="text-accent-purple shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-slate-100">
            {formatBytes(totalBytes)}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
            {(tPerf.albumsInLibrary || (isEn ? "{count} albums in library" : "{count} álbuns em biblioteca")).replace('{count}', String(albums.length))}
          </p>
        </div>

        <div className="p-4 sm:p-5 glass-panel rounded-3xl border border-border space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Rendimento Original</span>
            <Sparkles size={16} className="text-emerald-400 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-400">
            {totalImages > 0 ? `${yieldPercent}% Yield` : '0%'}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
            {(tPerf.resolvedOriginals || '{count} de {total} fotos em resolução original').replace('{count}', String(resolvedImages.length)).replace('{total}', String(totalImages))}
          </p>
        </div>

        <div className="p-4 sm:p-5 glass-panel rounded-3xl border border-border space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total de Imagens</span>
            <ImageIcon size={16} className="text-brand-400 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-brand-400">
            {totalImages}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
            {(tPerf.avgMegapixels || (isEn ? "Average {avg} MP per image" : "Média de {avg} MP por imagem")).replace('{avg}', String(avgMp))}
          </p>
        </div>

        <div className="p-4 sm:p-5 glass-panel rounded-3xl border border-border space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>{tPerf.avgSize || (isEn ? "Average Size" : "Tamanho Médio")}</span>
            <Layers size={16} className="text-amber-400 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-amber-400">
            {formatBytes(avgSizeBytes)}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
            {(tPerf.tasksCompleted || (isEn ? "{count} tasks completed successfully" : "{count} tarefas concluídas com sucesso")).replace('{count}', String(jobs.filter(j => j.status === 'completed').length))}
          </p>
        </div>
      </div>

      {/* Resolution Distribution Bar (Calculated Dynamically) */}
      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border space-y-3.5 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs sm:text-sm text-slate-200">{tPerf.resolutionDistribution || (isEn ? "Collected Resolution Distribution" : "Distribuição de Resoluções Coletadas")}</h3>
          <span className="text-[11px] text-slate-400 font-mono">{allImages.length} fotos analisadas</span>
        </div>

        {allImages.length > 0 ? (
          <>
            <div className="h-3.5 sm:h-4 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              {uhdPct > 0 && (
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${uhdPct}%` }}
                  title={`Ultra HD / 4K+: ${uhdCount} (${uhdPct}%)`}
                />
              )}
              {fhdPct > 0 && (
                <div
                  className="h-full bg-brand-500 transition-all duration-500"
                  style={{ width: `${fhdPct}%` }}
                  title={`Full HD 1080p: ${fhdCount} (${fhdPct}%)`}
                />
              )}
              {hdPct > 0 && (
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${hdPct}%` }}
                  title={`HD 720p: ${hdCount} (${hdPct}%)`}
                />
              )}
              {otherPct > 0 && (
                <div
                  className="h-full bg-slate-600 transition-all duration-500"
                  style={{ width: `${otherPct}%` }}
                  title={`Outros/Nativos: ${otherCount} (${otherPct}%)`}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                4K UHD ({uhdCount} • {uhdPct}%)
              </span>
              <span className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500 shrink-0"></span>
                1080p FHD ({fhdCount} • {fhdPct}%)
              </span>
              <span className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                720p HD ({hdCount} • {hdPct}%)
              </span>
              <span className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-600 shrink-0"></span>
                Outros ({otherCount} • {otherPct}%)
              </span>
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-xs text-slate-500">
            {tPerf.noImagesExtracted || (isEn ? "No images extracted yet to compute distribution." : "Nenhuma imagem extraída ainda para calcular a distribuição.")}
          </div>
        )}
      </div>

      {/* Formats and Album Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Formats breakdown */}
        <div className="glass-panel p-4 sm:p-5 rounded-3xl border border-border space-y-3">
          <h3 className="font-bold text-xs sm:text-sm text-slate-200 flex items-center gap-2">
            <FileImage size={16} className="text-brand-400" />
            <span>Formatos de Imagem Detectados</span>
          </h3>
          {Object.keys(formatCounts).length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {Object.entries(formatCounts).map(([fmt, count]) => (
                <div key={fmt} className="p-3 rounded-2xl bg-surface-elevated/40 border border-border text-center">
                  <div className="text-xs font-mono font-bold text-brand-300">{fmt}</div>
                  <div className="text-lg font-mono font-extrabold text-slate-100">{count}</div>
                  <div className="text-[10px] text-slate-400">
                    {allImages.length > 0 ? Math.round((count / allImages.length) * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Nenhum formato registrado.</p>
          )}
        </div>

        {/* Extraction Summary */}
        <div className="glass-panel p-4 sm:p-5 rounded-3xl border border-border space-y-3">
          <h3 className="font-bold text-xs sm:text-sm text-slate-200 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" />
            <span>{tPerf.pipelineEfficiency || (isEn ? "Pipeline Efficiency" : "Eficiência do Pipeline")}</span>
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 rounded-xl bg-surface-elevated/30 border border-border/50">
              <span className="text-slate-400">{tPerf.originalYieldRate || (isEn ? "Original Resolution Rate:" : "Taxa de Resolução Original:")}</span>
              <span className="font-mono font-bold text-emerald-400">{yieldPercent}%</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-xl bg-surface-elevated/30 border border-border/50">
              <span className="text-slate-400">{tPerf.totalIndexedAlbums || (isEn ? "Total Indexed Albums:" : "Total de Álbuns Indexados:")}</span>
              <span className="font-mono font-bold text-slate-200">{albums.length}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-xl bg-surface-elevated/30 border border-border/50">
              <span className="text-slate-400">Fila de Processamento:</span>
              <span className="font-mono font-bold text-slate-200">
                {jobs.filter(j => j.status === 'active').length} em andamento
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cloud & Local Multi-Storage Infrastructure Dashboard */}
      <StorageInfrastructureSection />
    </div>
  );
};

// Componente dedicado para monitoramento em tempo real do Hugging Face e Render
const StorageInfrastructureSection: React.FC = () => {
  const { settings } = useAppStore();
  const isEn = settings?.language === 'en-US';
  const tPerf = translations[settings.language].performance;
  const [stats, setStats] = React.useState<any>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/storage/analytics', { cache: 'no-store' });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (e) {
      console.warn('Erro ao carregar estatísticas de storage:', e);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const formatMB = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  const hf = stats?.cloud_huggingface;
  const renderLocal = stats?.render_local;
  const streamOnly = stats?.stream_only;

  return (
    <div className="glass-panel p-5 sm:p-6 rounded-3xl border border-brand-500/30 bg-gradient-to-b from-slate-900/60 to-slate-950/80 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-sm sm:text-base font-black text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
            <span>Infraestrutura de Armazenamento & Nuvem Gratuita</span>
          </h2>
          <p className="text-xs text-slate-400">
            Monitoramento de cotas em tempo real: Hugging Face (10 GB), Transbordo Render e Streams
          </p>
        </div>
        <button
          onClick={loadStats}
          disabled={loading}
          className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-surface-elevated border border-border text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'Atualizando...' : 'Atualizar Cotas'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Hugging Face Cloud Storage */}
        <div className="p-4 rounded-2xl bg-surface/50 border border-purple-500/30 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
              <Cloud size={14} className="text-purple-400" />
              <span>Hugging Face Hub</span>
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
              hf?.is_connected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {hf?.is_connected ? '● CONECTADO' : '○ OFFLINE'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xl font-mono font-black text-slate-100">
                {formatMB(hf?.total_bytes_used || 0)}
              </span>
              <span className="text-xs font-mono text-slate-400">
                de 10.00 GB ({hf?.used_percentage || 0}%)
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ${
                  (hf?.used_percentage || 0) > 85 ? 'bg-rose-500' : 'bg-purple-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, hf?.used_percentage || 0))}%` }}
              />
            </div>
          </div>

          <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-border/40">
            <div className="flex justify-between">
              <span>{tPerf.secureStorage || (isEn ? "Secure Storage:" : "Repositório Seguro:")}</span>
              <span className="font-mono text-purple-300">{hf?.repo_id || 'album-data'}</span>
            </div>
            <div className="flex justify-between">
              <span>{tPerf.archivedVideos || (isEn ? "Archived Videos:" : "Vídeos Arquivados:")}</span>
              <span className="font-mono text-slate-200">{hf?.app_recorded_videos || hf?.files_count || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Custo:</span>
              <span className="font-bold text-emerald-400">{tPerf.freeForever || "100% Gratuito (Sem Cartão)"}</span>
            </div>
          </div>
        </div>

        {/* Render Local Storage (Transbordo / Fallback) */}
        <div className="p-4 rounded-2xl bg-surface/50 border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Server size={14} className="text-amber-400" />
              <span>Render Local (Transbordo)</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {isEn ? "TEMPORARY DISK" : "DISCO TEMPORÁRIO"}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xl font-mono font-black text-slate-100">
                {formatMB(renderLocal?.total_bytes_used || 0)}
              </span>
              <span className="text-xs font-mono text-slate-400">
                {renderLocal?.videos_count || 0} {isEn ? "video(s)" : "vídeo(s)"}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-700"
                style={{ width: `${Math.min(100, Math.max(4, ((renderLocal?.total_bytes_used || 0) / (500 * 1024 * 1024)) * 100))}%` }}
              />
            </div>
          </div>

          <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-border/40">
            <p className="text-[10px] text-amber-300/90 leading-tight flex items-start gap-1">
              <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
              <span>{isEn ? "Stores spillover when cloud is full. Render restarts periodically; export or migrate local files when needed." : "Armazena excessos caso a nuvem esteja cheia. O Render reinicia periodicamente; exclua ou migre arquivos locais quando possível."}</span>
            </p>
          </div>
        </div>

        {/* Streaming Remoto / Sem Custo */}
        <div className="p-4 rounded-2xl bg-surface/50 border border-cyan-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
              <Link2 size={14} className="text-cyan-400" />
              <span>Streaming Puro (URLs)</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              ZERO DISCO
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xl font-mono font-black text-cyan-300">
                {streamOnly?.videos_count || 0} {isEn ? "videos" : "vídeos"}
              </span>
              <span className="text-xs font-mono text-slate-400">
                0 MB consumidos
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 w-full" />
            </div>
          </div>

          <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-border/40">
            <p className="text-[10px] text-slate-300 leading-tight">
              {isEn ? "Videos streamed directly from origin server without physical download, saving 100% disk storage." : "Vídeos reproduzidos diretamente do servidor de origem sem download físico, preservando 100% da sua cota de armazenamento."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
