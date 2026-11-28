import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Run only against a freshly started run-simulator-pilot.sh.
const port = Number(process.env.AUTO_APPLY_TEST_API_PORT || 8093);
const base = `http://127.0.0.1:${port}`;
const api = async (path, method = 'GET', payload, expectedStatus = 200) => {
  const response = await fetch(base + path, {
    method,
    ...(payload !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== expectedStatus) {
    assert.fail(`${method} ${path} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
};

async function waitFor(path, predicate, { allowUnconfirmed = false } = {}) {
  const deadline = Date.now() + 65_000;
  let result;
  while (Date.now() < deadline) {
    result = await api(path);
    if (predicate(result)) return result;
    assert(!['failed', 'cancelled'].includes(result.state) &&
      (allowUnconfirmed || result.state !== 'unconfirmed'), JSON.stringify(result));
    await delay(750);
  }
  assert.fail(`Timed out waiting for ${path}: ${JSON.stringify(result)}`);
}

const profile = await api('/me/auto-apply/profile?includeSavedDetails=true');
assert.equal(profile.version, 0, 'Start with a fresh simulator database');
assert.equal(profile.education.major, 'Engineering', 'Expected the synthetic learner fixture');
const checkPhoneReuse = process.argv.includes('--remember-phone');
const quotaCheck = process.argv.includes('--quota');
const checkMultipleChoices = process.argv.includes('--multiple-choices');
const checkCheckboxes = process.argv.includes('--checkboxes');
const checkStatementPrompts = process.argv.includes('--statement-prompts');
const longName = '🙂'.repeat(41);
await api('/me/auto-apply/profile', 'PUT', {
  version: profile.version,
  background: profile.suggestedExperience,
  statement: '',
  contact: checkPhoneReuse ? { ...profile.contact, phone: '' } : quotaCheck ? profile.contact : { ...profile.contact, name: longName, phone: '+1 202 555 0100' },
  education: profile.education,
});

const fixtures = [
  { name: 'ITU', id: 'bd049dfb-a668-49ba-a6a7-6e3b2b0eff51',
    receipt: new RegExp('^SIMULATOR-ITU-PHYSICS-BLANK-' +
      (checkCheckboxes ? 'DECLARED-NO-UPDATES-' : '') +
      (checkMultipleChoices ? 'ACCESS-INCLUSION-NO-CHANNELS-' : '') + (checkStatementPrompts ? 'DISTINCT-STATEMENTS-' : '')) },
  { name: 'Mastercard', id: 'c4d25057-893f-499c-8ffa-e6487bc3050f', receipt: /^SIMULATOR-CV-/,
    attachment: { flag: 'cvRequested', route: '/cv', cvId: '0f04871a-5e0b-4284-8f7d-b72958e70c82' } },
  { name: 'Chevron', id: '28758c31-ee93-4516-acf8-81528ba75bc2', receipt: /^SIMULATOR-PDF-/,
    attachment: { flag: 'attachmentRequired', route: '/attachment', uploadId: '6eb71807-562e-42cf-a45b-c5dcd0136596' } },
];

async function checkQuota() {
  const allowancePath = '/me/auto-apply/allowance';
  const adminUser = '/admin/auto-apply/users/fixture';
  const grantPath = '/fixture/auto-apply/lite-grant';
  async function expectAllowance(limit, used, options) {
    const actual = await api(allowancePath);
    assert.equal(actual.monthlyLimit, limit);
    assert.equal(actual.used, used);
    if (options) assert.deepEqual(actual.upgradeOptions, options);
    const reset = new Date(actual.resetAt);
    assert(reset.getTime() > Date.now());
    assert.equal(reset.getUTCDate(), 1);
    assert.equal(reset.getUTCHours(), 0);
  }

  await expectAllowance(3, 2);
  const starters = await Promise.all(fixtures.map(async fixture => {
    const tracker = await api('/me/applications', 'POST', { opportunityId: fixture.id });
    return '/me/auto-apply/applications/' + tracker.id;
  }));
  const starts = await Promise.allSettled(starters.map(path => api(path, 'POST', {})));
  const winner = starts.findIndex(result => result.status === 'fulfilled');
  assert(winner >= 0, 'One start should succeed');
  const rejected = starters.filter((_, index) => index !== winner);
  for (const [index, result] of starts.entries()) {
    if (index !== winner) {
      assert.equal(result.status, 'rejected');
      // A browser check may already be in flight when the winning request consumes the last run.
      assert.match(result.reason.message, /returned (429.*Monthly Auto Apply limit reached|503.*temporarily unavailable)/);
    }
  }

  const original = await api(starters[winner], 'POST', {});
  assert.equal(original.id, starts[winner].value.id);
  await expectAllowance(3, 3);
  for (const path of rejected) {
    assert.match((await api(path, 'POST', {}, 429)).message, /Monthly Auto Apply limit reached/);
  }

  await api('/admin/auto-apply/plans/lite', 'PUT', { monthlyLimit: 4 });
  await api(grantPath, 'POST', { environment: 'sandbox', expired: false });
  await api(grantPath, 'POST', { environment: 'live', expired: true });
  await expectAllowance(3, 3);
  await api(rejected[0], 'POST', {}, 429);
  await api(grantPath, 'POST', { environment: 'live', expired: false });
  const aboveLite = [{ tier: 'pro', monthlyLimit: 8 }, { tier: 'scholar', monthlyLimit: 12 }];
  await expectAllowance(4, 3, aboveLite);
  await api(rejected[0], 'POST', {});
  await expectAllowance(4, 4);
  await api(rejected[1], 'POST', {}, 429);

  await api(adminUser, 'PUT', { monthlyLimit: 6 });
  await expectAllowance(6, 4, aboveLite);
  await api(rejected[1], 'POST', {});
  await expectAllowance(6, 5);
  await api(adminUser, 'PUT', { monthlyLimit: null });
  await expectAllowance(4, 5, aboveLite);
  console.log('Passed concurrent quota, duplicate starts, simulated plan grants, admin overrides, and UTC reset checks');
}

async function checkSubmitConfig() {
  const { id: opportunityId } = fixtures[0];
  const tracker = await api('/me/applications', 'POST', { opportunityId });
  const availability = '/me/auto-apply/opportunities/' + opportunityId;
  const start = '/me/auto-apply/applications/' + tracker.id;
  const configure = mode => api('/fixture/auto-apply/submit-config', 'PUT', { mode });
  for (const mode of ['missing', 'invalid']) {
    await configure(mode);
    const listing = await api(availability);
    assert.equal(listing.available, false);
    assert.equal(listing.providerUnavailable, true);
    await api(start, 'POST', {}, 503);
    assert.equal((await api('/me/auto-apply/allowance')).used, 0);
  }

  await configure('ready');
  assert.equal((await api(availability)).available, true);
  const { id } = await api(start, 'POST', {});
  await configure('missing');
  assert.equal((await api(start, 'POST', {})).id, id);
  assert.equal((await api(availability)).attempt.id, id);
  const path = '/me/auto-apply/attempts/' + id;
  const question = await waitFor(path, value => value.state === 'needs_input');
  await api(path + '/answer', 'POST', { version: question.version, answer: 'Digital access for students in rural communities' });
  const review = await waitFor(path, value => value.state === 'needs_review');
  assert.equal(review.canSubmit, false);
  assert.equal(review.submissionUnavailable, true);
  assert.match((await api(path + '/approve', 'POST', { version: review.version }, 409)).message, /submission is unavailable/i);
  await configure('ready');
  const restored = await api(path);
  assert.equal(restored.id, id);
  assert.equal(restored.version, review.version);
  assert.deepEqual(restored.review, review.review);
  assert.equal(restored.canSubmit, true);
  assert.equal(restored.submissionUnavailable, false);
  const corrected = await api(path + '/review', 'PUT', { version: restored.version,
    values: restored.review.map(field => field.label === 'Applicant name' ? profile.contact.name : field.value),
  });
  await api(path + '/approve', 'POST', { version: corrected.version });
  assert.match((await waitFor(path, value => value.state === 'submitted')).receipt, /^SIMULATOR-ITU-/);
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  console.log('Incomplete submission configuration used no allowance and the saved attempt finished after restoration.');
}

async function checkFormPreflight() {
  const { id: opportunityId } = fixtures[0];
  const tracker = await api('/me/applications', 'POST', { opportunityId });
  const start = '/me/auto-apply/applications/' + tracker.id;
  const availability = '/me/auto-apply/opportunities/' + opportunityId;
  const blocked = await api(availability);
  assert.equal(blocked.available, false);
  assert.equal(blocked.providerUnavailable, true);
  await api(start, 'POST', {}, 503);
  assert.equal((await api('/me/auto-apply/allowance')).used, 0);
  assert.equal((await api(availability)).attempt, null);
  assert.deepEqual(await api('/fixture/auto-apply/form-preflight', 'PUT', { handoff: true }), { posts: 0 });
  const { id } = await api(start, 'POST', {});
  const path = '/me/auto-apply/attempts/' + id;
  let paused = await waitFor(path, value => value.state === 'needs_input');
  if (!paused.handoffRequired) {
    await api(path + '/answer', 'POST', { version: paused.version, answer: 'Digital access for students in rural communities' });
    paused = await waitFor(path, value => value.state === 'needs_input' && value.handoffRequired);
  }
  assert.equal(paused.id, id);
  assert.deepEqual(await api('/fixture/auto-apply/form-preflight', 'PUT', { blocked: true }), { posts: 0 });
  assert.equal((await api(start, 'POST', {})).id, id);
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  assert.deepEqual(await api('/fixture/auto-apply/form-preflight', 'PUT', {}), { posts: 0 });
  await api(path + '/control', 'POST', { action: 'retry', version: paused.version });
  const review = await waitFor(path, value => value.state === 'needs_review');
  const updated = await api(path + '/review', 'PUT', { version: review.version,
    values: review.review.map(field => field.label === 'Applicant name' ? profile.contact.name : field.value) });
  await api(path + '/approve', 'POST', { version: updated.version });
  const submitted = await waitFor(path, value => value.state === 'submitted');
  assert.match(submitted.receipt, /^SIMULATOR-ITU-ENGINEERING-BLANK-/);
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  console.log('Live preflight blocked an unmapped required field before charging and kept a mapped provider handoff available');
}

async function checkManualSubmission() {
  const { id: opportunityId } = fixtures[0];
  const tracker = await api('/me/applications', 'POST', { opportunityId });
  const { id } = await api('/me/auto-apply/applications/' + tracker.id, 'POST', {});
  const path = '/me/auto-apply/attempts/' + id;
  const question = await waitFor(path, value => value.state === 'needs_input');
  assert.equal(question.canRecordManualSubmission, false);
  await api(path + '/manual-submission', 'POST', { version: question.version }, 409);
  await api(path + '/answer', 'POST', { version: question.version, answer: 'Digital access for students in rural communities' });
  const handoff = await waitFor(path, value => value.state === 'needs_input' && value.handoffRequired);
  assert.equal(handoff.canRecordManualSubmission, true);
  await api(path + '/manual-submission', 'POST', { version: question.version }, 409);
  assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 0 });
  assert.deepEqual(await api('/fixture/auto-apply/manual-portal-submission', 'POST'), { posts: 1 });
  const submitted = await api(path + '/manual-submission', 'POST', { version: handoff.version });
  assert.equal(submitted.state, 'submitted');
  assert.equal(submitted.manuallySubmitted, true);
  assert.equal(submitted.receipt, null);
  assert.equal(submitted.canRetry, false);
  assert.deepEqual(await api(path + '/manual-submission', 'POST', { version: handoff.version }), submitted);
  await api(path + '/control', 'POST', { action: 'retry', version: submitted.version }, 409);
  const recorded = (await api('/me/applications')).find(row => row.id === tracker.id);
  assert.equal(recorded.status, 'submitted');
  assert.equal(recorded.metadata.submission_source, 'manual');
  assert.deepEqual(recorded.auto_apply, { id, state: 'submitted' });
  await waitFor('/notifications', items => items.some(item => item.metadata?.applicationId === tracker.id &&
    item.metadata.source === 'application-status' && item.metadata.status === 'submitted' &&
    item.title === 'Submission recorded' && item.metadata.submissionVerified !== true));
  assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 1 });
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  console.log('A learner-recorded submission completed the original attempt and tracker without a second portal write.');
}

async function checkManualReview() {
  const tracker = await api('/me/applications', 'POST', { opportunityId: fixtures[0].id });
  const { id } = await api('/me/auto-apply/applications/' + tracker.id, 'POST', {});
  const path = '/me/auto-apply/attempts/' + id;
  const question = await waitFor(path, value => value.state === 'needs_input');
  await api(path + '/answer', 'POST', { version: question.version, answer: 'Digital access for students in rural communities' });
  const review = await waitFor(path, value => value.state === 'needs_review');
  assert.equal(review.canStartManualSubmission, true);
  await api(path + '/manual-submission', 'POST', { version: review.version }, 409);
  const switchMode = (version, enabled) => api(path + '/manual-review', 'POST', { version, enabled });
  const manual = await switchMode(review.version, true);
  assert.equal(manual.reviewingOnProvider, true);
  assert.equal(manual.canSubmit, false);
  assert.equal(manual.canRecordManualSubmission, true);
  assert.deepEqual(manual.review, review.review);
  await api(path + '/approve', 'POST', { version: review.version }, 409);
  await api(path + '/approve', 'POST', { version: manual.version }, 409);
  await api(path + '/control', 'POST', { version: manual.version, action: 'cancel' }, 409);
  const edutu = await switchMode(manual.version, false);
  assert.equal(edutu.canSubmit, true);
  assert.equal(edutu.canRecordManualSubmission, false);
  assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 0 });
  const resumed = await switchMode(edutu.version, true);
  assert.deepEqual(await api('/fixture/auto-apply/manual-portal-submission', 'POST'), { posts: 1 });
  const recorded = await api(path + '/manual-submission', 'POST', { version: resumed.version });
  assert.equal(recorded.manuallySubmitted, true);
  assert.equal(recorded.receipt, null);
  await api(path + '/approve', 'POST', { version: resumed.version }, 409);
  assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 1 });
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  console.log('Provider-site submission kept the reviewed draft and blocked Edutu approval until the learner switched back.');
}

async function checkTrackerSync() {
  const { id: opportunityId } = fixtures[0];
  const tracker = await api('/me/applications', 'POST', { opportunityId });
  const trackerPath = '/me/applications/' + tracker.id;
  const { id } = await api('/me/auto-apply/applications/' + tracker.id, 'POST', {});
  const path = '/me/auto-apply/attempts/' + id;
  const question = await waitFor(path, value => value.state === 'needs_input');
  await api(path + '/answer', 'POST', { version: question.version, answer: 'Digital access for students in rural communities' });
  const review = await waitFor(path, value => value.state === 'needs_review');
  const updated = await api(path + '/review', 'PUT', { version: review.version,
    values: review.review.map(field => field.label === 'Applicant name' ? profile.contact.name : field.value) });
  await api(path + '/approve', 'POST', { version: updated.version });
  await waitFor('/fixture/auto-apply/portal-posts', value => value.posts === 1);
  assert.equal((await api(path)).state, 'submitting');
  await api(trackerPath, 'PATCH', { status: 'submitted' }, 409);
  assert.equal((await api('/me/applications')).find(row => row.id === tracker.id).status, 'draft');
  await api('/fixture/auto-apply/release-receipt', 'POST');
  const uncertain = await waitFor(path, value => value.state === 'unconfirmed', { allowUnconfirmed: true });
  const recorded = await api(trackerPath, 'PATCH', { status: 'submitted' });
  assert.equal(recorded.metadata.submission_source, 'manual');
  const completed = await api(path);
  assert.equal(completed.state, 'submitted');
  assert.equal(completed.manuallySubmitted, true);
  assert.equal(completed.receipt, null);
  assert.equal(completed.version, uncertain.version + 1);
  await api(trackerPath, 'PATCH', { status: 'submitted' });
  assert.equal((await api(path)).version, completed.version);
  assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 1 });
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  console.log('Tracker updates waited for the in-flight form, recorded confirmed status, and closed Auto Apply without a duplicate write.');
}

async function checkStatementProvenance() {
  const tracker = await api('/me/applications', 'POST', { opportunityId: fixtures[0].id });
  const { id } = await api('/me/auto-apply/applications/' + tracker.id, 'POST', {});
  const path = '/me/auto-apply/attempts/' + id;
  const pending = await waitFor(path, value => value.state === 'needs_input');
  await api(path + '/answer', 'POST', { version: pending.version, answer: 'Digital access for rural learners' });
  const statement = await waitFor(path, value => value.statementRequested && value.statementRetryAvailable);
  const manual = 'My engineering studies shaped my interest in rural digital access.';
  await api(path + '/answer', 'POST', { version: statement.version, answer: manual });
  const review = await waitFor(path, value => value.state === 'needs_review');
  const learnerStatement = review.review.find(field => field.label === 'Statement of purpose');
  const aiStatement = review.review.find(field => field.label === 'Board contribution');
  assert.equal(learnerStatement.value, manual);
  assert.equal(learnerStatement.generatedByAi, undefined);
  assert.equal(aiStatement.generatedByAi, true);
  const aiIndex = review.review.findIndex(field => field.label === 'Board contribution');
  const values = review.review.map(field => field.label === 'Applicant name' ? profile.contact.name : field.value);
  values[aiIndex] = 'I would share lessons from community digital access projects.';
  const edited = await api(path + '/review', 'PUT', { version: review.version, values });
  assert.equal(edited.review[aiIndex].generatedByAi, true);
  assert.equal(edited.review[aiIndex].value, values[aiIndex]);
  values[aiIndex] = aiStatement.value;
  const approved = await api(path + '/review', 'PUT', { version: edited.version, values });
  await api(path + '/approve', 'POST', { version: approved.version });
  assert.match((await waitFor(path, value => value.state === 'submitted')).receipt, /DISTINCT-STATEMENTS/);
  console.log('The same review distinguished learner-written and AI-started statements and reached submission after approval.');
}

async function checkStatementRetry() {
  const tracker = await api('/me/applications', 'POST', { opportunityId: fixtures[0].id });
  const { id } = await api('/me/auto-apply/applications/' + tracker.id, 'POST', {});
  const path = '/me/auto-apply/attempts/' + id;
  const pending = await waitFor(path, value => value.state === 'needs_input');
  await api(path + '/retry-statement', 'POST', { version: pending.version }, 409);
  await api(path + '/answer', 'POST', { version: pending.version, answer: 'Digital access in rural communities' });
  const statement = await waitFor(path, value => value.statementRequested && value.statementRetryAvailable);
  await api(path + '/retry-statement', 'POST', { version: statement.version - 1 }, 409);
  assert.equal((await api(path + '/retry-statement', 'POST', { version: statement.version })).id, id);
  await api(path + '/retry-statement', 'POST', { version: statement.version }, 409);
  const review = await waitFor(path, value => value.state === 'needs_review');
  assert.equal(review.statementRetryAvailable, false);
  assert.match(review.review.find(field => field.label === 'Statement of purpose').value, /engineering/);
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  console.log('The original attempt resumed statement drafting once and reached review without another monthly attempt.');
}

async function checkMultiPageReview(interrupted = false) {
  const tracker = await api('/me/applications', 'POST', { opportunityId: fixtures[0].id });
  const { id } = await api('/me/auto-apply/applications/' + tracker.id, 'POST', {});
  const path = '/me/auto-apply/attempts/' + id;
  const question = await waitFor(path, value => value.state === 'needs_input');
  await api(path + '/answer', 'POST', { version: question.version, answer: 'Digital access in rural communities' });
  const review = await waitFor(path, value => value.state === 'needs_review');
  assert.equal(review.review[0].label, 'Background');
  assert.deepEqual(review.review[0].providerPage, { number: 1, total: 2 });
  assert(review.review.slice(1).every(field => field.providerPage?.number === 2 && field.providerPage?.total === 2));
  const background = 'I led a community study group.';
  const updated = await api(path + '/review', 'PUT', { version: review.version, values: review.review.map(field =>
    field.label === 'Background' ? background : field.label === 'Applicant name' ? profile.contact.name : field.value) });
  assert.deepEqual(updated.review[0].providerPage, review.review[0].providerPage);
  assert.deepEqual(await api('/fixture/auto-apply/page-posts'), { backgrounds: [], finalPosts: 0 });
  await api(path + '/approve', 'POST', { version: updated.version });
  if (interrupted) {
    const partial = await waitFor(path, value => value.state === 'unconfirmed', { allowUnconfirmed: true });
    assert.equal(partial.receipt, null);
    assert.equal(partial.canSubmit, false);
    assert.equal(partial.canRetry, false);
    assert.equal(partial.canCheckReceipt, true);
    await api(path + '/approve', 'POST', { version: partial.version }, 409);
    await api(path + '/control', 'POST', { action: 'retry', version: partial.version }, 409);
    const checked = await api(path + '/check-receipt', 'POST');
    assert.equal(checked.state, 'unconfirmed');
    assert.deepEqual(await api('/fixture/auto-apply/page-posts'), { backgrounds: [background], finalPosts: 0 });
    assert.equal((await api('/me/auto-apply/allowance')).used, 1);
    console.log('An interruption after the first provider POST preserved uncertainty and blocked a duplicate submission.');
    return;
  }
  assert.match((await waitFor(path, value => value.state === 'submitted')).receipt, /^SIMULATOR-ITU-/);
  assert.deepEqual(await api('/fixture/auto-apply/page-posts'), { backgrounds: [background], finalPosts: 1 });
  console.log('The grouped review edited page one and sent both provider pages exactly once after approval.');
}

async function checkNativeValidation() {
  const tracker = await api('/me/applications', 'POST', { opportunityId: fixtures[0].id });
  const { id } = await api('/me/auto-apply/applications/' + tracker.id, 'POST', {});
  const path = '/me/auto-apply/attempts/' + id;
  const question = await waitFor(path, value => value.state === 'needs_input');
  await api(path + '/answer', 'POST', { version: question.version, answer: 'Digital access for students in rural communities' });
  const phone = await waitFor(path, value => value.answerHint);
  assert.equal(phone.activityAction, 'answer_format');
  assert.equal(phone.question, 'What should Edutu enter for Phone number?');
  assert.equal(phone.answerHint, 'Enter + followed by 11 digits, without spaces.');
  await waitFor('/notifications', items => items.some(item => item.metadata?.attemptId === id &&
    item.metadata.attemptVersion === phone.version && item.title === 'Check your answer format' &&
    !item.body.includes(phone.answerHint)));
  await api(path + '/answer', 'POST', { version: phone.version, answer: '+12025550100' });
  let review = await waitFor(path, value => value.state === 'needs_review');
  const phoneIndex = review.review.findIndex(field => field.label === 'Phone number');
  assert.equal(review.review[phoneIndex].value, '+12025550100');
  const values = review.review.map(field => field.label === 'Applicant name' ? profile.contact.name : field.value);
  values[phoneIndex] = '+1 202 555 0100';
  review = await api(path + '/review', 'PUT', { version: review.version, values });
  await api(path + '/approve', 'POST', { version: review.version });
  const flagged = await waitFor(path, value => value.state === 'needs_review' && value.version > review.version);
  assert.equal(flagged.activityAction, 'correction');
  assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 0 });
  assert.equal(flagged.review[phoneIndex].validationHint, phone.answerHint);
  assert.equal(flagged.canSubmit, false);
  await waitFor('/notifications', items => items.some(item => item.metadata?.attemptId === id &&
    item.metadata.attemptVersion === flagged.version && item.metadata.reviewCorrection === true &&
    item.metadata.url === '/auto-apply/' + id && item.title === 'Correct your application' &&
    !item.body.includes('+1 202 555 0100') && !item.body.includes(phone.answerHint)));
  await api(path + '/approve', 'POST', { version: flagged.version }, 422);
  const unchanged = await api(path + '/review', 'PUT', { version: flagged.version, values });
  assert.equal(unchanged.review[phoneIndex].validationHint, phone.answerHint);
  values[phoneIndex] = '+12025550100';
  review = await api(path + '/review', 'PUT', { version: unchanged.version, values });
  await api(path + '/approve', 'POST', { version: review.version });
  await waitFor(path, value => value.state === 'submitted');
  assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 1 });
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  console.log('Native validation caught a saved phone format and an invalid review edit before filling the provider form.');
}

async function checkRememberPhone() {
  const start = async (fixture) => {
    const tracker = await api('/me/applications', 'POST', { opportunityId: fixture.id });
    const { id } = await api('/me/auto-apply/applications/' + tracker.id, 'POST', {});
    return '/me/auto-apply/attempts/' + id;
  };
  const path = await start(fixtures[0]);
  const concurrent = await start(fixtures[2]);
  const first = await waitFor(path, value => value.state === 'needs_input');
  assert.equal(first.savePhoneOffered, false);
  await api(path + '/answer', 'POST', { version: first.version, answer: '+12025550100', rememberPhone: true }, 409);
  await api(path + '/answer', 'POST', { version: first.version, answer: 'Educational access' });
  const phone = await waitFor(path, value => value.savePhoneOffered);
  assert.equal(phone.question, 'What should Edutu enter for Phone number?');
  await api(path + '/answer', 'POST', { version: phone.version, answer: '2025550100', rememberPhone: true }, 422);
  const answer = '+1 (202) 555-0100';
  assert.equal((await api(path + '/answer', 'POST', { version: phone.version, answer, rememberPhone: true })).phoneSaved, true);
  const profilePath = '/me/auto-apply/profile?includeSavedDetails=true';
  const saved = await api(profilePath);
  assert.equal(saved.contact.phone, '+12025550100');
  assert.equal(saved.version, 2);
  const firstReview = await waitFor(path, value => value.state === 'needs_review');
  assert.equal(firstReview.review.find(field => field.label === 'Phone number').value, answer);
  await api(path + '/answer', 'POST', { version: phone.version, answer: '+12025550122', rememberPhone: true }, 409);
  assert.equal((await api(profilePath)).contact.phone, '+12025550100');
  const otherQuestion = await waitFor(concurrent, value => value.state === 'needs_input');
  await api(concurrent + '/answer', 'POST', { version: otherQuestion.version, answer: 'Fourth year' });
  const otherPhone = await waitFor(concurrent, value => value.savePhoneOffered);
  assert.equal((await api(concurrent + '/answer', 'POST', {
    version: otherPhone.version, answer: '+12025550122', rememberPhone: true,
  })).phoneSaved, false);
  assert.equal((await api(profilePath)).contact.phone, '+12025550100');
  const second = await start(fixtures[1]);
  const topic = await waitFor(second, value => value.state === 'needs_input');
  await api(second + '/answer', 'POST', { version: topic.version, answer: 'Engineering' });
  const cv = await waitFor(second, value => value.cvRequested);
  assert.equal(cv.savePhoneOffered, false);
  await api(second + '/cv', 'POST', { version: cv.version, cvId: fixtures[1].attachment.cvId });
  const review = await waitFor(second, value => value.state === 'needs_review');
  assert.equal(review.review.find(field => field.label === 'Phone number').value, '+12025550100');
  await api(second + '/approve', 'POST', { version: review.version });
  assert.match((await waitFor(second, value => value.state === 'submitted')).receipt, /^SIMULATOR-CV-/);
  console.log('Explicit phone sharing preserved the current provider answer and supplied a normalized number to a later opportunity.');
}

async function checkAndroidUpdates() {
  const tracker = await api('/me/applications', 'POST', { opportunityId: fixtures[2].id });
  const { id } = await api('/me/auto-apply/applications/' + tracker.id, 'POST', {});
  const path = '/me/auto-apply/attempts/' + id;
  const activity = { activityId: 'android', platform: 'android' };
  assert.deepEqual(await api(path + '/activity', 'PUT', { ...activity, token: 'ExpoPushToken[android-other]' }), { updated: false });
  assert.deepEqual(await api(path + '/activity', 'PUT', { ...activity, token: 'ExpoPushToken[android-pilot]' }), { updated: true });
  const drain = () => api('/fixture/auto-apply/android-progress', 'POST');
  const question = await waitFor(path, value => value.state === 'needs_input');
  const preference = enabled => api('/fixture/auto-apply/push-preference', 'PUT', { enabled });
  await preference(false);
  assert.deepEqual(await drain(), []);
  await waitFor('/notifications', items => items.some(item => item.metadata?.url === '/auto-apply/' + id &&
    item.metadata.attemptVersion === question.version));
  await preference(true);
  assert.deepEqual(await drain(), [{ source: 'auto-apply-progress', attemptId: id, version: question.version, state: 'needs_input' }]);
  const cancelled = await api(path + '/control', 'POST', { action: 'cancel', version: question.version });
  assert.deepEqual(await drain(), [{ source: 'auto-apply-progress', attemptId: id, version: cancelled.version, state: 'cancelled' }]);
  assert.deepEqual(await drain(), []);
  await api(path + '/control', 'POST', { action: 'retry', version: cancelled.version });
  const resumed = await waitFor(path, value => value.state === 'needs_input' && value.version > cancelled.version);
  assert.deepEqual(await drain(), [{ source: 'auto-apply-progress', attemptId: id, version: resumed.version, state: 'needs_input' }]);
  await api(path + '/answer', 'POST', { version: resumed.version, answer: 'Fourth year' });
  const attachment = await waitFor(path, value => value.attachmentRequired);
  assert.equal(attachment.activityAction, 'pdf');
  assert.deepEqual(await drain(), [{
    source: 'auto-apply-progress', attemptId: id, version: attachment.version, state: 'needs_input', activityAction: 'pdf',
  }]);
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  console.log('Android progress respected the push preference, kept the in-app prompt, and delivered the resumed PDF request without rebinding');
}

async function checkApplications({ testUnconfirmed, removalGuard, rollbackReceipt, manualStatement, catalogLink, securityCheck, expiredSession, changedHandoffForm, boundHandoff, multipleDocuments, liveAiProvider }) {
  const providerPrompt = expiredSession ? 'Sign in on the provider’s website to continue.'
    : 'Complete the security check on the provider’s website.';
  for (const fixture of fixtures) {
    const tracker = await api('/me/applications', 'POST', { opportunityId: fixture.id });
    const startPath = '/me/auto-apply/applications/' + tracker.id;
    if (catalogLink) {
      const opportunityPath = '/me/auto-apply/opportunities/' + fixture.id;
      assert.equal((await api(opportunityPath)).available, true);
      await api('/fixture/auto-apply/catalog-link', 'PATCH', { matches: false });
      const unavailable = await api(opportunityPath);
      assert.equal(unavailable.providerUnavailable, true);
      assert.equal(unavailable.attempt, null);
      await api(startPath, 'POST', {}, 503);
      assert.equal((await api('/me/auto-apply/allowance')).used, 0);
      await api('/fixture/auto-apply/catalog-link', 'PATCH', { matches: true });
      assert.equal((await api(opportunityPath)).available, true);
    }
    const { id } = await api(startPath, 'POST', {});
    const path = '/me/auto-apply/attempts/' + id;
    let pending = await waitFor(path, value => value.state === 'needs_input' && !!value.question);
    await waitFor('/notifications', items => items.some(item => item.metadata?.attemptId === id &&
      item.metadata.attemptVersion === pending.version && item.metadata.url === '/auto-apply/' + id));
    await api(path + '/answer', 'POST', { version: pending.version, answer: 'Digital access for students in rural communities' });
    if (securityCheck && fixture.name === 'ITU') {
      const handoff = await waitFor(path, value => value.state === 'needs_input' && value.handoffRequired);
      assert.equal(handoff.activityAction, 'provider_step');
      assert.equal(handoff.question, providerPrompt);
      if (boundHandoff) {
        assert.equal(handoff.exactHandoff, true);
        assert.match(handoff.handoffUrl, new RegExp('^https://127\\.0\\.0\\.1:\\d+/apply/' + fixture.id + '#documents$'));
        await api('/fixture/auto-apply/catalog-link', 'PATCH', { matches: false });
        const changed = await api(path);
        assert.equal(changed.exactHandoff, false);
        assert.equal(changed.handoffUrl, 'https://provider.example/application?cycle=changed');
        await api('/fixture/auto-apply/catalog-link', 'PATCH', { matches: true });
        console.log('ITU fixture: exact step matched the approved host and fell back after the catalog link changed');
      } else assert.equal(handoff.handoffUrl, 'https://provider.example/application');
      assert.equal(handoff.canRetry, true);
      await waitFor('/notifications', items => items.some(item => item.metadata?.attemptId === id &&
        item.metadata.attemptVersion === handoff.version && item.metadata.url === '/auto-apply/' + id &&
        item.body.includes('needs your attention on the provider’s website.')));
      assert.deepEqual(await api('/fixture/auto-apply/security-check', 'PUT', { enabled: false }), { posts: 0 });
      assert.equal((await api(path + '/control', 'POST', { version: handoff.version, action: 'retry' })).id, id);
      assert.equal((await api('/me/auto-apply/allowance')).used, 1);
      console.log(`ITU fixture: ${expiredSession ? 'expired session' : 'security check'} paused without a portal write, notified the learner, and resumed the same attempt`);
    }
    if (fixture.attachment) {
      const { flag, route, ...selection } = fixture.attachment;
      pending = await waitFor(path, value => value.state === 'needs_input' && value[flag]);
      assert.equal(pending.activityAction, flag === 'cvRequested' ? 'cv' : 'pdf');
      await api(path + route, 'POST', { version: pending.version, ...selection });
      if (multipleDocuments && flag === 'attachmentRequired') {
        pending = await waitFor(path, value => value.state === 'needs_input' && value.attachmentRequired &&
          value.question === 'Choose your academic transcript PDF.');
        await waitFor('/notifications', items => items.some(item => item.metadata?.attemptId === id &&
          item.metadata.attemptVersion === pending.version && item.metadata.url === '/auto-apply/' + id));
        assert(pending.attachmentBytesRemaining < 10 * 1024 * 1024);
        assert.equal(pending.canResetDocuments, true);
        await api(path + route, 'POST', { version: pending.version, uploadId: 'fb36699a-e23f-4977-abaa-f6b8cd967552' }, 413);
        assert.equal((await api(path)).version, pending.version);
        const usage = (await api('/me/auto-apply/allowance')).used;
        await api(path + '/control', 'POST', { version: pending.version, action: 'reset_documents' });
        const first = await waitFor(path, value => value.state === 'needs_input' && value.attachmentRequired &&
          value.question === 'Choose a PDF for Institution letter.');
        assert.equal(first.attachmentBytesRemaining, 10 * 1024 * 1024);
        assert.equal(first.canResetDocuments, false);
        assert.equal((await api('/me/auto-apply/allowance')).used, usage);
        await api(path + route, 'POST', { version: first.version, ...selection });
        pending = await waitFor(path, value => value.state === 'needs_input' && value.attachmentRequired &&
          value.question === 'Choose your academic transcript PDF.');
        await api(path + route, 'POST', { version: pending.version, uploadId: 'e5b514de-18b9-4297-b2a6-61e00676d87e' });
      }
    }
    if (checkCheckboxes && fixture.name === 'ITU') {
      const questions = [
        { prompt: 'Application declaration — The provider asks: I confirm that the information in this application is accurate.',
          choices: ['Check this box'], answer: 'Check this box' },
        { prompt: 'Program updates — The provider asks: Send me occasional updates about this program.',
          choices: ['Check this box', 'Leave unchecked'], answer: 'Leave unchecked' },
      ];
      for (const { prompt, choices, answer } of questions) {
        pending = await waitFor(path, value => value.state === 'needs_input' && value.question === prompt);
        assert.deepEqual(pending.choices, choices);
        await waitFor('/notifications', items => items.some(item => item.metadata?.attemptId === id &&
          item.metadata.attemptVersion === pending.version && item.metadata.url === '/auto-apply/' + id));
        assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 0 });
        await api(path + '/answer', 'POST', { version: pending.version, answer: 'yes' }, 422);
        await api(path + '/answer', 'POST', { version: pending.version, answer });
      }
    }
    if (checkMultipleChoices && fixture.name === 'ITU') {
      pending = await waitFor(path, value => value.selectionMode === 'multiple_required');
      assert.deepEqual(pending.choices, ['Digital access', 'Digital skills', 'Inclusion']);
      await waitFor('/notifications', items => items.some(item => item.metadata?.attemptId === id &&
        item.metadata.attemptVersion === pending.version && item.metadata.url === '/auto-apply/' + id));
      assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 0 });
      for (const answer of ['Digital access', '[]', '["Digital access","Digital access"]', '["Unavailable topic"]', '[1]']) {
        await api(path + '/answer', 'POST', { version: pending.version, answer }, 422);
      }
      await api(path + '/answer', 'POST', { version: pending.version, answer: '["Digital skills","Digital access"]' });
      pending = await waitFor(path, value => value.selectionMode === 'multiple_optional');
      assert.deepEqual(pending.choices, ['Email', 'Phone']);
      await api(path + '/answer', 'POST', { version: pending.version, answer: '[]' });
    }
    if (manualStatement) {
      pending = await waitFor(path, value => value.state === 'needs_input' && value.statementRequested);
      await waitFor('/notifications', items => items.some(item =>
        item.metadata?.attemptId === id && item.metadata.attemptVersion === pending.version &&
        item.metadata.url === '/auto-apply/' + id && item.title === 'Statement of purpose needed' &&
        item.body.includes('needs your statement of purpose to continue.')));
      if (fixture.name === 'ITU') {
        assert.equal(pending.answerMaxLength, 180);
        const rejected = await api(path + '/answer', 'POST', {
          version: pending.version, answer: '🙂'.repeat(91),
        }, 422);
        assert.match(rejected.message, /180 characters/);
        const unchanged = await api(path);
        assert.equal(unchanged.version, pending.version);
      }
      await api(path + '/answer', 'POST', {
        version: pending.version, answer: 'My engineering studies support my interest in rural digital access.',
      });
    }
    let review = await waitFor(path, value => value.state === 'needs_review' || (liveAiProvider && value.statementRequested));
    assert.equal(review.state, 'needs_review', 'The AI provider should prepare a draft on this synthetic fixture');
    const statement = review.review.find(field => field.label === 'Statement of purpose')?.value;
    assert(statement, 'The review must include a statement draft');
    if (checkStatementPrompts && fixture.name === 'ITU') {
      const contribution = review.review.find(field => field.label === 'Board contribution');
      assert.equal(contribution?.maxLength, 135);
      assert.match(contribution?.value, /rural digital access/);
      assert.notEqual(contribution?.value, statement);
      const notices = await api('/notifications');
      assert.equal(notices.some(item => item.metadata?.attemptId === id && item.title === 'Statement of purpose needed'), false);
    }
    if (checkCheckboxes && fixture.name === 'ITU') {
      assert.deepEqual(review.review.filter(field => ['Application declaration', 'Program updates'].includes(field.label)), [
        { label: 'Application declaration', providerLabel: 'I confirm that the information in this application is accurate.',
          value: 'Check this box', choices: ['Check this box'] },
        { label: 'Program updates', providerLabel: 'Send me occasional updates about this program.',
          value: 'Leave unchecked', choices: ['Check this box', 'Leave unchecked'] },
      ]);
    }
    if (checkMultipleChoices && fixture.name === 'ITU') {
      const topics = review.review.findIndex(field => field.label === 'Advice topics');
      const channels = review.review.find(field => field.label === 'Contact channels');
      assert.equal(review.review[topics].value, '["Digital skills","Digital access"]');
      assert.equal(review.review[topics].selectionMode, 'multiple_required');
      assert.equal(channels.value, '[]');
      assert.equal(channels.selectionMode, 'multiple_optional');
    }
    if (liveAiProvider && fixture.name === 'ITU') assert.match(statement, /rural|digital access/i);
    if (!liveAiProvider) assert(statement.includes('engineering'));
    if (fixture.attachment) {
      assert(review.review.some(field => field.attachment?.type === 'pdf'));
      if (multipleDocuments && fixture.attachment.flag === 'attachmentRequired') {
        const fieldIndex = review.review.findIndex(field => field.label === 'Academic transcript');
        assert.equal(review.review[fieldIndex]?.value, 'old-transcript.pdf');
        const answers = review.review.map(field => field.value);
        answers[review.review.findIndex(field => field.label === 'Application question')] = 'I am in my fourth year.';
        review = await api(path + '/review', 'PUT', { version: review.version, values: answers });
        const oldVersion = review.version;
        const otherFields = review.review.filter((_, index) => index !== fieldIndex);
        const allowance = await api('/me/auto-apply/allowance');
        await api(path + '/attachment', 'POST', {
          version: oldVersion, fieldIndex, uploadId: 'fb36699a-e23f-4977-abaa-f6b8cd967552',
        }, 413);
        assert.equal((await api(path)).version, oldVersion);
        await api(path + '/attachment', 'POST', {
          version: oldVersion, fieldIndex, uploadId: 'd5aaba4e-d007-4428-9dd7-abc8fdca27f2',
        });
        await api(path + '/approve', 'POST', { version: oldVersion }, 409);
        review = await api(path);
        assert.equal(review.state, 'needs_review');
        assert.equal(review.version, oldVersion + 1);
        assert.equal((await api('/me/auto-apply/allowance')).used, allowance.used);
        assert.deepEqual(review.review.filter((_, index) => index !== fieldIndex), otherFields);
        assert.deepEqual(review.review.filter(field => field.attachment?.uploadId).map(field => [field.label, field.value, field.attachment.uploadId]), [
          ['Institution letter', 'institution-letter.pdf', fixture.attachment.uploadId],
          ['Academic transcript', 'transcript.pdf', 'd5aaba4e-d007-4428-9dd7-abc8fdca27f2'],
        ]);
      }
    } else {
      assert.equal(review.review.find(field => field.label === 'Statement of purpose')?.maxLength, 180);
      assert.equal(review.review.find(field => field.label === 'Phone number')?.value, '+1 202 555 0100');
      const major = review.review.findIndex(field => field.label === 'Field of study');
      const name = review.review.findIndex(field => field.label === 'Applicant name');
      const note = review.review.findIndex(field => field.label === 'Additional notes');
      assert.equal(review.review[major]?.value, 'Engineering');
      assert.equal(review.review[major]?.providerLabel, undefined);
      assert.equal(review.review[name]?.value, longName);
      assert.equal(review.review[name]?.maxLength, 80);
      assert.deepEqual(review.review[note], { label: 'Additional notes', value: '', optional: true });
      const values = review.review.map(field => field.value);
      values[major] = 'Physics';
      assert.match((await api(path + '/approve', 'POST', { version: review.version }, 422)).message, /character limits/);
      assert.match((await api(path + '/review', 'PUT', { version: review.version, values }, 422)).message, /character limits/);
      values[name] = '';
      assert.match((await api(path + '/review', 'PUT', { version: review.version, values }, 422)).message, /required answers/);
      values[name] = profile.contact.name;
      values[note] = 'Can provide a reference if needed.';
      review = await api(path + '/review', 'PUT', { version: review.version, values });
      assert.equal(review.review[note].value, values[note]);
      values[note] = '';
      review = await api(path + '/review', 'PUT', { version: review.version, values });
      assert.equal(review.review[note].value, '');
      assert.equal(review.review[major].value, 'Physics');
    }
    if (checkMultipleChoices && fixture.name === 'ITU') {
      const topics = review.review.findIndex(field => field.label === 'Advice topics');
      const values = review.review.map(field => field.value);
      values[topics] = '[]';
      assert.match((await api(path + '/review', 'PUT', { version: review.version, values }, 422)).message,
        /available options/);
      values[topics] = '["Inclusion","Digital access"]';
      review = await api(path + '/review', 'PUT', { version: review.version, values });
      assert.equal(review.review[topics].value, values[topics]);
    }
    if (catalogLink) {
      await api('/fixture/auto-apply/catalog-link', 'PATCH', { matches: false });
    }
    const checkAfterApproval = securityCheck && fixture.name === 'ITU';
    if (checkAfterApproval && changedHandoffForm) {
      const values = review.review.map(field => field.label === 'Statement of purpose'
        ? 'A previous statement reviewed and edited by the learner.' : field.value);
      review = await api(path + '/review', 'PUT', { version: review.version, values });
    }
    if (checkAfterApproval) {
      assert.deepEqual(await api('/fixture/auto-apply/security-check', 'PUT', { enabled: true }), { posts: 0 });
    }
    await api(path + '/approve', 'POST', { version: review.version });
    if (checkAfterApproval) {
      let paused = await waitFor(path, value => value.state === 'needs_input' && value.handoffRequired);
      assert.equal(paused.canSubmit, false);
      assert.equal(paused.canRetry, true);
      assert.equal(paused.review, null);
      assert.equal(paused.question, providerPrompt);
      if (boundHandoff) {
        assert.equal(paused.exactHandoff, true);
        assert.match(paused.handoffUrl, new RegExp('#documents$'));
      }
      await waitFor('/notifications', items => items.some(item => item.metadata?.attemptId === id &&
        item.metadata.attemptVersion === paused.version && item.metadata.url === '/auto-apply/' + id &&
        item.body.includes('needs your attention on the provider’s website.')));
      if (!changedHandoffForm) {
        const beforeRecheck = paused.version;
        await api(path + '/control', 'POST', { action: 'retry', version: beforeRecheck });
        paused = await waitFor(path, value => value.state === 'needs_input' && value.handoffRequired && value.version > beforeRecheck);
        assert.equal(paused.review, null);
      }
      assert.deepEqual(await api('/fixture/auto-apply/security-check', 'PUT', { enabled: false, changeForm: changedHandoffForm }), { posts: 0 });
      await api(path + '/control', 'POST', { action: 'retry', version: paused.version });
      const fresh = await waitFor(path, value => value.state === 'needs_review');
      assert.equal(fresh.id, id);
      await api(path + '/approve', 'POST', { version: review.version }, 409);
      if (changedHandoffForm) {
        assert.equal(fresh.review.find(field => field.label === 'Applicant name').providerLabel, 'Reference name');
        assert.equal(fresh.review.find(field => field.label === 'Field of study').value, 'Engineering');
        assert.equal(fresh.hasPreviousAnswers, true);
        const previous = await api(path + '/previous-answers');
        assert.equal(previous.version, fresh.version);
        assert.equal(previous.answers.find(field => field.label === 'Statement of purpose').value,
          'A previous statement reviewed and edited by the learner.');
        assert.notEqual(fresh.review.find(field => field.label === 'Statement of purpose').value,
          previous.answers.find(field => field.label === 'Statement of purpose').value);
        assert.equal(previous.answers.some(field => ['Field of study', 'Contact email'].includes(field.label)), false);
        const updated = await api(path + '/review', 'PUT', { version: fresh.version,
          values: fresh.review.map(field => field.label === 'Applicant name' ? profile.contact.name : field.value),
        });
        await api(path + '/approve', 'POST', { version: updated.version });
      } else {
        assert.deepEqual(fresh.review, review.review);
        await api(path + '/approve', 'POST', { version: fresh.version });
      }
      console.log('ITU fixture: post-approval pause returned to review and ' +
        (changedHandoffForm ? 'skipped prior edits after the form changed' : 'restored edits on the same form'));
    }
    if (catalogLink) {
      const stopped = await waitFor(path, value => value.state === 'failed' && value.failureReason === 'mapping_changed');
      assert.equal(stopped.canRetry, true);
      assert.equal(stopped.canSubmit, false);
      assert.equal(stopped.hasPreviousAnswers, true);
      const previous = await api(path + '/previous-answers');
      assert.equal(previous.version, stopped.version);
      assert.equal(previous.answers.find(field => field.label === 'Statement of purpose').value, statement);
      assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 0 });
      await api('/fixture/auto-apply/catalog-link', 'PATCH', { matches: true });
      await api(path + '/control', 'POST', { action: 'retry', version: stopped.version });
      const fresh = await waitFor(path, value => value.state === 'needs_review');
      assert.equal(fresh.id, id);
      assert.deepEqual(fresh.review.map(field => field.label), review.review.map(field => field.label));
      const corrected = await api(path + '/review', 'PUT', {
        version: fresh.version, values: review.review.map(field => field.value),
      });
      await api(path + '/approve', 'POST', { version: corrected.version });
      const submitted = await waitFor(path, value => value.state === 'submitted');
      assert.match(submitted.receipt, fixture.receipt);
      assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 1 });
      assert.equal((await api('/me/auto-apply/allowance')).used, 1);
      console.log('ITU: stale link used no allowance before start, sent no portal writes after approval, and recovered with the original attempt');
      return;
    }
    if (testUnconfirmed) {
      const trackerPath = '/me/applications/' + tracker.id;
      if (removalGuard) {
        try {
          await waitFor('/fixture/auto-apply/portal-posts', value => value.posts === 1);
          const conflict = await api(trackerPath + '?discardUnconfirmed=true', 'DELETE', undefined, 409);
          assert.match(conflict.message, /Auto Apply is submitting/);
          assert.equal((await api(path)).state, 'submitting');
        } finally {
          await api('/fixture/auto-apply/release-receipt', 'POST', {});
        }
      }
      const uncertain = await waitFor(path, value => value.state === 'unconfirmed');
      assert.equal(uncertain.handoffUrl, 'https://provider.example/application');
      assert.equal(uncertain.canRetry, false);
      assert.equal(uncertain.canSubmit, false);
      const checked = await api(path + '/check-receipt', 'POST', {});
      assert.equal(checked.state, 'unconfirmed');
      await api(path + '/control', 'POST', { version: uncertain.version, action: 'retry' }, 409);
      assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 1 });
      if (rollbackReceipt) {
        await api('/fixture/auto-apply/disable-pilot', 'POST', {});
        const next = await api('/me/applications', 'POST', { opportunityId: fixtures[1].id });
        await api('/me/auto-apply/applications/' + next.id, 'POST', {}, 409);
        const paused = await api(path + '/check-receipt', 'POST', {});
        assert.equal(paused.state, 'unconfirmed');
        assert.equal(paused.canCheckReceipt, true);
        await api('/fixture/auto-apply/late-receipt', 'POST', { id });
        const recovered = await waitFor(path, value => value.state === 'submitted', { allowUnconfirmed: true });
        assert.equal(recovered.receipt, 'SIMULATOR-LATE-RECEIPT');
        assert.equal(recovered.canCheckReceipt, false);
        const confirmed = await waitFor('/notifications', items => items.some(item =>
          item.title === 'Application receipt confirmed' && item.metadata?.submissionVerified === true &&
          item.metadata.attemptId === id && item.metadata.attemptVersion === recovered.version));
        const notices = confirmed.filter(item => item.metadata?.applicationId === tracker.id && item.metadata?.status === 'submitted');
        assert.equal(notices.length, 1);
        assert.equal(notices[0].metadata.url, '/auto-apply/' + id);
        assert.match(notices[0].body, /ITU/);
        assert(!JSON.stringify(notices[0]).includes(recovered.receipt));
        assert.equal((await api('/me/auto-apply/allowance')).used, 1);
        assert.deepEqual(await api('/fixture/auto-apply/portal-posts'), { posts: 1 });
        console.log('ITU: disabled pilot rejected new starts and recovered the original receipt without sending twice');
        return;
      }
      if (removalGuard) {
        const conflict = await api(trackerPath, 'DELETE', undefined, 409);
        assert.equal(conflict.code, 'auto_apply_unconfirmed');
        assert.equal((await api(path)).state, 'unconfirmed');
        assert.deepEqual(await api(trackerPath + '?discardUnconfirmed=true', 'DELETE'), { success: true });
        await api(path, 'GET', undefined, 404);
        assert.equal((await api('/me/auto-apply/allowance')).used, 1);
        console.log('ITU: in-flight removal blocked, receipt checks preserved until explicit removal, usage retained');
      }
      console.log('ITU: accepted without a receipt, provider link available, only one portal submission');
      return;
    }
    const submitted = await waitFor(path, value => value.state === 'submitted');
    assert.match(submitted.receipt, checkAfterApproval && changedHandoffForm ? /^SIMULATOR-ITU-ENGINEERING-BLANK-/ : fixture.receipt);
    if (checkAfterApproval && changedHandoffForm) {
      assert.equal(submitted.hasPreviousAnswers, false);
      await api(path + '/previous-answers', 'GET', undefined, 404);
    }
    console.log(`${fixture.name}: application reviewed and synthetic receipt recorded`);
  }

  const allowance = await api('/me/auto-apply/allowance');
  assert.equal(allowance.used, 3);
  assert.equal(allowance.monthlyLimit, 3);
  if (liveAiProvider) {
    const calls = await waitFor('/fixture/auto-apply/ai-usage', items => items.length >= fixtures.length);
    assert.deepEqual(calls, fixtures.map(() => ({ provider: liveAiProvider, status: 'success', sampled: false })));
    console.log(`${liveAiProvider} generated three statements through Edutu without sampling learner content`);
  }
  console.log('Three confirmed applications used the three monthly free attempts');
}

async function checkSelectedCv() {
  const liveAiProvider = process.env.AUTO_APPLY_TEST_AI_PROVIDER;
  const opportunityId = fixtures[1].id;
  assert.equal((await api('/me/auto-apply/opportunities/' + opportunityId)).available, true);
  const cvs = await api('/me/auto-apply/cvs');
  assert.equal(cvs.length, 2);
  const selected = cvs.find(cv => cv.name === 'Synthetic Research CV');
  assert(selected);
  const tracker = await api('/me/applications', 'POST', { opportunityId });
  const attempt = await api('/me/auto-apply/applications/' + tracker.id, 'POST', { cvId: selected.id });
  const path = '/me/auto-apply/attempts/' + attempt.id;
  const question = await waitFor(path, value => value.state === 'needs_input');
  assert.match(question.question, /study/i);
  await waitFor('/notifications', items => items.some(item => item.metadata?.url === '/auto-apply/' + attempt.id &&
    item.body?.includes('needs your intended field of study to continue.')));
  await api(path + '/answer', 'POST', { version: question.version, answer: 'Physics' });
  const review = await waitFor(path, value => value.state === 'needs_review' || (liveAiProvider && value.statementRequested));
  if (liveAiProvider) {
    assert.equal(review.state, 'needs_review', 'The live AI provider did not produce a usable statement.');
    const draft = review.review.find(field => field.label === 'Statement of purpose');
    assert.equal(draft?.generatedByAi, true);
    assert(draft.value.trim());
    const usage = await api('/fixture/auto-apply/ai-usage');
    assert.deepEqual(usage, [{ provider: liveAiProvider, status: 'success', sampled: false }]);
    console.log(`${liveAiProvider} drafted a statement for the fictional learner through Edutu.`);
  }
  const file = review.review.find(field => field.attachment?.sourceName === selected.name);
  assert.match(file?.value ?? '', /optics/i);
  const preview = await api(path + '/cv-preview', 'POST', { version: review.version, fieldIndex: review.review.indexOf(file) });
  assert.equal(Buffer.from(preview.pdf, 'base64').subarray(0, 5).toString(), '%PDF-');
  assert.equal(review.receipt, null);
  assert(review.destinationHost);
  const statement = 'I studied optics during my research placement.';
  const values = review.review.map(field => field.label === 'Statement of purpose' ? statement : field.value);
  const edited = await api(path + '/review', 'PUT', { version: review.version, values });
  assert(edited.version > review.version);
  await api(path + '/approve', 'POST', { version: review.version }, 409);
  assert.deepEqual(await api('/fixture/auto-apply/cv-submissions'), []);
  await api(path + '/approve', 'POST', { version: edited.version });
  const completed = await waitFor(path, value => value.state === 'submitted');
  assert.match(completed.receipt, fixtures[1].receipt);
  assert.equal(completed.manuallySubmitted, false);
  assert.deepEqual(await api('/fixture/auto-apply/cv-submissions'), [{ answer: 'Physics', statement, filename: 'edutu-cv.pdf' }]);
  assert.equal((await api('/me/auto-apply/allowance')).used, 1);
  console.log(`Selected ${selected.name} from two CVs, answered the notification, reviewed and edited the draft, rejected stale approval, approved once, and received ${completed.receipt}.`);
}

if (process.argv.includes('--selected-cv')) await checkSelectedCv();
else if (quotaCheck) await checkQuota();
else if (process.argv.includes('--submit-config')) await checkSubmitConfig();
else if (checkPhoneReuse) await checkRememberPhone();
else if (process.argv.includes('--android-updates')) await checkAndroidUpdates();
else if (process.argv.includes('--form-preflight')) await checkFormPreflight();
else if (process.argv.includes('--manual-submission')) await checkManualSubmission();
else if (process.argv.includes('--manual-review')) await checkManualReview();
else if (process.argv.includes('--tracker-sync')) await checkTrackerSync();
else if (process.argv.includes('--statement-provenance')) await checkStatementProvenance();
else if (process.argv.includes('--statement-retry')) await checkStatementRetry();
else if (process.argv.includes('--multi-page')) await checkMultiPageReview();
else if (process.argv.includes('--multi-page-interruption')) await checkMultiPageReview(true);
else if (process.argv.includes('--native-validation')) await checkNativeValidation();
else await checkApplications({
  testUnconfirmed: process.argv.some(arg => ['--unconfirmed', '--remove-guard', '--rollback-receipt'].includes(arg)),
  removalGuard: process.argv.includes('--remove-guard'),
  rollbackReceipt: process.argv.includes('--rollback-receipt'),
  manualStatement: process.argv.includes('--manual-statement'),
  catalogLink: process.argv.includes('--catalog-link'),
  securityCheck: ['--security-check', '--changed-handoff-form', '--bound-handoff', '--expired-session'].some(arg => process.argv.includes(arg)),
  expiredSession: process.argv.includes('--expired-session'),
  boundHandoff: process.argv.includes('--bound-handoff'),
  multipleDocuments: process.argv.includes('--multiple-documents'),
  changedHandoffForm: process.argv.includes('--changed-handoff-form'),
  liveAiProvider: process.env.AUTO_APPLY_TEST_AI_PROVIDER,
});
