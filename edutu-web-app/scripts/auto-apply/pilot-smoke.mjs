import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { createBrowserProvider } from './browser-provider.mjs';

async function address(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

const browser = await chromium.launch({ channel: 'chrome', executablePath: process.env.CHROME_PATH });
const receipts = await mkdtemp(join(tmpdir(), 'edutu-auto-apply-'));
const submitted = [];
const intermediate = [];
let formAction = '/send';
let formEncoding = 'multipart/form-data';
let studyLabel = 'Field of study';
let remoteNoValue = 'no';
let applicantMaxLength = 80;
let applicantAccessibleLabel = 'Applicant full name';
let notesRequired = false;
let submitLabel = 'Send application';
let unexpectedWrites = 0;
let inputEvents = 0;
let driftAfterFirstPost = false;
let handoffAfterFirstPost = false;
let unexplainedConsent = false;
let showHandoff = false;
let handoffStatus = 200;
let portalUnavailable = 0;
let redirectToProviderLogin = false;
let replaySubmittedForm = false;
let blockPortal;
let separatePortalRequests = 0;
let separatePortalUrl;
const multiPage = process.argv.includes('--multi-page');
const observeInputs = `<script>
  document.addEventListener('input', () => {
    const request = new XMLHttpRequest();
    request.open('GET', '/fixture-input-event', false);
    request.send();
  });
</script>`;
const separatePortal = createServer((request, response) => {
  separatePortalRequests++;
  response.end('Provider login');
});
const portal = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'text/html');
  if (portalUnavailable && request.method === 'GET' && request.url === '/apply') {
    response.writeHead(portalUnavailable);
    return response.end('The test portal is temporarily unavailable.');
  }
  if (request.method === 'GET' && blockPortal) await blockPortal();
  if (request.method === 'GET' && request.url === '/fixture-input-event') {
    inputEvents++;
    response.writeHead(204);
    return response.end();
  }
  if (redirectToProviderLogin && request.method === 'GET' && request.url === '/apply') {
    response.writeHead(302, { Location: '/provider-login' });
    return response.end();
  }
  if (request.method === 'GET' && request.url === '/provider-login') {
    response.writeHead(302, { Location: separatePortalUrl });
    return response.end();
  }
  if (request.method === 'GET' && request.url === '/confirmation') {
    return response.end('<output id="receipt">Pilot receipt 001</output>');
  }
  if (request.method === 'POST' && request.url === '/next') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    intermediate.push(new URLSearchParams(Buffer.concat(chunks).toString()).get('background'));
    if (driftAfterFirstPost) formAction = '/changed';
    if (handoffAfterFirstPost) showHandoff = true;
    response.writeHead(303, { Location: '/details' });
    return response.end();
  }
  if (request.method === 'POST' && request.url === '/changed') {
    unexpectedWrites++;
    return response.end('Unexpected destination');
  }
  if (request.method === 'POST' && request.url === '/send') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const form = await new Response(Buffer.concat(chunks), { headers: {
      'Content-Type': request.headers['content-type'],
    } }).formData();
    const file = form.get('cv');
    assert.equal(file.name, 'edutu-cv.pdf');
    assert.equal(file.type, 'application/pdf');
    assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    submitted.push({ name: form.get('name'), background: multiPage ? intermediate.at(-1) : form.get('background'),
      study: form.get('study'), remote: form.get('remote') });
    response.writeHead(replaySubmittedForm ? 307 : 303, { Location: replaySubmittedForm ? '/changed' : '/confirmation' });
    return response.end();
  }
  if (showHandoff && (!multiPage || request.url === '/details')) {
    response.writeHead(handoffStatus);
    return response.end('<p hidden class="provider-gate">Sign in</p><p id="provider-sign-in" class="provider-gate">Continue on the provider site.</p>');
  }
  if (multiPage && request.url === '/apply') {
    return response.end(`<form action="/next" method="post">
      <label>Background <textarea name="background" required></textarea></label>
      <button type="submit">Continue</button>
    </form>${observeInputs}`);
  }
  return response.end(`<form action="${formAction}" method="post" enctype="${formEncoding}">
    <label>Applicant <input name="name" aria-label="${applicantAccessibleLabel}" maxlength="${applicantMaxLength}" required></label>
    <label>Additional notes <textarea name="notes" ${notesRequired ? 'required' : ''}></textarea></label>
    <label>Phone number <input type="tel" name="phone"></label>
    ${multiPage ? '' : '<label>Background <textarea name="background" required></textarea></label>'}
    <label id="study-label">${studyLabel} <select name="study" aria-labelledby="study-label" required>
      <option value="">Choose</option><option value="physics">Physics</option>
      <option value="engineering">Engineering</option><option value="closed" disabled>Closed</option>
    </select></label>
    <fieldset><legend>Remote placement</legend>
      <label><input type="radio" name="remote" value="yes" checked required> Yes</label>
      <label><input type="radio" name="remote" value="${remoteNoValue}"> No</label>
      <label><input type="radio" name="remote" value="unknown" disabled> Unsure</label>
    </fieldset>
    <label>CV <input type="file" name="cv" accept="application/pdf" required></label>
    ${unexplainedConsent ? '<label>Optional declaration <input name="accept" type="checkbox" checked></label>' : ''}
    <button type="submit">${submitLabel}</button>
  </form>${observeInputs}`);
});

let provider;
try {
  const base = await address(portal);
  separatePortalUrl = await address(separatePortal);
  const opportunityId = 'a0000000-0000-4000-8000-000000000001';
  const id = 'a0000000-0000-4000-8000-000000000002';
  const single = {
    url: base + '/apply',
    fields: [
      { label: 'CV attachment', selector: 'input[name="cv"]', source: 'cv_pdf' },
      { label: 'Applicant', selector: 'input[name="name"]', source: 'name' },
      { label: 'Background', selector: 'textarea[name="background"]', source: 'background' },
      { label: 'Field of study', selector: 'select[name="study"]', source: 'answer', control: 'select', question: 'What is your field of study?' },
      { label: 'Remote placement', selector: 'input[type="radio"][name="remote"]', source: 'answer', control: 'radio', question: 'Can you attend remotely?' },
    ],
    submitSelector: 'button[type="submit"]', handoffSelector: '#provider-sign-in',
    handoffPath: '/documents#references', receiptSelector: '#receipt',
  };
  const forms = { [opportunityId]: multiPage ? {
    steps: [
      { url: base + '/apply', submitSelector: single.submitSelector, fields: single.fields.filter(field => field.source === 'background') },
      { url: base + '/details', submitSelector: single.submitSelector, handoffSelector: single.handoffSelector, handoffPath: single.handoffPath, fields: single.fields.filter(field => field.source !== 'background') },
    ],
    receiptSelector: single.receiptSelector,
  } : single };
  const supportingId = 'a0000000-0000-4000-8000-000000000003';
  const supportingFields = (fields) => fields.map(field => field.source === 'cv_pdf'
    ? { ...field, source: 'support_pdf', question: 'Choose your institution letter.' }
    : field);
  forms[supportingId] = multiPage ? {
    ...forms[opportunityId],
    steps: forms[opportunityId].steps.map(step => ({ ...step, fields: supportingFields(step.fields) })),
  } : { ...single, fields: supportingFields(single.fields) };
  const educationId = 'a0000000-0000-4000-8000-000000000005';
  const catalogUrl = 'https://catalog.example/application?cycle=2027';
  const securityHandoff = {
    handoffSelector: '.provider-gate',
    handoffQuestion: 'Complete the security check on the provider’s website.',
  };
  const educationFields = fields => fields.flatMap(field => field.label === 'Field of study'
    ? [{ ...field, source: 'major' }, { label: 'Additional notes', selector: 'textarea[name="notes"]', source: 'answer', optional: true },
      { label: 'Phone number', selector: 'input[name="phone"]', source: 'phone' }]
    : [field]);
  forms[educationId] = multiPage ? {
    ...forms[opportunityId],
    catalogUrl,
    steps: forms[opportunityId].steps.map(step => ({ ...step, ...(step.handoffSelector && securityHandoff), fields: educationFields(step.fields) })),
  } : { ...single, ...securityHandoff, catalogUrl, fields: educationFields(single.fields) };
  const providerOptions = {
    browser, forms, token: 'fixture-only-token', receiptsDirectory: receipts, allowLocalFixture: true,
  };
  for (const handoffPath of ['/documents?session=fixture', '//other.example/documents']) {
    assert.throws(() => createBrowserProvider({
      ...providerOptions, forms: { [opportunityId]: { ...single, handoffPath } },
    }), /approved origin without query parameters/);
  }
  provider = createBrowserProvider(providerOptions);
  let origin = await address(provider);
  const health = () => fetch(origin + '/healthz');
  const capabilityUrl = origin + '/capabilities/' + opportunityId;
  const headers = { Authorization: 'Bearer fixture-only-token' };
  const verify = async (id = opportunityId) => {
    const deadline = Date.now() + 15000;
    do {
      const response = await fetch(origin + '/verify/' + id, { headers, signal: AbortSignal.timeout(30000) });
      const body = await response.json();
      if (body.code !== 'provider_busy') return { status: response.status, body };
      await setTimeout(100);
    } while (Date.now() < deadline);
    throw new Error('Provider remained busy during verification');
  };
  assert.equal((await fetch(origin + '/verify/' + opportunityId)).status, 401);
  assert.equal((await fetch(capabilityUrl)).status, 401);
  const capability = await fetch(capabilityUrl, { headers });
  assert.equal(capability.status, 200);
  assert.deepEqual(await capability.json(), { status: 'ready', opportunityId });
  const unmappedId = 'a0000000-0000-4000-8000-000000000099';
  assert.equal((await fetch(origin + '/capabilities/' + unmappedId, { headers })).status, 404);
  assert.deepEqual(await verify(unmappedId), { status: 404, body: {} });
  const ready = await health();
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ready' });
  await rename(receipts, receipts + '-unmounted');
  try {
    const unavailable = await health();
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { status: 'unavailable' });
    assert.equal((await fetch(capabilityUrl, { headers })).status, 503);
    assert.deepEqual(await verify(), { status: 503, body: { code: 'provider_unavailable' } });
  } finally {
    await rename(receipts + '-unmounted', receipts);
  }
  async function send(path, data, read = response => response.json()) {
    const deadline = Date.now() + 20_000;
    do {
      const response = await fetch(origin + path, {
        method: 'POST',
        headers: { Authorization: 'Bearer fixture-only-token', ...(data.id ? { 'Idempotency-Key': data.id } : {}) },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(65_000),
      });
      if (response.status !== 503) return { status: response.status, body: await read(response) };
      await response.body?.cancel();
      await setTimeout(100);
    } while (Date.now() < deadline);
    throw new Error('Provider remained busy');
  }
  const readReceipt = () => fetch(origin + '/receipt/' + id, {
    headers: { Authorization: 'Bearer fixture-only-token' },
  });
  assert.equal((await readReceipt()).status, 404);
  const job = {
    id, opportunityId, version: 1, background: 'Research assistant', statement: '',
    cv: { name: 'Academic CV', data: {
      header: { full_name: 'Example Learner' },
      education: [{ degree: 'BSc', field: 'Physics', institution: 'Example University' }],
    } }, answers: {},
  };
  const missingCv = await send('/prepare', {
    ...job, cv: null,
  });
  assert.deepEqual(missingCv.body, { state: 'needs_input', question: 'Paste the CV text you want Edutu to attach as a PDF.', cvRequested: true });
  const first = await send('/prepare', job);
  assert.deepEqual(first.body, { state: 'needs_input', question: 'What is your field of study?', choices: ['Physics', 'Engineering'] });
  job.answers['2'] = { question: first.body.question, answer: 'Physics' };
  const radio = await send('/prepare', { ...job, version: 3 });
  assert.deepEqual(radio.body, { state: 'needs_input', question: 'Can you attend remotely?', choices: ['Yes', 'No'] });
  job.answers['3'] = { question: radio.body.question, answer: 'No' };
  const educationJob = {
    ...job, opportunityId: educationId, version: 3,
    answers: { '3': job.answers['3'] }, education: { major: 'Physics' },
    cv: { ...job.cv, data: { ...job.cv.data, header: { ...job.cv.data.header, phone: '+234 800 555 0100' } } },
  };
  assert.deepEqual(await send('/prepare', educationJob), { status: 409, body: { code: 'mapping_changed' } });
  const educationCapability = await fetch(origin + '/capabilities/' + educationId, {
    headers: { Authorization: 'Bearer fixture-only-token' },
  });
  educationJob.catalogFingerprint = createHash('sha256').update(catalogUrl).digest('hex');
  assert.deepEqual(await educationCapability.json(), {
    status: 'ready', opportunityId: educationId, catalogFingerprint: educationJob.catalogFingerprint,
  });
  const prefilled = await send('/prepare', educationJob);
  assert.equal(prefilled.body.state, 'needs_review');
  assert.deepEqual(await verify(educationId), { status: 200, body: {
    status: 'verified', opportunityId: educationId, steps: multiPage ? 2 : 1,
    destinationHost: new URL(base).host, catalogFingerprint: educationJob.catalogFingerprint,
    mappingRevision: prefilled.body.mappingRevision,
  } });
  assert.deepEqual(await send('/submit', {
    id: educationJob.id, version: 4, opportunityId: educationId, catalogFingerprint: '0'.repeat(64),
    fields: prefilled.body.fields.map(({ label, value }) => ({ label, value })),
    mappingRevision: prefilled.body.mappingRevision,
  }), { status: 409, body: { code: 'mapping_changed' } });
  assert.equal(submitted.length, 0);
  assert.equal(prefilled.body.fields.find(field => field.label === 'Applicant').maxLength, 80);
  assert.equal(prefilled.body.fields.find(field => field.label === 'Field of study').value, 'Physics');
  assert.equal(prefilled.body.fields.find(field => field.label === 'Phone number').value, '+234 800 555 0100');
  const profilePhone = await send('/prepare', {
    ...educationJob, contact: { name: '', email: '', phone: '+234 800 555 0101' },
  });
  assert.equal(profilePhone.body.fields.find(field => field.label === 'Phone number').value, '+234 800 555 0101');
  assert.deepEqual((await send('/prepare', { ...educationJob, cv: job.cv })).body,
    { state: 'needs_input', question: 'What should Edutu enter for Phone number?', savePhoneOffered: true });
  assert.deepEqual(prefilled.body.fields.find(field => field.label === 'Additional notes'),
    { label: 'Additional notes', value: '', optional: true, ...(multiPage ? { providerPage: { number: 2, total: 2 } } : {}) });
  notesRequired = true;
  assert.deepEqual(await verify(educationId), { status: 409, body: { code: 'mapping_changed', step: multiPage ? 2 : 1 } });
  assert.deepEqual(await send('/prepare', educationJob), { status: 409, body: { code: 'mapping_changed' } });
  notesRequired = false;
  const unmatched = await send('/prepare', { ...educationJob, education: { major: 'Mathematics' } });
  assert.deepEqual(unmatched.body, first.body);
  for (const status of [429, 503]) {
    portalUnavailable = status;
    assert.deepEqual(await verify(), { status: 502, body: { code: 'provider_unavailable', step: 1 } });
    assert.deepEqual(await send('/prepare', { ...job, version: 3 }), { status: 502, body: {} });
  }
  assert.equal(inputEvents, 0);
  portalUnavailable = 0;
  showHandoff = true;
  assert.deepEqual((await send('/prepare', { ...job, version: 3 })).body, {
    state: 'needs_input', handoffRequired: true, question: 'This provider requires you to continue on its website.',
    handoffUrl: base + '/documents#references',
  });
  const supportingJob = { ...job, opportunityId: supportingId, version: 3 };
  assert.equal((await send('/prepare', supportingJob)).body.handoffRequired, true);
  handoffStatus = 429;
  assert.deepEqual(await verify(educationId), { status: 409, body: {
    code: 'provider_handoff', step: multiPage ? 2 : 1, opportunityId: educationId,
    catalogFingerprint: educationJob.catalogFingerprint,
  } });
  assert.deepEqual(await send('/prepare', educationJob), {
    status: 200, body: {
      state: 'needs_input', handoffRequired: true, question: securityHandoff.handoffQuestion,
      handoffUrl: base + '/documents#references',
      handoffCatalogFingerprint: educationJob.catalogFingerprint,
    },
  });
  assert.deepEqual(await send('/submit', {
    id: educationJob.id, version: 4, opportunityId: educationId, catalogFingerprint: educationJob.catalogFingerprint,
    fields: prefilled.body.fields.map(({ label, value }) => ({ label, value })),
    mappingRevision: prefilled.body.mappingRevision,
  }), { status: 409, body: {
    code: 'provider_handoff', question: securityHandoff.handoffQuestion, handoffUrl: base + '/documents#references',
    handoffCatalogFingerprint: educationJob.catalogFingerprint,
  } });
  assert.equal((await readReceipt()).status, 404);
  assert.equal(inputEvents, 0);
  assert.equal(intermediate.length, 0);
  assert.equal(submitted.length, 0);
  showHandoff = false;
  assert.deepEqual((await send('/prepare', supportingJob)).body, {
    state: 'needs_input', question: 'Choose your institution letter.', attachmentRequired: true,
  });
  formEncoding = 'application/x-www-form-urlencoded';
  assert.deepEqual(await send('/prepare', supportingJob), { status: 409, body: { code: 'mapping_changed' } });
  formEncoding = 'multipart/form-data';
  redirectToProviderLogin = true;
  assert.deepEqual((await send('/prepare', { ...job, version: 3 })).body, {
    state: 'needs_input', handoffRequired: true, question: 'This provider requires you to continue on its website.',
    handoffUrl: base + (multiPage ? '/apply' : '/documents#references'),
  });
  assert.equal(separatePortalRequests, 0);
  redirectToProviderLogin = false;
  const portalEntered = Promise.withResolvers();
  const portalReleased = Promise.withResolvers();
  blockPortal = () => {
    portalEntered.resolve();
    return portalReleased.promise;
  };
  const pendingReview = send('/prepare', { ...job, version: 3 });
  try {
    await Promise.race([
      portalEntered.promise,
      pendingReview.then(() => { throw new Error('Review completed without visiting the portal'); }),
    ]);
    const competing = await fetch(origin + '/submit', {
      method: 'POST', headers: { Authorization: 'Bearer fixture-only-token' },
    });
    assert.equal(competing.status, 503);
    assert.deepEqual(await competing.json(), { code: 'provider_busy' });
    assert.equal(intermediate.length, 0);
    assert.equal(submitted.length, 0);
  } finally {
    blockPortal = undefined;
    portalReleased.resolve();
  }
  const review = await pendingReview;
  assert.equal(review.body.state, 'needs_review');
  const secondPage = multiPage ? { providerPage: { number: 2, total: 2 } } : {};
  assert.deepEqual(review.body.fields.find(field => field.label === 'Background').providerPage,
    multiPage ? { number: 1, total: 2 } : undefined);
  assert.deepEqual(review.body.fields.find(field => field.label === 'CV attachment'), {
    label: 'CV attachment', value: 'Example Learner\n\nEducation\nBSc · Physics · Example University',
    providerLabel: 'CV', ...secondPage,
    attachment: { type: 'pdf', sourceName: 'Academic CV' },
  });
  assert.deepEqual(review.body.fields.find(field => field.label === 'Remote placement'), {
    label: 'Remote placement', value: 'No', choices: ['Yes', 'No'], ...secondPage,
  });
  assert.deepEqual(review.body.fields.find(field => field.label === 'Field of study'), {
    label: 'Field of study', value: 'Physics', choices: ['Physics', 'Engineering'], ...secondPage,
  });
  assert.equal(inputEvents, 0);
  assert.equal(submitted.length, 0);
  assert.equal(intermediate.length, 0);
  assert.equal(review.body.destinationHost, new URL(base).host);
  assert.match(review.body.mappingRevision, /^[a-f0-9]{64}$/);
  assert.equal((await fetch(origin + '/preview-cv', { method: 'POST' })).status, 401);
  const reviewedCv = review.body.fields.find(field => field.label === 'CV attachment');
  const preview = await send('/preview-cv', { value: reviewedCv.value }, async response => {
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return Buffer.from(await response.arrayBuffer());
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.subarray(0, 5).toString(), '%PDF-');
  assert.equal(submitted.length, 0);
  assert.equal(intermediate.length, 0);
  const approved = { id, opportunityId, version: 5, fields: review.body.fields, mappingRevision: review.body.mappingRevision };
  const invalidAnswer = { ...approved, fields: approved.fields.map(field =>
    field.label === 'Remote placement' ? { ...field, value: 'Maybe' } : field) };
  assert.deepEqual(await send('/submit', invalidAnswer), { status: 409, body: { code: 'mapping_changed' } });
  assert.deepEqual(await send('/submit', { ...approved, mappingRevision: '0'.repeat(64) }),
    { status: 409, body: { code: 'mapping_changed' } });
  assert.equal(submitted.length, 0);
  assert.equal(intermediate.length, 0);
  formAction = '/changed';
  assert.deepEqual(await send('/submit', approved), { status: 409, body: { code: 'mapping_changed' } });
  assert.equal(unexpectedWrites, 0);
  assert.equal(intermediate.length, 0);
  assert.equal(submitted.length, 0);
  formAction = '/send';
  studyLabel = 'What do you study now?';
  assert.deepEqual(await send('/submit', approved), { status: 409, body: { code: 'mapping_changed' } });
  assert.equal(intermediate.length, 0);
  const renamedStudy = await send('/prepare', job);
  assert.equal(renamedStudy.body.fields.find(field => field.label === 'Field of study').providerLabel, 'What do you study now?');
  studyLabel = 'Field of study';
  applicantMaxLength = 40;
  assert.deepEqual(await send('/submit', approved), { status: 409, body: { code: 'mapping_changed' } });
  applicantMaxLength = 80;
  const overLimit = { ...approved, fields: approved.fields.map(field =>
    field.label === 'Applicant' ? { ...field, value: '🙂'.repeat(41) } : field) };
  assert.deepEqual(await send('/submit', overLimit), { status: 409, body: { code: 'mapping_changed' } });
  assert.equal(inputEvents, 0);
  applicantAccessibleLabel = 'Emergency contact name';
  assert.deepEqual(await send('/submit', approved), { status: 409, body: { code: 'mapping_changed' } });
  const updatedReview = await send('/prepare', job);
  assert.equal(updatedReview.body.fields.find(field => field.label === 'Applicant').providerLabel, 'Emergency contact name');
  applicantAccessibleLabel = 'Applicant full name';
  submitLabel = 'Withdraw application';
  assert.deepEqual(await send('/submit', approved), { status: 409, body: { code: 'mapping_changed' } });
  submitLabel = 'Send application';
  remoteNoValue = 'not-available';
  assert.deepEqual(await send('/submit', approved), { status: 409, body: { code: 'mapping_changed' } });
  remoteNoValue = 'no';
  unexplainedConsent = true;
  assert.deepEqual(await send('/submit', approved), { status: 409, body: { code: 'mapping_changed' } });
  assert.equal(intermediate.length, 0);
  assert.equal(submitted.length, 0);
  unexplainedConsent = false;
  assert.equal(inputEvents, 0);
  const confirmation = await send('/submit', approved);
  assert.deepEqual(confirmation, { status: 200, body: { receipt: 'Pilot receipt 001' } });
  assert.ok(inputEvents > 0);
  const closed = once(provider, 'close');
  provider.close();
  await closed;
  provider = createBrowserProvider(providerOptions);
  origin = await address(provider);
  assert.equal((await fetch(origin + '/receipt/' + id)).status, 401);
  const recovered = await readReceipt();
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), confirmation.body);
  assert.deepEqual(await send('/submit', approved), confirmation);
  assert.equal((await send('/submit', { ...approved, version: 6 })).status, 409);
  assert.deepEqual(submitted, [{ name: 'Example Learner', background: 'Research assistant', study: 'physics', remote: 'no' }]);
  assert.equal(intermediate.length, multiPage ? 1 : 0);
  if (multiPage) {
    driftAfterFirstPost = true;
    const changedMidFlight = await send('/submit', { ...approved, id: 'a0000000-0000-4000-8000-000000000003' });
    assert.equal(changedMidFlight.status, 502);
    assert.notEqual(changedMidFlight.body.code, 'mapping_changed');
    assert.equal(intermediate.length, 2);
    assert.equal(submitted.length, 1);
    assert.equal(unexpectedWrites, 0);
    formAction = '/send';
    driftAfterFirstPost = false;

    handoffAfterFirstPost = true;
    const interrupted = { ...approved, id: 'a0000000-0000-4000-8000-000000000006' };
    assert.deepEqual(await send('/submit', interrupted), { status: 502, body: {} });
    assert.deepEqual(await send('/submit', interrupted), { status: 409, body: {} });
    assert.equal(intermediate.length, 3);
    assert.equal(submitted.length, 1);
    handoffAfterFirstPost = false;
    showHandoff = false;
  }
  replaySubmittedForm = true;
  const redirected = { ...approved, id: 'a0000000-0000-4000-8000-000000000004' };
  assert.equal((await send('/submit', redirected)).status, 502);
  // The portal accepted the final POST but no usable receipt reached the adapter.
  // A fresh adapter must preserve the reservation and refuse to send it again.
  const stopped = once(provider, 'close');
  provider.close();
  await stopped;
  provider = createBrowserProvider(providerOptions);
  origin = await address(provider);
  const unknownReceipt = await fetch(origin + '/receipt/' + redirected.id, { headers });
  assert.equal(unknownReceipt.status, 404);
  assert.equal((await send('/submit', redirected)).status, 409);
  assert.equal(submitted.length, 2);
  assert.equal(unexpectedWrites, 0);
  if (!multiPage) {
    const cleanupStarted = Promise.withResolvers();
    const releaseCleanup = Promise.withResolvers();
    const previewProvider = createBrowserProvider({
      ...providerOptions,
      browser: {
        isConnected: () => true,
        newContext: async () => ({
          newPage: async () => ({
            setContent: async () => {},
            locator: () => ({ evaluate: async () => {} }),
            pdf: async () => Buffer.from('%PDF-1.4'),
            close: async () => {},
          }),
          close: async () => { cleanupStarted.resolve(); await releaseCleanup.promise; },
        }),
      },
    });
    try {
      const previewOrigin = await address(previewProvider);
      const preview = () => fetch(previewOrigin + '/preview-cv', {
        method: 'POST', headers, body: JSON.stringify({ value: 'Synthetic CV' }),
      });
      let replied = false;
      const first = preview().then(response => { replied = true; return response; });
      await cleanupStarted.promise;
      const competingPreview = await preview();
      assert.equal(competingPreview.status, 503);
      assert.deepEqual(await competingPreview.json(), { code: 'provider_busy' });
      assert.equal(replied, false, 'CV preview must wait until its browser context closes');
      releaseCleanup.resolve();
      assert.equal(await (await first).text(), '%PDF-1.4');
      assert.equal(await (await preview()).text(), '%PDF-1.4');
    } finally {
      releaseCleanup.resolve();
      previewProvider.close();
    }

    const disconnected = Promise.withResolvers();
    const stalledProvider = createBrowserProvider({
      ...providerOptions,
      browser: {
        isConnected: () => true,
        newContext: async () => ({
          newPage: async () => { throw new Error('Synthetic browser failure'); },
          close: () => new Promise(() => {}),
        }),
        close: async () => { disconnected.resolve(); },
      },
    });
    try {
      const stalledOrigin = await address(stalledProvider);
      const prepared = await fetch(stalledOrigin + '/prepare', {
        method: 'POST', headers, body: JSON.stringify(job),
      });
      assert.equal(prepared.status, 502);
      await Promise.race([
        disconnected.promise,
        setTimeout(8000).then(() => { throw new Error('Stalled browser was not quarantined'); }),
      ]);
      assert.equal((await fetch(stalledOrigin + '/healthz')).status, 503);
      const subsequent = await fetch(stalledOrigin + '/prepare', { method: 'POST', headers });
      assert.deepEqual(await subsequent.json(), { code: 'provider_unavailable' });
    } finally {
      stalledProvider.close();
    }
  }
  console.log('Passed: read-only review, CV upload after approval, supporting PDF prompts, form revisions, redirects, and receipt recovery.');
} finally {
  provider?.close();
  portal.close();
  separatePortal.close();
  await browser.close();
  await rm(receipts, { recursive: true, force: true });
}
