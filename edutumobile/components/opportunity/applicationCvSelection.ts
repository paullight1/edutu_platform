import AsyncStorage from '@react-native-async-storage/async-storage';

export type SelectedApplicationCv = { id: string; name: string };
type SelectionListener = (value: SelectedApplicationCv | null) => void;
const listeners = new Map<string, Set<SelectionListener>>();

export function applicationCvKey(userId: string, opportunityId: string) {
  return 'application-cv:' + JSON.stringify([userId, opportunityId]);
}

export async function saveApplicationCvSelection(key: string, cv: SelectedApplicationCv | null) {
  if (cv) await AsyncStorage.setItem(key, cv.id);
  else await AsyncStorage.removeItem(key);
  listeners.get(key)?.forEach(listener => listener(cv));
}

export function subscribeToApplicationCv(key: string, listener: SelectionListener) {
  const group = listeners.get(key) ?? new Set<SelectionListener>();
  group.add(listener);
  listeners.set(key, group);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(key);
  };
}
