import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { LoadingButton } from './LoadingButton';

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus the confirm button on open
    confirmBtnRef.current?.focus();

    // Trap focus inside dialog
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-500',
      iconBg: 'bg-red-100',
      confirmVariant: 'danger' as const,
    },
    warning: {
      icon: 'text-amber-500',
      iconBg: 'bg-amber-100',
      confirmVariant: 'secondary' as const,
    },
    info: {
      icon: 'text-blue-500',
      iconBg: 'bg-blue-100',
      confirmVariant: 'primary' as const,
    },
  }[variant];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-in zoom-in-95 fade-in duration-200"
      >
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full ${variantStyles.iconBg} flex-shrink-0`}>
            <AlertTriangle className={`w-5 h-5 ${variantStyles.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="confirm-title" className="text-lg font-semibold text-[#1d1d1f]">
              {title}
            </h2>
            <p id="confirm-message" className="mt-2 text-sm text-gray-500 leading-relaxed">
              {message}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
          <LoadingButton
            ref={confirmBtnRef}
            variant={variantStyles.confirmVariant}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
