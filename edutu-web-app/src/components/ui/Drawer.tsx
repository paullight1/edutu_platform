import React, { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

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

export const DrawerContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => {
  const { open, onOpenChange, side } = useDrawerContext();

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
        className={cn(
          'relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 shadow-2xl',
          side === 'right' ? 'ml-auto' : 'mr-auto',
          className
        )}
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
