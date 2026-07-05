import React from 'react';
import { cn } from '../../lib/cn';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-sm font-medium text-text-secondary', className)}
    {...props}
  />
));

Label.displayName = 'Label';

export default Label;
