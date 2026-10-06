import React from 'react';
import {
  Settings,
  Cpu,
  Globe,
  Shield,
  Palette,
  Volume2,
  VolumeX,
  Headphones,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  Zap,
  Compass,
  Bot,
  Languages,
  Sliders,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  Lock,
  Server,
  AlertCircle,
  Terminal,
  Cloud,
  Copy,
  Check,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ThemeMode, Language } from '../../types';
import { AiEngineSelector } from '../common/AiEngineSelector';
import { soundEffects } from '../../services/soundEffects';
import { backendApi } from '../../services/realApi';
import { translations } from '../../i18n/translations';
import { IconBadge } from '../common/IconBadge';

export const SettingsView: React.FC = () => {
  const {
    settings,
    updateSettings,
    addNotification,
    availableModels,
    ollamaStatus,
    ollamaModels,
    isCheckingOllama,
    checkOllamaHealth
  } = useAppStore();

  const t = translations[settings.language].settings;

  const [ollamaUrlInput, setOllamaUrlInput] = React.useState(settings.ollamaBaseUrl || 'http://localhost:11434');
  const [copiedCmd, setCopiedCmd] = React.useState<string | null>(null);
  const [isRepairingPalettes, setIsRepairingPalettes] = React.useState(false);
  const [forceRepairPalettes, setForceRepairPalettes] = React.useState(false);
  const [paletteRepairResult, setPaletteRepairResult] = React.useState<{
    success: boolean;
    scanned_albums: number;
    repaired_albums: number;
    repaired_images: number;
    message: string;
  } | null>(null);

  const handleRepairPalettes = async () => {
    setIsRepairingPalettes(true);
    setPaletteRepairResult(null);
    try {
      const res = await backendApi.repairAllAlbumPalettes(forceRepairPalettes);
      setPaletteRepairResult(res);
      if (res.success) {
        addNotification({
          type: 'success',
          title: settings.language === 'pt-BR' ? 'Visão Computacional' : 'Color Vision',
          message: `${t.recalculateSuccess} (${res.repaired_images} imagens em ${res.repaired_albums} álbuns)`
        });
      } else {
        addNotification({
          type: 'error',
          title: settings.language === 'pt-BR' ? 'Visão Computacional' : 'Color Vision',
          message: res.error || res.message || 'Erro ao recalcular paletas'
        });
      }
    } catch (err: any) {
      addNotification({
        type: 'error',
        title: settings.language === 'pt-BR' ? 'Visão Computacional' : 'Color Vision',
        message: err.message || 'Erro ao recalcular paletas'
      });
    } finally {
      setIsRepairingPalettes(false);
    }
  };

  React.useEffect(() => {
    checkOllamaHealth(settings.ollamaBaseUrl || 'http://localhost:11434');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyCommand = (cmd: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(cmd).catch(() => {
        const textArea = document.createElement("textarea");
        textArea.value = cmd;
        document.body.appendChild(textArea);
        textArea.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(textArea);
      });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = cmd;
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(textArea);
    }
    setCopiedCmd(cmd);
    soundEffects.click(settings.soundEnabled);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleTestOllamaConnection = async () => {
    const cleanUrl = ollamaUrlInput.trim() || 'http://localhost:11434';
    updateSettings({ ollamaBaseUrl: cleanUrl });
    const res = await checkOllamaHealth(cleanUrl);
    if (res.isAvailable) {
      addNotification({
        type: 'success',
        title: t.ollamaConnected,
        message: `Servidor ativo (v${res.version || '0.5.x'}) com ${res.installedModels.length} modelo(s) pronto(s).`
      });
    } else {
      addNotification({
        type: 'error',
        title: t.ollamaDisconnected,
        message: res.error || 'Não foi possível comunicar com o Ollama nesta URL.'
      });
    }
  };

  // API Keys & Cloud Connections State
  const [keysData, setKeysData] = React.useState<{
    gemini: { is_set: boolean; masked_key: string; is_connected: boolean; error: string | null };
    huggingface: { is_set: boolean; masked_token: string; repo_id: string; is_connected: boolean };
  } | null>(null);
  const [loadingKeys, setLoadingKeys] = React.useState(false);
  const [savingKeys, setSavingKeys] = React.useState(false);
  const [newGeminiKey, setNewGeminiKey] = React.useState('');
  const [newHfToken, setNewHfToken] = React.useState('');
  const [newHfRepo, setNewHfRepo] = React.useState('');
  const [showGeminiField, setShowGeminiField] = React.useState(false);
  const [showHfField, setShowHfField] = React.useState(false);
  const [keyStatusMsg, setKeyStatusMsg] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchKeysStatus = React.useCallback(async () => {
    setLoadingKeys(true);
    try {
      const data = await backendApi.getKeysStatus();
      if (data) {
        setKeysData(data);
        if (data.huggingface?.repo_id) {
          setNewHfRepo(data.huggingface.repo_id);
        }
      }
    } catch (e) {
      console.warn('Error fetching keys status:', e);
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  React.useEffect(() => {
    fetchKeysStatus();
  }, [fetchKeysStatus]);

  const handleSaveKeys = async () => {
    setSavingKeys(true);
    setKeyStatusMsg(null);
    try {
      const payload: { gemini_api_key?: string; hf_token?: string; hf_dataset_repo?: string } = {};
      if (newGeminiKey.trim()) payload.gemini_api_key = newGeminiKey.trim();
      if (newHfToken.trim()) payload.hf_token = newHfToken.trim();
      if (newHfRepo.trim()) payload.hf_dataset_repo = newHfRepo.trim();

      const result = await backendApi.updateKeys(payload);
      if (result) {
        setKeysData(result);
        setNewGeminiKey('');
        setNewHfToken('');
        setKeyStatusMsg({
          type: 'success',
          text: t.keysSavedSuccess,
        });
        addNotification({
          type: 'success',
          title: 'Chaves Atualizadas',
          message: 'Credenciais validadas e conexões de nuvem ativas.',
        });
      } else {
        setKeyStatusMsg({
          type: 'error',
          text: 'Não foi possível salvar as chaves no servidor.',
        });
      }
    } catch (e) {
      setKeyStatusMsg({
        type: 'error',
        text: 'Erro ao comunicar com o servidor.',
      });
    } finally {
      setSavingKeys(false);
    }
  };

  const themes: { id: ThemeMode; label: string; desc: string }[] = [
    { id: 'dark-slate', label: 'Dark Slate Studio', desc: 'Padrão escuro sofisticado com alto contraste' },
    { id: 'deep-oled', label: 'Deep OLED Black', desc: 'Preto puro para telas OLED e economia de energia' },
    { id: 'clean-light', label: 'Clean Light', desc: 'Tema claro de alta legibilidade para estúdio diurno' },
    { id: 'cyber-studio', label: 'Cyber Neon Studio', desc: 'Vibração futurista com acentos roxos e cianos' },
  ];

  const ambientSoundOptions = [
    { id: 'none', label: 'Desativado', desc: 'Silêncio total' },
    { id: 'lofi', label: 'Lo-Fi Chill Beat', desc: 'Batida suave relaxante' },
    { id: 'rain', label: 'Chuva Suave', desc: 'Gotas de chuva em janela' },
    { id: 'whitenoise', label: 'Ruído Branco', desc: 'Frequência constante' },
  ];

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-5 sm:space-y-6 min-w-0 max-w-full pb-20">
      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2.5">
          <IconBadge icon={<Settings size={20} />} variant="gold" size="md" />
          <span>{t.title}</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {t.subtitle}
        </p>
      </div>

      {/* Section 0: Secure API Keys & Cloud Connections */}
      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <IconBadge icon={<Key size={14} />} variant="gold" size="sm" />
              <span>{t.apiKeysSection}</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t.apiKeysSubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchKeysStatus}
            disabled={loadingKeys}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elevated border border-border text-xs font-semibold text-slate-300 hover:text-white transition-all"
          >
            <RefreshCw size={13} className={loadingKeys ? 'animate-spin text-brand-400' : 'text-slate-400'} />
            <span>{loadingKeys ? t.retesting : t.retestConnections}</span>
          </button>
        </div>

        {/* Security Confidentiality Notice */}
        <div className="p-3 rounded-2xl bg-surface-elevated/40 border border-emerald-500/20 flex items-start gap-2.5 text-xs text-slate-300">
          <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed text-slate-300">
            <strong className="text-emerald-300">{t.securityNoticeTitle} </strong>{t.securityNoticeDesc}
          </div>
        </div>

        {keyStatusMsg && (
          <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            keyStatusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            {keyStatusMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{keyStatusMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* 1. Google Gemini Cloud API */}
          <div className="p-4 rounded-2xl bg-surface-elevated/60 border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <Zap size={14} className="text-amber-400" />
                <span>Google Gemini API</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                keysData?.gemini.is_connected
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : keysData?.gemini.is_set
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  keysData?.gemini.is_connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`}></span>
                {keysData?.gemini.is_connected
                  ? 'Conectado (API Ativa)'
                  : keysData?.gemini.is_set
                  ? 'Chave Salva (Offline/Erro)'
                  : 'Não Configurado'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-surface/80 border border-border space-y-1">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{t.serverKey}</div>
              <div className="font-mono text-xs text-slate-200">
                {keysData?.gemini.masked_key || <span className="text-slate-500 italic">{t.noKeySet}</span>}
              </div>
            </div>

            {keysData?.gemini.error && (
              <p className="text-[10px] text-red-400 font-mono">
                Aviso: {keysData.gemini.error}
              </p>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-300 font-semibold flex items-center justify-between">
                <span>{t.replaceKey}</span>
              </label>
              <div className="relative">
                <input
                  type={showGeminiField ? "text" : "password"}
                  value={newGeminiKey}
                  onChange={e => setNewGeminiKey(e.target.value)}
                  placeholder={keysData?.gemini.is_set ? t.placeholderGeminiSet : t.placeholderGeminiEmpty}
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-surface border border-border text-slate-100 font-mono text-xs outline-none focus:border-amber-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiField(!showGeminiField)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                >
                  {showGeminiField ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                {t.geminiHint}
              </p>
            </div>
          </div>

          {/* 2. Hugging Face Hub (Cloud Dataset) */}
          <div className="p-4 rounded-2xl bg-surface-elevated/60 border border-cyan-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                <Server size={14} className="text-cyan-400" />
                <span>Hugging Face Dataset (10GB+)</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                keysData?.huggingface.is_connected
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : keysData?.huggingface.is_set
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  keysData?.huggingface.is_connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`}></span>
                {keysData?.huggingface.is_connected
                  ? 'Repositório Ativo'
                  : keysData?.huggingface.is_set
                  ? 'Token Salvo (Validando)'
                  : 'Desconectado'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-surface/80 border border-border space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                <span>Token no Servidor:</span>
                <span className="text-cyan-400 font-mono lowercase">{keysData?.huggingface.repo_id || 'lokkmorant/album-data'}</span>
              </div>
              <div className="font-mono text-xs text-slate-200">
                {keysData?.huggingface.masked_token || <span className="text-slate-500 italic">{t.noKeySet}</span>}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-300 font-semibold">{t.replaceHfToken}</label>
              <div className="relative">
                <input
                  type={showHfField ? "text" : "password"}
                  value={newHfToken}
                  onChange={e => setNewHfToken(e.target.value)}
                  placeholder={keysData?.huggingface.is_set ? t.placeholderHfSet : t.placeholderHfEmpty}
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-surface border border-border text-slate-100 font-mono text-xs outline-none focus:border-cyan-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowHfField(!showHfField)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                >
                  {showHfField ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300 font-semibold">{t.hfRepoLabel}</label>
              <input
                type="text"
                value={newHfRepo}
                onChange={e => setNewHfRepo(e.target.value)}
                placeholder="usuario/meu-album-data"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-slate-100 font-mono text-xs outline-none focus:border-cyan-400 transition-colors"
              />
              <p className="text-[10px] text-slate-500 leading-tight">
                {t.hfHint}
              </p>
            </div>
          </div>
        </div>

        {/* Save & Test Button */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleSaveKeys}
            disabled={savingKeys || (!newGeminiKey.trim() && !newHfToken.trim() && newHfRepo === (keysData?.huggingface.repo_id || ''))}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
              savingKeys
                ? 'bg-brand-500/50 text-white cursor-wait'
                : 'bg-brand-500 hover:bg-brand-600 text-white shadow-glow-brand'
            }`}
          >
            {savingKeys ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
            <span>{savingKeys ? t.savingKeys : t.saveKeysBtn}</span>
          </button>
        </div>
      </div>

      {/* Section 0.5: Local AI & Ollama Onboarding (Fase 3 do Roadmap) */}
      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <IconBadge icon={<Terminal size={14} />} variant="neon" size="sm" />
              <span>{t.ollamaSection}</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t.ollamaSubtitle}
            </p>
          </div>

          {/* Real-time Status Badge */}
          <div className="self-start sm:self-auto flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                ollamaStatus?.isAvailable
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  ollamaStatus?.isAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                }`}
              />
              <span>
                {ollamaStatus?.isAvailable
                  ? `Ollama Ativo (v${ollamaStatus.version || '0.5.x'})`
                  : 'Ollama Offline / Desconectado'}
              </span>
            </span>

            {ollamaStatus?.latencyMs !== undefined && ollamaStatus.latencyMs !== null && (
              <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-surface border border-border text-slate-400">
                {ollamaStatus.latencyMs} ms
              </span>
            )}
          </div>
        </div>

        {/* Server URL Input & Live Test Button */}
        <div className="p-4 rounded-2xl bg-surface-elevated/50 border border-border space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Server size={14} className="text-brand-400" />
              <span>{t.ollamaUrlLabel}</span>
            </label>
            <span className="text-[11px] text-slate-400">
              Padrão recomendado: <code className="font-mono text-brand-300">http://localhost:11434</code>
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={ollamaUrlInput}
              onChange={e => setOllamaUrlInput(e.target.value)}
              onBlur={() => {
                if (ollamaUrlInput.trim()) {
                  updateSettings({ ollamaBaseUrl: ollamaUrlInput.trim() });
                }
              }}
              placeholder="http://localhost:11434"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface border border-border text-slate-100 font-mono text-xs outline-none focus:border-brand-500 transition-colors"
            />

            <button
              type="button"
              onClick={handleTestOllamaConnection}
              disabled={isCheckingOllama}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-elevated hover:bg-surface border border-border hover:border-brand-500/40 text-slate-200 text-xs font-bold transition-all shadow-sm"
            >
              <RefreshCw size={13} className={isCheckingOllama ? 'animate-spin text-brand-400' : 'text-slate-400'} />
              <span>{isCheckingOllama ? t.ollamaTesting : t.ollamaTestBtn}</span>
            </button>
          </div>
        </div>

        {/* Chatbot Co-Pilot Dual Engine Selection & Active Local Model */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Default Chat Engine */}
          <div className="p-4 rounded-2xl bg-surface-elevated/70 border border-border space-y-2.5">
            <label className="text-slate-200 font-bold flex items-center gap-1.5">
              <Bot size={14} className="text-brand-400" />
              <span>Motor Padrão do Chatbot Co-Pilot</span>
            </label>
            <p className="text-[11px] text-slate-400">
              Escolha qual inteligência responderá prioritariamente no chat lateral.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => updateSettings({ aiChatProvider: 'gemini' })}
                className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  settings.aiChatProvider === 'gemini' || !settings.aiChatProvider
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 shadow-sm'
                    : 'bg-surface border-border text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="font-bold text-xs flex items-center gap-1">
                  <Cloud size={13} className="text-amber-400" /> Gemini Cloud
                </span>
                <span className="text-[10px] text-slate-400">Recomendado • Sem instalação</span>
              </button>

              <button
                type="button"
                onClick={() => updateSettings({ aiChatProvider: 'ollama' })}
                className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  settings.aiChatProvider === 'ollama'
                    ? 'bg-brand-500/15 border-brand-500/40 text-brand-200 shadow-sm'
                    : 'bg-surface border-border text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="font-bold text-xs flex items-center gap-1">
                  <Terminal size={13} className="text-brand-400" /> Ollama Local
                </span>
                <span className="text-[10px] text-slate-400">Privado • Funciona offline</span>
              </button>
            </div>
          </div>

          {/* Dynamic Installed Models Dropdown */}
          <div className="p-4 rounded-2xl bg-surface-elevated/70 border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-200 font-bold flex items-center gap-1.5">
                <Cpu size={14} className="text-brand-400" />
                <span>{t.ollamaModelSelect}</span>
              </label>
              {ollamaStatus?.installedModels && ollamaStatus.installedModels.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {ollamaStatus.installedModels.length} instalado(s)
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400">
              Modelos descobertos automaticamente na sua máquina.
            </p>

            {ollamaStatus?.isAvailable && (ollamaStatus.installedModels.length > 0 || ollamaModels.length > 0) ? (
              <select
                value={settings.selectedOllamaModel || (ollamaStatus.installedModels[0] || 'llama3.2')}
                onChange={e => updateSettings({ selectedOllamaModel: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-slate-100 font-semibold outline-none focus:border-brand-500 transition-colors"
              >
                {ollamaStatus.installedModels.map(mName => {
                  const detailed = ollamaModels.find(m => m.name === mName);
                  const label = detailed ? detailed.label : mName;
                  return (
                    <option key={mName} value={mName}>
                      {label}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="p-3 rounded-xl bg-surface border border-border text-[11px] text-slate-400 leading-relaxed">
                {ollamaStatus?.isAvailable ? (
                  <span className="text-amber-300 font-medium flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-400 shrink-0" />
                    <span>{t.ollamaNoModels}</span>
                  </span>
                ) : (
                  <span>
                    Conecte o Ollama acima para carregar automaticamente a lista de modelos instalados na máquina.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Didactic Step-by-Step Onboarding Guide for Beginners */}
        <div className="p-4 rounded-2xl bg-surface-elevated/40 border border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                <Sparkles size={14} className="text-accent-purple" />
                <span>{t.ollamaCardsTitle}</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                O Ollama é 100% gratuito e open-source. Leva menos de 2 minutos para começar:
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.open('https://ollama.com', '_blank')}
              className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/40 text-xs font-bold transition-all shadow-sm"
            >
              <span>{t.downloadOllama}</span>
              <ExternalLink size={12} />
            </button>
          </div>

          {/* Ready-to-copy Command Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Card 1: Meta Llama 3.2 */}
            <div className="p-3.5 rounded-2xl bg-surface border border-border hover:border-brand-500/40 transition-all flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-100">Meta Llama 3.2</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    2.0 GB • Leve
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ideal para qualquer PC ou notebook. Respostas rápidas e baixíssimo consumo de memória.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-elevated border border-border/80">
                <code className="font-mono text-[11px] text-brand-300 truncate">ollama run llama3.2</code>
                <button
                  type="button"
                  onClick={() => handleCopyCommand('ollama run llama3.2')}
                  className="p-1 rounded-lg hover:bg-surface text-slate-400 hover:text-white transition-colors shrink-0"
                  title={t.copyCmd}
                >
                  {copiedCmd === 'ollama run llama3.2' ? (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                      <Check size={12} /> {t.copied}
                    </span>
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
            </div>

            {/* Card 2: Qwen 2.5:7b */}
            <div className="p-3.5 rounded-2xl bg-surface border border-border hover:border-brand-500/40 transition-all flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-100">Qwen 2.5:7b</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    4.5 GB • Equilibrado
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Excelente capacidade de raciocínio, análise de código e extração estruturada de mídia.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-elevated border border-border/80">
                <code className="font-mono text-[11px] text-brand-300 truncate">ollama run qwen2.5:7b</code>
                <button
                  type="button"
                  onClick={() => handleCopyCommand('ollama run qwen2.5:7b')}
                  className="p-1 rounded-lg hover:bg-surface text-slate-400 hover:text-white transition-colors shrink-0"
                  title={t.copyCmd}
                >
                  {copiedCmd === 'ollama run qwen2.5:7b' ? (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                      <Check size={12} /> {t.copied}
                    </span>
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
            </div>

            {/* Card 3: DeepSeek R1:8b */}
            <div className="p-3.5 rounded-2xl bg-surface border border-border hover:border-brand-500/40 transition-all flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-100">DeepSeek R1:8b</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    5.0 GB • Raciocínio
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Modelo de raciocínio avançado com pensamento granular (Chain-of-Thought) na sua máquina.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-elevated border border-border/80">
                <code className="font-mono text-[11px] text-brand-300 truncate">ollama run deepseek-r1:8b</code>
                <button
                  type="button"
                  onClick={() => handleCopyCommand('ollama run deepseek-r1:8b')}
                  className="p-1 rounded-lg hover:bg-surface text-slate-400 hover:text-white transition-colors shrink-0"
                  title={t.copyCmd}
                >
                  {copiedCmd === 'ollama run deepseek-r1:8b' ? (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                      <Check size={12} /> {t.copied}
                    </span>
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: AI Strategy Engine & Dual AI Brain Configuration */}
      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border space-y-5">
        <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
          <IconBadge icon={<Cpu size={14} />} variant="sapphire" size="sm" />
          <span>{t.aiStrategySection}</span>
        </h3>

        {/* Global Default Engine Selector (4 Engines) */}
        <AiEngineSelector variant="cards" />

        {/* Dual AI Models: Gemini Scout + Qwen Closer */}
        <div className="pt-3 border-t border-border space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* 1. Gemini Cloud Vision Model (Scout Head) */}
            <div className="p-4 rounded-2xl bg-surface-elevated/70 border border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-amber-300 font-bold flex items-center gap-1.5">
                  <Zap size={14} className="text-amber-400" />
                  <span>{t.geminiModelLabel}</span>
                </label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Motores 1 e 2
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {t.geminiModelDesc}
              </p>
              <select
                value={settings.geminiModel || 'gemini-3.6-flash'}
                onChange={e => updateSettings({ geminiModel: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-slate-100 font-semibold outline-none focus:border-amber-400 transition-colors"
              >
                <option value="gemini-3.6-flash">Gemini 3.6 Flash (Recomendado — Ultrarrápido & Mais Estável)</option>
                <option value="gemini-3.7-flash">Gemini 3.7 Flash (Multimodal Recente)</option>
                <option value="gemini-3.5-flash">Gemini 3.5 Flash (Equilibrado & Baixa Latência)</option>
                <option value="gemini-3.5-pro">Gemini 3.5 Pro (Alta Capacidade Cognitiva)</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Raciocínio Profundo para Casos Difíceis)</option>
              </select>
            </div>

            {/* 2. Qwen Local Model (Closer & ReAct Head) */}
            <div className="p-4 rounded-2xl bg-surface-elevated/70 border border-brand-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-brand-300 font-bold flex items-center gap-1.5">
                  <Bot size={14} className="text-brand-400" />
                  <span>{t.qwenModelLabel}</span>
                </label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  Motor 3 & Fechamento
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {t.qwenModelDesc}
              </p>
              <select
                value={settings.aiModel}
                onChange={e => updateSettings({ aiModel: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-slate-100 font-semibold outline-none focus:border-brand-400 transition-colors"
              >
                <optgroup label="Modelos Locais (Ollama / Qwen)" className="bg-surface text-slate-300 font-bold">
                  <option value="qwen2.5:32b">Qwen 2.5:32b (ReAct 7-Pillars / Alta Precisão)</option>
                  <option value="qwen2.5:14b">Qwen 2.5:14b (Equilibrado / Rápido)</option>
                  <option value="qwen2.5-coder:32b">Qwen 2.5 Coder:32b (Especialista em DOM/HTML)</option>
                  {availableModels.filter(m => !m.includes('qwen2.5')).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </optgroup>
                <optgroup label="Modelos Cloud Vision Alternativos" className="bg-surface text-slate-300 font-bold">
                  <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="gpt-4o">GPT-4o Vision</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Reasoning Budget (Orçamento de Raciocínio) - Explained clearly */}
          <div className="p-4 rounded-2xl bg-surface-elevated/40 border border-border space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-slate-200 font-bold text-xs flex items-center gap-1.5">
                <Sliders size={14} className="text-brand-400" />
                <span>{t.reasoningBudget}</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Limite de ciclos cognitivos:</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {settings.reasoningBudget} {settings.reasoningBudget === 1 ? t.stepSingle : t.stepPlural}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {t.reasoningDesc}
            </p>

            <input
              type="range"
              min="1"
              max="5"
              value={settings.reasoningBudget}
              onChange={e => updateSettings({ reasoningBudget: Number(e.target.value) })}
              className="w-full mt-1"
            />
          </div>
        </div>

        {/* Educational Guide: Como Funciona a Combinação de Motor e Modelo */}
        <div className="p-4 rounded-2xl bg-surface-elevated/50 border border-border/80 space-y-3 mt-3">
          <div className="flex items-center gap-2 text-brand-300 font-bold text-xs">
            <HelpCircle size={15} />
            <span>Guia Rápido: Motor de IA vs Modelo de Inferência (Sem conflitos nem bugs!)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
            <div className="p-3 rounded-xl bg-surface/80 border border-white/5 space-y-1">
              <div className="font-bold text-slate-100 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span>Motor de IA = O "Corpo" / Robô</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Define <strong>como</strong> o robô navega (se faz requisição HTTP ultrarrápida, se valida o Raio-X de bytes ou se abre janela gráfica do Playwright).
              </p>
            </div>

            <div className="p-3 rounded-xl bg-surface/80 border border-white/5 space-y-1">
              <div className="font-bold text-slate-100 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-400"></span>
                <span>Modelos de IA = Os "Cérebros"</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                O <strong>Gemini</strong> cuida da visão e auditoria de seletores (Scout), enquanto o <strong>Qwen</strong> cuida do raciocínio local e navegação ReAct.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5">
            <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-400" />
              <span>Combinações Recomendadas:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="font-bold text-amber-300 flex items-center gap-1">
                  <Zap size={12} className="text-amber-300" />
                  <span>Velocidade Máxima:</span>
                </div>
                <div className="text-slate-200 text-[10px] mt-0.5 font-medium">Motor 2 + Gemini 3.7 Flash + Qwen 2.5:32b</div>
                <div className="text-slate-400 text-[9px] mt-0.5">Extrai com Raio-X físico sem abrir navegador.</div>
              </div>

              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <div className="font-bold text-cyan-300 flex items-center gap-1">
                  <Compass size={12} className="text-cyan-300" />
                  <span>Mapear Novo Site:</span>
                </div>
                <div className="text-slate-200 text-[10px] mt-0.5 font-medium">Motor 1 + Gemini 2.5/3.7 Flash</div>
                <div className="text-slate-400 text-[9px] mt-0.5">Aprende o layout e salva a receita reutilizável.</div>
              </div>

              <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20">
                <div className="font-bold text-brand-300 flex items-center gap-1">
                  <Bot size={12} className="text-brand-300" />
                  <span>Sites com Abas/JS:</span>
                </div>
                <div className="text-slate-200 text-[10px] mt-0.5 font-medium">Motor 3 + Qwen 2.5:32b (Steps: 3)</div>
                <div className="text-slate-400 text-[9px] mt-0.5">Usa Playwright visual completo com Set-of-Marks.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Audio, Sounds & Concentration Mode */}
      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border space-y-4">
        <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
          <IconBadge icon={<Volume2 size={14} />} variant="cyan" size="sm" />
          <span>{t.audioSection}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Sound Effects Toggle */}
          <div className="p-4 rounded-2xl bg-surface-elevated/60 border border-border flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-100 mb-0.5">{t.sfxLabel}</div>
              <div className="text-[11px] text-slate-400">{t.sfxDesc}</div>
            </div>
            <button
              onClick={() => {
                const next = !settings.soundEnabled;
                updateSettings({ soundEnabled: next });
                soundEffects.click(next);
              }}
              className={`p-2.5 rounded-xl border transition-all ${
                settings.soundEnabled
                  ? 'bg-brand-500/20 border-brand-500 text-brand-300'
                  : 'bg-surface-elevated border-border text-slate-500'
              }`}
            >
              {settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>

          {/* Ambient Sound Volume */}
          <div className="p-4 rounded-2xl bg-surface-elevated/60 border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100">{t.ambientVolume}</span>
              <span className="text-cyan-400 font-mono font-bold">{Math.round((settings.ambientSoundVolume || 0.3) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.ambientSoundVolume || 0.3}
              onChange={e => updateSettings({ ambientSoundVolume: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>

        {/* Ambient Sound Presets */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            {t.soundtrackLabel}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {ambientSoundOptions.map(opt => {
              const isSelected = settings.ambientSoundType === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => updateSettings({ ambientSoundType: opt.id as any })}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    isSelected
                      ? 'bg-cyan-500/20 border-cyan-500 shadow-glow-accent text-cyan-300'
                      : 'bg-surface-elevated/40 border-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-100">{opt.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 3: Visual Theme & Language */}
      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border space-y-4">
        <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
          <IconBadge icon={<Palette size={14} />} variant="rose" size="sm" />
          <span>{t.visualSection}</span>
        </h3>

        {/* Language Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pb-3 border-b border-border">
          <div>
            <label className="text-slate-400 block mb-1.5 font-semibold flex items-center gap-1.5">
              <Languages size={14} className="text-slate-400" />
              <span>{t.languageLabel}</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => updateSettings({ language: 'pt-BR' })}
                className={`flex-1 py-2.5 rounded-xl border font-bold transition-all ${
                  settings.language === 'pt-BR'
                    ? 'bg-brand-500/20 border-brand-500 text-brand-300 shadow-glow-brand'
                    : 'bg-surface-elevated border-border text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.portuguese}
              </button>
              <button
                onClick={() => updateSettings({ language: 'en-US' })}
                className={`flex-1 py-2.5 rounded-xl border font-bold transition-all ${
                  settings.language === 'en-US'
                    ? 'bg-brand-500/20 border-brand-500 text-brand-300 shadow-glow-brand'
                    : 'bg-surface-elevated border-border text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.english}
              </button>
            </div>
          </div>
        </div>

        {/* Theme Studio */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            {t.themeLabel}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {themes.map(thm => (
              <button
                key={thm.id}
                onClick={() => updateSettings({ theme: thm.id })}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  settings.theme === thm.id
                    ? 'bg-brand-500/20 border-brand-500 shadow-glow-brand ring-1 ring-brand-500'
                    : 'bg-surface-elevated/40 border-border hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-slate-100 mb-0.5">{thm.label}</div>
                <div className="text-[11px] text-slate-400">{thm.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 4: Crawler & Anti-Bot Limits */}
      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border space-y-4">
        <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
          <IconBadge icon={<Globe size={14} />} variant="emerald" size="sm" />
          <span>{t.crawlerSection}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1.5 font-semibold flex items-center justify-between">
              <span>{t.workersLabel}</span>
              <span className="text-emerald-400 font-mono font-bold">{settings.maxConcurrency} threads</span>
            </label>
            <input
              type="range"
              min="1"
              max="16"
              value={settings.maxConcurrency}
              onChange={e => updateSettings({ maxConcurrency: Number(e.target.value) })}
              className="w-full mt-2"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1.5 font-semibold flex items-center justify-between">
              <span>{t.antiBotDelay}</span>
              <span className="text-emerald-400 font-mono font-bold">{settings.antiBotDelayMs} ms</span>
            </label>
            <input
              type="range"
              min="100"
              max="3000"
              step="100"
              value={settings.antiBotDelayMs}
              onChange={e => updateSettings({ antiBotDelayMs: Number(e.target.value) })}
              className="w-full mt-2"
            />
          </div>
        </div>
      </div>

      {/* Section 5: Color Vision & On-Disk Metadata Maintenance (Fase 5 do Roadmap) */}
      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <IconBadge icon={<Palette size={14} />} variant="neon" size="sm" />
            <span>{t.colorMaintenanceSection}</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            Pillow MEDIANCUT 160×160 • 8 Cores Perceptuais
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {t.colorMaintenanceDesc}
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface-elevated/80 border border-white/5">
          <label className="flex items-center gap-3 cursor-pointer text-xs text-slate-300 select-none">
            <input
              type="checkbox"
              checked={forceRepairPalettes}
              onChange={e => setForceRepairPalettes(e.target.checked)}
              className="w-4 h-4 rounded border-border text-brand-500 focus:ring-0 focus:ring-offset-0 bg-surface cursor-pointer"
            />
            <span>{t.forceRecalculateLabel}</span>
          </label>

          <button
            type="button"
            onClick={handleRepairPalettes}
            disabled={isRepairingPalettes}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-md shadow-violet-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
          >
            {isRepairingPalettes ? (
              <>
                <Loader2 size={14} className="animate-spin text-white" />
                <span>{t.recalculatingPalettes}</span>
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                <span>{t.recalculatePalettesBtn}</span>
              </>
            )}
          </button>
        </div>

        {paletteRepairResult && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-2.5 animate-fade-in">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-emerald-200">
                {paletteRepairResult.message}
              </p>
              <p className="text-[11px] text-emerald-300/80">
                {settings.language === 'pt-BR'
                  ? `Álbuns varridos: ${paletteRepairResult.scanned_albums} | Álbuns atualizados: ${paletteRepairResult.repaired_albums} | Imagens enriquecidas: ${paletteRepairResult.repaired_images}`
                  : `Scanned albums: ${paletteRepairResult.scanned_albums} | Updated albums: ${paletteRepairResult.repaired_albums} | Enriched images: ${paletteRepairResult.repaired_images}`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
