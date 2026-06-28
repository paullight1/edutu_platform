export interface FeatureFlag {
  id: string;
  key: string;
  label: string;
  description: string;
  is_enabled: boolean;
  pro_required: boolean;
  sort_order: number;
}

export interface UseFeatureFlagsReturn {
  features: FeatureFlag[];
  isLoading: boolean;
  isFeatureEnabled: (key: string) => boolean;
  isProRequired: (key: string) => boolean;
  refresh: () => Promise<void>;
}
