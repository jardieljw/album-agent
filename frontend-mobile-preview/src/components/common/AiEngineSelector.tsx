import React from 'react';
import { Zap, Compass, Bot, ShieldCheck, Sparkles, HelpCircle, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { AiEngineType } from '../../types';

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

export const AI_ENGINE_OPTIONS: AiEngineOption[] = [
  {
    id: 'gemini_surgical_scout',
    title: '2. Gemini Surgical Scout (v2)',
    shortTitle: '2. Surgical Scout',
    badge: 'RECOMENDADO (90%)',
    description: 'Extração cirúrgica direta por HTTP com Raio-X Físico de bytes. Ultra-rápido (1 a 3s), não abre navegador gráfico pesado e economiza RAM.',
    bestFor: '90% das galerias da web, fóruns, image hosts (ex: imx.to) e downloads rápidos.',
    brainType: 'Gemini Flash + Raio-X Físico (Fallback Heurístico Seguro)',
    icon: Zap,
    colorClass: 'text-amber-400',
    borderClass: 'border-amber-500/40 hover:border-amber-400',
    bgClass: 'bg-amber-500/10',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    id: 'gemini_layout_explorer',
    title: '1. Gemini Layout Explorer (v1)',
    shortTitle: '1. Layout Explorer',
    badge: 'Mapear Novo Site',
    description: 'Usa Gemini Cloud para ler o HTML, deduzir o layout visual da página e seguir botões de paginação (1, 2, 3...). Salva receitas para reutilização.',
    bestFor: 'Aprender a estrutura de sites desconhecidos ou galerias paginadas em sequência.',
    brainType: 'Gemini Cloud Vision + Auto-Paginação Inteligente',
    icon: Compass,
    colorClass: 'text-cyan-400',
    borderClass: 'border-cyan-500/40 hover:border-cyan-400',
    bgClass: 'bg-cyan-500/10',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  {
    id: 'ai_react',
    title: '3. 7-Pillar ReAct Agent (Navegador)',
    shortTitle: '3. ReAct Visual',
    badge: 'Navegador Completo',
    description: 'Abre um navegador invisível real (Playwright). Enxerga a tela com Set-of-Marks, clica em botões ("Ver Mais"), fecha popups e rola a tela.',
    bestFor: 'Sites protegidos por JavaScript, com abas interativas, botões ocultos ou scroll infinito.',
    brainType: 'Qwen 2.5 Local (Ollama) / Cloud + Navegador Playwright',
    icon: Bot,
    colorClass: 'text-brand-400',
    borderClass: 'border-brand-500/40 hover:border-brand-400',
    bgClass: 'bg-brand-500/10',
    badgeColor: 'bg-brand-500/20 text-brand-300 border-brand-500/30',
  },
  {
    id: 'classic',
    title: '4. Classic Semantic Brain (Sem IA)',
    shortTitle: '4. Semantic Clássico',
    badge: '100% Determinístico',
    description: 'Motor puramente matemático baseado em regras regex e heurísticas clássicas. Zero IA, zero gasto de tokens e funciona 100% offline.',
    bestFor: 'Uso sem internet/IA, links diretos ou quando nenhuma chave de API estiver cadastrada.',
    brainType: '100% Heurística Local / Speculative Probing',
    icon: ShieldCheck,
    colorClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/40 hover:border-emerald-400',
    bgClass: 'bg-emerald-500/10',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
];

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
  const { activeAiEngine, setActiveAiEngine } = useAppStore();
  const currentEngine = selectedEngine || activeAiEngine || 'gemini_layout_explorer';

  const handleSelect = (engine: AiEngineType) => {
    if (onChange) {
      onChange(engine);
    } else {
      setActiveAiEngine(engine);
    }
  };

  const activeOption = AI_ENGINE_OPTIONS.find(o => o.id === currentEngine) || AI_ENGINE_OPTIONS[0];
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
            {AI_ENGINE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-surface text-slate-200 py-1">
                {opt.title}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (variant === 'dropdown') {
    return (
      <div className={`relative ${className}`}>
        <select
          value={currentEngine}
          onChange={(e) => handleSelect(e.target.value as AiEngineType)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-slate-100 font-semibold text-xs outline-none focus:border-brand-500 transition-all cursor-pointer"
        >
          {AI_ENGINE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id} className="bg-surface text-slate-200">
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
          <span>Motor de IA / Estratégia de Navegação</span>
        </label>
        <span className="text-[10px] font-mono text-slate-500">4 Motores Disponíveis</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {AI_ENGINE_OPTIONS.map((opt) => {
          const isSelected = currentEngine === opt.id;
          const Icon = opt.icon;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelect(opt.id)}
              className={`text-left p-3.5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
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
                    <span className="text-slate-500 font-semibold">Ideal: </span>
                    {opt.bestFor}
                  </div>
                  <div className="text-slate-400 font-mono text-[9px] truncate">
                    <span className="text-slate-500 font-sans font-semibold">Cérebro: </span>
                    {opt.brainType}
                  </div>
                </div>
              </div>

              {isSelected && (
                <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-bold text-brand-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse"></span>
                    <span>Motor Selecionado</span>
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
            Dica de Escolha Rápida:
          </span>
          <span className="text-[11px] text-slate-400 leading-relaxed">
            Na dúvida, use sempre o <strong className="text-amber-300">Motor 2 (Surgical Scout)</strong>. Ele é 10x mais rápido (1 a 3s), não trava a memória e usa Raio-X binário para baixar fotos originais. Use o <strong className="text-brand-300">Motor 3</strong> apenas se a página exigir clicar em botões, abas ou rolagem infinita.
          </span>
        </div>
      )}
    </div>
  );
};
