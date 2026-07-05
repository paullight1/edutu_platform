import React from 'react';
import { cn } from '../../lib/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'outline';
}

const variantStyles: Record<Required<BadgeProps>['variant'], string> = {
  default: 'bg-surface-elevated text-text-secondary',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  outline: 'border border-subtle text-text-secondary'
};

const Badge: React.FC<BadgeProps> = ({ className, variant = 'default', ...props }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      variantStyles[variant],
      className
    )}
    {...props}
  />
);

export default Badge;
