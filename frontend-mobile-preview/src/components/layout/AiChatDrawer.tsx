import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Bot,
  Sparkles,
  User,
  Zap,
  ChevronDown,
  ChevronUp,
  Cpu,
  CheckCircle2,
  Sliders,
  MessageSquare,
  Cloud,
  Terminal,
  Settings as SettingsIcon,
  RefreshCw,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { translations } from '../../i18n/translations';
import { IconBadge } from '../common/IconBadge';

export const AiChatDrawer: React.FC = () => {
  const {
    aiChatOpen,
    setAiChatOpen,
    aiChatMessages,
    sendAiChatMessage,
    settings,
    setAiChatProvider,
    checkOllamaHealth,
    ollamaStatus,
    isCheckingOllama,
    navigateToView
  } = useAppStore();

  const [inputText, setInputText] = useState('');
  const [expandedReasoning, setExpandedReasoning] = useState<{ [id: string]: boolean }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const t = translations[settings.language]?.aiChat || translations['en-US'].aiChat;
  const quickPrompts: string[] = (t.prompts as string[]) || [];

  const activeProvider = settings.aiChatProvider || 'gemini';
  const activeModel = activeProvider === 'gemini'
    ? (settings.geminiChatModel || settings.geminiModel || 'gemini-3.7-flash')
    : (settings.selectedOllamaModel || 'llama3.2');

  useEffect(() => {
    if (!aiChatOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAiChatOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aiChatOpen, setAiChatOpen]);

  useEffect(() => {
    if (aiChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiChatMessages, aiChatOpen]);

  useEffect(() => {
    if (aiChatOpen && !ollamaStatus) {
      checkOllamaHealth();
    }
  }, [aiChatOpen, ollamaStatus, checkOllamaHealth]);

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;
    sendAiChatMessage(text.trim());
    setInputText('');
  };

  const toggleReasoning = (id: string) => {
    setExpandedReasoning(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFallbackToGemini = (failedMessageId: string) => {
    setAiChatProvider('gemini');
    // Find the user query that preceded this error
    const msgIdx = aiChatMessages.findIndex(m => m.id === failedMessageId);
    let userQuery = '';
    if (msgIdx > 0) {
      for (let i = msgIdx - 1; i >= 0; i--) {
        if (aiChatMessages[i].sender === 'user') {
          userQuery = aiChatMessages[i].text;
          break;
        }
      }
    }
    if (userQuery) {
      sendAiChatMessage(userQuery, 'gemini');
    }
  };

  const handleOpenSettings = () => {
    setAiChatOpen(false);
    navigateToView('settings');
  };

  return (
    <>
      {/* Drawer Overlay */}
      {aiChatOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setAiChatOpen(false)}
          ></div>

          {/* Chat Drawer */}
          <div className="relative w-full max-w-md h-full bg-surface border-l border-border shadow-2xl flex flex-col z-10 animate-slide-left">
            {/* Chat Header */}
            <div className="p-4 border-b border-border space-y-3 bg-surface-elevated/80 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <IconBadge icon={<Bot size={18} />} variant="neon" size="md" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-extrabold text-sm text-slate-100">{t.copilotTitle}</h3>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                        {activeModel}
                      </span>
                    </div>
                    <p className={`text-[11px] flex items-center gap-1 font-medium ${
                      activeProvider === 'gemini'
                        ? 'text-amber-300'
                        : (ollamaStatus?.isAvailable ? 'text-emerald-400' : 'text-red-400')
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        activeProvider === 'gemini'
                          ? 'bg-amber-400 animate-pulse'
                          : (ollamaStatus?.isAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-red-400')
                      }`} />
                      {activeProvider === 'gemini'
                        ? (t.geminiCloudStatus || 'Google Gemini Cloud')
                        : (ollamaStatus?.isAvailable ? (t.ollamaOnlineStatus || 'Ollama Local Online') : (t.ollamaOfflineStatus || 'Ollama Local Offline'))}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={handleOpenSettings}
                    title={t.aiSettingsTooltip}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface transition-colors"
                  >
                    <SettingsIcon size={16} />
                  </button>
                  <button
                    onClick={() => setAiChatOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Dual-Engine Switcher Segmented Tabs */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-surface border border-border text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setAiChatProvider('gemini')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                    activeProvider === 'gemini'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-surface-elevated/40'
                  }`}
                >
                  <Cloud size={14} className={activeProvider === 'gemini' ? 'text-amber-400' : ''} />
                  <span>Google Gemini</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 hidden sm:inline">
                    {t.cloudBadge}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAiChatProvider('ollama');
                    if (!ollamaStatus) checkOllamaHealth();
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                    activeProvider === 'ollama'
                      ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30 shadow-sm font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-surface-elevated/40'
                  }`}
                >
                  <Terminal size={14} className={activeProvider === 'ollama' ? 'text-brand-400' : ''} />
                  <span>Ollama Local</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      ollamaStatus?.isAvailable ? 'bg-emerald-400 shadow-glow-emerald' : 'bg-red-400'
                    }`}
                    title={ollamaStatus?.isAvailable ? (t.ollamaOnlineStatus || 'Ollama Local Online') : (t.ollamaOfflineStatus || 'Ollama Local Offline')}
                  />
                </button>
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {aiChatMessages.map(msg => {
                const isUser = msg.sender === 'user';
                const isOllamaError = msg.errorType === 'ollama_offline' || (msg.errorType?.includes('ollama') && msg.canFallback);
                const isKeyError = msg.errorType === 'no_api_key';

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        isUser
                          ? 'bg-brand-600 text-white'
                          : 'bg-surface-elevated border border-border text-brand-400'
                      }`}
                    >
                      {isUser ? <User size={14} /> : <Bot size={14} />}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 space-y-2 leading-relaxed ${
                        isUser
                          ? 'bg-gradient-to-tr from-brand-600 to-brand-700 text-white shadow-glow-brand rounded-tr-none'
                          : isOllamaError || isKeyError
                          ? 'bg-amber-500/10 border border-amber-500/30 text-slate-200 shadow-sm rounded-tl-none'
                          : 'bg-surface-elevated border border-border text-slate-200 shadow-sm rounded-tl-none'
                      }`}
                    >
                      {/* Engine Tag on Agent Messages */}
                      {!isUser && msg.provider && (
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 pb-1 border-b border-white/5">
                          {msg.provider === 'gemini' ? (
                            <span className="flex items-center gap-1 text-amber-300 font-semibold">
                              <Cloud size={11} /> Gemini Cloud
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-brand-400 font-semibold">
                              <Terminal size={11} /> Ollama Local
                            </span>
                          )}
                          {msg.model && <span className="text-slate-500">• {msg.model}</span>}
                        </div>
                      )}

                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      {/* Humanized Fallback Quick Action Buttons */}
                      {isOllamaError && (
                        <div className="pt-2 border-t border-amber-500/20 space-y-2">
                          <p className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                            <AlertTriangle size={13} className="shrink-0" />
                            {t.ollamaOfflineTitle}
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleFallbackToGemini(msg.id)}
                              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] font-bold transition-all shadow-sm"
                            >
                              <Cloud size={13} />
                              <span>{t.switchToGemini}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenSettings}
                              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-elevated text-slate-300 border border-border text-[11px] font-medium transition-all"
                            >
                              <SettingsIcon size={12} />
                              <span>{t.openOllamaGuide}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Missing API Key Quick Action Button */}
                      {isKeyError && (
                        <div className="pt-2 border-t border-amber-500/20">
                          <button
                            type="button"
                            onClick={handleOpenSettings}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/40 text-[11px] font-bold transition-all"
                          >
                            <SettingsIcon size={13} />
                            <span>{t.addApiKeyInSettings}</span>
                            <ArrowRight size={12} />
                          </button>
                        </div>
                      )}

                      {/* Action Executed Badge */}
                      {msg.actionExecuted && (
                        <div className="pt-1.5 border-t border-white/10 flex items-center gap-1.5 text-[10px] font-mono text-emerald-300 font-bold">
                          <CheckCircle2 size={12} className="text-emerald-400" />
                          <span>{t.actionExecuted} {msg.actionExecuted.label}</span>
                        </div>
                      )}

                      {/* Reasoning Dropdown Pill */}
                      {msg.reasoning && (
                        <div className="pt-1">
                          <button
                            onClick={() => toggleReasoning(msg.id)}
                            className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-slate-200"
                          >
                            <Cpu size={10} className="text-accent-purple" />
                            <span>{t.reasoningChain}</span>
                            {expandedReasoning[msg.id] ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </button>
                          {expandedReasoning[msg.id] && (
                            <div className="mt-1.5 p-2 rounded-lg bg-black/40 border border-white/5 font-mono text-[10px] text-slate-300 leading-normal">
                              {msg.reasoning}
                            </div>
                          )}
                        </div>
                      )}

                      <div className={`text-[9px] font-mono ${isUser ? 'text-blue-200' : 'text-slate-500'} text-right`}>
                        {msg.timestamp}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestion Prompt Chips */}
            <div className="p-3 border-t border-border bg-surface-elevated/40 space-y-1.5">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>{t.quickSuggestions}</span>
                {activeProvider === 'ollama' && isCheckingOllama && (
                  <span className="flex items-center gap-1 text-slate-400 text-[10px]">
                    <RefreshCw size={10} className="animate-spin text-brand-400" /> Verificando Ollama...
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(p)}
                    className="px-2.5 py-1 rounded-xl bg-surface-elevated hover:bg-brand-500/20 hover:border-brand-500/40 border border-border text-slate-300 hover:text-brand-300 text-[11px] transition-all text-left truncate max-w-full flex items-center gap-1.5"
                  >
                    <MessageSquare size={12} className="text-brand-400 shrink-0" />
                    <span>{p}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-border bg-surface flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSend();
                }}
                placeholder={activeProvider === 'gemini' ? 'Fale com o Co-Pilot Gemini Cloud...' : 'Fale com o Co-Pilot Ollama Local...'}
                className="flex-1 px-3.5 py-2 rounded-xl bg-surface-elevated border border-border text-slate-100 placeholder-slate-500 text-xs outline-none focus:border-brand-500"
              />
              <button
                onClick={() => handleSend()}
                disabled={!inputText.trim()}
                className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 transition-colors shadow-glow-brand"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
