import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from '../src/app/api/health/route';

test('reports the deployment platform from the Docploy service setting', async () => {
  const previous = process.env.DEPLOYMENT_PLATFORM;

  try {
    delete process.env.DEPLOYMENT_PLATFORM;
    const unknownResponse = GET();
    const unknownBody = await unknownResponse.json();
    assert.equal(unknownBody.deploymentSource, 'unknown');

    process.env.DEPLOYMENT_PLATFORM = ' Docploy ';
    const response = GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, 'pay.edutu.org');
    assert.equal(body.deploymentSource, 'docploy');
    assert.doesNotThrow(() => new Date(body.time).toISOString());
  } finally {
    if (previous === undefined) delete process.env.DEPLOYMENT_PLATFORM;
    else process.env.DEPLOYMENT_PLATFORM = previous;
  }
});
