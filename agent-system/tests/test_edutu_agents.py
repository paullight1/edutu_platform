"""Offline behavioral tests for the Edutu agent support tool, not LLM evals."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'edutu_agents.py'


class EntrypointTest(unittest.TestCase):
    def test_advisory_router_has_a_runnable_entrypoint(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--help'],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

class ToolBehaviorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.registry = {
            'schema_version': 1,
            'max_concurrent_agents': 3,
            'defaults': {'inspect': ['core'], 'change': ['core'],
                         'review': ['core'], 'curate': ['core']},
            'components': [{'id': 'web', 'manifest': 'web/package.json'}],
            'agents': [{'id': 'reader', 'path': '.codex/agents/reader.toml'}],
            'skills': [
                {'id': 'core', 'path': '.agents/skills/core/SKILL.md',
                 'agent': 'reader', 'managed': True, 'globs': [], 'keywords': []},
                {'id': 'billing', 'path': 'legacy/billing/SKILL.md',
                 'agent': 'reader', 'managed': False,
                 'globs': ['*/billing/*'], 'keywords': ['payment']}
            ]
        }
        self.put('agent-system/registry.json', json.dumps(self.registry))
        self.put('.agents/skills/core/SKILL.md',
                 '---\nname: core\ndescription: Use when inspecting a repository.\n---\n'
                 '## Workflow\nRead current files.\n## Evidence\nCite paths.\n'
                 '## Stop conditions\nStop on missing evidence.\n')
        self.put('.codex/agents/reader.toml',
                 'name = "reader"\ndescription = "Inspect files"\n'
                 'sandbox_mode = "read-only"\n'
                 'developer_instructions = "Read agent-system/README.md and return evidence."\n')
        self.put('.codex/config.toml', '[agents]\nmax_concurrent_threads_per_session = 3\n')
        self.put('legacy/billing/SKILL.md', 'Existing reviewer, intentionally not rewritten.\n')
        self.put('web/package.json', '{"name":"fixture","scripts":{"test":"never execute this"}}\r\n')
        self.write_evidence()

    def put(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content.encode('utf-8'))

    def write_evidence(self, sha=None):
        import hashlib
        data = (self.root / 'web/package.json').read_bytes()
        value = sha or hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        self.put('agent-system/evidence.json', json.dumps({
            'schema_version': 1, 'source_commit': 'a' * 40,
            'anchors': [{'path': 'web/package.json', 'git_blob': value}]}))

    def run_tool(self, *args, code=0):
        result = subprocess.run([sys.executable, str(SCRIPT), '--root', str(self.root), *args],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, code, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def test_valid_pack(self):
        self.assertEqual(self.run_tool('validate')['status'], 'pass')

    def test_default_routing_is_advisory(self):
        out = self.run_tool('recommend')
        self.assertEqual(out['mode'], 'advisory')
        self.assertEqual([s['id'] for s in out['skills']], ['core'])

    def test_path_routes_existing_billing_reviewer(self):
        out = self.run_tool('recommend', '--path', 'api/billing/webhook.ts')
        self.assertEqual([s['id'] for s in out['skills']], ['core', 'billing'])

    def test_keyword_routes_case_insensitively(self):
        out = self.run_tool('recommend', '--task', 'Review PAYMENT retries')
        self.assertEqual(out['skills'][-1]['id'], 'billing')

    def test_keywords_do_not_match_substrings(self):
        out = self.run_tool('recommend', '--task', 'Review prepaymentlabel styling')
        self.assertEqual(len(out['skills']), 1)

    def test_unknown_domain_does_not_invent_skills(self):
        out = self.run_tool('recommend', '--path', 'unknown/new-language.file')
        self.assertEqual(out['unmatched_paths'], ['unknown/new-language.file'])
        self.assertEqual(len(out['skills']), 1)

    def test_duplicate_recommendations_are_removed(self):
        out = self.run_tool('recommend', '--path', 'api/billing/a.ts', '--path',
                            'api/billing/b.ts', '--task', 'payment')
        self.assertEqual(len(out['skills']), 2)
        self.assertEqual(out['agents'], ['reader'])

    def test_rejects_path_traversal(self):
        self.assertEqual(self.run_tool('recommend', '--path', '../secret', code=2)['status'], 'error')

    def test_rejects_absolute_paths(self):
        self.run_tool('recommend', '--path', '/tmp/secret', code=2)

    def test_rejects_windows_and_control_paths(self):
        for path in ['C:\\secret', 'foo\nbar', 'foo/../bar']:
            with self.subTest(path=path):
                self.run_tool('recommend', '--path', path, code=2)

    def test_missing_skill_fails_validation(self):
        (self.root / '.agents/skills/core/SKILL.md').unlink()
        self.assertEqual(self.run_tool('validate', code=1)['status'], 'fail')

    def test_missing_external_skill_fails_full_validation(self):
        (self.root / 'legacy/billing/SKILL.md').unlink()
        self.run_tool('validate', code=1)

    def test_pack_only_explicitly_reports_skipped_external_checks(self):
        (self.root / 'legacy/billing/SKILL.md').unlink()
        out = self.run_tool('validate', '--pack-only')
        self.assertEqual(out['scope'], 'pack-only')
        self.assertTrue(out['skipped'])

    def test_missing_agent_reference_fails(self):
        self.registry['skills'][0]['agent'] = 'invented'
        self.put('agent-system/registry.json', json.dumps(self.registry))
        self.run_tool('validate', code=2)

    def test_empty_registry_fails_closed(self):
        self.registry['skills'] = []
        self.put('agent-system/registry.json', json.dumps(self.registry))
        self.run_tool('validate', code=2)

    def test_duplicate_skill_ids_fail(self):
        self.registry['skills'].append(self.registry['skills'][0])
        self.put('agent-system/registry.json', json.dumps(self.registry))
        self.run_tool('validate', code=2)

    def test_duplicate_json_keys_fail(self):
        self.put('agent-system/registry.json', '{"schema_version":1,"schema_version":1}')
        self.run_tool('validate', code=2)

    def test_malformed_json_fails(self):
        self.put('agent-system/registry.json', '{broken')
        self.run_tool('validate', code=2)

    def test_skill_name_must_match_registry(self):
        file = self.root / '.agents/skills/core/SKILL.md'
        file.write_text(file.read_text().replace('name: core', 'name: different'))
        self.run_tool('validate', code=1)

    def test_unbounded_agent_permissions_are_rejected(self):
        file = self.root / '.codex/agents/reader.toml'
        file.write_text(file.read_text().replace('read-only', 'danger-full-access'))
        self.run_tool('validate', code=1)

    def test_malformed_agent_toml_fails(self):
        self.put('.codex/agents/reader.toml', '[broken')
        self.run_tool('validate', code=1)

    def test_unchanged_crlf_source_hash_passes(self):
        self.assertEqual(self.run_tool('drift', '--strict')['status'], 'unchanged')

    def test_changed_source_is_reported_and_strict_fails(self):
        self.put('web/package.json', '{"name":"changed"}\n')
        self.assertEqual(self.run_tool('drift')['status'], 'stale')
        self.run_tool('drift', '--strict', code=1)

    def test_deleted_source_is_not_considered_verified(self):
        (self.root / 'web/package.json').unlink()
        out = self.run_tool('drift', '--strict', code=1)
        self.assertEqual(out['changes'][0]['status'], 'missing')

    def test_empty_anchors_fail_closed(self):
        self.put('agent-system/evidence.json', json.dumps({
            'schema_version': 1, 'source_commit': 'a' * 40, 'anchors': []}))
        self.run_tool('drift', code=2)

    def test_invalid_fingerprint_fails_closed(self):
        self.write_evidence('not-a-sha')
        self.run_tool('drift', code=2)

    def test_source_symlinks_are_rejected(self):
        target = self.root / 'web/package.json'
        data = target.read_bytes()
        target.unlink()
        self.put('other.json', data.decode())
        target.symlink_to(self.root / 'other.json')
        # Registry validation rejects this before the drift stage.
        self.run_tool('drift', '--strict', code=2)

    def test_unregistered_anchor_symlink_is_reported_unreadable(self):
        self.put('extra/source.txt', 'source')
        (self.root / 'extra/link.txt').symlink_to(self.root / 'extra/source.txt')
        self.put('agent-system/evidence.json', json.dumps({
            'schema_version': 1, 'source_commit': 'a' * 40,
            'anchors': [{'path': 'extra/link.txt', 'git_blob': 'b' * 40}]}))
        out = self.run_tool('drift', '--strict', code=1)
        self.assertEqual(out['changes'][0]['status'], 'unreadable')

    def test_inspect_reports_declared_commands_without_executing_them(self):
        before = (self.root / 'web/package.json').read_bytes()
        out = self.run_tool('inspect')
        self.assertEqual(out['components'][0]['script_names'], ['test'])
        self.assertNotIn('never execute this', json.dumps(out))
        self.assertEqual((self.root / 'web/package.json').read_bytes(), before)

    def test_missing_manifest_is_explicitly_unknown(self):
        (self.root / 'web/package.json').unlink()
        out = self.run_tool('inspect', code=1)
        self.assertEqual(out['components'][0]['status'], 'unknown')

    def test_malicious_task_text_is_not_executed(self):
        sentinel = self.root / 'must-not-exist'
        out = self.run_tool('recommend', '--task', f'payment; touch {sentinel}')
        self.assertEqual(out['mode'], 'advisory')
        self.assertFalse(sentinel.exists())

    def test_registry_cannot_read_secret_files(self):
        self.registry['components'][0]['manifest'] = '.env'
        self.put('agent-system/registry.json', json.dumps(self.registry))
        self.run_tool('inspect', code=2)


if __name__ == '__main__':
    unittest.main()
