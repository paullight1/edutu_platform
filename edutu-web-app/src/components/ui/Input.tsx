import React from 'react';
import { cn } from '../../lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = 'text', ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-10 w-full rounded-lg border border-subtle bg-surface-layer px-3 text-sm text-text-primary outline-none placeholder:text-text-muted transition focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    />
  );
});

Input.displayName = 'Input';

export default Input;
