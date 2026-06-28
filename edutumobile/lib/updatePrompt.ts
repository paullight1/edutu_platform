import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as Updates from 'expo-updates';

type UpdateButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
};

type AlertFn = (title: string, message?: string, buttons?: UpdateButton[]) => void;

type UpdatesModule = {
  isEnabled: boolean;
  checkForUpdateAsync: typeof Updates.checkForUpdateAsync;
  fetchUpdateAsync: typeof Updates.fetchUpdateAsync;
  reloadAsync: typeof Updates.reloadAsync;
};

type CheckForUpdateOptions = {
  updates?: UpdatesModule;
  alert?: AlertFn;
  isDev?: boolean;
  platformOS?: string;
};

export type UpdatePromptResult = 'skipped' | 'no-update' | 'prompted' | 'error';

const isDevelopment = () => typeof __DEV__ !== 'undefined' && __DEV__;

export async function checkForUpdateWithPrompt({
  updates = Updates,
  alert = Alert.alert,
  isDev = isDevelopment(),
  platformOS = Platform.OS,
}: CheckForUpdateOptions = {}): Promise<UpdatePromptResult> {
  if (isDev || platformOS === 'web' || !updates.isEnabled) {
    return 'skipped';
  }

  try {
    const update = await updates.checkForUpdateAsync();

    if (!update.isAvailable) {
      return 'no-update';
    }

    alert('Update available', 'A newer version of Edutu is ready to download.', [
      { text: 'Later', style: 'cancel' },
      {
        text: 'Update',
        onPress: async () => {
          try {
            const fetchedUpdate = await updates.fetchUpdateAsync();

            if (!fetchedUpdate.isNew && !fetchedUpdate.isRollBackToEmbedded) {
              return;
            }

            alert('Update ready', 'Restart Edutu to apply the latest update.', [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Restart',
                onPress: () => {
                  void updates.reloadAsync();
                },
              },
            ]);
          } catch (error) {
            console.warn('Unable to download update', error);
          }
        },
      },
    ]);

    return 'prompted';
  } catch (error) {
    console.warn('Unable to check for update', error);
    return 'error';
  }
}

export function useInAppUpdatePrompt() {
  const hasCheckedForUpdate = useRef(false);

  useEffect(() => {
    if (hasCheckedForUpdate.current) {
      return;
    }

    hasCheckedForUpdate.current = true;
    void checkForUpdateWithPrompt();
  }, []);
}
