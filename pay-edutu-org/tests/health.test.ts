import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from '../src/app/api/health/route';

test('reports the production deployment platform accurately', async () => {
  const response = GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'pay.edutu.org');
  assert.equal(body.deploymentSource, 'docploy');
  assert.doesNotThrow(() => new Date(body.time).toISOString());
});
