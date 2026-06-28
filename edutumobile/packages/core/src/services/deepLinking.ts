import * as Linking from 'expo-linking';

const DEEP_LINK_PREFIX = 'edutu://';

export type DeepLinkRoute =
  | { screen: 'opportunity'; id: string }
  | { screen: 'roadmap'; id: string }
  | { screen: 'goal'; id: string }
  | { screen: 'profile' }
  | { screen: 'chat' };

// ─── URL Generation ──────────────────────────────────────────────────────────

export function createShareLink(route: DeepLinkRoute): string {
  switch (route.screen) {
    case 'opportunity':
      return `${DEEP_LINK_PREFIX}opportunity/${route.id}`;
    case 'roadmap':
      return `${DEEP_LINK_PREFIX}roadmap/${route.id}`;
    case 'goal':
      return `${DEEP_LINK_PREFIX}goal/${route.id}`;
    case 'profile':
      return `${DEEP_LINK_PREFIX}profile`;
    case 'chat':
      return `${DEEP_LINK_PREFIX}chat`;
  }
}

export function createWebLink(route: DeepLinkRoute): string {
  const baseUrl = 'https://edutu.ai';
  switch (route.screen) {
    case 'opportunity':
      return `${baseUrl}/opportunities/${route.id}`;
    case 'roadmap':
      return `${baseUrl}/roadmaps/${route.id}`;
    case 'goal':
      return `${baseUrl}/goals/${route.id}`;
    case 'profile':
      return `${baseUrl}/profile`;
    case 'chat':
      return `${baseUrl}/chat`;
  }
}

export function createUniversalLink(route: DeepLinkRoute): { deep: string; web: string } {
  return {
    deep: createShareLink(route),
    web: createWebLink(route),
  };
}

// ─── URL Parsing ─────────────────────────────────────────────────────────────

export function parseDeepLink(url: string): DeepLinkRoute | null {
  // Handle edutu:// scheme
  if (url.startsWith(DEEP_LINK_PREFIX)) {
    const path = url.replace(DEEP_LINK_PREFIX, '');
    return parsePath(path);
  }

  // Handle https://edutu.ai scheme
  try {
    const parsedUrl = new URL(url);
    const isValidDomain = parsedUrl.hostname === 'edutu.ai' || parsedUrl.hostname === 'www.edutu.ai';
    if (!isValidDomain) return null;
    const path = parsedUrl.pathname.replace(/^\//, '');
    return parsePath(path);
  } catch {
    return null;
  }

  return null;
}

function parsePath(path: string): DeepLinkRoute | null {
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return null;

  const screen = parts[0];
  const id = parts[1];

  switch (screen) {
    case 'opportunity':
      return id ? { screen: 'opportunity', id } : null;
    case 'roadmap':
      return id ? { screen: 'roadmap', id } : null;
    case 'goal':
      return id ? { screen: 'goal', id } : null;
    case 'profile':
      return { screen: 'profile' };
    case 'chat':
      return { screen: 'chat' };
    default:
      return null;
  }
}

// ─── Share Helpers ───────────────────────────────────────────────────────────

export function getShareMessage(route: DeepLinkRoute, title?: string): string {
  const links = createUniversalLink(route);

  switch (route.screen) {
    case 'opportunity':
      return title
        ? `Check out "${title}" on Edutu!\n\n${links.web}`
        : `Check out this opportunity on Edutu!\n\n${links.web}`;
    case 'roadmap':
      return title
        ? `Check out "${title}" roadmap on Edutu!\n\n${links.web}`
        : `Check out this roadmap on Edutu!\n\n${links.web}`;
    case 'goal':
      return title
        ? `Check out my goal "${title}" on Edutu!\n\n${links.web}`
        : `Check out this goal on Edutu!\n\n${links.web}`;
    case 'profile':
      return `Check out my profile on Edutu!\n\n${links.web}`;
    case 'chat':
      return `Chat with Edutu AI!\n\n${links.web}`;
  }
}
