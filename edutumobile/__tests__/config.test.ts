describe('runtime config validation', () => {
  const envKeys = [
    'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_API_URL',
  ] as const;

  const originalEnv = { ...process.env };

  const restoreEnv = () => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  };

  const loadConfig = (extra: Record<string, unknown> = {}) => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: { extra },
        manifest: { extra },
        manifest2: { extra: { expoClient: { extra } } },
      },
      expoConfig: { extra },
      manifest: { extra },
      manifest2: { extra: { expoClient: { extra } } },
    }));

    return require('../lib/config') as typeof import('../lib/config');
  };

  beforeEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
    jest.resetModules();
  });

  afterEach(() => {
    restoreEnv();
    jest.dontMock('expo-constants');
  });

  it('reads values directly from process env and applies the dev API fallback', () => {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_process';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://process.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'process-anon';

    const { validateEnvironment } = loadConfig();
    const config = validateEnvironment();

    expect(config).toMatchObject({
      clerkPublishableKey: 'pk_test_process',
      supabaseUrl: 'https://process.supabase.co',
      supabaseAnonKey: 'process-anon',
      apiBaseUrl: 'https://edutu-platform.onrender.com',
    });
  });

  it('falls back to Expo constants extras when process env is not populated', () => {
    const { validateEnvironment } = loadConfig({
      clerkPublishableKey: 'pk_test_extra',
      supabaseUrl: 'https://extra.supabase.co',
      supabaseAnonKey: 'extra-anon',
      apiBaseUrl: 'http://localhost:3000',
    });

    const config = validateEnvironment();

    expect(config).toMatchObject({
      clerkPublishableKey: 'pk_test_extra',
      supabaseUrl: 'https://extra.supabase.co',
      supabaseAnonKey: 'extra-anon',
      apiBaseUrl: 'http://localhost:3000',
    });
  });

  it('throws a clear error when required values are missing', () => {
    const { validateEnvironment } = loadConfig();

    expect(() => validateEnvironment()).toThrow('Missing required environment variable: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  });
});
