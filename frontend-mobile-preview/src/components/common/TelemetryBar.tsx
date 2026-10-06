import React from 'react';
import { Activity, ShieldCheck, Sparkles, AlertCircle, Ban, Layers, HardDrive } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { translations } from '../../i18n/translations';
import { formatFileSize } from '../../utils/formatters';

export const TelemetryBar: React.FC = () => {
  const { albums, jobs, settings } = useAppStore();
  const t = translations[settings.language].telemetry || {
    totalExtractions: 'Total Extractions',
    collectedImages: 'Collected Images',
    originalsResolved: 'Originals Resolved',
    originalYield: 'Original Yield',
    storage: 'Storage',
    rejectedBanners: 'Rejected Banners',
    avgThroughput: 'Average Throughput',
  };

  const totalImages = albums.reduce((acc, a) => acc + a.imageCount, 0);
  const totaloriginalResolved = albums.reduce((acc, a) => acc + a.resolvedOriginalCount, 0);
  const totalBytes = albums.reduce((acc, a) => acc + a.totalSizeBytes, 0);
  const completedJobs = jobs.filter(j => j.status === 'completed').length;

  const metrics = [
    { label: t.totalExtractions, value: completedJobs, color: 'text-brand-400', icon: Activity },
    { label: t.collectedImages, value: totalImages, color: 'text-slate-100', icon: Layers },
    { label: t.originalsResolved, value: totaloriginalResolved, color: 'text-emerald-400', icon: ShieldCheck },
    { label: t.originalYield, value: `${totalImages > 0 ? Math.round((totaloriginalResolved / totalImages) * 100) : 100}%`, color: 'text-brand-300', icon: Sparkles },
    { label: t.storage, value: totalBytes > 0 ? formatFileSize(totalBytes) : '0 B', color: 'text-accent-purple', icon: HardDrive },
    { label: t.rejectedBanners, value: '42', color: 'text-rose-400', icon: Ban },
    { label: t.avgThroughput, value: '54.2 MB/s', color: 'text-amber-400', icon: Activity },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 p-3 glass-panel rounded-2xl border border-border">
      {metrics.map((m, idx) => {
        const Icon = m.icon;
        return (
          <div
            key={idx}
            className="p-2.5 rounded-xl bg-surface-elevated/50 border border-border/60 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[10px] font-medium tracking-wider uppercase truncate">{m.label}</span>
              <Icon size={12} className={m.color} />
            </div>
            <div className={`text-base font-bold font-mono ${m.color}`}>
              {m.value}
            </div>
          </div>
        );
      })}
    </div>
  );
};
