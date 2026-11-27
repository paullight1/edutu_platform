import { createHash, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { z } from 'zod';

const text = z.string().max(16000);
const cvPreviewRequest = z.object({ value: text.refine(value => Boolean(value.trim())) }).strict();
const maxCvPreviewBytes = 512 * 1024;
const field = z.object({ label: z.string().trim().min(1).max(200), value: text });
const identity = z.object({
  id: z.string().uuid(), opportunityId: z.string().uuid(), version: z.number().int().positive(),
  catalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
const maxPdfBytes = 10 * 1024 * 1024;
const maxSupportingDocuments = 3;
const educationSources = ['school', 'degree', 'major', 'graduationYear'];
const documentMetadata = z.object({ name: z.string().regex(/^[A-Za-z0-9._-]{1,120}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const selectedDocument = documentMetadata.extend({ uploadId: z.string().uuid(), question: z.string().min(1).max(1000) });
const submittedDocument = documentMetadata.extend({ base64: z.string().max(Math.ceil(maxPdfBytes / 3) * 4) });
const prepareRequest = identity.extend({
  background: text,
  statement: text,
  contact: z.object({ name: z.string().max(200), email: z.string().max(254), phone: z.string().max(40).optional() }).optional(),
  education: z.object({
    school: z.string().max(160).optional(),
    degree: z.string().max(160).optional(),
    major: z.string().max(160).optional(),
    graduationYear: z.string().regex(/^(?:[1-9]\d{3})?$/).optional(),
  }).optional(),
  cv: z.object({
    name: z.string().trim().max(200).optional().catch(undefined),
    data: z.record(z.string(), z.unknown()),
  }).nullish(),
  answers: z.record(z.string(), z.object({ question: z.string(), answer: text, generatedByAi: z.literal(true).optional() })),
  document: selectedDocument.optional(),
  documents: z.array(selectedDocument).optional(),
});
const submitRequest = identity.extend({
  fields: z.array(field).min(1).max(60),
  mappingRevision: z.string().regex(/^[a-f0-9]{64}$/),
  document: submittedDocument.optional(),
  documents: z.array(submittedDocument.extend({ question: z.string().min(1).max(1000) })).max(maxSupportingDocuments).optional(),
});
const configuredField = z.object({
  label: field.shape.label,
  selector: z.string().min(1),
  source: z.enum(['background', 'statement', 'name', 'email', 'phone', 'answer', 'cv_pdf', 'support_pdf', ...educationSources]),
  question: z.string().trim().min(1).max(1000).optional(),
  formatHint: z.string().trim().min(1).max(400).optional(),
  control: z.enum(['text', 'select', 'radio', 'checkbox', 'multi-select']).default('text'),
  checkboxLabel: z.string().trim().min(1).max(200).optional(),
  optional: z.literal(true).optional(),
  statementContext: z.literal(true).optional(),
}).refine(item => item.control === 'text' || item.source === 'answer' || educationSources.includes(item.source))
  .refine(item => item.control !== 'multi-select' || item.source === 'answer')
  .refine(item => item.control === 'checkbox'
    ? item.source === 'answer' && !!item.checkboxLabel && !item.question
    : item.checkboxLabel === undefined)
  .refine(item => !item.optional || (item.control === 'text' && !['cv_pdf', 'support_pdf'].includes(item.source)))
  .refine(item => !item.statementContext || (item.source === 'answer' && item.control === 'text'));
const formStep = z.object({
  url: z.url(),
  fields: z.array(configuredField).min(1).max(60),
  submitSelector: z.string().min(1),
  handoffSelector: z.string().min(1).optional(),
  handoffQuestion: z.string().trim().min(1).max(1000).optional(),
  handoffPath: z.string().max(1000).startsWith('/').optional(),
});
const formSchema = z.union([
  formStep.extend({ receiptSelector: z.string().min(1), catalogUrl: z.url().optional() })
    .transform(({ receiptSelector, catalogUrl, ...step }) => ({ steps: [step], receiptSelector, catalogUrl })),
  z.object({
    steps: z.array(formStep).min(2).max(4),
    receiptSelector: z.string().min(1),
    catalogUrl: z.url().optional(),
  }),
]);
const formConfig = z.record(z.string().uuid(), formSchema);

function equal(a, b) {
  const hash = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > (request.url === '/submit' ? 16 : 1) * 1024 * 1024) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

const cvSections = [
  ['Experience', 'experience', ['role', 'company', 'location', 'start_date', 'end_date', 'description', 'highlights']],
  ['Education', 'education', ['degree', 'field', 'institution', 'start_date', 'end_date', 'gpa', 'highlights']],
  ['Projects', 'projects', ['name', 'description', 'url', 'technologies']],
  ['Achievements', 'achievements', ['title', 'issuer', 'date', 'description']],
  ['Research', 'research', ['title', 'institution', 'role', 'start_date', 'end_date', 'description']],
  ['Publications', 'publications', ['title', 'journal', 'date', 'url', 'doi', 'authors', 'description']],
];

function cvText(data) {
  if (!data) return '';
  const values = value => {
    const items = Array.isArray(value) ? value : [value];
    return items.filter(item => typeof item === 'string' || typeof item === 'number')
      .map(item => String(item).trim()).filter(Boolean);
  };
  const lines = ['full_name', 'email', 'phone', 'location', 'linkedin', 'portfolio', 'website']
    .flatMap(key => values(data.header?.[key]));
  const summary = values(data.summary);
  if (summary.length) lines.push('', 'Summary', ...summary);
  for (const [title, key, properties] of cvSections) {
    const entries = (Array.isArray(data[key]) ? data[key] : [])
      .map(item => properties.flatMap(property => values(item?.[property])))
      .filter(entry => entry.length);
    if (entries.length) lines.push('', title, ...entries.map(entry => entry.join(' · ')));
  }
  const skills = values(data.skills);
  if (skills.length) lines.push('', 'Skills', skills.join(', '));
  return lines.join('\n').trim();
}

async function cvPdf(context, value) {
  const document = await context.newPage();
  try {
    await document.setContent('<meta charset="utf-8"><style>pre{font:11pt system-ui;white-space:pre-wrap;overflow-wrap:anywhere}</style><pre></pre>');
    await document.locator('pre').evaluate((element, content) => { element.textContent = content; }, value);
    return await document.pdf({
      format: 'A4', margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });
  } finally {
    await document.close();
  }
}

class FormChanged extends Error {}
class NeedPortalHandoff extends Error {}

function mappedHandoffUrl(step) {
  if (!step) return null;
  const url = new URL(step.handoffPath ?? step.url, step.url);
  return url.origin === new URL(step.url).origin && !url.username && !url.password && !url.search &&
    (!url.hash || /^#[a-z0-9_-]{1,80}$/i.test(url.hash)) && url.href.length <= 2048 ? url.href : null;
}

class NeedChoice extends Error {
  constructor(question, choices, selectionMode) {
    super('A provider choice is required');
    this.question = question;
    this.choices = choices;
    this.selectionMode = selectionMode;
  }
}

function questionFor(item) {
  if (item.control === 'checkbox') return item.label + ' — The provider asks: ' + item.checkboxLabel;
  if (item.source === 'support_pdf') return item.question ?? 'Choose a PDF for ' + item.label + '.';
  return item.question ?? (item.source === 'cv_pdf'
    ? 'Paste the CV text you want Edutu to attach as a PDF.'
    : item.control === 'multi-select' ? 'Choose options for ' + item.label + '.'
      : item.control !== 'text' ? 'Choose an option for ' + item.label + '.'
      : 'What should Edutu enter for ' + item.label + '?');
}

function applicationPhone(value) {
  if (typeof value !== 'string') return undefined;
  const phone = value.trim();
  const digits = phone.replace(/\D/g, '').length;
  return phone.length <= 40 && /^\+?[\d ().-]+$/.test(phone) && digits >= 7 && digits <= 15 ? phone : undefined;
}

const fillableTypes = new Set([
  'text', 'search', 'tel', 'url', 'email', 'number', 'date', 'datetime-local',
  'month', 'range', 'time', 'week', 'color', 'textarea',
]);
const lengthLimitedTypes = new Set(['text', 'search', 'tel', 'url', 'email', 'textarea']);
const nativeValidationTypes = new Set(['number', 'date', 'datetime-local', 'month', 'time', 'week', 'range', 'color', 'email', 'url']);
const validationAttributes = ['min', 'max', 'step', 'minlength', 'maxlength', 'pattern', 'accept', 'multiple'];
const minimumLengthIndex = validationAttributes.indexOf('minlength');
const patternIndex = validationAttributes.indexOf('pattern');

async function readRadioGroup(input, formId) {
  return input.evaluateAll((elements, index) => {
    const form = document.forms[index];
    const first = elements[0];
    if (!form || !first?.name || elements.some(element =>
      element.type !== 'radio' || element.form !== form || element.name !== first.name)) return null;
    const controls = Array.from(form.elements);
    const group = controls.filter(element => element.type === 'radio' && element.name === first.name);
    if (group.length !== elements.length) return null;
    const options = elements.flatMap((element, choiceIndex) => element.matches(':disabled') ? [] : [{
      value: element.value,
      label: [...element.labels].map(label => label.textContent.trim()).join(' '),
      choiceIndex,
    }]);
    if (options.length < 2 || options.some(option => !option.value)) return null;
    return {
      type: 'radio', name: first.name,
      positions: elements.map(element => controls.indexOf(element)),
      label: first.closest('fieldset')?.querySelector('legend')?.textContent.trim() ?? '',
      accessibleLabels: elements.map(element => element.getAttribute('aria-label')),
      required: elements.some(element => element.required && !element.matches(':disabled')),
      options,
    };
  }, formId);
}

async function inspectStep(page, step, fields, origin) {
  const submit = page.locator(step.submitSelector);
  if (!await submit.isVisible()) throw new FormChanged();
  const formId = await submit.evaluate(button => Array.from(document.forms).indexOf(button.form));
  if (formId < 0) throw new FormChanged();

  const readControl = input => input.evaluate((element, { index, attributes }) => {
    if (element.form !== document.forms[index] || element.matches(':disabled') || !element.name) return null;
    const labels = [...(element.labels ?? [])];
    const references = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id));
    const accessibleLabel = element.getAttribute('aria-label');
    const placeholder = element.getAttribute('placeholder');
    const readLabelText = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
      if (node.nodeType !== Node.ELEMENT_NODE ||
          node.matches('input, select, textarea, button, script, style, [aria-hidden="true"]')) return '';
      return Array.from(node.childNodes, readLabelText).join('');
    };
    const labelText = label => label ? readLabelText(label).trim() : '';
    return {
      name: element.name,
      type: element.type,
      required: element.required,
      readOnly: element.readOnly === true,
      position: Array.from(element.form.elements).indexOf(element),
      label: labels.map(label => label.textContent.trim()).join(' '),
      accessibleLabel,
      labelledBy: references.map(label => label?.textContent.trim() ?? ''),
      placeholder,
      displayLabel: references.map(labelText).join(' ').trim() || accessibleLabel ||
        labels.map(labelText).join(' ').trim() || placeholder || '',
      nativeMaxLength: element.maxLength,
      checkbox: element.type === 'checkbox' ? {
        value: element.value,
        indeterminate: element.indeterminate,
        hasLinkedText: [...labels, ...references].some(label => label && (label.matches('a') || label.querySelector('a'))),
      } : undefined,
      constraints: attributes.map(attribute => element.getAttribute(attribute)),
      stepBaseValue: ['number', 'date', 'datetime-local', 'month', 'time', 'week', 'range'].includes(element.type)
        ? element.getAttribute('value') ?? undefined : undefined,
      options: ['select-one', 'select-multiple'].includes(element.type)
        ? Array.from(element.options).filter(option => option.value && !option.matches(':disabled'))
            .map(option => ({ value: option.value, label: option.label.trim() }))
        : undefined,
    };
  }, { index: formId, attributes: validationAttributes });
  const inputs = step.fields.map(item => page.locator(item.selector));
  const controls = [];
  const selectedOptions = [];
  const maxLengths = [];
  const displayLabels = [];
  for (const [index, item] of step.fields.entries()) {
    const input = inputs[index];
    if (item.control !== 'radio' && await input.count() !== 1) throw new FormChanged();
    const details = item.control === 'radio' ? await readRadioGroup(input, formId) : await readControl(input);
    if (!details || details.readOnly) throw new FormChanged();
    // The raw label remains part of the form revision so old approvals keep their existing bindings.
    const { nativeMaxLength, displayLabel, ...control } = details;
    displayLabels[index] = (displayLabel ?? control.label ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (item.optional && control.required) throw new FormChanged();
    if (lengthLimitedTypes.has(control.type) && nativeMaxLength >= 0 && nativeMaxLength < 16000) {
      if (nativeMaxLength === 0) throw new FormChanged();
      maxLengths[index] = nativeMaxLength;
    }
    controls.push(control);
    if (item.control === 'checkbox') {
      const labels = [control.label, control.accessibleLabel, control.labelledBy?.join(' ')]
        .map(label => label?.trim().replace(/\s+/g, ' ')).filter(Boolean);
      if (!control.checkbox?.value || control.checkbox.indeterminate || control.checkbox.hasLinkedText ||
          !labels.length || labels.some(label => label !== item.checkboxLabel) ||
          !(await input.isVisible())) throw new FormChanged();
      control.options = [{ label: 'Check this box', value: 'checked' }];
      if (!control.required) control.options.push({ label: 'Leave unchecked', value: 'unchecked' });
    }
    if (item.control !== 'text') {
      const expectedType = item.control === 'multi-select' ? 'select-multiple'
        : item.control === 'select' ? 'select-one' : item.control;
      if (control.type !== expectedType) throw new FormChanged();
      const options = control.options ?? [];
      const labels = options.map(option => option.label);
      if (!labels.length || labels.length > 250 || labels.some(label => !label || label.length > 200) ||
          new Set(labels).size !== labels.length || new Set(options.map(option => option.value)).size !== options.length) {
        throw new FormChanged();
      }
      if (fields && item.control === 'multi-select') {
        const selectionMode = control.required ? 'multiple_required' : 'multiple_optional';
        let selected;
        try { selected = JSON.parse(fields[index].value); } catch { /* Ask for an explicit choice. */ }
        if (fields[index].value.length > 4000 || !Array.isArray(selected) ||
            (control.required && !selected.length) || new Set(selected).size !== selected.length ||
            selected.some(label => !labels.includes(label))) {
          throw new NeedChoice(questionFor(item), labels, selectionMode);
        }
        selectedOptions[index] = options.filter(option => selected.includes(option.label));
      } else if (fields) {
        const option = options.find(option => option.label === fields[index].value);
        if (!option) throw new NeedChoice(questionFor(item), labels);
        selectedOptions[index] = option;
      }
    } else if (item.source === 'cv_pdf' || item.source === 'support_pdf') {
      if (control.type !== 'file') throw new FormChanged();
    } else if (!fillableTypes.has(control.type)) {
      throw new FormChanged();
    }
  }
  const positions = controls.flatMap(control => control.positions ?? [control.position]);
  if (new Set(positions).size !== positions.length) throw new FormChanged();
  const shape = await submit.evaluate((button, mappedPositions) => {
    const form = button.form;
    if (!form || button.type !== 'submit' || button.matches(':disabled')) return null;
    const unexpectedValue = Array.from(form.elements).some((element, position) => {
      if (mappedPositions.includes(position)) return false;
      if (element.willValidate && !element.validity.valid) return true;
      if (!element.name || element.matches(':disabled') ||
          ['hidden', 'submit', 'reset', 'button', 'image'].includes(element.type)) return false;
      if (['checkbox', 'radio'].includes(element.type)) return element.checked;
      if (element.type === 'file') return Boolean(element.files?.length);
      return Boolean(element.value);
    });
    if (unexpectedValue) return null;
    return {
      action: button.hasAttribute('formaction') ? button.formAction : form.action,
      method: button.hasAttribute('formmethod') ? button.formMethod : form.method,
      target: button.hasAttribute('formtarget') ? button.formTarget : form.target,
      encoding: button.hasAttribute('formenctype') ? button.formEnctype : form.enctype,
      submitName: button.name, submitValue: button.value,
      submitLabel: button.textContent.trim(),
      submitAccessibleLabel: button.getAttribute('aria-label'),
      noValidate: form.noValidate || button.formNoValidate,
      hiddenNames: Array.from(form.elements).filter(input => input.type === 'hidden' && input.name)
        .map(input => input.name).sort(),
    };
  }, positions);
  if (!shape || typeof shape.action !== 'string' || shape.method !== 'post' || (shape.target && shape.target !== '_self') ||
      new URL(shape.action).origin !== origin) throw new FormChanged();
  if (controls.some(control => control.type === 'file') && shape.encoding !== 'multipart/form-data') {
    throw new FormChanged();
  }
  return { submit, inputs, selectedOptions, maxLengths, displayLabels, shape: { ...shape, controls } };
}

async function invalidNativeAnswer(context, steps) {
  const candidates = [];
  let index = 0;
  for (const { step, shape, values } of steps) {
    for (const [position, item] of step.fields.entries()) {
      const { type, constraints, stepBaseValue } = shape.controls[position];
      const { value } = values[position];
      if (item.control === 'text' && fillableTypes.has(type) && value &&
          (nativeValidationTypes.has(type) || constraints[minimumLengthIndex] !== null || constraints[patternIndex] !== null)) {
        candidates.push({ index, type, constraints, stepBaseValue, value, question: questionFor(item), hint: item.formatHint });
      }
      index++;
    }
  }
  if (!candidates.length) return null;

  // Use a blank page so provider scripts never see an applicant value during preparation.
  const checker = await context.newPage();
  try {
    return await checker.evaluate(({ fields, attributes }) => {
      for (const { index, type, constraints, stepBaseValue, value, question, hint } of fields) {
        const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
        if (input instanceof HTMLInputElement) input.type = type;
        for (const [position, name] of attributes.entries()) {
          if (constraints[position] !== null) input.setAttribute(name, constraints[position]);
        }
        if (stepBaseValue !== undefined) input.setAttribute('value', stepBaseValue);
        input.value = value;
        if (input.value === value && input.validity.valid &&
            (input.minLength <= 0 || input.value.length >= input.minLength)) continue;
        const fallback = input.value !== value
          ? (type === 'date' ? 'Enter a date in YYYY-MM-DD format.' : 'Enter a value in the format requested by the provider.')
          : input.validity.valid ? `Enter at least ${input.minLength} characters.` : input.validationMessage;
        return { index, question, hint: (hint || fallback).slice(0, 400) };
      }
      return null;
    }, { fields: candidates, attributes: validationAttributes });
  } finally {
    await checker.close();
  }
}

async function fillApprovedStep(context, step, fields, inspected, supportingPdfs) {
  for (const [index, item] of step.fields.entries()) {
    const input = inspected.inputs[index];
    const value = fields[index].value;
    if (item.control === 'multi-select') {
      await input.selectOption(inspected.selectedOptions[index].map(option => ({ value: option.value })));
    } else if (item.control === 'select') {
      await input.selectOption({ value: inspected.selectedOptions[index].value });
    } else if (item.control === 'radio') {
      await input.nth(inspected.selectedOptions[index].choiceIndex).check();
    } else if (item.control === 'checkbox') {
      await input.setChecked(inspected.selectedOptions[index].value === 'checked');
    } else if (item.source === 'cv_pdf') {
      const buffer = await cvPdf(context, value);
      await input.setInputFiles({ name: 'edutu-cv.pdf', mimeType: 'application/pdf', buffer });
    } else if (item.source === 'support_pdf') {
      const supportingPdf = supportingPdfs.get(questionFor(item));
      await input.setInputFiles({ name: supportingPdf.name, mimeType: 'application/pdf', buffer: supportingPdf.bytes });
    } else if (value !== '' || !item.optional) {
      await input.fill(value);
    }
  }

  for (const [index, item] of step.fields.entries()) {
    if (item.control === 'radio') {
      const option = inspected.selectedOptions[index];
      const checked = await inspected.inputs[index].evaluateAll(elements => elements.flatMap((element, choiceIndex) =>
        element.checked && !element.matches(':disabled') && element.validity.valid ? [choiceIndex] : []));
      if (checked.length !== 1 || checked[0] !== option.choiceIndex) throw new FormChanged();
      continue;
    }
    if (item.control === 'multi-select') {
      const expected = inspected.selectedOptions[index].map(option => option.value);
      const actual = await inspected.inputs[index].evaluate(element => ({
        selected: Array.from(element.selectedOptions, option => option.value),
        valid: element.validity.valid,
      }));
      if (!actual.valid || actual.selected.length !== expected.length ||
          actual.selected.some(value => !expected.includes(value))) throw new FormChanged();
      continue;
    }
    const actual = await inspected.inputs[index].evaluate(element => ({
      value: element.value, label: element.selectedOptions?.[0]?.label.trim(),
      filename: element.files?.[0]?.name, valid: element.validity?.valid,
      checked: element.checked, indeterminate: element.indeterminate,
    }));
    const expectedValue = item.control === 'checkbox'
      ? (actual.checked ? 'Check this box' : 'Leave unchecked')
      : item.control === 'select' ? actual.label : actual.value;
    const matches = item.source === 'cv_pdf' ? actual.filename === 'edutu-cv.pdf'
      : item.source === 'support_pdf' ? actual.filename === supportingPdfs.get(questionFor(item)).name : expectedValue === fields[index].value;
    if (!actual.valid || actual.indeterminate || !matches) throw new FormChanged();
  }
}

export function createBrowserProvider({ browser, forms, token, receiptsDirectory, allowLocalFixture = false }) {
  if (!token || !receiptsDirectory) throw new Error('Set the provider token and receipt directory');
  const configuration = formConfig.parse(forms);
  const catalogFingerprints = new Map();
  if (!Object.keys(configuration).length) throw new Error('Configure at least one approved form');
  for (const [id, form] of Object.entries(configuration)) {
    if (form.catalogUrl) {
      const catalog = new URL(form.catalogUrl);
      if (catalog.protocol !== 'https:' || catalog.username || catalog.password) {
        throw new Error('Configure catalog URLs with HTTPS and without credentials');
      }
      catalog.hash = '';
      catalogFingerprints.set(id, createHash('sha256').update(catalog.href).digest('hex'));
    }
    const origin = new URL(form.steps[0].url).origin;
    const mappedFields = form.steps.flatMap(step => step.fields);
    const labels = mappedFields.map(item => item.label);
    const questions = mappedFields.map(questionFor);
    if (mappedFields.filter(item => item.source === 'support_pdf').length > maxSupportingDocuments) {
      throw new Error('Configure up to three supporting PDFs per application');
    }
    if (labels.length > 60 || new Set(labels).size !== labels.length) {
      throw new Error('Configure up to 60 fields with distinct labels across all steps');
    }
    if (new Set(questions).size !== questions.length) {
      throw new Error('Configure distinct question text for each mapped field');
    }
    for (const step of form.steps) {
      const url = new URL(step.url);
      const local = allowLocalFixture && url.protocol === 'http:' && url.hostname === '127.0.0.1';
      if ((!local && url.protocol !== 'https:') || url.origin !== origin || url.username || url.password || url.hash) {
        throw new Error('Configure approved same-origin HTTPS form URLs without credentials or fragments');
      }
      if (step.handoffPath && !mappedHandoffUrl(step)) {
        throw new Error('Configure handoff paths on the approved origin without query parameters');
      }
      if (new Set(step.fields.map(item => item.selector)).size !== step.fields.length) {
        throw new Error('Each field in a step needs a distinct selector');
      }
    }
  }

  let healthy = true;
  async function ready() {
    try {
      await access(receiptsDirectory, constants.R_OK | constants.W_OK | constants.X_OK);
      return healthy && browser.isConnected();
    } catch {
      return false;
    }
  }

  function quarantineBrowser() {
    healthy = false;
    void browser.close().catch(() => {});
  }

  let busy = false;
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000, connectionsCheckingInterval: 5000 }, async (request, response) => {
    const reply = (status, payload) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(payload));
    };
    let send = reply;
    if (request.method === 'GET' && request.url === '/healthz') {
      if (await ready()) return send(200, { status: 'ready' });
      return send(503, { status: 'unavailable' });
    }
    if (!equal(request.headers.authorization ?? '', 'Bearer ' + token)) return send(401, {});
    const capabilitiesRoute = /^\/capabilities\/([a-f\d-]+)$/i.exec(request.url ?? '');
    if (request.method === 'GET' && capabilitiesRoute) {
      const id = identity.shape.opportunityId.safeParse(capabilitiesRoute[1]);
      if (!id.success || !Object.hasOwn(configuration, id.data)) return send(404, {});
      if (!await ready()) return send(503, { status: 'unavailable' });
      const catalogFingerprint = catalogFingerprints.get(id.data);
      return send(200, { status: 'ready', opportunityId: id.data, ...(catalogFingerprint ? { catalogFingerprint } : {}) });
    }
    const receiptRoute = /^\/receipt\/([a-f\d-]+)$/i.exec(request.url ?? '');
    if (request.method === 'GET' && receiptRoute) {
      const id = identity.shape.id.safeParse(receiptRoute[1]);
      if (!id.success) return send(404, {});
      try {
        const saved = JSON.parse(await readFile(join(receiptsDirectory, id.data), 'utf8'));
        if (typeof saved.receipt === 'string' && saved.receipt.trim() && saved.receipt.length <= 500) {
          return send(200, { receipt: saved.receipt });
        }
      } catch {
        // An absent or incomplete reservation is not proof of submission.
      }
      return send(404, {});
    }
    const submitting = request.url === '/submit';
    const previewingCv = request.url === '/preview-cv';
    const verifyRoute = request.method === 'GET' && /^\/verify\/([a-f\d-]+)$/i.exec(request.url ?? '');
    if (!verifyRoute && (request.method !== 'POST' || (!submitting && !previewingCv && request.url !== '/prepare'))) return send(404, {});
    if (verifyRoute && !await ready()) return send(503, { code: 'provider_unavailable' });
    if (!healthy || !browser.isConnected()) return send(503, { code: 'provider_unavailable' });
    if (busy) return send(503, { code: 'provider_busy' });
    busy = true;
    let verificationReply;
    if (verifyRoute) {
      // A start can reverify immediately after the opportunity screen receives
      // this response. Release the browser slot before replying.
      send = (status, payload) => { verificationReply = [status, payload]; };
    }
    let context;
    let reservation;
    let digest;
    let receiptFile;
    let writesStarted = false;
    let blockedNavigation = false;
    let activeStep;
    let catalogFingerprint;
    let verifiedOpportunityId;
    let stepNumber = 0;
    let browserDeadline;
    try {
      if (previewingCv) {
        const preview = cvPreviewRequest.safeParse(await readJson(request));
        if (!preview.success) return send(400, {});
        browserDeadline = setTimeout(quarantineBrowser, 8000);
        context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
        const pdf = await cvPdf(context, preview.data.value);
        if (pdf.length > maxCvPreviewBytes) return send(413, {});
        response.writeHead(200, {
          'Content-Type': 'application/pdf', 'Content-Length': pdf.length, 'Cache-Control': 'no-store',
        });
        response.end(pdf);
        return;
      }
      let job;
      let opportunityId;
      if (verifyRoute) {
        const id = identity.shape.opportunityId.safeParse(verifyRoute[1]);
        if (!id.success) return send(404, {});
        opportunityId = id.data;
        verifiedOpportunityId = opportunityId;
      } else {
        const parsed = (submitting ? submitRequest : prepareRequest).safeParse(await readJson(request));
        if (!parsed.success) return send(400, {});
        job = parsed.data;
        opportunityId = job.opportunityId;
      }
      const form = configuration[opportunityId];
      if (!form) return send(404, {});
      catalogFingerprint = catalogFingerprints.get(opportunityId);
      if (job && catalogFingerprint && job.catalogFingerprint !== catalogFingerprint) {
        return send(409, { code: 'mapping_changed' });
      }
      const configuredFields = form.steps.flatMap(step => step.fields);
      const documentFields = configuredFields.filter(item => item.source === 'support_pdf');
      const originalCvText = job && !submitting ? cvText(job.cv?.data) : '';
      let fields;
      const supportingPdfs = new Map();
      let selectedDocuments;
      let documentQuestion;
      let statementQuestion;
      let statementMaxLength;
      if (verifyRoute) {
        fields = null;
      } else if (submitting) {
        if (request.headers['idempotency-key'] !== job.id) return send(400, {});
        fields = job.fields;
        if (fields.length !== configuredFields.length || fields.some((item, index) => item.label !== configuredFields[index].label)) {
          return send(409, {});
        }
        const files = job.documents ?? (job.document && documentFields.length === 1
          ? [{ ...job.document, question: questionFor(documentFields[0]) }] : []);
        if ((job.document && job.documents) || files.length !== documentFields.length) throw new FormChanged();
        let totalBytes = 0;
        for (const document of files) {
          const index = configuredFields.findIndex(item => item.source === 'support_pdf' && questionFor(item) === document.question);
          if (index < 0 || supportingPdfs.has(document.question) || document.name !== fields[index].value) throw new FormChanged();
          const bytes = Buffer.from(document.base64, 'base64');
          totalBytes += bytes.length;
          if (totalBytes > maxPdfBytes || bytes.subarray(0, 5).toString() !== '%PDF-' ||
              createHash('sha256').update(bytes).digest('hex') !== document.sha256) throw new FormChanged();
          supportingPdfs.set(document.question, { name: document.name, bytes });
        }
        receiptFile = join(receiptsDirectory, job.id);
        const document = job.document ? { name: job.document.name, sha256: job.document.sha256 } : undefined;
        const { catalogFingerprint: _, ...receiptJob } = job;
        const documents = job.documents?.map(({ name, sha256, question }) => ({ name, sha256, question }));
        digest = createHash('sha256').update(JSON.stringify({ ...receiptJob, document, documents })).digest('hex');
        let existing;
        try {
          existing = await readFile(receiptFile, 'utf8');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (existing !== undefined) {
          try {
            const saved = JSON.parse(existing);
            if (saved.digest === digest && saved.receipt) return send(200, { receipt: saved.receipt });
          } catch {
            // An existing reservation without a receipt has an unknown outcome.
          }
          return send(409, {});
        }
      } else {
        selectedDocuments = new Map((job.documents ?? (job.document ? [job.document] : [])).map(document => [document.question, document]));
        const profile = {
          background: job.background,
          statement: configuredFields.filter(item => item.source === 'statement').length === 1 ? job.statement : '',
          name: job.contact?.name || job.cv?.data.header?.full_name,
          email: job.contact?.email || job.cv?.data.header?.email,
          phone: applicationPhone(job.contact?.phone) ?? applicationPhone(job.cv?.data.header?.phone),
          cv_pdf: originalCvText,
          ...job.education,
        };
        fields = [];
        const savedAnswers = Object.values(job.answers);
        for (const item of configuredFields) {
          const question = questionFor(item);
          if (item.source === 'support_pdf') {
            const document = selectedDocuments.get(question);
            if (!document) documentQuestion ??= question;
            fields.push({ label: item.label, value: document?.name ?? '' });
            continue;
          }
          const answer = savedAnswers.findLast(entry => entry.question === question);
          const value = answer?.answer ?? profile[item.source] ?? '';
          if (item.control === 'text' && (typeof value !== 'string' || (!item.optional && !value.trim()) || value.length > 16000)) {
            if (item.source === 'statement') {
              statementQuestion ??= { question, index: fields.length };
              fields.push({ label: item.label, value: '' });
              continue;
            }
            return send(200, { state: 'needs_input', question,
              ...(item.source === 'cv_pdf' ? { cvRequested: true } : {}),
              ...(item.source === 'phone' && !value ? { savePhoneOffered: true } : {}),
            });
          }
          fields.push({
            label: item.label,
            value: item.optional && !value.trim() ? '' : value,
            ...(item.source === 'statement' && answer?.generatedByAi ? { generatedByAi: true } : {}),
          });
        }
      }

      const expected = new URL(form.steps[0].url);
      browserDeadline = setTimeout(quarantineBrowser, submitting ? 50_000 : 22_000);
      context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
      let allowedPost = null;
      const page = await context.newPage();
      await context.routeWebSocket('**/*', socket => socket.close());
      await context.route('**/*', route => {
        try {
          if (route.request().frame() === page.mainFrame()) return route.continue();
        } catch {
          // Workers and early popup requests can lack a frame.
        }
        return route.abort();
      });
      // Playwright routes only the first URL in a redirect chain. Chromium pauses every hop.
      const network = await context.newCDPSession(page);
      const { frameTree } = await network.send('Page.getFrameTree');
      network.on('Fetch.requestPaused', ({ requestId, request, resourceType, frameId, redirectedRequestId }) => {
        const url = new URL(request.url);
        const sameOrigin = url.origin === expected.origin && url.protocol === expected.protocol && !url.username && !url.password;
        const mainFrame = frameId === frameTree.frame.id;
        const readOnly = request.method === 'GET' || request.method === 'HEAD';
        const approvedPost = !redirectedRequestId && request.method === 'POST' &&
          resourceType === 'Document' && url.href === allowedPost;
        if (sameOrigin && mainFrame && (readOnly || approvedPost)) {
          if (approvedPost) allowedPost = null;
          void network.send('Fetch.continueRequest', { requestId }).catch(() => {});
        } else {
          if (mainFrame && resourceType === 'Document') blockedNavigation = true;
          void network.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
        }
      });
      await network.send('Fetch.enable', { patterns: [{ requestStage: 'Request' }] });
      page.setDefaultTimeout(5000);
      const receipt = page.locator(form.receiptSelector);
      const inspect = async (step, values, navigate) => {
        activeStep = step;
        const stepUrl = new URL(step.url).href;
        let status;
        if (navigate) {
          const portal = await page.goto(stepUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
          status = portal?.status();
        } else await page.waitForURL(stepUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
        if (new URL(page.url()).origin !== expected.origin) throw new FormChanged();
        if (step.handoffSelector && await page.locator(step.handoffSelector).filter({ visible: true }).first().isVisible()) {
          throw new NeedPortalHandoff(step.handoffQuestion);
        }
        if (status >= 500 || status === 408 || status === 429) throw new Error('The portal is temporarily unavailable');
        if (status >= 400 || page.url() !== stepUrl || await receipt.isVisible()) throw new FormChanged();
        return inspectStep(page, step, values, expected.origin);
      };

      // Review every page without putting learner values into the portal DOM.
      const steps = [];
      let fieldIndex = 0;
      for (const step of form.steps) {
        stepNumber++;
        const values = fields?.slice(fieldIndex, fieldIndex + step.fields.length) ?? null;
        const inspected = await inspect(step, values, true);
        if (statementQuestion && statementQuestion.index >= fieldIndex &&
            statementQuestion.index < fieldIndex + step.fields.length) {
          statementMaxLength = inspected.maxLengths[statementQuestion.index - fieldIndex];
        }
        fieldIndex += step.fields.length;
        steps.push({ step, values, ...inspected });
      }
      const mappingRevision = createHash('sha256')
        .update(JSON.stringify({ form, shapes: steps.map(step => step.shape) })).digest('hex');
      if (blockedNavigation) throw new NeedPortalHandoff();
      if (verifyRoute) {
        return send(200, {
          status: 'verified', opportunityId, destinationHost: expected.host, steps: steps.length,
          mappingRevision, ...(catalogFingerprint ? { catalogFingerprint } : {}),
        });
      }
      if (submitting && job.mappingRevision !== mappingRevision) throw new FormChanged();
      const invalid = await invalidNativeAnswer(context, steps);
      if (invalid) {
        return submitting
          ? send(409, { code: 'invalid_review_answer', fieldIndex: invalid.index, hint: invalid.hint })
          : send(200, { state: 'needs_input', question: invalid.question, answerHint: invalid.hint });
      }
      if (!submitting) {
        if (documentQuestion) return send(200, { state: 'needs_input', question: documentQuestion, attachmentRequired: true });
        if (statementQuestion) {
          const statementContextQuestions = configuredFields.filter(field => field.statementContext).map(questionFor).slice(0, 8);
          return send(200, { state: 'needs_input', question: statementQuestion.question, draftStatement: true,
            ...(statementMaxLength ? { statementMaxLength } : {}),
            ...(statementContextQuestions.length ? { statementContextQuestions } : {}),
          });
        }
        const review = steps.flatMap(({ step, values, shape, maxLengths, displayLabels }, pageIndex) => values.map((value, index) => {
          const control = shape.controls[index];
          const options = control.options;
          const item = step.fields[index];
          const providerLabel = item.control === 'checkbox' ? item.checkboxLabel : displayLabels[index];
          const reviewed = { ...value,
            ...(providerLabel && providerLabel !== value.label ? { providerLabel } : {}),
            ...(steps.length > 1 ? { providerPage: { number: pageIndex + 1, total: steps.length } } : {}),
          };
          if (item.source === 'cv_pdf') {
            const sourceName = value.value === originalCvText ? job.cv?.name : undefined;
            return { ...reviewed, attachment: { type: 'pdf', ...(sourceName ? { sourceName } : {}) } };
          }
          if (item.source === 'support_pdf') {
            const question = questionFor(item);
            return { ...reviewed, attachment: { type: 'pdf', uploadId: selectedDocuments.get(question).uploadId,
              ...(documentFields.length > 1 ? { question } : {}) } };
          }
          if (options) return { ...reviewed, choices: options.map(option => option.label),
            ...(item.control === 'multi-select' ? {
              selectionMode: control.required ? 'multiple_required' : 'multiple_optional',
            } : {}),
          };
          return { ...reviewed, ...(maxLengths[index] ? { maxLength: maxLengths[index] } : {}),
            ...(item.optional ? { optional: true } : {}) };
        }));
        return send(200, { state: 'needs_review', fields: review, mappingRevision, destinationHost: expected.host });
      }
      if (steps.some(({ values, maxLengths }) => maxLengths.some((limit, index) => values[index].value.length > limit))) {
        throw new FormChanged();
      }
      if (steps.some(({ step, values }) => step.fields.some((item, index) => !item.optional && !values[index].value.trim()))) {
        throw new FormChanged();
      }

      for (const [index, { step, values, shape }] of steps.entries()) {
        const inspected = steps.length === 1
          ? steps[0]
          : await inspect(step, values, index === 0);
        if (JSON.stringify(inspected.shape) !== JSON.stringify(shape)) throw new FormChanged();
        await fillApprovedStep(context, step, values, inspected, supportingPdfs);
        const filled = await inspectStep(page, step, values, expected.origin);
        if (blockedNavigation || JSON.stringify(filled.shape) !== JSON.stringify(shape)) throw new FormChanged();
        if (index === 0) {
          await mkdir(receiptsDirectory, { recursive: true, mode: 0o700 });
          try {
            reservation = await open(receiptFile, 'wx', 0o600);
          } catch (error) {
            if (error.code === 'EEXIST') return send(409, {});
            throw error;
          }
          if (process.platform === 'linux') {
            const directory = await open(receiptsDirectory, 'r');
            try {
              await directory.sync();
            } finally {
              await directory.close();
            }
          }
        }
        allowedPost = shape.action;
        writesStarted = true;
        await filled.submit.click();
        if (blockedNavigation || allowedPost !== null) throw new FormChanged();
      }
      await receipt.waitFor({ state: 'visible' });
      const reference = (await receipt.innerText()).trim();
      if (blockedNavigation || !reference || reference.length > 500 || new URL(page.url()).origin !== expected.origin) return send(502, {});
      await reservation.writeFile(JSON.stringify({ receipt: reference, digest }));
      await reservation.sync();
      return send(200, { receipt: reference });
    } catch (error) {
      if (!response.headersSent) {
        if (verifyRoute) {
          if (error instanceof NeedPortalHandoff || blockedNavigation) {
            return send(409, { code: 'provider_handoff', step: stepNumber, opportunityId: verifiedOpportunityId,
              ...(catalogFingerprint ? { catalogFingerprint } : {}) });
          }
          if (error instanceof FormChanged) return send(409, { code: 'mapping_changed', step: stepNumber });
          return send(502, { code: 'provider_unavailable', step: stepNumber });
        }
        if (error instanceof NeedChoice && !submitting) {
          return send(200, { state: 'needs_input', question: error.question, choices: error.choices,
            ...(error.selectionMode ? { selectionMode: error.selectionMode } : {}),
          });
        }
        if ((error instanceof NeedPortalHandoff || blockedNavigation) && !writesStarted && !reservation) {
          const handoffUrl = mappedHandoffUrl(activeStep);
          return send(submitting ? 409 : 200, {
            ...(submitting ? { code: 'provider_handoff' } : { state: 'needs_input', handoffRequired: true }),
            question: (error instanceof NeedPortalHandoff && error.message) ||
              'This provider requires you to continue on its website.',
            ...(handoffUrl ? { handoffUrl, ...(catalogFingerprint ? { handoffCatalogFingerprint: catalogFingerprint } : {}) } : {}),
          });
        }
        if ((error instanceof FormChanged || error instanceof NeedChoice) && !writesStarted) return send(409, { code: 'mapping_changed' });
        send(502, {});
      }
    } finally {
      clearTimeout(browserDeadline);
      const cleanupDeadline = new AbortController();
      try {
        const closed = await Promise.race([
          Promise.allSettled([context?.close(), reservation?.close()]).then(() => true),
          delay(5000, false, { signal: cleanupDeadline.signal }),
        ]);
        if (!closed) quarantineBrowser();
      } finally {
        cleanupDeadline.abort();
        busy = false;
        if (verificationReply) reply(...verificationReply);
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {
    AUTO_APPLY_FORMS_FILE: formsFile, AUTO_APPLY_PROVIDER_TOKEN: token,
    AUTO_APPLY_RECEIPTS_DIR: receiptsDirectory, AUTO_APPLY_PROVIDER_PORT: port = '7718',
    AUTO_APPLY_PROVIDER_BIND_HOST: host = '127.0.0.1', CHROME_PATH: chromePath,
    AUTO_APPLY_BUNDLED_CHROMIUM: bundledChromium,
  } = process.env;
  if (!formsFile || !token || !receiptsDirectory || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Set the provider mappings, token, receipt directory, and a valid port');
  }
  const forms = JSON.parse(await readFile(formsFile, 'utf8'));
  if (process.env.AUTO_APPLY_REQUIRE_RECEIPT_MOUNT === 'true') {
    const directory = await realpath(receiptsDirectory);
    const mounts = await readFile('/proc/self/mountinfo', 'utf8');
    const isMounted = mounts.split('\n').some(line => line.split(' ')[4]
      ?.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8))) === directory);
    if (!isMounted) throw new Error('Mount persistent storage at the provider receipt directory');
  } else {
    await mkdir(receiptsDirectory, { recursive: true, mode: 0o700 });
  }
  await access(receiptsDirectory, constants.R_OK | constants.W_OK | constants.X_OK);
  const browserEnv = Object.fromEntries(['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'SystemRoot', 'TEMP', 'USERPROFILE']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const browser = await chromium.launch({
    executablePath: chromePath,
    channel: bundledChromium === 'true' || chromePath ? undefined : 'chrome',
    chromiumSandbox: true,
    env: browserEnv,
  });
  let server;
  try {
    server = createBrowserProvider({ browser, forms, token, receiptsDirectory });
  } catch (error) {
    await browser.close();
    throw error;
  }
  let stopping = false;
  const stop = () => {
    stopping = true;
    server.close(() => { void browser.close(); });
  };
  browser.once('disconnected', () => {
    if (stopping) return;
    console.error('Auto Apply browser disconnected');
    process.exitCode = 1;
    stop();
  });
  server.once('error', error => {
    console.error('Auto Apply listener failed:', error.code);
    process.exitCode = 1;
    stop();
  });
  server.listen(Number(port), host);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, stop);
  }
}
