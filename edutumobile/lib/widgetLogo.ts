import { Platform } from 'react-native';

/**
 * Widgets brand themselves with the logo mark alone (no wordmark). WidgetKit
 * extensions can only read images from the shared app-group container, so on
 * iOS we copy the bundled transparent logo (assets/logo1.png) into
 * expo-widgets' shared directory once and hand widgets a file:// URI.
 *
 * Android widgets use the res/drawable copy instead, and every widget layout
 * falls back to an SF Symbol / drawable when the URI is missing, so this is
 * strictly best-effort.
 */

const LOGO_FILE_NAME = 'edutu-widget-logo.png';

let cachedUri: string | null | undefined;

export async function getWidgetLogoUri(): Promise<string | undefined> {
  if (Platform.OS !== 'ios') return undefined;
  if (cachedUri !== undefined) return cachedUri ?? undefined;

  try {
    // Lazily required: native modules aren't available under Jest / Expo Go.
    const { widgetsDirectory } = require('expo-widgets') as typeof import('expo-widgets');
    if (!widgetsDirectory) {
      cachedUri = null;
      return undefined;
    }

    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    const { File, Directory } =
      require('expo-file-system') as typeof import('expo-file-system');

    const destination = new File(new Directory(widgetsDirectory), LOGO_FILE_NAME);
    if (!destination.exists) {
      const asset = Asset.fromModule(require('../assets/logo1.png'));
      await asset.downloadAsync();
      if (!asset.localUri) {
        cachedUri = null;
        return undefined;
      }
      new File(asset.localUri).copy(destination);
    }
    cachedUri = destination.uri;
  } catch {
    cachedUri = null;
  }
  return cachedUri ?? undefined;
}
