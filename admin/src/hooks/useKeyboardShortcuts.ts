import { useEffect, useCallback } from 'react';

interface ShortcutMap {
  [key: string]: () => void;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
}

export function useKeyboardShortcuts(
  shortcuts: ShortcutMap,
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled = true } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Allow Escape in inputs (to blur)
        if (event.key !== 'Escape') return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? event.metaKey : event.ctrlKey;

      let shortcutKey = '';

      if (mod) shortcutKey += 'mod+';
      if (event.shiftKey) shortcutKey += 'shift+';
      if (event.altKey) shortcutKey += 'alt+';

      shortcutKey += event.key.toLowerCase();

      const handler = shortcuts[shortcutKey];
      if (handler) {
        event.preventDefault();
        handler();
      }
    },
    [shortcuts, enabled],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Common admin shortcuts reference
export const ADMIN_SHORTCUTS = {
  SAVE: 'mod+s',
  SEARCH: 'mod+k',
  FIND: 'mod+f',
  HELP: '?',
  CLOSE: 'escape',
  NEW: 'mod+n',
} as const;
