#!/usr/bin/env python3
"""Read-only Edutu skill routing, pack validation, and evidence drift checks.

Python 3.11+ standard library only. No network, package-script execution,
repository writes, skill installation, or model calls are performed.
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import re
import sys
import tomllib
from pathlib import Path, PurePosixPath
from typing import Any


class InvalidInput(ValueError):
    """An input cannot be trusted or interpreted safely."""


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise InvalidInput(f'duplicate JSON key: {key}')
        result[key] = value
    return result


def relative(value: str) -> str:
    if not isinstance(value, str) or not value or '\\' in value or ':' in value:
        raise InvalidInput('expected a repository-relative POSIX path')
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise InvalidInput('control characters are not allowed in paths')
    parts = value.split('/')
    if value.startswith('/') or any(part in ('', '.', '..') for part in parts):
        raise InvalidInput('absolute, empty, or traversal path segment')
    return PurePosixPath(value).as_posix()


def safe_file(root: Path, value: str) -> Path:
    path = root
    for part in relative(value).split('/'):
        if part == '.git' or part == '.env' or part.startswith('.env.'):
            raise InvalidInput('secret and Git-internal files are excluded')
        path = path / part
        if path.is_symlink():
            raise InvalidInput(f'symlink is not allowed: {value}')
    if not path.resolve().is_relative_to(root.resolve()):
        raise InvalidInput('path escapes repository root')
    return path


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_object)
    if not isinstance(value, dict):
        raise InvalidInput(f'expected a JSON object: {path.name}')
    return value


def nonempty_list(value: Any, field: str) -> list[Any]:
    if not isinstance(value, list) or not value:
        raise InvalidInput(f'{field} must be a nonempty list')
    return value


def load_registry(root: Path) -> dict[str, Any]:
    reg = read_json(safe_file(root, 'agent-system/registry.json'))
    if reg.get('schema_version') != 1:
        raise InvalidInput('unsupported registry schema_version')
    if type(reg.get('max_concurrent_agents')) is not int or not 1 <= reg['max_concurrent_agents'] <= 3:
        raise InvalidInput('max_concurrent_agents must be between 1 and 3')
    ids: dict[str, set[str]] = {}
    for group in ('agents', 'skills', 'components'):
        ids[group] = set()
        for entry in nonempty_list(reg.get(group), group):
            if not isinstance(entry, dict):
                raise InvalidInput(f'{group} entries must be objects')
            name = entry.get('id', '')
            if not isinstance(name, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) or len(name) > 64:
                raise InvalidInput(f'invalid {group} identifier')
            if name in ids[group]:
                raise InvalidInput(f'duplicate {group} identifier: {name}')
            ids[group].add(name)
            key = 'manifest' if group == 'components' else 'path'
            safe_file(root, entry.get(key, ''))
            if group == 'components' and not entry[key].endswith('/package.json'):
                raise InvalidInput('component manifest must be a package.json')
    for skill in reg['skills']:
        if skill.get('agent') not in ids['agents'] or type(skill.get('managed')) is not bool:
            raise InvalidInput(f'invalid agent or managed flag for {skill["id"]}')
        for field in ('globs', 'keywords'):
            if not isinstance(skill.get(field), list) or not all(isinstance(x, str) and x for x in skill[field]):
                raise InvalidInput(f'invalid {field} for {skill["id"]}')
        for pattern in skill['globs']:
            relative(pattern)
    defaults = reg.get('defaults')
    if not isinstance(defaults, dict):
        raise InvalidInput('defaults must be an object')
    for intent in ('inspect', 'change', 'review', 'curate'):
        for name in nonempty_list(defaults.get(intent), f'defaults.{intent}'):
            if not isinstance(name, str) or name not in ids['skills']:
                raise InvalidInput(f'unknown default skill for {intent}')
    return reg


def skill_metadata(text: str) -> dict[str, str]:
    lines = text.splitlines()
    if not lines or lines[0] != '---' or '---' not in lines[1:]:
        raise InvalidInput('missing skill frontmatter')
    meta: dict[str, str] = {}
    for line in lines[1:lines.index('---', 1)]:
        key, sep, value = line.partition(':')
        if key not in ('name', 'description'):
            continue
        if not sep or key in meta:
            raise InvalidInput('invalid or duplicate skill metadata')
        value = value.strip()
        meta[key] = json.loads(value) if value.startswith('"') else value
    if not all(isinstance(meta.get(k), str) and meta[k].strip() for k in ('name', 'description')):
        raise InvalidInput('skill name and description are required')
    if len(meta['description']) > 1024:
        raise InvalidInput('skill description is too long')
    return meta


def validate(root: Path, reg: dict[str, Any], pack_only: bool) -> dict[str, Any]:
    errors: list[str] = []
    skipped: list[str] = []
    for skill in reg['skills']:
        if pack_only and not skill['managed']:
            skipped.append(skill['path'])
            continue
        try:
            text = safe_file(root, skill['path']).read_text(encoding='utf-8')
            if skill['managed']:
                if skill_metadata(text)['name'] != skill['id']:
                    raise InvalidInput('skill name differs from registry')
                for heading in ('## Workflow', '## Evidence', '## Stop conditions'):
                    if heading not in text:
                        raise InvalidInput(f'missing {heading}')
        except (OSError, ValueError) as exc:
            errors.append(f'{skill["path"]}: {exc}')
    for agent in reg['agents']:
        try:
            data = tomllib.loads(safe_file(root, agent['path']).read_text(encoding='utf-8'))
            if data.get('name') != agent['id']:
                raise InvalidInput('agent name differs from registry')
            for key in ('description', 'developer_instructions'):
                if not isinstance(data.get(key), str) or not data[key].strip():
                    raise InvalidInput(f'missing {key}')
            if data.get('sandbox_mode') not in ('read-only', 'workspace-write'):
                raise InvalidInput('agent must declare a bounded sandbox mode')
            if 'agent-system/README.md' not in data['developer_instructions']:
                raise InvalidInput('agent must reference shared operating contract')
            if 'mcp_servers' in data or 'approval_policy' in data:
                raise InvalidInput('permission overrides require separate maintainer review')
        except (OSError, ValueError) as exc:
            errors.append(f'{agent["path"]}: {exc}')
    try:
        config = tomllib.loads(safe_file(root, '.codex/config.toml').read_text(encoding='utf-8'))
        if config.get('agents', {}).get('max_concurrent_threads_per_session') != reg['max_concurrent_agents']:
            raise InvalidInput('agent concurrency differs from registry')
    except (OSError, ValueError) as exc:
        errors.append(f'.codex/config.toml: {exc}')
    for component in reg['components']:
        if pack_only:
            skipped.append(component['manifest'])
        else:
            try:
                read_json(safe_file(root, component['manifest']))
            except (OSError, ValueError) as exc:
                errors.append(f'{component["manifest"]}: {exc}')
    return {'status': 'fail' if errors else 'pass',
            'scope': 'pack-only' if pack_only else 'registered-files',
            'errors': errors, 'skipped': skipped,
            'note': 'Structural checks are not model-behavior tests or application verification.'}


def recommend(reg: dict[str, Any], paths: list[str], task: str, intent: str) -> dict[str, Any]:
    paths = list(dict.fromkeys(relative(path) for path in paths))
    matched: set[str] = set()
    selected: list[dict[str, Any]] = []
    for skill in reg['skills']:
        reasons = ['intent:' + intent] if skill['id'] in reg['defaults'][intent] else []
        for path in paths:
            if any(fnmatch.fnmatchcase(path, pattern) for pattern in skill['globs']):
                reasons.append('path:' + path)
                matched.add(path)
        for keyword in skill['keywords']:
            if re.search(r'(?<!\w)' + re.escape(keyword) + r'(?!\w)', task, flags=re.IGNORECASE):
                reasons.append('keyword:' + keyword)
        if reasons:
            selected.append({'id': skill['id'], 'path': skill['path'], 'agent': skill['agent'],
                             'reuse_existing': not skill['managed'], 'reasons': reasons})
    return {'mode': 'advisory', 'intent': intent, 'skills': selected,
            'agents': list(dict.fromkeys(s['agent'] for s in selected)),
            'max_concurrent_agents': reg['max_concurrent_agents'],
            'unmatched_paths': [p for p in paths if p not in matched],
            'note': 'Heuristic routing only. Trace current code; a matched or deleted path is not proof of implementation. Nothing is executed.'}


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()


def drift(root: Path) -> dict[str, Any]:
    evidence = read_json(safe_file(root, 'agent-system/evidence.json'))
    if evidence.get('schema_version') != 1 or not re.fullmatch(r'[0-9a-f]{40}', evidence.get('source_commit', '')):
        raise InvalidInput('invalid evidence version or source commit')
    changes: list[dict[str, str]] = []
    seen: set[str] = set()
    for anchor in nonempty_list(evidence.get('anchors'), 'anchors'):
        if not isinstance(anchor, dict):
            raise InvalidInput('anchor must be an object')
        path = relative(anchor.get('path', ''))
        expected = anchor.get('git_blob', '')
        if not isinstance(expected, str) or not re.fullmatch(r'[0-9a-f]{40}', expected) or path in seen:
            raise InvalidInput('invalid or duplicate evidence anchor')
        seen.add(path)
        try:
            actual = blob_sha(safe_file(root, path).read_bytes())
            if actual != expected:
                changes.append({'path': path, 'status': 'changed', 'expected': expected, 'actual': actual})
        except FileNotFoundError:
            changes.append({'path': path, 'status': 'missing'})
        except (OSError, ValueError) as exc:
            changes.append({'path': path, 'status': 'unreadable', 'reason': str(exc)})
    return {'status': 'stale' if changes else 'unchanged', 'source_commit': evidence['source_commit'],
            'checked_anchors': len(seen), 'changes': changes,
            'note': 'Hashes cover only named anchors, not whole-project correctness. No fingerprints were updated.'}


def inspect(root: Path, reg: dict[str, Any]) -> dict[str, Any]:
    components: list[dict[str, Any]] = []
    for entry in reg['components']:
        result: dict[str, Any] = {'id': entry['id'], 'manifest': entry['manifest']}
        try:
            file = safe_file(root, entry['manifest'])
            data = read_json(file)
            scripts = data.get('scripts', {})
            dependencies = data.get('dependencies', {})
            if not isinstance(scripts, dict) or not isinstance(dependencies, dict):
                raise InvalidInput('invalid scripts or dependencies object')
            result.update(status='observed-manifest', name=data.get('name'),
                          git_blob=blob_sha(file.read_bytes()), script_names=sorted(scripts),
                          declared_dependencies=sorted(dependencies))
        except (OSError, ValueError) as exc:
            result.update(status='unknown', reason=str(exc))
        components.append(result)
    return {'components': components,
            'note': 'Manifest declarations do not prove runtime use. Script bodies, environment files, and secret values are not emitted.'}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    commands = parser.add_subparsers(dest='command', required=True)
    check = commands.add_parser('validate')
    check.add_argument('--pack-only', action='store_true')
    route = commands.add_parser('recommend')
    route.add_argument('--path', action='append', default=[])
    route.add_argument('--task', default='')
    route.add_argument('--intent', choices=('inspect', 'change', 'review', 'curate'), default='change')
    commands.add_parser('inspect')
    stale = commands.add_parser('drift')
    stale.add_argument('--strict', action='store_true')
    args = parser.parse_args()
    try:
        root = args.root.resolve(strict=True)
        reg = load_registry(root)
        if args.command == 'validate':
            result = validate(root, reg, args.pack_only)
            code = int(bool(result['errors']))
        elif args.command == 'recommend':
            result = recommend(reg, args.path, args.task, args.intent)
            code = 0
        elif args.command == 'inspect':
            result = inspect(root, reg)
            code = int(any(c['status'] == 'unknown' for c in result['components']))
        else:
            result = drift(root)
            code = int(args.strict and result['status'] == 'stale')
    except (OSError, ValueError, TypeError, KeyError) as exc:
        result, code = {'status': 'error', 'reason': str(exc)}, 2
    print(json.dumps(result, indent=2, ensure_ascii=True))
    return code


if __name__ == '__main__':
    sys.exit(main())
