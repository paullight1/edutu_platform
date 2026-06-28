import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { parseDeepLink } from '@edutu/core/src/services/deepLinking';

export function useDeepLink() {
  const router = useRouter();
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      // Prevent handling the same URL twice
      if (handledRef.current.has(url)) return;
      handledRef.current.add(url);

      const route = parseDeepLink(url);
      if (!route) return;

      switch (route.screen) {
        case 'opportunity':
          router.push(`/opportunities/${route.id}`);
          break;
        case 'roadmap':
          router.push(`/roadmaps`);
          break;
        case 'goal':
          router.push(`/goals/${route.id}`);
          break;
        case 'profile':
          router.push('/profile');
          break;
        case 'chat':
          router.push('/chat');
          break;
      }
    };

    // Handle initial URL (cold start)
    Linking.getInitialURL().then(url => {
      if (url) handleUrl({ url });
    });

    // Handle URL when app is already running
    const subscription = Linking.addEventListener('url', handleUrl);

    return () => {
      subscription.remove();
    };
  }, [router]);
}
