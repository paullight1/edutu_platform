import React, { useState } from 'react';
import { Globe, Building2 } from 'lucide-react';

interface ImageWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  fallbackIcon?: 'globe' | 'building';
  fallbackClassName?: string;
}

const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
  src,
  alt,
  className = '',
  fallbackIcon = 'globe',
  fallbackClassName = ''
}) => {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    const Icon = fallbackIcon === 'building' ? Building2 : Globe;
    return (
      <div className={`flex items-center justify-center ${fallbackClassName}`}>
        <Icon size={32} className="text-slate-300" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
};

export default ImageWithFallback;
