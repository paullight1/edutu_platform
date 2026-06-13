/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  undoAction?: () => void;
  undoLabel?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (params: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(
    ({ type = 'info', message, undoAction, undoLabel, duration = 5000 }: Omit<Toast, 'id'>) => {
      const id = `toast_${++toastId}`;
      setToasts((prev) => [...prev.slice(-2), { id, type, message, undoAction, undoLabel, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismissToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (t.duration === 0) return;
    const timer = setTimeout(() => setExiting(true), t.duration - 300);
    return () => clearTimeout(timer);
  }, [t.duration]);

  const config = {
    success: { bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle, iconColor: 'text-emerald-500' },
    error: { bg: 'bg-red-50 border-red-200', icon: AlertCircle, iconColor: 'text-red-500' },
    warning: { bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-500' },
    info: { bg: 'bg-blue-50 border-blue-200', icon: Info, iconColor: 'text-blue-500' },
  }[t.type];

  const Icon = config.icon;

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-sm transition-all duration-300 ${config.bg} ${
        exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
      <p className="flex-1 text-sm font-medium text-gray-900">{t.message}</p>
      <div className="flex items-center gap-2 flex-shrink-0">
        {t.undoAction && (
          <button
            onClick={() => {
              t.undoAction?.();
              onDismiss(t.id);
            }}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            {t.undoLabel || 'Undo'}
          </button>
        )}
        <button
          onClick={() => onDismiss(t.id)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
