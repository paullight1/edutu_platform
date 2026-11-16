import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Identifiers must not contain ':' or '-' — expo-notifications treats those as
// internal delimiters and the category fails to register.
export const OPPORTUNITY_CATEGORY = 'edutuOpportunity';

export const ACTION_SAVE = 'saveOpportunity';
export const ACTION_ASK = 'askEdutu';
export const ACTION_DISMISS = 'notInterested';

// Android is the only platform where expo-notifications runs our JS for an
// action tap while the app is backgrounded or killed — see the registerTaskAsync
// docs: "Only on Android, the task also runs in response to a notification
// action tap when the app is backgrounded or terminated."
//
// So iOS actions must open the app. The alternative (opensAppToForeground:false)
// is documented to silently do nothing once the app is killed, which is worse
// than an honest app launch: the user taps, and nothing happens, forever.
export const HANDLES_ACTIONS_INLINE = Platform.OS === 'android';

// The push payload sets categoryId to this; the buttons only appear if the
// category was registered on the device *before* the notification arrives.
export async function registerNotificationCategoriesAsync(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.setNotificationCategoryAsync(OPPORTUNITY_CATEGORY, [
      {
        identifier: ACTION_SAVE,
        buttonTitle: 'Save',
        options: { opensAppToForeground: !HANDLES_ACTIONS_INLINE },
      },
      {
        identifier: ACTION_ASK,
        buttonTitle: 'Ask Edutu',
        textInput: {
          submitButtonTitle: 'Ask',
          placeholder: 'Am I eligible for this?',
        },
        options: { opensAppToForeground: !HANDLES_ACTIONS_INLINE },
      },
      {
        identifier: ACTION_DISMISS,
        buttonTitle: 'Not interested',
        // Never worth a cold app launch. On iOS this means a tap while the app
        // is killed records nothing — the notification still dismisses, we just
        // lose the signal. Accepted: the tap is cheap and advisory.
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]);
  } catch (error) {
    // A failed category registration must not break push-token sync: without it
    // the user still gets notifications, just without the action buttons.
    if (__DEV__) {
      console.warn('Failed to register notification categories', error);
    }
  }
}
