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
  MessageSquare
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const AiChatDrawer: React.FC = () => {
  const { aiChatOpen, setAiChatOpen, aiChatMessages, sendAiChatMessage, settings } = useAppStore();
  const [inputText, setInputText] = useState('');
  const [expandedReasoning, setExpandedReasoning] = useState<{ [id: string]: boolean }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    'Selecione apenas as fotos na vertical com luz amarela',
    'Filtrar fotos com resolução 4K UHD ou superior',
    'Qual álbum teve a maior taxa de Original hoje?',
    'Ir para a galeria de álbuns'
  ];

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

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;
    sendAiChatMessage(text.trim());
    setInputText('');
  };

  const toggleReasoning = (id: string) => {
    setExpandedReasoning(prev => ({ ...prev, [id]: !prev[id] }));
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
            <div className="p-4 border-b border-border flex items-center justify-between bg-surface-elevated/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-accent-purple flex items-center justify-center text-white shadow-glow-brand">
                  <Bot size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-extrabold text-sm text-slate-100">AI Chat Co-Pilot</h3>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
                      {settings.aiModel}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Agente Conversacional Ativo
                  </p>
                </div>
              </div>

              <button
                onClick={() => setAiChatOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-elevated transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {aiChatMessages.map(msg => {
                const isUser = msg.sender === 'user';
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
                          : 'bg-surface-elevated border border-border text-slate-200 shadow-sm rounded-tl-none'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      {/* Action Executed Badge */}
                      {msg.actionExecuted && (
                        <div className="pt-1.5 border-t border-white/10 flex items-center gap-1.5 text-[10px] font-mono text-emerald-300 font-bold">
                          <CheckCircle2 size={12} className="text-emerald-400" />
                          <span>Ação Executada: {msg.actionExecuted.label}</span>
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
                            <span>Cadeia de Raciocínio (Chain-of-Thought)</span>
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
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Sugestões Rápidas:
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
                placeholder="Fale com o Co-Pilot (ex: selecione fotos amarelas)..."
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
