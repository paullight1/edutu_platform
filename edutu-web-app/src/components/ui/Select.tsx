import React from 'react';
import { cn } from '../../lib/cn';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, placeholder, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'h-10 w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';

export default Select;
