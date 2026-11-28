// Local simulator QA against the production controller, worker and migrations.
// The catalog is read-only and all learner records belong to synthetic users.
require('ts-node/register/transpile-only');
const { createServer } = require('node:http');
const { BadRequestException, NotFoundException } = require('@nestjs/common');
const { createServer: createHttpsServer } = require('node:https');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { randomUUID, createHash, X509Certificate } = require('node:crypto');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { AutoApplyController } = require('../../src/me/auto-apply.controller.ts');
const { AutoApplyActivityService } = require('../../src/me/auto-apply-activity.service.ts');
const { AutoApplyAdminController } = require('../../src/me/auto-apply-admin.controller.ts');
const { AutoApplyWorker } = require('../../src/me/auto-apply-worker.service.ts');
const { BillingService } = require('../../src/billing/billing.service.ts');
const { NotificationsService } = require('../../src/notifications/notifications.service.ts');
const { MeService } = require('../../src/me/me.service.ts');
const { UploadsService } = require('../../src/uploads/uploads.service.ts');
const { toDatabaseUserId } = require('../../src/common/user-id.ts');
const { pool } = require('../../src/db/index.ts');

const opportunities = {
  '28758c31-ee93-4516-acf8-81528ba75bc2': 'Chevron internship simulator pilot',
  'c4d25057-893f-499c-8ffa-e6487bc3050f': 'Mastercard scholarship simulator pilot',
  'bd049dfb-a668-49ba-a6a7-6e3b2b0eff51': 'ITU advisory board simulator pilot',
};
const owner = 'user_auto_apply_simulator_fixture';
const loadCount = Number(process.env.AUTO_APPLY_TEST_LOAD_LEARNERS || 0);
const loadWorkerTickMs = Number(process.env.AUTO_APPLY_TEST_LOAD_WORKER_TICK_MS || 1000);
if (loadCount && ![1000, 15_000].includes(loadWorkerTickMs)) {
  throw new Error('Use a 1000 or 15000 millisecond synthetic load worker interval');
}
const loadOwner = index => `user_auto_apply_load_${index}`;
const token = 'synthetic-local-provider-token';
const fixtureCv = { id: '0f04871a-5e0b-4284-8f7d-b72958e70c82', name: 'Synthetic CV' };
const researchCv = { id: '6a15b964-caf2-488a-9b8f-f24ca2b098cb', name: 'Synthetic Research CV' };
const savedCvs = process.env.AUTO_APPLY_TEST_CV_SELECTION === '1' ? [fixtureCv, researchCv] : [fixtureCv];
const cvPortalSubmissions = [];
const cvRequiredOpportunity = 'c4d25057-893f-499c-8ffa-e6487bc3050f';
const supportingPdfOpportunity = '28758c31-ee93-4516-acf8-81528ba75bc2';
const educationOpportunity = 'bd049dfb-a668-49ba-a6a7-6e3b2b0eff51';
const educationCatalogUrl = 'https://provider.example/application';
const fixtureDocument = { id: '6eb71807-562e-42cf-a45b-c5dcd0136596', name: 'institution-letter.pdf' };
const fixturePdf = Buffer.from('%PDF-1.4\n% Synthetic institutional letter fixture\n%%EOF\n');
const testDeviceUpload = process.env.AUTO_APPLY_TEST_DEVICE_UPLOAD === '1';
const testMultipleDocuments = process.env.AUTO_APPLY_TEST_MULTIPLE_DOCUMENTS === '1';
const testCheckboxes = process.env.AUTO_APPLY_TEST_CHECKBOXES === '1';
const testStatementPrompts = process.env.AUTO_APPLY_TEST_STATEMENT_PROMPTS === '1';
const contributionQuestion = 'What would you contribute to the advisory board?';
const contributionDraft = 'I would share what I learned about rural digital access through community projects.';
const testAndroidUpdates = process.env.AUTO_APPLY_TEST_ANDROID_UPDATES === '1';
const testFormPreflight = process.env.AUTO_APPLY_TEST_FORM_PREFLIGHT === '1';
const testMultipleChoices = process.env.AUTO_APPLY_TEST_MULTIPLE_CHOICES === '1';
const testRememberPhone = process.env.AUTO_APPLY_TEST_REMEMBER_PHONE === '1';
const testMultiPageInterruption = process.env.AUTO_APPLY_TEST_MULTI_PAGE_INTERRUPTION === '1';
const testMultiPage = testMultiPageInterruption || process.env.AUTO_APPLY_TEST_MULTI_PAGE === '1';
const testNativeValidation = process.env.AUTO_APPLY_TEST_NATIVE_VALIDATION === '1';
const phoneFormatHint = 'Enter + followed by 11 digits, without spaces.';
let addUnmappedRequirement = testFormPreflight;
const declarationLabel = 'I confirm that the information in this application is accurate.';
const updatesLabel = 'Send me occasional updates about this program.';
const fixtureTranscript = {
  id: 'd5aaba4e-d007-4428-9dd7-abc8fdca27f2', name: 'transcript.pdf',
  bytes: Buffer.from('%PDF-1.4\n% Synthetic academic transcript fixture\n%%EOF\n'),
};
const oversizeTranscript = {
  id: 'fb36699a-e23f-4977-abaa-f6b8cd967552', name: 'large-transcript.pdf',
  bytes: testMultipleDocuments ? Buffer.concat([fixtureTranscript.bytes], 10 * 1024 * 1024) : Buffer.alloc(0),
};
const previousTranscript = {
  id: 'e5b514de-18b9-4297-b2a6-61e00676d87e', name: 'old-transcript.pdf',
  bytes: Buffer.from('%PDF-1.4\n% Synthetic earlier transcript fixture\n%%EOF\n'),
};
const fixtureDocuments = [{ ...fixtureDocument, bytes: fixturePdf },
  ...(testMultipleDocuments ? [fixtureTranscript, oversizeTranscript, previousTranscript] : [])];
const testQuota = process.env.AUTO_APPLY_TEST_QUOTA === '1';
const testUpgrades = testQuota || process.env.AUTO_APPLY_TEST_UPGRADES === '1';
const testTrackerSync = process.env.AUTO_APPLY_TEST_TRACKER_SYNC === '1';
const testUnconfirmed = testTrackerSync || process.env.AUTO_APPLY_TEST_UNCONFIRMED === '1';
const testRollbackReceipt = testUnconfirmed && process.env.AUTO_APPLY_TEST_ROLLBACK_RECEIPT === '1';
const holdReceipt = testUnconfirmed && (testTrackerSync || process.env.AUTO_APPLY_TEST_REMOVE_GUARD === '1') ? Promise.withResolvers() : null;
const testCatalogLink = process.env.AUTO_APPLY_TEST_CATALOG_LINK === '1';
const testSubmitConfig = process.env.AUTO_APPLY_TEST_SUBMIT_CONFIG === '1';
const liveAiProvider = process.env.AUTO_APPLY_TEST_AI_PROVIDER;
if (!Number.isInteger(loadCount) || loadCount < 0 || loadCount > 100 || (loadCount && liveAiProvider)) {
  throw new Error('The local load fixture supports up to 100 learners and synthetic drafting only');
}
const liveAiRoutes = new Map([
  ['openai', { credential: 'OPENAI_API_KEY', model: 'gpt-4.1-mini' }],
  ['openrouter', { credential: 'OPENROUTER_API_KEY', model: 'openai/gpt-4.1-mini' }],
  ['deepseek', { credential: 'DEEPSEEK_API_KEY', model: 'deepseek-chat' }],
]);
const testBoundHandoff = process.env.AUTO_APPLY_TEST_BOUND_HANDOFF === '1';
const testManualSubmission = process.env.AUTO_APPLY_TEST_MANUAL_SUBMISSION === '1';
const testManualReview = process.env.AUTO_APPLY_TEST_MANUAL_REVIEW === '1';
const testExpiredSession = process.env.AUTO_APPLY_TEST_EXPIRED_SESSION === '1';
const testSecurityCheck = testBoundHandoff || testManualSubmission || testExpiredSession || process.env.AUTO_APPLY_TEST_SECURITY_CHECK === '1';
let showSecurityCheck = testSecurityCheck;
let changeFormAfterSecurityCheck = false;
let educationPortalPosts = 0;
const educationPageOnePosts = [];
const changingFormOpportunity = process.env.AUTO_APPLY_TEST_CHANGED_FORM === '1'
  ? 'bd049dfb-a668-49ba-a6a7-6e3b2b0eff51' : null;
let changingFormReads = 0;
let failFirstPortalRead = process.env.AUTO_APPLY_TEST_FAIL_FIRST_PORTAL_READ === '1';
const dir = process.env.AUTO_APPLY_TEST_DIR;
const database = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
const dbPort = process.env.AUTO_APPLY_TEST_POSTGRES_PORT || '55495';
const apiPort = Number(process.env.AUTO_APPLY_TEST_API_PORT || 8093);
if (!dir || database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1' ||
    database.port !== dbPort || database.pathname !== '/postgres') {
  throw new Error('Use the isolated local simulator database and provide AUTO_APPLY_TEST_DIR');
}
const web = join(__dirname, '../../../../../../edutu-web-app');

async function listen(server, port = 0) {
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function body(request) {
  let value = '';
  for await (const chunk of request) value += chunk;
  return JSON.parse(value || '{}');
}

function fixtureCgroupMetrics() {
  if (process.platform !== 'linux') return;
  try {
    const read = name => readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim();
    const cpu = read('cpu.stat');
    return {
      cpuQuota: read('cpu.max'),
      cpuPeriods: Number(/^nr_periods (\d+)$/m.exec(cpu)?.[1]),
      cpuThrottledPeriods: Number(/^nr_throttled (\d+)$/m.exec(cpu)?.[1]),
      cpuThrottledMicros: Number(/^throttled_usec (\d+)$/m.exec(cpu)?.[1]),
      memoryPeakBytes: Number(read('memory.peak')),
      oomKills: Number(/^oom_kill (\d+)$/m.exec(read('memory.events'))?.[1]),
    };
  } catch {
    // An older kernel or a local test without cgroup v2 may omit these metrics.
  }
}

async function main() {
  const loadPortalWrites = new Map();
  const loadAdapterResponses = new Map();
  let peakFixtureRssBytes = 0;
  const { chromium } = require(join(web, 'node_modules/playwright-core'));
  const { createBrowserProvider } = await import(pathToFileURL(join(web, 'scripts/auto-apply/browser-provider.mjs')).href);
  const tls = { key: readFileSync(join(dir, 'server.key')), cert: readFileSync(join(dir, 'server.crt')) };
  const institutionLetter = testDeviceUpload ? await new Promise((resolve, reject) => {
    const Pdf = require('pdfkit');
    const document = new Pdf();
    const buffers = [];
    document.on('data', buffer => buffers.push(buffer));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(buffers)));
    document.fontSize(20).text('Fictional institution letter');
    document.fontSize(12).text('Example University. This PDF contains test data for the Edutu simulator.');
    document.end();
  }) : fixturePdf;
  const args = [];
  if (testBoundHandoff) {
    const publicKey = new X509Certificate(tls.cert).publicKey.export({ format: 'der', type: 'spki' });
    args.push('--ignore-certificate-errors-spki-list=' + createHash('sha256').update(publicKey).digest('base64'));
  }
  const chromePath = process.env.CHROME_PATH;
  const bundledChromium = process.env.AUTO_APPLY_TEST_BUNDLED_CHROMIUM === '1';
  const browser = await chromium.launch({
    channel: bundledChromium || chromePath ? undefined : 'chrome', executablePath: chromePath, args,
    chromiumSandbox: loadCount > 0 || process.env.AUTO_APPLY_TEST_CHROMIUM_SANDBOX === '1',
  });
  const handlePortal = async (request, response) => {
    response.setHeader('Content-Type', 'text/html');
    const requiresCv = request.url === '/apply/' + cvRequiredOpportunity;
    if (loadCount && requiresCv) await delay(150);
    const requiresSupport = request.url === '/apply/' + supportingPdfOpportunity;
    const requiresEducation = request.url === '/apply/' + educationOpportunity;
    if (testMultiPage && request.url === '/start/' + educationOpportunity) {
      if (request.method === 'GET') return response.end(
        '<form method="post"><label>Background <textarea name="background" required></textarea></label><button type="submit">Continue</button></form>',
      );
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      educationPageOnePosts.push(new URLSearchParams(Buffer.concat(chunks).toString()).get('background'));
      response.writeHead(303, { Location: '/apply/' + educationOpportunity });
      return response.end();
    }
    if (request.method === 'GET' && failFirstPortalRead) {
      failFirstPortalRead = false;
      response.writeHead(503);
      return response.end('Synthetic portal temporarily unavailable.');
    }
    if (request.method === 'GET' && requiresEducation && testMultiPageInterruption && educationPageOnePosts.length) {
      response.writeHead(401);
      return response.end('Sign in to continue to the second page of the synthetic portal.');
    }
    if (request.method === 'GET' && requiresEducation && showSecurityCheck) {
      if (testExpiredSession) {
        response.writeHead(401);
        return response.end('Sign in to the synthetic portal.');
      }
      response.writeHead(429);
      return response.end('<h1 id="security-check">Security Check</h1>');
    }
    if (request.method === 'POST') {
      if (requiresEducation) educationPortalPosts++;
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      let receiptContext = requiresCv ? 'CV-' : requiresSupport ? 'PDF-' : '';
      if (requiresCv || requiresSupport) {
        try {
          const body = await new Response(Buffer.concat(chunks), {
            headers: { 'Content-Type': request.headers['content-type'] },
          }).formData();
          if (testRememberPhone && requiresCv && body.get('phone') !== '+12025550100') {
            response.writeHead(422);
            return response.end('The simulator portal requires the saved international phone number.');
          }
          const pdf = body.get(requiresSupport ? 'support' : 'cv');
          if (!(pdf instanceof File) || pdf.name !== (requiresSupport ? fixtureDocument.name : 'edutu-cv.pdf') || pdf.type !== 'application/pdf' ||
              Buffer.from(await pdf.slice(0, 4).arrayBuffer()).toString() !== '%PDF') throw new Error();
          if (requiresSupport && !Buffer.from(await pdf.arrayBuffer()).equals(institutionLetter)) throw new Error();
          if (requiresSupport && testMultipleDocuments) {
            const transcript = body.get('transcript');
            if (!(transcript instanceof File) || transcript.name !== fixtureTranscript.name ||
                transcript.type !== 'application/pdf' || !Buffer.from(await transcript.arrayBuffer()).equals(fixtureTranscript.bytes)) {
              throw new Error();
            }
          }
          if (requiresCv && loadCount) {
            const email = body.get('email');
            loadPortalWrites.set(email, (loadPortalWrites.get(email) ?? 0) + 1);
          }
          if (requiresCv && process.env.AUTO_APPLY_TEST_CV_SELECTION === '1') {
            cvPortalSubmissions.push({ answer: body.get('answer'), statement: body.get('statement'), filename: pdf.name });
          }
        } catch {
          response.writeHead(422);
          return response.end('The simulator portal requires the expected PDF.');
        }
      }
      if (requiresEducation) {
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        const major = form.get('major');
        if (major !== 'engineering' && major !== 'physics') {
          response.writeHead(422);
          return response.end('The simulator portal requires a recognized field of study.');
        }
        if (testCheckboxes && (form.get('declaration') !== 'confirmed' || form.has('updates'))) {
          response.writeHead(422);
          return response.end('The simulator portal requires the reviewed checkbox selections.');
        }
        if (testMultipleChoices && (form.getAll('topics').join(',') !== 'access,inclusion' || form.has('channels'))) {
          response.writeHead(422);
          return response.end('The simulator portal requires the reviewed selections with no optional channels.');
        }
        if (testNativeValidation && form.get('phone') !== '+12025550100') {
          response.writeHead(422);
          return response.end('The simulator portal requires a compact phone number.');
        }
        receiptContext = 'ITU-' + major.toUpperCase() + (form.get('optional_note') ? '-NOTES-' : '-BLANK-');
        if (testCheckboxes) receiptContext += 'DECLARED-NO-UPDATES-';
        if (testMultipleChoices) receiptContext += 'ACCESS-INCLUSION-NO-CHANNELS-';
        if (testStatementPrompts) {
          if (!form.get('statement')?.includes('engineering') || form.get('contribution') !== contributionDraft) {
            response.writeHead(422);
            return response.end('The simulator portal requires the distinct reviewed statements.');
          }
          receiptContext += 'DISTINCT-STATEMENTS-';
        }
        if (testUnconfirmed) {
          if (holdReceipt) await holdReceipt.promise;
          return response.end('<p>Application accepted</p>');
        }
      }
      return response.end('<output id="receipt">SIMULATOR-' + receiptContext + randomUUID().slice(0, 8) + '</output>');
    }
    const changedForm = (requiresEducation && changeFormAfterSecurityCheck) ||
      (request.url === '/apply/' + changingFormOpportunity && ++changingFormReads > 1);
    const nameLabel = changedForm ? 'Reference name' : 'Applicant name';
    response.end(`<form method="post"${requiresCv || requiresSupport ? ' enctype="multipart/form-data"' : ''}>` +
      `<input name="name" aria-label="${nameLabel}"${requiresEducation ? ' maxlength="80"' : ''} required><input type="email" name="email" required>` +
      (requiresEducation && testMultiPage ? '' : '<textarea name="background" required></textarea>') +
      '<input name="answer" required><textarea name="statement"' + (requiresEducation ? ' maxlength="180"' : '') + ' required></textarea>' +
      (requiresEducation && testStatementPrompts ? '<label>Board contribution <textarea name="contribution" maxlength="135" required></textarea></label>' : '') +
      (requiresEducation ? '<label>Field of study <select name="major" required><option value="">Choose</option><option value="engineering">Engineering</option><option value="physics">Physics</option></select></label>' : '') +
      (requiresEducation ? '<label>Additional notes <textarea name="optional_note"></textarea></label>' : '') +
      (requiresEducation || (testRememberPhone && (requiresCv || requiresSupport)) ? '<label>Phone number <input type="tel" name="phone"' +
        (testNativeValidation ? ' pattern="[+][0-9]{11}"' : '') + ' required></label>' : '') +
      (requiresEducation && addUnmappedRequirement ? '<label>New provider requirement <input name="new_requirement" required></label>' : '') +
      (requiresEducation && testMultipleChoices
        ? '<label>Advice topics <select name="topics" multiple required><option value="access">Digital access</option>' +
          '<option value="skills" selected>Digital skills</option><option value="inclusion">Inclusion</option>' +
          '<option value="unavailable" disabled>Unavailable topic</option></select></label>' +
          '<label>Contact channels <select name="channels" multiple><option value="email" selected>Email</option>' +
          '<option value="phone">Phone</option></select></label>'
        : '') +
      (requiresEducation && testCheckboxes
        ? `<label><input type="checkbox" name="declaration" value="confirmed" required checked>${declarationLabel}</label>` +
          `<label><input type="checkbox" name="updates" value="subscribed" checked>${updatesLabel}</label>`
        : '') +
      (requiresCv ? '<label>CV attachment <input type="file" name="cv" accept="application/pdf" required></label>' : '') +
      (requiresSupport ? '<label>Institution letter <input type="file" name="support" accept="application/pdf" required></label>' : '') +
      (requiresSupport && testMultipleDocuments ? '<label>Academic transcript <input type="file" name="transcript" accept="application/pdf" required></label>' : '') +
      '<button type="submit">Send</button></form>');
  };
  const portal = testBoundHandoff ? createHttpsServer(tls, handlePortal) : createServer(handlePortal);
  const portalPort = await listen(portal);
  const portalOrigin = (testBoundHandoff ? 'https' : 'http') + '://127.0.0.1:' + portalPort;
  const forms = Object.fromEntries(Object.keys(opportunities).map((id, index) => [id, {
    url: portalOrigin + '/apply/' + id,
    catalogUrl: id === educationOpportunity ? educationCatalogUrl : 'https://provider.example/application/' + id,
    ...(id === educationOpportunity ? {
      handoffSelector: '#security-check',
      handoffQuestion: 'Complete the security check on the provider’s website.',
      ...(testBoundHandoff ? { handoffPath: '/apply/' + id + '#documents' } : {}),
    } : {}),
    fields: [
      { label: 'Applicant name', selector: '[name="name"]', source: 'name' },
      { label: 'Contact email', selector: '[name="email"]', source: 'email' },
      { label: 'Background', selector: '[name="background"]', source: 'background' },
      { label: 'Application question', selector: '[name="answer"]', source: 'answer',
        ...(id === educationOpportunity ? { statementContext: true } : {}),
        question: ['What year are you in?', 'What do you plan to study?', 'What topic would you advise on?'][index] },
      { label: 'Statement of purpose', selector: '[name="statement"]', source: 'statement' },
      ...(id === educationOpportunity && testStatementPrompts ? [
        { label: 'Board contribution', selector: '[name="contribution"]', source: 'statement', question: contributionQuestion },
      ] : []),
      ...(id === educationOpportunity ? [{ label: 'Field of study', selector: '[name="major"]', source: 'major', control: 'select' }] : []),
      ...(id === educationOpportunity ? [{ label: 'Additional notes', selector: '[name="optional_note"]', source: 'answer', optional: true }] : []),
      ...(id === educationOpportunity || (testRememberPhone && [cvRequiredOpportunity, supportingPdfOpportunity].includes(id)) ? [{ label: 'Phone number', selector: '[name="phone"]', source: 'phone',
        ...(testNativeValidation ? { formatHint: phoneFormatHint } : {}) }] : []),
      ...(id === educationOpportunity && testMultipleChoices ? [
        { label: 'Advice topics', selector: '[name="topics"]', source: 'answer', control: 'multi-select', question: 'Which topics would you like to advise on?' },
        { label: 'Contact channels', selector: '[name="channels"]', source: 'answer', control: 'multi-select' },
      ] : []),
      ...(id === educationOpportunity && testCheckboxes ? [
        { label: 'Application declaration', selector: '[name="declaration"]', source: 'answer', control: 'checkbox', checkboxLabel: declarationLabel },
        { label: 'Program updates', selector: '[name="updates"]', source: 'answer', control: 'checkbox', checkboxLabel: updatesLabel },
      ] : []),
      ...(id === cvRequiredOpportunity ? [{ label: 'CV attachment', selector: '[name="cv"]', source: 'cv_pdf' }] : []),
      ...(id === supportingPdfOpportunity ? [{ label: 'Institution letter', selector: '[name="support"]', source: 'support_pdf' }] : []),
      ...(id === supportingPdfOpportunity && testMultipleDocuments ? [{ label: 'Academic transcript', selector: '[name="transcript"]',
        source: 'support_pdf', question: 'Choose your academic transcript PDF.' }] : []),
    ],
    submitSelector: 'button', receiptSelector: '#receipt',
  }]));
  if (testMultiPage) {
    const { receiptSelector, catalogUrl, ...details } = forms[educationOpportunity];
    forms[educationOpportunity] = { receiptSelector, catalogUrl, steps: [
      { url: portalOrigin + '/start/' + educationOpportunity, submitSelector: 'button',
        fields: details.fields.filter(field => field.source === 'background') },
      { ...details, fields: details.fields.filter(field => field.source !== 'background') },
    ] };
  }
  if (process.env.AUTO_APPLY_TEST_UNMAPPED === '1') delete forms[cvRequiredOpportunity];
  const receiptsDirectory = join(dir, 'receipts');
  mkdirSync(receiptsDirectory, { mode: 0o700 });
  const provider = createBrowserProvider({ browser, forms, token, receiptsDirectory, allowLocalFixture: true, tls });
  if (loadCount) {
    provider.on('request', (request, response) => {
      const route = request.url.split('/')[1];
      response.once('finish', () => {
        const key = `${route}:${response.statusCode}`;
        loadAdapterResponses.set(key, (loadAdapterResponses.get(key) ?? 0) + 1);
      });
    });
  }
  const providerPort = await listen(provider);
  Object.assign(process.env, {
    AUTO_APPLY_PILOT_OPPORTUNITIES: Object.keys(opportunities).join(','),
    AUTO_APPLY_PROVIDER_TOKEN: token,
    AUTO_APPLY_PROVIDER_PREPARE_URL: 'https://127.0.0.1:' + providerPort + '/prepare',
    AUTO_APPLY_PROVIDER_CAPABILITIES_URL: 'https://127.0.0.1:' + providerPort + '/capabilities',
    AUTO_APPLY_PROVIDER_VERIFY_URL: 'https://127.0.0.1:' + providerPort + '/verify',
    AUTO_APPLY_PROVIDER_SUBMIT_URL: 'https://127.0.0.1:' + providerPort + '/submit',
    AUTO_APPLY_PROVIDER_RECEIPT_URL: 'https://127.0.0.1:' + providerPort + '/receipt',
    AUTO_APPLY_PROVIDER_CV_PREVIEW_URL: 'https://127.0.0.1:' + providerPort + '/preview-cv',
  });
  for (const [id, title] of Object.entries(opportunities)) {
    await pool.query(
      'insert into opportunities(id,title,organization,summary,application_url) values($1,$2,$3,$4,$5) on conflict do nothing',
      [id, title, 'Example Programs', 'The pilot supports applied research and community projects.',
        id === educationOpportunity ? educationCatalogUrl : 'https://provider.example/application/' + id],
    );
  }
  await pool.query(`insert into profiles(user_id, full_name, email, school, degree, major, skills) values($1,$2,$3,$4,$5,$6,$7)`,
    [owner, 'Example Learner', 'learner@example.test', 'Example University', 'Bachelor of Science', 'Engineering', ['Research']]);
  if (loadCount) {
    await pool.query(`insert into profiles(user_id, full_name, email, school, degree, major, skills)
      select $1 || cohort.id, 'Example Learner ' || cohort.id, 'learner-' || cohort.id || '@example.test',
        'Example University', 'Bachelor of Science', 'Engineering', array['Research']
      from generate_series(1, $2::integer) as cohort(id)`, [loadOwner(''), loadCount]);
  }
  if (testUpgrades) {
    await pool.query(`insert into private.auto_apply_usage (user_id, month_start, attempts)
      values ($1, date_trunc('month', now() at time zone 'UTC')::date, $2)`, [owner, testQuota ? 2 : 3]);
  }
  const billing = new BillingService();
  billing.getSupabase = () => null; // Keep QA on the isolated database, even with production environment variables.
  const uploadedRows = new Map();
  const objects = new Map();
  const multer = require('multer');
  const receiveUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single('file');
  const deviceUploads = new UploadsService({
    storage: { from: () => ({
      upload: async (key, bytes) => { objects.set(key, Buffer.from(bytes)); return { error: null }; },
      download: async key => ({ data: objects.has(key) ? new Blob([objects.get(key)]) : null, error: null }),
      remove: async keys => { keys.forEach(key => objects.delete(key)); return { error: null }; },
    }) },
    from: () => ({
      insert: row => ({ select: () => ({ single: async () => {
        const id = randomUUID();
        uploadedRows.set(id, row);
        return { data: { id }, error: null };
      } }) }),
      select: () => {
        const filters = {};
        const selection = {
          eq: (column, value) => { filters[column] = value; return selection; },
          maybeSingle: async () => {
            const row = uploadedRows.get(filters.id);
            return { data: row?.user_id === filters.user_id ? row : null, error: null };
          },
        };
        return selection;
      },
    }),
  });
  const uploads = testDeviceUpload ? deviceUploads : { getApplicationPdf: async (_ownerId, uploadId) => {
    const document = fixtureDocuments.find(item => item.id === uploadId);
    if (!document) throw new Error('Unknown fixture document');
    return { name: document.name, bytes: document.bytes, sha256: createHash('sha256').update(document.bytes).digest('hex') };
  } };
  let liveAi;
  if (liveAiProvider) {
    const route = liveAiRoutes.get(liveAiProvider);
    if (!route) throw new Error('Choose openai, openrouter, or deepseek for the live AI pilot');
    const { credential, model } = route;
    if (!process.env[credential]?.trim()) throw new Error(`Live AI pilot requires the existing ${credential}`);
    for (const name of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY']) {
      if (name !== credential) delete process.env[name];
    }
    await pool.query(`insert into public.ai_routes (feature, provider, model, temperature, response_mime_type)
      values ('docs.sop', $1, $2, 20, 'application/json')`, [liveAiProvider, model]);
    process.env.AI_CONTENT_SAMPLE_RATE = '1';
    const { AiService } = require('../../src/ai/ai.service.ts');
    const { AiEncryptionService } = require('../../src/ai/ai-encryption.service.ts');
    const { DeepSeekAdapter, GeminiAdapter } = require('../../src/ai/adapters/gemini.adapter.ts');
    const { OpenRouterAdapter } = require('../../src/ai/adapters/openrouter.adapter.ts');
    const { OpenAiAdapter } = require('../../src/ai/adapters/openai.adapter.ts');
    liveAi = new AiService(new AiEncryptionService(), new DeepSeekAdapter(), new GeminiAdapter(), new OpenRouterAdapter(), new OpenAiAdapter());
  }
  let simulatedStatementFailure = false;
  const worker = new AutoApplyWorker({
    generateJson: async (options) => {
      const { prompt, sensitiveContent, systemInstruction } = options;
      if (!sensitiveContent || !prompt.includes('Example Programs') || !prompt.includes('applied research and community projects')) {
        throw new Error('The pilot statement request must contain the listing context and opt out of logging content');
      }
      if (prompt.includes('ITU advisory board simulator pilot') && !prompt.includes('"applicationAnswers":[{"question":"What topic would you advise on?"')) {
        throw new Error('The ITU statement request must include the learner’s selected advisory topic.');
      }
      const isContribution = testStatementPrompts && prompt.includes(contributionQuestion);
      if (prompt.includes('ITU advisory board simulator pilot') &&
          !systemInstruction.includes((isContribution ? '135' : '180') + ' characters')) {
        throw new Error('The ITU request must include the specific essay’s character limit.');
      }
      if (liveAi) {
        try {
          return await liveAi.generateJson(options);
        } catch (error) {
          const status = /^(?:OpenAI|OpenRouter|DeepSeek) request failed: (\d{3})\b/.exec(error.message ?? '')?.[1];
          console.error(status ? `Live AI pilot received HTTP ${status}` : 'Live AI pilot could not generate a statement');
          throw error;
        }
      }
      if (process.env.AUTO_APPLY_TEST_SOP_RESULT === 'unavailable-once' && !simulatedStatementFailure) {
        simulatedStatementFailure = true;
        throw new Error('Synthetic statement provider was unavailable');
      }
      return { statement: process.env.AUTO_APPLY_TEST_SOP_RESULT === 'insufficient'
        ? null
        : isContribution ? contributionDraft : 'I want to build on my engineering studies and contribute to this programme.' };
    },
  }, uploads);
  const testCvRemoval = process.env.AUTO_APPLY_TEST_CV_REMOVAL === '1';
  let fixtureCvAvailable = true;
  const controller = new AutoApplyController(billing, {
    listSummaries: async () => fixtureCvAvailable ? savedCvs : [],
    get: async (_owner, id) => {
      const cv = savedCvs.find(item => item.id === id);
      if (!fixtureCvAvailable || !cv) throw new NotFoundException('CV not found');
      return { ...cv, data: { summary: cv.id === researchCv.id ? 'Synthetic research placement in optics' : 'Synthetic applicant CV' } };
    },
  }, worker, uploads);
  const admin = new AutoApplyAdminController();
  const applications = new MeService();
  const notifications = new NotificationsService();
  notifications.sendPush = async () => ({ sent: 0, skipped: 'simulator inbox only' });
  const androidUpdates = testAndroidUpdates ? new AutoApplyActivityService() : null;
  const progressMessages = [];
  if (androidUpdates) {
    androidUpdates.expo = { sendPushNotificationsAsync: async messages => {
      progressMessages.push(...messages.map(message => message.data));
      return messages.map(() => ({ status: 'ok', id: randomUUID() }));
    } };
    await pool.query(`insert into public.notification_push_tokens (user_id, token, provider, device) values
      (public.clerk_id_to_uuid($1)::uuid, 'ExpoPushToken[android-pilot]', 'expo', '{"platform":"android"}'),
      (public.clerk_id_to_uuid('user_another_fixture')::uuid, 'ExpoPushToken[android-other]', 'expo', '{"platform":"android"}')`, [owner]);
  }
  const tick = setInterval(async () => {
    if (loadCount) peakFixtureRssBytes = Math.max(peakFixtureRssBytes, process.memoryUsage.rss());
    try {
      await worker.stopUnavailableAttempts();
      await worker.runScheduledBatch();
      await worker.reconcileUnconfirmed();
      await notifications.processDueQueue();
    } catch (error) {
      console.error(error.message);
    }
  }, loadCount ? loadWorkerTickMs : 1000);
  const api = createServer(async (request, response) => {
    const index = Number(request.headers['x-fixture-learner']);
    const requestOwner = loadCount && Number.isInteger(index) && index >= 1 && index <= loadCount
      ? loadOwner(index) : owner;
    return handleFixtureRequest(request, response, requestOwner);
  });
  async function handleFixtureRequest(request, response, owner) {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    const method = request.method;
    let status = 200;
    let payload;
    try {
      const match = pathname.match(/^\/me\/auto-apply\/(opportunities|applications|attempts)\/([a-f\d-]+)(?:\/(answer|attachment|cv|cv-preview|approve|review|previous-answers|retry-statement|control|check-receipt|activity|manual-review|manual-submission))?$/);
      const adminPlan = pathname.match(/^\/admin\/auto-apply\/plans\/(lite|pro|scholar)$/);
      const fixtureDetailId = pathname.match(/^\/opportunities\/([a-f\d-]+)$/)?.[1];
      if (loadCount && pathname === '/fixture/auto-apply/load' && method === 'GET') {
        const writes = [...loadPortalWrites.values()];
        payload = {
          learners: loadCount, workerTickMs: loadWorkerTickMs,
          browserConnected: browser.isConnected(), peakFixtureRssBytes,
          browserVersion: browser.version(), cgroup: fixtureCgroupMetrics(),
          adapterResponses: Object.fromEntries(loadAdapterResponses), portalApplicants: writes.length,
          portalWrites: writes.reduce((total, count) => total + count, 0),
          duplicateWrites: writes.reduce((total, count) => total + count - 1, 0),
        };
      } else if (pathname === '/notifications' && method === 'GET') {
        payload = await notifications.listForUser(owner, Number(searchParams.get('limit')));
      } else if (method === 'PATCH' && /^\/notifications\/[a-f\d-]+\/read$/.test(pathname)) {
        payload = await notifications.markRead(owner, pathname.split('/')[2], (await body(request)).read);
      } else if (pathname === '/billing/status') {
        payload = await billing.getStatus(owner);
      } else if (process.env.AUTO_APPLY_TEST_CV_SELECTION === '1' && pathname === '/fixture/auto-apply/cv-submissions' && method === 'GET') {
        payload = cvPortalSubmissions;
      } else if ((testManualSubmission || testManualReview) && pathname === '/fixture/auto-apply/manual-portal-submission' && method === 'POST') {
        const portalResponse = await fetch(portalOrigin + '/apply/' + educationOpportunity,
          { method: 'POST', body: new URLSearchParams({ major: 'engineering' }) });
        if (!portalResponse.ok) throw new Error('Synthetic provider rejected the manual submission');
        await portalResponse.text();
        payload = { posts: educationPortalPosts };
      } else if (testFormPreflight && pathname === '/fixture/auto-apply/form-preflight' && method === 'PUT') {
        const fixture = await body(request);
        addUnmappedRequirement = fixture.blocked === true;
        showSecurityCheck = fixture.handoff === true;
        payload = { posts: educationPortalPosts };
      } else if (androidUpdates && pathname === '/fixture/auto-apply/android-progress' && method === 'POST') {
        await androidUpdates.sendAndroidUpdates();
        payload = progressMessages.splice(0);
      } else if (androidUpdates && pathname === '/fixture/auto-apply/push-preference' && method === 'PUT') {
        const { enabled } = await body(request);
        if (typeof enabled !== 'boolean') throw new Error('Expected a boolean push preference');
        await pool.query(`insert into public.notification_preferences (user_id, push_notifications)
          values (public.clerk_id_to_uuid($1)::uuid, $2)
          on conflict (user_id) do update set push_notifications = excluded.push_notifications`, [owner, enabled]);
        payload = { enabled };
      } else if (liveAiProvider && pathname === '/fixture/auto-apply/ai-usage' && method === 'GET') {
        const { rows } = await pool.query(`select provider, status, request_metadata ? 'sampledContent' as sampled
          from public.ai_usage_logs where feature = 'docs.sop' order by created_at`);
        payload = rows;
      } else if (testCvRemoval && pathname === '/fixture/auto-apply/cv-availability' && method === 'PUT') {
        fixtureCvAvailable = (await body(request)).available === true;
        payload = { available: fixtureCvAvailable };
      } else if (testMultiPage && pathname === '/fixture/auto-apply/page-posts' && method === 'GET') {
        payload = { backgrounds: educationPageOnePosts, finalPosts: educationPortalPosts };
      } else if ((testUnconfirmed || testCatalogLink || testCheckboxes || testManualSubmission || testManualReview || testNativeValidation || testMultipleChoices) &&
          pathname === '/fixture/auto-apply/portal-posts' && method === 'GET') {
        payload = { posts: educationPortalPosts };
      } else if (holdReceipt && pathname === '/fixture/auto-apply/release-receipt' && method === 'POST') {
        holdReceipt.resolve();
        payload = { released: true };
      } else if (testRollbackReceipt && pathname === '/fixture/auto-apply/disable-pilot' && method === 'POST') {
        delete process.env.AUTO_APPLY_PILOT_OPPORTUNITIES;
        payload = { disabled: true };
      } else if (testRollbackReceipt && pathname === '/fixture/auto-apply/late-receipt' && method === 'POST') {
        const { id } = await body(request);
        const attempt = await controller.attempt(owner, id);
        if (attempt.state !== 'unconfirmed') throw new Error('Expected an unconfirmed fixture attempt');
        writeFileSync(join(receiptsDirectory, attempt.id), JSON.stringify({ receipt: 'SIMULATOR-LATE-RECEIPT' }), { mode: 0o600 });
        await pool.query('update private.auto_apply_attempts set receipt_check_after = now() where id = $1', [attempt.id]);
        payload = { ready: true };
      } else if (testSecurityCheck && pathname === '/fixture/auto-apply/security-check' && method === 'PUT') {
        const { enabled, changeForm = false } = await body(request);
        if (typeof enabled !== 'boolean' || typeof changeForm !== 'boolean') throw new Error('Invalid synthetic security check state');
        showSecurityCheck = enabled;
        changeFormAfterSecurityCheck = changeForm;
        payload = { posts: educationPortalPosts };
      } else if ((testCatalogLink || testBoundHandoff) && pathname === '/fixture/auto-apply/catalog-link' && method === 'PATCH') {
        const { matches } = await body(request);
        if (typeof matches !== 'boolean') throw new Error('Invalid synthetic catalog link');
        await pool.query('update opportunities set application_url = $2 where id = $1', [
          educationOpportunity,
          matches ? educationCatalogUrl : educationCatalogUrl + '?cycle=changed',
        ]);
        payload = { saved: true };
      } else if (testSubmitConfig && pathname === '/fixture/auto-apply/submit-config' && method === 'PUT') {
        const { mode } = await body(request);
        if (!['missing', 'invalid', 'ready'].includes(mode)) throw new Error('Invalid submission configuration fixture');
        if (mode === 'missing') delete process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL;
        else process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL = mode === 'ready'
          ? 'https://127.0.0.1:' + providerPort + '/submit' : 'https://invalid.example/submit';
        payload = { saved: true };
      } else if (testUpgrades && pathname === '/fixture/auto-apply/lite-grant' && method === 'POST') {
        const { environment, expired } = await body(request);
        if (!['sandbox', 'live'].includes(environment) || typeof expired !== 'boolean') {
          throw new Error('Invalid synthetic grant');
        }
        await pool.query(`insert into public.billing_entitlement_grants
          (user_id, environment, feature_key, valid_from, valid_until)
          values ($1, $2, 'lite', now() - interval '2 days',
            case when $3::boolean then now() - interval '1 day' else null end)`,
          [owner, environment, expired]);
        payload = { saved: true };
      } else if (testUpgrades && adminPlan && method === 'PUT') {
        payload = await admin.setPlan('admin', adminPlan[1], await body(request));
      } else if (testUpgrades && pathname === '/admin/auto-apply/users/fixture' && method === 'PUT') {
        payload = await admin.setUserLimit('admin', owner, await body(request));
      } else if (pathname === '/billing/user-catalog' && testUpgrades) {
        payload = { checkoutEnabled: false, products: ['lite', 'pro', 'scholar'].map((tier, index) => ({
          productKey: tier + '_monthly_pass', amountMinor: 500 * (index + 1), currency: 'USD',
          renewalMode: 'recurring', validityDays: null,
        })) };
      } else if (pathname === '/me/auto-apply/profile') {
        payload = method === 'PUT' ? await controller.saveProfile(owner, await body(request))
          : method === 'DELETE' ? await controller.clearProfile(owner, await body(request))
            : await controller.profile(owner, searchParams.get('includeSavedDetails') ?? undefined);
      } else if (pathname === '/me/auto-apply/allowance') {
        payload = await controller.allowance(owner);
      } else if (pathname === '/me/auto-apply/cvs') {
        payload = await controller.listCvs(owner);
      } else if (match) {
        const [, collection, id, action] = match;
        if (collection === 'opportunities') payload = await controller.opportunity(owner, id);
        else if (collection === 'applications') payload = await controller.start(owner, id, await body(request));
        else if (action === 'check-receipt') payload = await controller.checkReceipt(owner, id);
        else if (action === 'manual-submission') payload = await controller.recordManualSubmission(owner, id, await body(request));
        else if (action === 'manual-review') payload = await controller.setManualReview(owner, id, await body(request));
        else if (action === 'control') payload = await controller.controlAttempt(owner, id, await body(request));
        else if (androidUpdates && action === 'activity') payload = await controller.registerActivity(owner, id, await body(request));
        else if (action === 'retry-statement') payload = await controller.retryStatement(owner, id, await body(request));
        else if (action === 'answer') payload = await controller.answer(owner, id, await body(request));
        else if (action === 'attachment') payload = await controller.attachPdf(owner, id, await body(request));
        else if (action === 'cv') payload = await controller.selectAttemptCv(owner, id, await body(request));
        else if (action === 'cv-preview') {
          response.setHeader('Cache-Control', 'no-store');
          payload = await controller.previewCv(owner, id, await body(request));
        }
        else if (action === 'previous-answers' && method === 'GET') {
          response.setHeader('Cache-Control', 'no-store');
          payload = await controller.previousAnswers(owner, id);
        }
        else if (action === 'review') payload = await controller.saveReview(owner, id, await body(request));
        else if (action === 'approve') payload = await controller.approve(owner, id, await body(request));
        else payload = await controller.attempt(owner, id);
      } else if (pathname === '/me/applications' && method === 'POST') {
        const { opportunityId } = await body(request);
        if (!opportunities[opportunityId]) throw new Error('Only fixture opportunities can be tracked');
        const { rows } = await pool.query(`insert into opportunity_applications(user_id,opportunity_id,status)
          values($1,$2,'draft') on conflict(user_id,opportunity_id) do update set user_id = excluded.user_id
          returning id,status,version`, [owner, opportunityId]);
        payload = rows[0];
      } else if (pathname === '/me/applications' && method === 'GET') {
        const { rows } = await pool.query(`select application.id, application.opportunity_id, application.status, application.metadata,
          jsonb_build_object('title', opportunity.title, 'organization', opportunity.organization) as opportunity,
          case when attempt.id is not null then jsonb_build_object('id', attempt.id, 'state', attempt.state) end as auto_apply
          from public.opportunity_applications application
          join public.opportunities opportunity on opportunity.id = application.opportunity_id
          left join private.auto_apply_attempts attempt on attempt.application_id = application.id
          where application.user_id = $1`, [owner]);
        payload = rows;
      } else if (testTrackerSync && method === 'PATCH' && /^\/me\/applications\/[a-f\d-]+$/.test(pathname)) {
        const { status: nextStatus } = await body(request);
        if (nextStatus !== 'submitted') throw new Error('Use this fixture to record a submitted application');
        const { rows } = await pool.query(`update public.opportunity_applications
          set status = 'submitted', submitted_at = coalesce(submitted_at, now())
          where id = $1 and user_id = $2 returning id, status, metadata`, [pathname.split('/')[3], owner]);
        payload = rows[0];
      } else if (method === 'DELETE' && /^\/me\/applications\/[a-f\d-]+$/.test(pathname)) {
        payload = await applications.deleteApplication(owner, pathname.split('/')[3], searchParams.get('discardUnconfirmed') === 'true');
      } else if ((method === 'GET' && (fixtureDetailId || ['/opportunities', '/opportunities/search',
        '/opportunities/featured'].includes(pathname))) || (method === 'POST' &&
        ['/opportunities/recommendations', '/opportunities/recommendations/query'].includes(pathname))) {
        const { rows } = await pool.query(
          'select id, title, organization, application_url, status from public.opportunities order by title',
        );
        const listings = rows.map(row => ({
          ...row,
          category: row.id === supportingPdfOpportunity ? 'Internships' : row.id === cvRequiredOpportunity ? 'Scholarships' : 'Fellowships',
          location: 'Remote',
          description: 'A synthetic listing for testing application preparation, review, and receipts.',
          requirements: ['Review your details before you approve the application.'],
          source: 'manual',
        }));
        if (fixtureDetailId) {
          payload = listings.find(listing => listing.id === fixtureDetailId);
          if (!payload) throw new NotFoundException('Fixture opportunity not found');
        } else {
          const q = searchParams.get('q')?.trim().toLowerCase();
          payload = { opportunities: listings.filter(listing => !q || listing.title.toLowerCase().includes(q)) };
        }
      } else if (testDeviceUpload && pathname === '/fixture/auto-apply/institution-letter.pdf' && method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="institution-letter.pdf"', 'Cache-Control': 'no-store' });
        return response.end(institutionLetter);
      } else if (testDeviceUpload && pathname === '/uploads/file' && method === 'POST') {
        await new Promise((resolve, reject) => receiveUpload(request, response,
          error => error ? reject(new BadRequestException('Select one PDF up to 10 MB.')) : resolve()));
        payload = await deviceUploads.uploadFile(toDatabaseUserId(owner), request.file, request.body?.kind);
        status = 201;
      } else if (pathname === '/uploads' && method === 'GET') {
        payload = testDeviceUpload
          ? [...uploadedRows].map(([id, row]) => ({ id, fileName: row.file_name, mimeType: row.mime_type }))
          : fixtureDocuments.map(({ id, name }) => ({ id, fileName: name, mimeType: 'application/pdf' }));
      } else {
        payload = [];
      }
    } catch (error) {
      status = error.getStatus?.() ?? (error.code === '55P03' ? 409 : 500);
      const detail = error.getResponse?.();
      payload = typeof detail === 'object' && detail !== null ? detail : { message: error.message };
    }
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  }
  const port = await listen(api, apiPort);
  console.log(`Simulator pilot API ready at http://127.0.0.1:${port}`);
  process.once('SIGINT', async () => {
    clearInterval(tick);
    holdReceipt?.resolve();
    api.close();
    provider.close();
    portal.close();
    await browser.close();
    await pool.end();
  });
}
void main().catch(error => { console.error(error.message); process.exit(1); });
