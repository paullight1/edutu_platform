import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ children, className = '', style, onClick }) => {
  const isInteractive = typeof onClick === 'function';

  return (
    <div
      className={`group relative rounded-[20px] transition-transform duration-200 ease-in-out hover:-translate-y-[2px] focus-within:-translate-y-[2px] ${
        isInteractive ? 'cursor-pointer' : ''
      }`}
      style={style}
      onClick={onClick}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[20px] bg-gradient-to-br from-brand-500/0 via-transparent to-info-500/0 opacity-0 transition-all duration-200 ease-in-out group-hover:from-brand-500/35 group-hover:to-info-500/35 group-hover:opacity-100 group-focus-within:from-brand-500/35 group-focus-within:to-info-500/35 group-focus-within:opacity-100 blur-2xl" />
      <div
        className={`relative rounded-[20px] border border-subtle bg-surface-layer p-6 shadow-soft backdrop-blur-xl transition-theme transition-all duration-200 ease-in-out hover:border-transparent hover:shadow-elevated focus-within:border-transparent focus-within:shadow-elevated ${className}`}
      >
        {children}
      </div>
    </div>
  );
};

export default Card;
