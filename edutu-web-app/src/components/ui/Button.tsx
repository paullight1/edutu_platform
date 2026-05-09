import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size = 'md', 
  children, 
  className = '', 
  ...props 
}) => {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-theme duration-200 ease-in-out focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0';
  
  const variantClasses = {
    primary: 'gradient-accent text-white shadow-soft hover:opacity-95 hover:shadow-[0_30px_70px_-32px_rgba(66,105,255,0.75)] active:translate-y-px',
    secondary: 'bg-surface-layer text-soft border border-subtle hover:bg-surface-elevated hover:border-accent-300/40 shadow-soft active:translate-y-px',
  };
  
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-3 text-base',
    lg: 'px-6 py-4 text-lg'
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
