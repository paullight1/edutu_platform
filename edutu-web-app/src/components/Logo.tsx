import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 48 }) => {
  return (
    <img
      src="/edutu-logo.png"
      alt="Edutu Logo"
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
};

export default Logo;