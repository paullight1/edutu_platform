import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Coins,
  Globe,
  GraduationCap,
  Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ImageWithFallbackProps {
  src: string | null | undefined;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  fallbackIcon?: 'globe' | 'building';
  fallbackClassName?: string;
  /**
   * Opportunity category. When provided, a missing/broken image renders a
   * branded gradient tile with a category icon instead of a bare icon —
   * never a generic stock photo.
   */
  category?: string | null;
}

const CATEGORY_FALLBACKS: Array<{
  pattern: RegExp;
  icon: LucideIcon;
  classes: string;
}> = [
  {
    pattern: /scholar/i,
    icon: GraduationCap,
    classes:
      'from-brand-500/25 via-brand-500/10 to-sky-500/20 text-brand-600 dark:text-brand-300',
  },
  {
    pattern: /fellow/i,
    icon: Award,
    classes:
      'from-violet-500/25 via-violet-500/10 to-fuchsia-500/20 text-violet-600 dark:text-violet-300',
  },
  {
    pattern: /intern|career|job/i,
    icon: Briefcase,
    classes:
      'from-emerald-500/25 via-emerald-500/10 to-teal-500/20 text-emerald-600 dark:text-emerald-300',
  },
  {
    pattern: /grant|fund/i,
    icon: Coins,
    classes:
      'from-amber-500/25 via-amber-500/10 to-orange-500/20 text-amber-600 dark:text-amber-300',
  },
  {
    pattern: /training|conference|course/i,
    icon: BookOpen,
    classes:
      'from-sky-500/25 via-sky-500/10 to-cyan-500/20 text-sky-600 dark:text-sky-300',
  },
  {
    pattern: /program|leader/i,
    icon: Layers,
    classes:
      'from-blue-500/25 via-blue-500/10 to-blue-500/20 text-blue-600 dark:text-blue-300',
  },
];

const DEFAULT_CATEGORY_FALLBACK = {
  icon: Globe,
  classes:
    'from-slate-400/25 via-slate-400/10 to-slate-500/20 text-slate-500 dark:text-slate-300',
};

const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
  src,
  fallbackSrc,
  alt,
  className = '',
  fallbackIcon = 'globe',
  fallbackClassName = '',
  category,
}) => {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [src, fallbackSrc]);

  const primarySource = typeof src === 'string' && src.trim() ? src : null;
  const fallbackSource =
    typeof fallbackSrc === 'string' && fallbackSrc.trim() ? fallbackSrc : null;
  const imageSource =
    primarySource && !primaryFailed
      ? primarySource
      : fallbackSource && !fallbackFailed
        ? fallbackSource
        : null;

  if (!imageSource) {
    if (category !== undefined) {
      const match =
        (category
          ? CATEGORY_FALLBACKS.find((entry) => entry.pattern.test(category))
          : undefined) ?? DEFAULT_CATEGORY_FALLBACK;
      const Icon = match.icon;
      return (
        <div
          className={`flex items-center justify-center bg-gradient-to-br ${match.classes} ${fallbackClassName}`}
          role="img"
          aria-label={alt}
        >
          <Icon size={36} strokeWidth={1.5} />
        </div>
      );
    }

    const Icon = fallbackIcon === 'building' ? Building2 : Globe;
    return (
      <div className={`flex items-center justify-center ${fallbackClassName}`}>
        <Icon size={32} className="text-text-muted" />
      </div>
    );
  }

  return (
    <img
      src={imageSource}
      alt={alt}
      className={className}
      onError={() => {
        if (primarySource && !primaryFailed && fallbackSource) {
          setPrimaryFailed(true);
        } else {
          setFallbackFailed(true);
        }
      }}
      loading="lazy"
      decoding="async"
      // Scraped og:image URLs often sit behind hotlink protection that keys on
      // the Referer header; omitting it lets far more source images load.
      referrerPolicy="no-referrer"
    />
  );
};

export default ImageWithFallback;
