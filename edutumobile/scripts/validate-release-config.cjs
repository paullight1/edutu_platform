const productionApi = 'https://backend.edutu.org';
const productionSupabase = 'https://supabase.edutu.org';

const productionHosts = new Set([
  new URL(productionApi).hostname,
  new URL(productionSupabase).hostname,
]);

function stagingUrl(env, name) {
  let url;
  try {
    url = new URL(env[name]);
  } catch {
    throw new Error(`${name} must be set to an HTTPS staging URL for an Auto Apply staging build`);
  }
  if (url.protocol !== 'https:' || productionHosts.has(url.hostname.replace(/\.$/, '')) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be set to a separate HTTPS staging URL for an Auto Apply staging build`);
  }
}

function validateReleaseConfig(env) {
  const productionBuild = ['production', 'production-apk'].includes(env.EAS_BUILD_PROFILE);
  if (!productionBuild &&
      (env.EDUTU_AUTO_APPLY_STAGING === 'true' ||
       ['auto-apply-staging', 'auto-apply-staging:simulator'].includes(env.EAS_BUILD_PROFILE))) {
    stagingUrl(env, 'EXPO_PUBLIC_API_URL');
    stagingUrl(env, 'EXPO_PUBLIC_SUPABASE_URL');
    if (!env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
      throw new Error('Auto Apply staging builds require a staging Supabase public key');
    }
    if (!env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_')) {
      throw new Error('Auto Apply staging builds require a Clerk test publishable key');
    }
    return;
  }
  if (!productionBuild) return;
  for (const [name, expected] of [
    ['EXPO_PUBLIC_API_URL', productionApi],
    ['EXPO_PUBLIC_SUPABASE_URL', productionSupabase],
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
