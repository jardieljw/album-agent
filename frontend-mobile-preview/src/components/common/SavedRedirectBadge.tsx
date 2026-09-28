import React from 'react';
import { BookmarkCheck, ExternalLink, Folder, Layers } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export interface SavedStatusInfo {
  isSaved: boolean;
  isExactDuplicate?: boolean;
  hasAlternativeResolution?: boolean;
  savedFolder?: string;
  folder?: string;
  targetId?: string;
  targetView?: 'videos' | 'gallery';
  qualityLabel?: string;
}

interface SavedRedirectBadgeProps {
  isSaved?: boolean;
  folderName?: string;
  itemId?: string;
  targetView?: 'videos' | 'gallery';
  isAlternativeQuality?: boolean;
  qualityLabel?: string;
  className?: string;
  savedInfo?: SavedStatusInfo;
}

export const SavedRedirectBadge: React.FC<SavedRedirectBadgeProps> = ({
  isSaved: directIsSaved,
  folderName: directFolder,
  itemId: directItemId,
  targetView: directTargetView,
  isAlternativeQuality: directIsAlt,
  qualityLabel: directQuality,
  className = '',
  savedInfo
}) => {
  const isSaved = savedInfo ? savedInfo.isSaved : (directIsSaved ?? false);
  const folderName = savedInfo ? (savedInfo.savedFolder || savedInfo.folder || 'Extraídos') : (directFolder || 'Extraídos');
  const itemId = savedInfo ? savedInfo.targetId : directItemId;
  const targetView = savedInfo ? (savedInfo.targetView || 'videos') : (directTargetView || 'videos');
  const isAlternativeQuality = savedInfo ? (savedInfo.hasAlternativeResolution ?? false) : (directIsAlt ?? false);
  const qualityLabel = savedInfo ? savedInfo.qualityLabel : directQuality;
  const { navigateToSavedItem } = useAppStore();

  if (!isSaved) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigateToSavedItem && itemId) {
      navigateToSavedItem(targetView, folderName, itemId);
    }
  };

  if (isAlternativeQuality) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={`Uma versão com qualidade diferente (${qualityLabel || 'resolução alternativa'}) já está salva na pasta "${folderName}". Clique para visualizar na galeria.`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shadow-sm group border ${
          'bg-amber-950/80 hover:bg-amber-900/90 text-amber-300 border-amber-500/40 hover:border-amber-400'
        } ${className}`}
      >
        <Layers size={12} className="text-amber-400 group-hover:scale-110 transition-transform" />
        <span className="truncate max-w-[130px]">
          {qualityLabel ? `${qualityLabel} em ${folderName}` : `Salvo em ${folderName}`}
        </span>
        <ExternalLink size={10} className="text-amber-400/80 group-hover:translate-x-0.5 transition-transform" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Arquivo salvo na pasta "${folderName}". Clique para abrir e visualizar diretamente na galeria.`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shadow-sm group border ${
        'bg-emerald-950/85 hover:bg-emerald-900/90 text-emerald-300 border-emerald-500/40 hover:border-emerald-400'
      } ${className}`}
    >
      <BookmarkCheck size={12} className="text-emerald-400 group-hover:scale-110 transition-transform" />
      <span className="truncate max-w-[130px]">Salvo em {folderName}</span>
      <ExternalLink size={10} className="text-emerald-400/80 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
};
