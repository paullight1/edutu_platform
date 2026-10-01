"""Integration checks against the shipped Edutu registry, not fixture metadata."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'agent-system/scripts/edutu_agents.py'


class ProjectPackTests(unittest.TestCase):
    def run_tool(self, *args):
        result = subprocess.run([sys.executable, str(SCRIPT), '--root', str(ROOT), *args],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def test_shipped_pack_validates_with_explicit_external_skips(self):
        output = self.run_tool('validate', '--pack-only')
        self.assertEqual(output['status'], 'pass')
        self.assertEqual(len(output['skipped']), 8)

    def test_mobile_payment_selects_existing_reviewers(self):
        output = self.run_tool('recommend', '--intent', 'review', '--path',
                               'edutumobile/app/paywall.tsx', '--task', 'Review payment retries')
        skills = {item['id']: item for item in output['skills']}
        self.assertTrue(skills['edutu-mobile-review']['reuse_existing'])
        self.assertTrue(skills['edutu-payments-review']['reuse_existing'])
        self.assertIn('edutu-cross-platform-parity', skills)
        self.assertEqual(output['max_concurrent_agents'], 3)

    def test_opportunity_api_selects_domain_and_security_workflows(self):
        output = self.run_tool('recommend', '--path',
                               'backend/services/services/api/src/opportunities/opportunities.controller.ts')
        skills = {item['id'] for item in output['skills']}
        self.assertTrue({'edutu-opportunity-integrity', 'edutu-api-data-safety',
                         'edutu-repository-evidence', 'edutu-change-delivery'} <= skills)

    def test_skill_creation_selects_architect_and_curator(self):
        output = self.run_tool('recommend', '--intent', 'curate', '--task', 'create skills')
        skills = {item['id'] for item in output['skills']}
        self.assertIn('edutu-project-skill-architect', skills)
        self.assertIn('edutu-skill-maintenance', skills)
        self.assertNotIn('edutu-payments-review', skills)

    def test_unknown_surface_is_visible_and_not_certified(self):
        output = self.run_tool('recommend', '--intent', 'inspect', '--path', 'new-engine/unseen.rs')
        self.assertEqual(output['unmatched_paths'], ['new-engine/unseen.rs'])
        self.assertEqual(output['mode'], 'advisory')
        self.assertEqual([s['id'] for s in output['skills']], ['edutu-repository-evidence'])


if __name__ == '__main__':
    unittest.main()
