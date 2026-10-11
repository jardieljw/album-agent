import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Shield,
  Cloud,
  Share2,
  Check,
  Sparkles,
  Archive
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { backendApi } from '../../services/realApi';
import {
  getModalAnimationClass,
  getSpeedClass,
  getDistanceClass
} from '../../services/motionConfig';

export const ExportModal: React.FC = () => {
  const { exportModalOpen, exportModalAlbum, closeExportModal, addNotification, settings } = useAppStore();
  const isEn = settings.language === "en-US";
  const [namingPattern, setNamingPattern] = useState('{album}_{index}_{res}');
  const [removeExif, setRemoveExif] = useState(false);
  const [exportFormat, setExportFormat] = useState<'zip' | 'json' | 'csv' | 'markdown'>('zip');
  const [exported, setExported] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!exportModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeExportModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exportModalOpen, closeExportModal]);

  if (!exportModalOpen || !exportModalAlbum) return null;

  const handleExport = () => {
    setExported(true);

    if (exportFormat === 'zip') {
      const params = new URLSearchParams();
      if (removeExif) params.append('remove_exif', 'true');
      if (namingPattern && namingPattern.trim()) params.append('naming_pattern', namingPattern.trim());
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const zipUrl = `/api/albums/${exportModalAlbum.id}/download-zip${queryStr}`;
      const zipName = `${exportModalAlbum.title || 'album'}.zip`;

      addNotification({
        type: 'info',
        title: isEn ? 'Generating ZIP Package' : 'Gerando Pacote ZIP',
        message: isEn ? `Compressing and preparing "${zipName}" for download...` : `Compactando e preparando "${zipName}" para download...`
      });

      backendApi.downloadToDisk(zipUrl, zipName, true).then(res => {
        if (res.success) {
          addNotification({
            type: 'success',
            title: isEn ? 'ZIP Saved Successfully' : 'ZIP Salvo com Sucesso',
            message: isEn ? `Package saved to Downloads folder: "${res.filename || zipName}".` : `Pacote salvo na pasta Downloads: "${res.filename || zipName}".`
          });
        } else {
          window.location.href = zipUrl;
        }
      });
    } else if (exportFormat === 'markdown') {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(`<html><head><title>${exportModalAlbum.title}</title></head><body style="font-family: sans-serif; padding: 20px;"><h1>${exportModalAlbum.title}</h1><p>Source: <a href="${exportModalAlbum.sourceUrl}">${exportModalAlbum.sourceDomain}</a></p>`);
        (exportModalAlbum.images || []).forEach(img => {
          w.document.write(`<div style="margin-bottom: 20px;"><img src="${img.originalUrl}" style="max-width: 100%; border-radius: 8px;" /><p><strong>${img.title}</strong> - ${img.width}x${img.height} - ${img.aspectRatio}</p></div>`);
        });
        w.document.write(`</body></html>`);
        w.document.close();
      }
    } else if (exportFormat === 'json') {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportModalAlbum, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${exportModalAlbum.title}_metadata.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } else if (exportFormat === 'csv') {
      let csvContent = 'data:text/csv;charset=utf-8,ID,Title,Width,Height,Aspect,URL\n';
      (exportModalAlbum.images || []).forEach(img => {
        csvContent += `"${img.id}","${img.title}",${img.width},${img.height},"${img.aspectRatio}","${img.originalUrl}"\n`;
      });
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${exportModalAlbum.title}_manifest.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    setTimeout(() => {
      setExported(false);
      closeExportModal();
    }, 1200);
  };

  return (
    <div
      onClick={closeExportModal}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`bg-surface border border-border shadow-2xl rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col ${getModalAnimationClass(settings.modalAnimation || 'scale', settings.disableAllAnimations)} ${getSpeedClass(settings.animationSpeed || 'normal')} ${getDistanceClass(settings.animationDistance || 'normal')}`}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-brand-500/20 text-brand-400">
              <Archive size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">{isEn ? "Export & Packaging Center" : "Central de Exportação & Empacotamento"}</h3>
              <p className="text-[11px] text-slate-400">{isEn ? "Export Original assets in structured packages or generate metadata" : "Exporte os ativos Original em pacotes estruturados ou gere metadados"}</p>
            </div>
          </div>
          <button onClick={closeExportModal} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs">
          {/* Format Picker */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              {isEn ? "Output Format" : "Formato de Saída"}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => setExportFormat('zip')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                  exportFormat === 'zip'
                    ? 'bg-brand-500/20 border-brand-500 text-brand-300 shadow-glow-brand'
                    : 'bg-surface-elevated border-border text-slate-400'
                }`}
              >
                <Archive size={20} className={exportFormat === 'zip' ? 'text-brand-400' : ''} />
                <span className="font-bold">{isEn ? "Original ZIP Package" : "Pacote ZIP Original"}</span>
              </button>

              <button
                onClick={() => setExportFormat('json')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                  exportFormat === 'json'
                    ? 'bg-brand-500/20 border-brand-500 text-brand-300 shadow-glow-brand'
                    : 'bg-surface-elevated border-border text-slate-400'
                }`}
              >
                <FileCode size={20} className={exportFormat === 'json' ? 'text-brand-400' : ''} />
                <span className="font-bold">JSON Metadata</span>
              </button>

              <button
                onClick={() => setExportFormat('csv')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                  exportFormat === 'csv'
                    ? 'bg-brand-500/20 border-brand-500 text-brand-300 shadow-glow-brand'
                    : 'bg-surface-elevated border-border text-slate-400'
                }`}
              >
                <FileSpreadsheet size={20} className={exportFormat === 'csv' ? 'text-brand-400' : ''} />
                <span className="font-bold">{isEn ? "CSV Spreadsheet" : "Planilha CSV"}</span>
              </button>

              <button
                onClick={() => setExportFormat('markdown')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-center transition-all ${
                  exportFormat === 'markdown'
                    ? 'bg-brand-500/20 border-brand-500 text-brand-300 shadow-glow-brand'
                    : 'bg-surface-elevated border-border text-slate-400'
                }`}
              >
                <FileText size={20} className={exportFormat === 'markdown' ? 'text-brand-400' : ''} />
                <span className="font-bold">Lookbook PDF</span>
              </button>
            </div>
          </div>

          {/* Filename Template Pattern */}
          {exportFormat === 'zip' && (
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                {isEn ? "File Naming Pattern Template" : "Template de Nomenclatura dos Arquivos"}
              </label>
              <input
                type="text"
                value={namingPattern}
                onChange={e => setNamingPattern(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-elevated border border-border text-slate-200 font-mono text-xs outline-none focus:border-brand-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                {isEn ? "Available variables:" : "Variáveis disponíveis:"} <code className="text-brand-400">{'{album}'}</code>, <code className="text-brand-400">{'{index}'}</code>, <code className="text-brand-400">{'{res}'}</code>, <code className="text-brand-400">{'{date}'}</code>
              </p>
            </div>
          )}

          {/* Privacy & EXIF Cleaning */}
          <div className="p-3.5 rounded-xl bg-surface-elevated/60 border border-border space-y-2">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={removeExif}
                onChange={e => setRemoveExif(e.target.checked)}
                className="rounded text-brand-500"
              />
              <span className="flex items-center gap-1.5">
                <Shield size={14} className="text-emerald-400" />
                {isEn ? "Anonymize EXIF (Strip GPS, camera serial number, and author)" : "Anonimizar EXIF (Expurgar GPS, número de série da câmera e autor)"}
              </span>
            </label>
          </div>

          {/* Action Button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={closeExportModal}
              className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-hover text-slate-300 font-semibold"
            >
              {isEn ? "Cancel" : "Cancelar"}
            </button>
            <button
              onClick={handleExport}
              className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold flex items-center gap-2 transition-colors shadow-glow-brand"
            >
              {exported ? <Check size={16} /> : <Download size={16} />}
              <span>{isEn ? (exported ? 'Generating Package...' : 'Generate & Download File') : (exported ? 'Gerando Pacote...' : 'Gerar e Baixar Arquivo')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
