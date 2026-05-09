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

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200',
  success: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  error: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  info: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  offline: 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  online: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  default: null,
  success: <CheckCircle size={18} className="text-emerald-500" />,
  error: <XCircle size={18} className="text-red-500" />,
  warning: <AlertTriangle size={18} className="text-amber-500" />,
  info: <Info size={18} className="text-blue-500" />,
  offline: <WifiOff size={18} className="text-gray-500" />,
  online: <Wifi size={18} className="text-emerald-500" />
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
      toast({ title: "You're offline", description: 'Some features may be unavailable', variant: 'offline', durationMs: 0 });
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
              'pointer-events-auto w-full rounded-xl border p-4 shadow-lg backdrop-blur-sm',
              'transform transition-all duration-300 ease-out',
              'animate-in slide-in-from-top-2 fade-in',
              VARIANT_STYLES[t.variant ?? 'default']
            )}
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              {VARIANT_ICONS[t.variant ?? 'default'] && (
                <span className="shrink-0 mt-0.5">
                  {VARIANT_ICONS[t.variant ?? 'default']}
                </span>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-sm opacity-80">{t.description}</p>
                )}
              </div>

              {/* Close button */}
              <button
                type="button"
                className="shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-current opacity-60 hover:opacity-100 transition-opacity"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
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

