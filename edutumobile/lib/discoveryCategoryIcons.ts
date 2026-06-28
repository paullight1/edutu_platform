import type { ImageSourcePropType } from 'react-native';

export type DiscoveryCategoryIcon = 'scholarship' | 'career' | 'grant' | 'leadership' | 'training';

export function getDiscoveryCategoryIconSource(type: DiscoveryCategoryIcon): ImageSourcePropType {
  switch (type) {
    case 'career':
      return require('../assets/icons8/briefcase.png');
    case 'leadership':
      return require('../assets/icons8/document.png');
    case 'training':
      return require('../assets/icons8/training.png');
    default:
      return require('../assets/icons8/certificate.png');
  }
}

export function getDiscoveryCategoryIconXml(type: DiscoveryCategoryIcon): string | null {
  if (type === 'scholarship') {
    return `
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="capBody" x1="14" y1="18" x2="50" y2="46" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FFFFFF"/>
            <stop offset="0.46" stop-color="#DBEAFE"/>
            <stop offset="1" stop-color="#93C5FD"/>
          </linearGradient>
          <linearGradient id="capRibbon" x1="25" y1="34" x2="43" y2="48" gradientUnits="userSpaceOnUse">
            <stop stop-color="#818CF8"/>
            <stop offset="1" stop-color="#4F46E5"/>
          </linearGradient>
        </defs>
        <path d="M6 25.5L32 13L58 25.5L32 38L6 25.5Z" fill="url(#capBody)"/>
        <path d="M17.5 31.4V42.1C17.5 46 24 49.2 32 49.2C40 49.2 46.5 46 46.5 42.1V31.4L32 38.4L17.5 31.4Z" fill="url(#capRibbon)"/>
        <path d="M50.5 28.8V42.5" stroke="#FDE68A" stroke-width="3" stroke-linecap="round"/>
        <circle cx="50.5" cy="45.8" r="3.7" fill="#F59E0B"/>
        <path d="M16 26L32 33.7L48 26" stroke="#FFFFFF" stroke-opacity="0.72" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  if (type === 'career') {
    return `
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="profileBody" x1="15" y1="12" x2="49" y2="54" gradientUnits="userSpaceOnUse">
            <stop stop-color="#BAE6FD"/>
            <stop offset="0.5" stop-color="#38BDF8"/>
            <stop offset="1" stop-color="#2563EB"/>
          </linearGradient>
          <linearGradient id="profileBadge" x1="22" y1="13" x2="43" y2="52" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FFFFFF"/>
            <stop offset="1" stop-color="#E0F2FE"/>
          </linearGradient>
        </defs>
        <rect x="15" y="10" width="34" height="44" rx="9" fill="url(#profileBody)"/>
        <circle cx="32" cy="25" r="7" fill="url(#profileBadge)"/>
        <path d="M20.8 45.8C22.9 39.8 27 36.8 32 36.8C37 36.8 41.1 39.8 43.2 45.8" fill="#EFF6FF"/>
        <path d="M22.5 17H41.5" stroke="#FFFFFF" stroke-opacity="0.46" stroke-width="2" stroke-linecap="round"/>
        <path d="M22.5 51H41.5" stroke="#075985" stroke-opacity="0.2" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  if (type === 'leadership') {
    return `
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="groupMain" x1="14" y1="13" x2="50" y2="53" gradientUnits="userSpaceOnUse">
            <stop stop-color="#bfdbfe"/>
            <stop offset="0.5" stop-color="#3b82f6"/>
            <stop offset="1" stop-color="#1e3a5f"/>
          </linearGradient>
          <linearGradient id="groupSide" x1="9" y1="19" x2="55" y2="49" gradientUnits="userSpaceOnUse">
            <stop stop-color="#C4B5FD"/>
            <stop offset="1" stop-color="#6366F1"/>
          </linearGradient>
        </defs>
        <circle cx="32" cy="24" r="8" fill="#FFFFFF"/>
        <circle cx="18.5" cy="29" r="6.2" fill="url(#groupSide)"/>
        <circle cx="45.5" cy="29" r="6.2" fill="url(#groupSide)"/>
        <path d="M15 50.5C17.7 41.7 23.4 37.2 32 37.2C40.6 37.2 46.3 41.7 49 50.5" fill="url(#groupMain)"/>
        <path d="M6.5 49.2C8.4 42.9 12.4 39.8 18.5 39.8C21.7 39.8 24.4 40.7 26.5 42.5C23.3 44.5 21 47.1 19.5 50.5H6.5V49.2Z" fill="#2563eb" opacity="0.78"/>
        <path d="M57.5 49.2C55.6 42.9 51.6 39.8 45.5 39.8C42.3 39.8 39.6 40.7 37.5 42.5C40.7 44.5 43 47.1 44.5 50.5H57.5V49.2Z" fill="#2563eb" opacity="0.78"/>
      </svg>
    `;
  }

  if (type === 'training') {
    return `
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="trainBody" x1="14" y1="10" x2="50" y2="54" gradientUnits="userSpaceOnUse">
            <stop stop-color="#E8D5FF"/>
            <stop offset="0.45" stop-color="#A855F7"/>
            <stop offset="1" stop-color="#7C3AED"/>
          </linearGradient>
          <linearGradient id="trainScreen" x1="20" y1="18" x2="44" y2="42" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FFFFFF"/>
            <stop offset="1" stop-color="#E9D5FF"/>
          </linearGradient>
        </defs>
        <rect x="14" y="12" width="36" height="30" rx="4" fill="url(#trainBody)"/>
        <rect x="18" y="16" width="28" height="18" rx="2" fill="url(#trainScreen)"/>
        <path d="M20 38L22 42H42L44 38" fill="#A855F7" opacity="0.6"/>
        <rect x="22" y="43" width="20" height="3" rx="1.5" fill="#C084FC"/>
        <line x1="26" y1="47" x2="26" y2="50" stroke="#7C3AED" stroke-width="2" stroke-linecap="round"/>
        <line x1="32" y1="47" x2="32" y2="50" stroke="#7C3AED" stroke-width="2" stroke-linecap="round"/>
        <line x1="38" y1="47" x2="38" y2="50" stroke="#7C3AED" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  return `
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="globeBody" x1="18" y1="14" x2="46" y2="50" gradientUnits="userSpaceOnUse">
          <stop stop-color="#8DD7FF"/>
          <stop offset="0.48" stop-color="#3B82F6"/>
          <stop offset="1" stop-color="#1D4ED8"/>
        </linearGradient>
        <linearGradient id="globeHighlight" x1="22" y1="18" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFFFFF" stop-opacity="0.95"/>
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.18"/>
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="50" rx="16.5" ry="5.2" fill="#0F172A" fill-opacity="0.12"/>
      <circle cx="32" cy="30" r="16" fill="url(#globeBody)"/>
      <path d="M16 30H48" stroke="#E0F2FE" stroke-width="2" stroke-linecap="round" opacity="0.9"/>
      <path d="M19 24.4C23.2 26.8 27.4 28 32 28C36.6 28 40.8 26.8 45 24.4" stroke="#E0F2FE" stroke-width="1.7" stroke-linecap="round" opacity="0.78"/>
      <path d="M19 35.6C23.2 33.2 27.4 32 32 32C36.6 32 40.8 33.2 45 35.6" stroke="#E0F2FE" stroke-width="1.7" stroke-linecap="round" opacity="0.78"/>
      <path d="M32 14C36 17.1 38.4 23 38.4 30C38.4 37 36 42.9 32 46" stroke="url(#globeHighlight)" stroke-width="1.7" stroke-linecap="round" opacity="0.9"/>
      <path d="M32 14C28 17.1 25.6 23 25.6 30C25.6 37 28 42.9 32 46" stroke="url(#globeHighlight)" stroke-width="1.7" stroke-linecap="round" opacity="0.9"/>
      <circle cx="43.2" cy="21.4" r="2.5" fill="#FDE68A"/>
      <circle cx="21.8" cy="40.8" r="2.4" fill="#FDA4AF"/>
      <circle cx="46" cy="37.5" r="2.15" fill="#A7F3D0"/>
      <circle cx="18.6" cy="24.8" r="2.05" fill="#BFDBFE"/>
      <path d="M22.1 40.6L18.8 24.9" stroke="#FFFFFF" stroke-opacity="0.66" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M43.2 21.4L46 37.5" stroke="#FFFFFF" stroke-opacity="0.66" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M24 18L42 30.7" stroke="#FFFFFF" stroke-opacity="0.58" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M20 35.4L40.6 24.2" stroke="#FFFFFF" stroke-opacity="0.58" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  `;
}
