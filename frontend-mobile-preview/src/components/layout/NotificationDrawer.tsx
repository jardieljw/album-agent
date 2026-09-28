import React, { useEffect } from 'react';
import { X, CheckCheck, Bell, Sparkles, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const NotificationDrawer: React.FC = () => {
  const {
    notificationDrawerOpen,
    setNotificationDrawerOpen,
    notifications,
    markNotificationsAsRead,
    navigateToView
  } = useAppStore();

  useEffect(() => {
    if (!notificationDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotificationDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notificationDrawerOpen, setNotificationDrawerOpen]);

  if (!notificationDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => setNotificationDrawerOpen(false)}
      ></div>

      {/* Drawer Content */}
      <div className="relative w-full max-w-sm h-full bg-surface border-l border-border shadow-2xl flex flex-col z-10 animate-slide-left">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-brand-400" />
            <h3 className="font-bold text-sm text-slate-100">Central de Notificações</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markNotificationsAsRead}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-elevated text-xs flex items-center gap-1 transition-colors"
              title="Marcar todas como lidas"
            >
              <CheckCheck size={14} />
            </button>
            <button
              onClick={() => setNotificationDrawerOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-elevated transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Nenhuma notificação recente.
            </div>
          ) : (
            notifications.map(notif => (
              <div
                key={notif.id}
                onClick={() => {
                  if (notif.linkViewId) {
                    navigateToView(notif.linkViewId, notif.linkAlbumId);
                    setNotificationDrawerOpen(false);
                  }
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  notif.isRead
                    ? 'bg-surface-elevated/40 border-border text-slate-400'
                    : 'bg-surface-elevated border-brand-500/30 text-slate-200 shadow-sm'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5">
                    {notif.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
                    {notif.type === 'warning' && <AlertTriangle size={16} className="text-amber-400" />}
                    {notif.type === 'info' && <Info size={16} className="text-brand-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-slate-100 truncate">{notif.title}</h4>
                      <span className="text-[10px] font-mono text-slate-500">{notif.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{notif.message}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
