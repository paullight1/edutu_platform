import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Pair with run-simulator-pilot.sh on the same machine. Only the opt-in,
// synthetic loopback fixture exposes the load endpoint and learner header.
const base = `http://127.0.0.1:${Number(process.env.AUTO_APPLY_TEST_API_PORT || 8093)}`;
const opportunityId = 'c4d25057-893f-499c-8ffa-e6487bc3050f';
const cvId = '0f04871a-5e0b-4284-8f7d-b72958e70c82';
const statsPath = '/fixture/auto-apply/load';
const attemptPath = '/me/auto-apply/attempts/';
const deadline = Date.now() + 12 * 60_000;
const statusPollMs = Number(process.env.AUTO_APPLY_TEST_LOAD_POLL_MS || 8000);
assert(Number.isInteger(statusPollMs) && statusPollMs >= 1000 && statusPollMs <= 30_000,
  'Use a status polling interval between 1000 and 30000 milliseconds');
let statusReads = 0;

async function api(path, learner, method = 'GET', body, allowed = [200]) {
  const headers = { ...(learner && { 'x-fixture-learner': String(learner) }) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12_000),
  });
  assert(allowed.includes(response.status), `${method} ${path} returned HTTP ${response.status}`);
  return { status: response.status, data: await response.json() };
}

function timings(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = fraction => ordered[Math.ceil(ordered.length * fraction) - 1];
  return { count: values.length, p50: percentile(0.5), p95: percentile(0.95), max: ordered.at(-1) };
}

const { data: initial } = await api(statsPath);
assert(Number.isInteger(initial.learners) && initial.learners > 0 && initial.learners <= 100);
assert.equal(initial.portalWrites, 0, 'Start a fresh loopback fixture for each load check');
const started = Date.now();
const learners = Array.from({ length: initial.learners }, (_, index) => ({
  index: index + 1, admitAt: started + Math.floor(index / 10) * 6000, phase: 'setup', startRetries: 0, nextStart: 0,
}));

async function advance(learner) {
  const { index } = learner;
  if (learner.phase === 'setup') {
    const { data: profile } = await api('/me/auto-apply/profile?includeSavedDetails=true', index);
    assert.equal(profile.version, 0, 'Use a fresh load cohort');
    await api('/me/auto-apply/profile', index, 'PUT', {
      version: profile.version, background: profile.suggestedExperience, statement: '',
      contact: profile.contact, education: profile.education,
    });
    const { data } = await api('/me/applications', index, 'POST', { opportunityId });
    learner.tracker = data.id;
    learner.phase = 'start';
  }
  if (learner.phase === 'start') {
    if (Date.now() < learner.nextStart) return;
    const { status, data } = await api('/me/auto-apply/applications/' + learner.tracker, index, 'POST', { cvId }, [200, 503]);
    if (status === 503) {
      learner.startRetries += 1;
      learner.nextStart = Date.now() + 750 + (index % 10) * 120;
      return;
    }
    learner.id = data.id;
    learner.admitted = Date.now();
    learner.phase = 'progress';
  }
  if (Date.now() < (learner.nextStatusPoll ?? 0)) return;
  const path = attemptPath + learner.id;
  const { data } = await api(path, index);
  statusReads++;
  learner.nextStatusPoll = Date.now() + statusPollMs;
  if (data.state === 'needs_input') {
    assert.match(data.question, /study/i);
    assert(!learner.answered, 'The fixture repeated an answered question');
    learner.answered = Date.now();
    await api(path + '/answer', index, 'POST', { version: data.version, answer: 'Physics' });
  } else if (data.state === 'needs_review') {
    assert(!learner.approved, 'An approved attempt unexpectedly returned to review');
    assert(data.review.some(field => field.attachment?.sourceName === 'Synthetic CV'));
    await api(path + '/approve', index, 'POST', { version: data.version });
    learner.approved = Date.now();
  } else if (data.state === 'submitted') {
    assert.match(data.receipt, /^SIMULATOR-CV-/);
    assert(learner.approved);
    const { data: allowance } = await api('/me/auto-apply/allowance', index);
    assert.equal(allowance.used, 1);
    learner.receipt = data.receipt;
    learner.completed = Date.now();
    learner.phase = 'submitted';
  } else if (['failed', 'cancelled', 'unconfirmed'].includes(data.state)) {
    learner.phase = data.state;
  }
}

const terminal = ['submitted', 'failed', 'cancelled', 'unconfirmed'];
let stats = initial;
let nextSample = started;
let testError;
try {
  while (Date.now() < deadline && learners.some(learner => !terminal.includes(learner.phase))) {
    const active = learners.filter(learner => learner.admitAt <= Date.now() && !terminal.includes(learner.phase));
    for (let offset = 0; offset < active.length; offset += 10) {
      const results = await Promise.allSettled(active.slice(offset, offset + 10).map(advance));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    }
    if (Date.now() >= nextSample) {
      ({ data: stats } = await api(statsPath));
      console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - started) / 1000),
        admitted: learners.filter(learner => learner.admitted).length, statusPollMs, statusReads, ...stats }));
      nextSample = Date.now() + 15_000;
      assert(stats.browserConnected, 'Chromium disconnected during the synthetic load run');
    }
    await delay(1000);
  }
} catch (error) {
  testError = error;
} finally {
  try { ({ data: stats } = await api(statsPath)); } catch { /* Retain the last recorded sample if the fixture exited. */ }
  console.log(JSON.stringify({
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    statusPollMs,
    statusReads,
    states: learners.reduce((counts, learner) => ({ ...counts, [learner.phase]: (counts[learner.phase] ?? 0) + 1 }), {}),
    startRetries: learners.reduce((sum, learner) => sum + learner.startRetries, 0),
    admissionMs: timings(learners.filter(learner => learner.admitted).map(learner => learner.admitted - learner.admitAt)),
    firstPromptMs: timings(learners.filter(learner => learner.answered).map(learner => learner.answered - learner.admitted)),
    approvalToReceiptMs: timings(learners.filter(learner => learner.completed).map(learner => learner.completed - learner.approved)),
    ...stats,
  }));
}
if (testError) throw testError;
assert.equal(learners.filter(learner => learner.phase === 'submitted').length, initial.learners);
assert.equal(new Set(learners.map(learner => learner.receipt)).size, initial.learners);
assert.equal(stats.portalWrites, initial.learners);
assert.equal(stats.portalApplicants, initial.learners);
assert.equal(stats.duplicateWrites, 0);
