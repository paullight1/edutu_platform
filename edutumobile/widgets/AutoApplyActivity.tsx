import type { LiveActivityFactory } from 'expo-widgets';

export type AutoApplyActivityProps = {
  status: string;
  actionRequired: boolean;
  title?: string;
};

export function getAutoApplyActivityFactory(): LiveActivityFactory<AutoApplyActivityProps> | null {
  return null;
}
