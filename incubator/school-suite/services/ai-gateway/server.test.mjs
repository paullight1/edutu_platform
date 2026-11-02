import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createHandler, validateLessonInput, constantTimeTokenMatch } from "./server.mjs";

const config = {
  internalToken: "temporary-test-token",
  providerKey: "test-provider-key",
  providerUrl: "https://llm.example.test/v1/chat/completions",
  providerModel: "test-model"
};
const valid = { subject: "Biology", grade: "JSS 2", topic: "Photosynthesis" };
const fakeProvider = async (_url, options) => {
  const request = JSON.parse(options.body);
  assert.equal(request.messages[1].role, "user");
  assert.equal(request.messages[1].content.includes("Photosynthesis"), true);
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: "DRAFT: explain photosynthesis in class." } }] })
  };
};

async function inServer(handler, action) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    return await action(base);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}
function requestOpts(body, token = config.internalToken, tenant = "evolve") {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
      "X-Tenant-ID": tenant
    },
    body: JSON.stringify(body)
  };
}
test("timing-safe token matching accepts only the correct token", () => {
  assert.equal(constantTimeTokenMatch("a", "a"), true);
  assert.equal(constantTimeTokenMatch("A", "a"), false);
  assert.equal(constantTimeTokenMatch("", "a"), false);
  assert.equal(constantTimeTokenMatch("long", "x"), false);
});
test("input whitelist refuses student personal details", () => {
  assert.equal(validateLessonInput(valid).error, undefined);
  assert.match(validateLessonInput({ ...valid, studentName: "Private learner" }).error, /Do not send/);
  assert.ok(validateLessonInput({ subject: "", grade: "JSS 2", topic: "Science" }).error);
});
test("health response is public but never exposes credentials", async () => {
  await inServer(createHandler({ config, fetchImpl: fakeProvider }), async (base) => {
    const res = await fetch(base + "/healthz");
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.configured, true);
    assert.equal(JSON.stringify(json).includes(config.providerKey), false);
  });
});
test("rejects missing and incorrect authorization", async () => {
  await inServer(createHandler({ config, fetchImpl: fakeProvider }), async (base) => {
    for (const token of ["", "wrong"]) {
      const response = await fetch(base + "/v1/lesson-draft", requestOpts(valid, token));
      assert.equal(response.status, 401);
    }
  });
});
test("requires valid internal tenant label and rejects extra fields", async () => {
  await inServer(createHandler({ config, fetchImpl: fakeProvider }), async (base) => {
    const tenant = await fetch(base + "/v1/lesson-draft", requestOpts(valid, config.internalToken, "../other"));
    assert.equal(tenant.status, 400);
    const pii = await fetch(base + "/v1/lesson-draft", requestOpts({ ...valid, pupilName: "Someone" }));
    assert.equal(pii.status, 422);
  });
});
test("draft generation marks result for teacher review and has no student data", async () => {
  await inServer(createHandler({ config, fetchImpl: fakeProvider }), async (base) => {
    const res = await fetch(base + "/v1/lesson-draft", requestOpts(valid));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.tenant, "evolve");
    assert.equal(json.review_required, true);
    assert.match(json.content, /^DRAFT:/);
    assert.equal(res.headers.get("cache-control"), "no-store");
  });
});
test("unconfigured provider fails closed", async () => {
  await inServer(createHandler({ config: { ...config, providerKey: undefined }, fetchImpl: fakeProvider }), async (base) => {
    const res = await fetch(base + "/v1/lesson-draft", requestOpts(valid));
    assert.equal(res.status, 503);
  });
});
test("provider errors return no internal or credential details", async () => {
  await inServer(createHandler({ config, fetchImpl: async () => { throw Error("secret-provider-details"); } }), async (base) => {
    const res = await fetch(base + "/v1/lesson-draft", requestOpts(valid));
    assert.equal(res.status, 502);
    const body = await res.text();
    assert.equal(body.includes("secret-provider-details"), false);
    assert.equal(body.includes(config.providerKey), false);
  });
});
