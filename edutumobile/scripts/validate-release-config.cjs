// Fail before uploading a store build if it would reconnect users to a retired server.
function validateReleaseConfig(env) {
  if (!['production', 'production-apk'].includes(env.EAS_BUILD_PROFILE)) return;
  for (const [name, expected] of [
    ['EXPO_PUBLIC_API_URL', 'https://backend.edutu.org'],
    ['EXPO_PUBLIC_SUPABASE_URL', 'https://supabase.edutu.org'],
  ]) {
    if (env[name]?.replace(/\/$/, '') !== expected) {
      throw new Error(`${name} must point to ${expected} for an Edutu production build`);
    }
  }
  if (!env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_')) {
    throw new Error('Edutu production builds require the existing live Clerk publishable key');
  }
}

module.exports = validateReleaseConfig;
