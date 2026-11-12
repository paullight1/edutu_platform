import { Platform } from 'react-native';

import { hasWidgetsNativeModule } from './widgetsNative';

/** Copy the approved bundled guide into the WidgetKit shared image container. */
const MASCOT_FILE_NAME = 'edutu-widget-guide.png';

let cachedUri: string | null | undefined;

export async function getWidgetMascotUri(): Promise<string | undefined> {
  if (Platform.OS !== 'ios') return undefined;
  if (cachedUri !== undefined) return cachedUri ?? undefined;
  // Probe without importing expo-widgets — its import logs+throws in Expo Go.
  if (!hasWidgetsNativeModule()) {
    cachedUri = null;
    return undefined;
  }

  try {
    const { widgetsDirectory } = require('expo-widgets') as typeof import('expo-widgets');
    if (!widgetsDirectory) {
      cachedUri = null;
      return undefined;
    }

    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    const { File, Directory } =
      require('expo-file-system') as typeof import('expo-file-system');

    const destination = new File(new Directory(widgetsDirectory), MASCOT_FILE_NAME);
    if (!destination.exists) {
      const asset = Asset.fromModule(require('../assets/mascot/edutu-guide.png'));
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
