/**
 * Environment Configuration
 * Validates required environment variables at runtime
 */

import * as ExpoConstants from 'expo-constants';

export interface AppConfig {
  clerkPublishableKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBaseUrl: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isDev: boolean;
}

class EnvironmentError extends Error {
  constructor(variable: string) {
    super(`Missing required environment variable: ${variable}`);
    this.name = 'EnvironmentError';
  }
}

const Constants = (ExpoConstants.default ?? ExpoConstants) as {
  expoConfig?: { extra?: Record<string, unknown> };
  manifest?: { extra?: Record<string, unknown> };
  manifest2?: { extra?: { expoClient?: { extra?: Record<string, unknown> } } };
};

const EXTRA_ENV_MAP: Record<string, string> = {
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'clerkPublishableKey',
  EXPO_PUBLIC_SUPABASE_URL: 'supabaseUrl',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'supabaseAnonKey',
  EXPO_PUBLIC_API_URL: 'apiBaseUrl',
};

function getRuntimeEnv(variable: string): string | undefined {
  const processValue = process.env[variable];
  if (processValue) return processValue;

  const extraKey = EXTRA_ENV_MAP[variable];
  const extra =
    Constants.expoConfig?.extra ??
    Constants.manifest2?.extra?.expoClient?.extra ??
    Constants.manifest?.extra ??
    {};
  const extraValue = extraKey ? extra[extraKey] : undefined;
  return typeof extraValue === 'string' && extraValue.trim() ? extraValue : undefined;
}

function getRequiredEnv(variable: string): string {
  const value = getRuntimeEnv(variable);
  if (!value) {
    throw new EnvironmentError(variable);
  }
  return value;
}

function getOptionalEnv(variable: string, fallback: string = ''): string {
  return getRuntimeEnv(variable) || fallback;
}

export function validateEnvironment(): AppConfig {
  const isDevelopment = typeof __DEV__ === 'undefined'
    ? process.env.NODE_ENV !== 'production'
    : __DEV__;
  const isProduction = !isDevelopment;

  try {
    const clerkPublishableKey = getRequiredEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
    const supabaseUrl = getRequiredEnv('EXPO_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = getRequiredEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    const apiBaseUrl = isProduction
      ? getRequiredEnv('EXPO_PUBLIC_API_URL')
      : getOptionalEnv('EXPO_PUBLIC_API_URL', 'https://edutu-platform.onrender.com');

    return {
      clerkPublishableKey,
      supabaseUrl,
      supabaseAnonKey,
      apiBaseUrl,
      isProduction,
      isDevelopment,
      isDev: isDevelopment,
    };
  } catch (error) {
    if (error instanceof EnvironmentError) {
      console.error(`[ENV] ${error.message}`);
    }
    throw error;
  }
}

export function getConfig(): AppConfig {
  return validateEnvironment();
}

export const config = new Proxy({} as AppConfig, {
  get(_target, property: keyof AppConfig) {
    return getConfig()[property];
  },
});

export default config;
