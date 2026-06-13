import React from 'react';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  (
    {
      loading = false,
      loadingText,
      children,
      variant = 'primary',
      size = 'md',
      disabled,
      className = '',
      ...props
    },
    ref,
  ) => {
    const baseClasses =
      'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantClasses = {
      primary:
        'bg-[#0071e3] text-white hover:bg-[#0077ed] focus:ring-[#0071e3] shadow-sm',
      secondary:
        'bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] focus:ring-[#1d1d1f]',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      ghost: 'bg-transparent text-[#1d1d1f] hover:bg-black/5 focus:ring-[#0071e3]',
    };

    const sizeClasses = {
      sm: 'text-xs px-4 py-2 rounded-lg',
      md: 'text-sm px-5 py-2.5',
      lg: 'text-base px-6 py-3',
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {loading ? (loadingText || children) : children}
      </button>
    );
  },
);

LoadingButton.displayName = 'LoadingButton';
