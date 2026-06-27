import React, { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { useFocusTrap, useReducedMotion } from '../../lib/accessibility';

interface DrawerContextValue {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  side: 'left' | 'right';
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

const useDrawerContext = () => {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('Drawer components must be used within a <Drawer>');
  }
  return context;
};

interface DrawerProps {
  open: boolean;
  side?: 'left' | 'right';
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({ open, side = 'right', onOpenChange, children }) => (
  <DrawerContext.Provider value={{ open, side, onOpenChange }}>{children}</DrawerContext.Provider>
);

export const DrawerContent: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { ariaLabel?: string }
> = ({ className, children, ariaLabel, ...props }) => {
  const { open, onOpenChange, side } = useDrawerContext();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) {
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused?.focus();
    };
  }, [open]);

  const containerRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange?.(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

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

  return createPortal(
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-gray-900/50 backdrop-blur-sm"
        onClick={() => onOpenChange?.(false)}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        className={cn(
          'relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 shadow-2xl',
          side === 'right' ? 'ml-auto' : 'mr-auto',
          !reducedMotion && 'animate-fade-in',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export const DrawerHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('space-y-1', className)} {...props} />
);

export const DrawerFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('mt-6', className)} {...props} />
);

export const DrawerTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, ...props }) => (
  <h2 className={cn('text-lg font-semibold text-gray-900', className)} {...props} />
);

export const DrawerDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className,
  ...props
}) => <p className={cn('text-sm text-gray-500', className)} {...props} />;
