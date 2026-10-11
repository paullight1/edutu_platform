#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function evaluateMobileAudit(report) {
  const vulnerabilities =
    report && typeof report === 'object' && report.vulnerabilities && typeof report.vulnerabilities === 'object'
      ? report.vulnerabilities
      : {};

  const blocking = [];

  for (const [name, finding] of Object.entries(vulnerabilities)) {
    const severity = finding?.severity;
    if (severity !== 'high' && severity !== 'critical') continue;
    blocking.push(name);
  }

  return {
    ok: blocking.length === 0,
    blocking: blocking.sort(),
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

  const result = evaluateMobileAudit(report);

  if (!result.ok) {
    console.error(
      `Blocking mobile high/critical vulnerabilities: ${result.blocking.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Mobile security audit passed the production policy.');
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) runAudit();
