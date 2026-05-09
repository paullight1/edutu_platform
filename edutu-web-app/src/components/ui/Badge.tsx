import React from 'react';
import { cn } from '../../lib/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'outline';
}

const variantStyles: Record<Required<BadgeProps>['variant'], string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-emerald-100 text-emerald-700',
  danger: 'bg-red-100 text-red-600',
  outline: 'border border-gray-200 text-gray-600'
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
