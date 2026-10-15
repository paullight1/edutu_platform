#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function evaluateMobileAudit(report, exceptions = [], now = new Date()) {
  const vulnerabilities =
    report && typeof report === 'object' && report.vulnerabilities && typeof report.vulnerabilities === 'object'
      ? report.vulnerabilities
      : {};

  const blocking = new Set();
  const accepted = new Set();
  const today = now.toISOString().slice(0, 10);

  for (const [name, finding] of Object.entries(vulnerabilities)) {
    const advisories = Array.isArray(finding?.via)
      ? finding.via.filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            (item.severity === 'high' || item.severity === 'critical'),
        )
      : [];

    for (const advisory of advisories) {
      const url = typeof advisory.url === 'string' ? advisory.url : '';
      const label = `${name} (${url || 'advisory URL missing'})`;
      const exception = exceptions.find(
        (candidate) => candidate?.package === name && candidate?.url === url,
      );
      const exceptionIsValid =
        exception &&
        /^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn) &&
        exception.expiresOn > today &&
        typeof exception.scope === 'string' &&
        exception.scope.trim().length > 0 &&
        typeof exception.reason === 'string' &&
        exception.reason.trim().length > 0;

      if (exceptionIsValid) accepted.add(label);
      else blocking.add(label);
    }
  }

  return {
    ok: blocking.size === 0,
    blocking: [...blocking].sort(),
    accepted: [...accepted].sort(),
  };
}

function runAudit() {
  const here = dirname(fileURLToPath(import.meta.url));
  const mobileDir = resolve(here, '..', 'edutumobile');
  const audit = spawnSync('npm', ['audit', '--json'], {
    cwd: mobileDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (!audit.stdout?.trim()) {
    console.error('Mobile npm audit produced no JSON output.');
    if (audit.stderr) console.error(audit.stderr.trim());
    process.exitCode = 1;
    return;
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch (error) {
    console.error('Unable to parse mobile npm audit JSON.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  let exceptions;
  try {
    const exceptionFile = resolve(
      here,
      '..',
      'docs',
      'security',
      'mobile-audit-exceptions.json',
    );
    exceptions = JSON.parse(readFileSync(exceptionFile, 'utf8')).exceptions;
    if (!Array.isArray(exceptions)) {
      throw new Error('The exceptions field must be an array.');
    }
  } catch (error) {
    console.error('Unable to load security/mobile-audit-exceptions.json.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const evaluated = evaluateMobileAudit(report, exceptions);

  if (!evaluated.ok) {
    console.error(
      `Blocking mobile high/critical advisories: ${evaluated.blocking.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Mobile security audit passed its high/critical advisory policy.');
  if (evaluated.accepted.length) {
    console.warn(
      `Accepted temporary, scoped advisories: ${evaluated.accepted.join(', ')}`,
    );
  }
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) runAudit();
