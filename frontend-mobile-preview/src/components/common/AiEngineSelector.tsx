import React from 'react';
import { Zap, Compass, Bot, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { AiEngineType } from '../../types';
import { translations } from '../../i18n/translations';

export interface AiEngineOption {
  id: AiEngineType;
  title: string;
  shortTitle: string;
  badge: string;
  description: string;
  bestFor: string;
  brainType: string;
  icon: React.ElementType;
  colorClass: string;
  borderClass: string;
  bgClass: string;
  badgeColor: string;
}

interface AiEngineSelectorProps {
  variant?: 'compact' | 'cards' | 'dropdown';
  className?: string;
  selectedEngine?: AiEngineType;
  onChange?: (engine: AiEngineType) => void;
  showHelp?: boolean;
}

export const AiEngineSelector: React.FC<AiEngineSelectorProps> = ({
  variant = 'cards',
  className = '',
  selectedEngine,
  onChange,
  showHelp = true,
}) => {
  const { activeAiEngine, setActiveAiEngine, settings } = useAppStore();
  const currentEngine = selectedEngine || activeAiEngine || 'gemini_layout_explorer';
  const tAi: any = translations[settings.language]?.aiEngine || translations['pt-BR']?.aiEngine || translations['en-US']?.aiEngine || {};

  const engineOptions: AiEngineOption[] = [
    {
      id: 'gemini_surgical_scout',
      title: tAi.engine2?.title || '2. Gemini Surgical Scout (v2)',
      shortTitle: tAi.engine2?.shortTitle || '2. Surgical Scout',
      badge: tAi.engine2?.badge || 'RECOMENDADO (90%)',
      description: tAi.engine2?.desc || 'Extração cirúrgica direta por HTTP com Raio-X Físico de bytes.',
      bestFor: tAi.engine2?.bestFor || '90% das galerias da web e image hosts.',
      brainType: tAi.engine2?.brainType || 'Gemini Flash + Raio-X Físico',
      icon: Zap,
      colorClass: 'text-amber-400',
      borderClass: 'border-amber-500/40 hover:border-amber-400',
      bgClass: 'bg-amber-500/10',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    {
      id: 'gemini_layout_explorer',
      title: tAi.engine1?.title || '1. Gemini Layout Explorer (v1)',
      shortTitle: tAi.engine1?.shortTitle || '1. Layout Explorer',
      badge: tAi.engine1?.badge || 'Mapear Novo Site',
      description: tAi.engine1?.desc || 'Usa Gemini Cloud para ler HTML e deduzir layout.',
      bestFor: tAi.engine1?.bestFor || 'Aprender a estrutura de sites desconhecidos.',
      brainType: tAi.engine1?.brainType || 'Gemini Cloud Vision',
      icon: Compass,
      colorClass: 'text-cyan-400',
      borderClass: 'border-cyan-500/40 hover:border-cyan-400',
      bgClass: 'bg-cyan-500/10',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    },
    {
      id: 'ai_react',
      title: tAi.engine3?.title || '3. 7-Pillar ReAct Agent (Navegador)',
      shortTitle: tAi.engine3?.shortTitle || '3. ReAct Visual',
      badge: tAi.engine3?.badge || 'Navegador Completo',
      description: tAi.engine3?.desc || 'Abre um navegador invisível real (Playwright).',
      bestFor: tAi.engine3?.bestFor || 'Sites protegidos por JavaScript ou scroll infinito.',
      brainType: tAi.engine3?.brainType || 'Qwen 2.5 / Playwright',
      icon: Bot,
      colorClass: 'text-brand-400',
      borderClass: 'border-brand-500/40 hover:border-brand-400',
      bgClass: 'bg-brand-500/10',
      badgeColor: 'bg-brand-500/20 text-brand-300 border-brand-500/30',
    },
    {
      id: 'classic',
      title: tAi.engine4?.title || '4. Classic Semantic Brain (Sem IA)',
      shortTitle: tAi.engine4?.shortTitle || '4. Semantic Clássico',
      badge: tAi.engine4?.badge || '100% Determinístico',
      description: tAi.engine4?.desc || 'Motor puramente matemático baseado em regras regex.',
      bestFor: tAi.engine4?.bestFor || 'Uso sem internet ou sem chaves de IA.',
      brainType: tAi.engine4?.brainType || '100% Heurística Local',
      icon: ShieldCheck,
      colorClass: 'text-emerald-400',
      borderClass: 'border-emerald-500/40 hover:border-emerald-400',
      bgClass: 'bg-emerald-500/10',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
  ];

  const handleSelect = (engine: AiEngineType) => {
    if (onChange) {
      onChange(engine);
    } else {
      setActiveAiEngine(engine);
    }
  };

  const activeOption = engineOptions.find(o => o.id === currentEngine) || engineOptions[0];
  const ActiveIcon = activeOption.icon;

  if (variant === 'compact') {
    return (
      <div className={`relative inline-flex items-center ${className}`}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-elevated border border-border shadow-sm hover:border-slate-600 transition-all">
          <ActiveIcon size={14} className={activeOption.colorClass} />
          <select
            value={currentEngine}
            onChange={(e) => handleSelect(e.target.value as AiEngineType)}
            className="bg-transparent text-xs font-semibold text-slate-200 outline-none cursor-pointer pr-1"
          >
            {engineOptions.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-surface text-slate-200 py-1">
                {opt.shortTitle}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (variant === 'dropdown') {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Sparkles size={13} className="text-brand-400" />
          <span>{tAi.title}</span>
        </label>
        <select
          value={currentEngine}
          onChange={(e) => handleSelect(e.target.value as AiEngineType)}
          className="w-full h-11 px-3.5 rounded-xl bg-surface-elevated border border-border text-xs font-semibold text-slate-200 outline-none focus:border-brand-500 transition-all cursor-pointer"
        >
          {engineOptions.map((opt) => (
            <option key={opt.id} value={opt.id} className="bg-surface text-slate-200 py-1">
              {opt.title}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Variant: 'cards' (Expanded visual cards for ExtractorView & SettingsView)
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles size={13} className="text-brand-400" />
          <span>{tAi.title}</span>
        </label>
        <span className="text-[10px] font-mono text-slate-500">{tAi.availableEngines}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {engineOptions.map((opt) => {
          const isSelected = currentEngine === opt.id;
          const Icon = opt.icon;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelect(opt.id)}
              className={`text-left p-3.5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? `${opt.bgClass} ${opt.borderClass} ring-2 ring-brand-500/40 shadow-glow-brand`
                  : 'bg-surface-elevated/60 border-border hover:bg-surface-elevated hover:border-slate-700'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className={`p-1.5 rounded-xl ${opt.bgClass} ${opt.colorClass}`}>
                    <Icon size={16} />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${opt.badgeColor}`}>
                    {opt.badge}
                  </span>
                </div>

                <div>
                  <div className="font-bold text-xs text-slate-100 mb-1 leading-snug">
                    {opt.title}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">
                    {opt.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/5 space-y-1 text-[10px]">
                  <div className="text-slate-300">
                    <span className="text-slate-500 font-semibold">{tAi.idealFor}</span>
                    {opt.bestFor}
                  </div>
                  <div className="text-slate-400 font-mono text-[9px] truncate">
                    <span className="text-slate-500 font-sans font-semibold">{tAi.brain}</span>
                    {opt.brainType}
                  </div>
                </div>
              </div>

              {isSelected && (
                <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-bold text-brand-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse"></span>
                    <span>{tAi.selectedEngine}</span>
                  </span>
                  <CheckCircle2 size={12} className="text-brand-400" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {showHelp && (
        <div className="p-3 rounded-xl bg-surface-elevated/40 border border-border flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-slate-300">
          <span className="text-amber-400 font-bold shrink-0 flex items-center gap-1.5">
            <Sparkles size={13} className="text-amber-400" />
            {tAi.quickTipTitle}
          </span>
          <span className="text-[11px] text-slate-400 leading-relaxed">
            {tAi.quickTipDesc}
          </span>
        </div>
      )}
    </div>
  );
};

export default AiEngineSelector;
