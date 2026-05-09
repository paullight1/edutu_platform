import React, { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

interface DialogContextValue {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

const useDialogContext = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('Dialog components must be used within a <Dialog>');
  }
  return context;
};

interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => (
  <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>
);

export const DialogContent: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { preventCloseOnBackdropClick?: boolean }
> = ({ className, children, preventCloseOnBackdropClick = false, ...props }) => {
  const { open, onOpenChange } = useDialogContext();

  useEffect(() => {
    if (!open) {
      return;
    }
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleBackdrop = () => {
    if (!preventCloseOnBackdropClick) {
      onOpenChange?.(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={handleBackdrop} />
      <div
        className={cn(
          'relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl focus:outline-none',
          className
        )}
        role="dialog"
        aria-modal="true"
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export const DialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('space-y-1 text-left', className)} {...props} />
);

export const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
);

export const DialogTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, ...props }) => (
  <h2 className={cn('text-lg font-semibold text-gray-900', className)} {...props} />
);

export const DialogDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className,
  ...props
}) => <p className={cn('text-sm text-gray-500', className)} {...props} />;
