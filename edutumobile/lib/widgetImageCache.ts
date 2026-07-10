import { Platform } from 'react-native';

import { hasWidgetsNativeModule } from './widgetsNative';

/**
 * WidgetKit extensions can only read images from the shared app-group container,
 * so the image-led trending widgets (Spotlight, Grid) can't fetch poster photos
 * at render time. This downloads a remote image into expo-widgets' shared
 * directory and hands the widget a stable file:// URI for it.
 *
 * iOS only — Android widgets load their own bitmaps natively. Best-effort: any
 * failure resolves to undefined and the widget falls back to a flat brand tile.
 * Keyed by a caller-owned slot id (e.g. "trend-0") so each poster slot reuses one
 * file and the newest photo overwrites the last.
 */
export async function getWidgetImageUri(
  url: string | null | undefined,
  slotKey: string,
): Promise<string | undefined> {
  if (Platform.OS !== 'ios' || !url) return undefined;
  // Probe without importing expo-widgets — its import logs+throws in Expo Go.
  if (!hasWidgetsNativeModule()) return undefined;

  try {
    const { widgetsDirectory } = require('expo-widgets') as typeof import('expo-widgets');
    if (!widgetsDirectory) return undefined;

    const { File, Directory } =
      require('expo-file-system') as typeof import('expo-file-system');

    const destination = new File(new Directory(widgetsDirectory), `edutu-widget-${slotKey}.img`);
    if (destination.exists) {
      destination.delete();
    }
    await File.downloadFileAsync(url, destination);
    return destination.exists ? destination.uri : undefined;
  } catch {
    return undefined;
  }
}
