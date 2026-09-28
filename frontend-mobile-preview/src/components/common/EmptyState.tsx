import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl glass-panel border border-border">
      <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center text-brand-400 mb-4 shadow-inner border border-border">
        <Icon size={28} />
      </div>
      <h3 className="text-base font-bold text-slate-100 mb-1">{title}</h3>
      <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-brand transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
