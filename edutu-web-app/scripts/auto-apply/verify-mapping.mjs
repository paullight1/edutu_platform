import { createHash } from 'node:crypto';

function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Expected an HTTPS URL without credentials.');
  return url;
}

async function verifyLearnerApi(baseUrl, token, id) {
  const base = httpsUrl(baseUrl);
  if (base.search || base.hash) throw new Error('Pass the mobile API base URL without a query or fragment.');
  base.pathname = base.pathname.replace(/\/$/, '') + '/';

  async function read(path) {
    const response = await fetch(new URL('me/auto-apply/' + path, base), {
      headers: { Authorization: 'Bearer ' + token },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    }).catch(() => { throw new Error('Could not reach the learner API over HTTPS.'); });
    if (response.status === 401 || response.status === 403) {
      throw new Error('The learner API rejected the staging learner session.');
    }
    if (response.status === 404) throw new Error(`Learner API route ${path} was not found at the configured base URL.`);
    if (!response.ok) throw new Error(`Learner API ${path} returned HTTP ${response.status}.`);
    return response.json().catch(() => { throw new Error(`Learner API ${path} returned invalid JSON.`); });
  }

  const allowance = await read('allowance');
  if (!Number.isSafeInteger(allowance?.monthlyLimit) || !Number.isSafeInteger(allowance?.used) ||
      allowance.monthlyLimit < 0 || allowance.used < 0 ||
      typeof allowance.resetAt !== 'string' || !Number.isFinite(Date.parse(allowance.resetAt))) {
    throw new Error('The learner API returned an invalid allowance.');
  }
  const opportunity = await read('opportunities/' + id);
  if (opportunity?.applicantOnly === true) throw new Error('The provider requires the learner to apply directly.');
  if (opportunity?.providerUnavailable === true) throw new Error('The learner API reports the browser provider is unavailable for this opportunity.');
  if (opportunity?.available !== true) throw new Error('The learner API does not offer Auto Apply for this opportunity.');
  if (opportunity.attempt !== null) throw new Error('Use a staging learner who has no existing attempt for this opportunity.');
  if (allowance.used >= allowance.monthlyLimit) throw new Error('The staging learner has no Auto Apply attempts remaining this month.');
}

async function main() {
  const [id, currentApplicationUrl] = process.argv.slice(2);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id ?? '') || !currentApplicationUrl) {
    throw new Error('Pass the opportunity UUID and its current catalog application URL.');
  }
  const { AUTO_APPLY_PROVIDER_PREPARE_URL, AUTO_APPLY_PROVIDER_TOKEN } = process.env;
  const learnerApiUrl = process.env.AUTO_APPLY_CHECK_API_URL?.trim();
  const learnerToken = process.env.AUTO_APPLY_CHECK_LEARNER_TOKEN?.trim();
  if (Boolean(learnerApiUrl) !== Boolean(learnerToken)) {
    throw new Error('Set both AUTO_APPLY_CHECK_API_URL and AUTO_APPLY_CHECK_LEARNER_TOKEN for the learner API check.');
  }
  if (!AUTO_APPLY_PROVIDER_PREPARE_URL || !AUTO_APPLY_PROVIDER_TOKEN?.trim()) {
    throw new Error('Set AUTO_APPLY_PROVIDER_PREPARE_URL and AUTO_APPLY_PROVIDER_TOKEN in the environment.');
  }
  const adapter = httpsUrl(AUTO_APPLY_PROVIDER_PREPARE_URL);
  const catalog = httpsUrl(currentApplicationUrl);
  catalog.hash = '';
  const fingerprint = createHash('sha256').update(catalog.href).digest('hex');
  const response = await fetch(new URL('/verify/' + id, adapter), {
    headers: { Authorization: 'Bearer ' + AUTO_APPLY_PROVIDER_TOKEN.trim() },
    redirect: 'error', signal: AbortSignal.timeout(30000),
  }).catch(() => { throw new Error('Could not reach the browser adapter over HTTPS.'); });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const knownCodes = ['provider_handoff', 'mapping_changed', 'provider_busy', 'provider_unavailable'];
    const code = knownCodes.includes(result?.code) ? ` ${result.code}` : '';
    const step = Number.isInteger(result?.step) && result.step > 0 && result.step <= 4 ? ` at step ${result.step}` : '';
    throw new Error(`Browser verification returned HTTP ${response.status}${code}${step}.`);
  }
  if (result?.status !== 'verified' || result.opportunityId !== id || !/^[a-f0-9]{64}$/.test(result.mappingRevision) ||
      !Number.isInteger(result.steps) || result.steps < 1 || result.steps > 4 ||
      typeof result.destinationHost !== 'string' || !/^[a-z0-9.:[\]-]{1,260}$/i.test(result.destinationHost)) {
    throw new Error('The adapter returned an invalid verification response.');
  }
  if (result.catalogFingerprint !== fingerprint) throw new Error('The mapping is unbound or its catalog URL has changed.');
  if (learnerApiUrl && learnerToken) await verifyLearnerApi(learnerApiUrl, learnerToken, id);
  console.log(JSON.stringify({ opportunityId: id, destinationHost: result.destinationHost, steps: result.steps,
    mappingRevision: result.mappingRevision, ...(learnerApiUrl ? { learnerApiVerified: true } : {}) }));
}

main().catch(error => {
  // URL parsing and transport errors can include credentials in their details.
  console.error(error instanceof TypeError ? 'Invalid browser adapter or catalog URL.' : error.message);
  process.exitCode = 1;
});
