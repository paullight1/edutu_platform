import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X, WifiOff, Wifi } from 'lucide-react';
import { cn } from '../../lib/cn';

type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info' | 'offline' | 'online';

interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  toasts: ToastData[];
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Minimal, opaque toasts: a solid surface for every variant so nothing looks
// washed-out over the page. The small colored icon carries the semantics;
// error keeps a faint tinted border for extra signal.
const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: 'border-subtle',
  success: 'border-subtle',
  error: 'border-danger/40',
  warning: 'border-warning/40',
  info: 'border-subtle',
  offline: 'border-subtle',
  online: 'border-subtle'
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  default: null,
  success: <CheckCircle size={16} className="text-success" />,
  error: <XCircle size={16} className="text-danger" />,
  warning: <AlertTriangle size={16} className="text-warning" />,
  info: <Info size={16} className="text-info" />,
  offline: <WifiOff size={16} className="text-text-muted" />,
  online: <Wifi size={16} className="text-success" />
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [wasOffline, setWasOffline] = useState(false);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = 'default', durationMs = 4000 }: ToastInput) => {
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, title, description, variant }]);

      if (durationMs > 0) {
        window.setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss]
  );

  const success = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'success', durationMs: 3000 });
  }, [toast]);

  const error = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'error', durationMs: 5000 });
  }, [toast]);

  const warning = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'warning', durationMs: 4000 });
  }, [toast]);

  const info = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'info', durationMs: 4000 });
  }, [toast]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      if (wasOffline) {
        // Remove offline toast
        setToasts(prev => prev.filter(t => t.variant !== 'offline'));
        toast({ title: "You're back online", description: 'All features are now available', variant: 'online', durationMs: 3000 });
      }
      setWasOffline(false);
    };

    const handleOffline = () => {
      // The persistent offline state is surfaced by <OfflineBanner /> (a slim
      // top bar) instead of a bottom toast, so we only record that we went
      // offline to trigger the "back online" confirmation on reconnect.
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast, wasOffline]);

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      toast,
      dismiss,
      success,
      error,
      warning,
      info
    }),
    [dismiss, toast, toasts, success, error, warning, info]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 left-4 sm:left-auto sm:right-4 z-[100] flex w-full sm:max-w-sm flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border bg-surface-layer px-3.5 py-2.5 shadow-elevated',
              'transition-all duration-300 ease-out',
              'animate-in slide-in-from-top-2 fade-in',
              VARIANT_STYLES[t.variant ?? 'default']
            )}
            role="alert"
            aria-live="polite"
          >
            {/* Icon */}
            {VARIANT_ICONS[t.variant ?? 'default'] && (
              <span className="mt-px shrink-0">
                {VARIANT_ICONS[t.variant ?? 'default']}
              </span>
            )}

            {/* Content */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-text-primary">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs leading-snug text-text-muted">{t.description}</p>
              )}
            </div>

            {/* Close button */}
            <button
              type="button"
              className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }

  return context;
};

