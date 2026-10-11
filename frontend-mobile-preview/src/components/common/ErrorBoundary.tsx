import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error | null, reset: () => void) => ReactNode);
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public handleReload = () => {
    window.location.reload();
  };

  public render() {
    const isEn = typeof window !== 'undefined' && (() => {
      try {
        const s = localStorage.getItem('imagex_settings');
        return s ? JSON.parse(s).language === 'en-US' : false;
      } catch (_) {
        return false;
      }
    })();

    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.handleReset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen w-full bg-slate-950 text-white flex items-center justify-center p-4 select-none">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto shadow-glow-rose">
              <AlertTriangle size={32} />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-white">{isEn ? "Oops, something went wrong" : "Ops, algo deu errado"}</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isEn ? "An unexpected error was safely caught to prevent application crash." : "Um erro inesperado foi capturado com segurança pelo sistema de proteção para evitar travamento da tela."}
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-black/60 border border-rose-500/20 rounded-xl text-left font-mono text-[11px] text-rose-300 max-h-32 overflow-y-auto break-words leading-relaxed select-text">
                {this.state.error.message || this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-white/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw size={14} />
                {isEn ? "Recover" : "Recuperar"}
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-lg shadow-brand-600/30 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw size={14} />
                {isEn ? "Reload" : "Recarregar"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
