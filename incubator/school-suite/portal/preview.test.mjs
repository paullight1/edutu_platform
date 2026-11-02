import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const folder = new URL(".", import.meta.url);
function read(name) { return readFileSync(new URL(name, folder), "utf8"); }
test("example tenants declare unique IDs, colors and labels", () => {
  const context = { window: {} };
  runInNewContext(read("tenants.js"), context);
  const tenants = Object.values(context.window.SCHOOL_SUITE_TENANTS);
  assert.ok(tenants.length >= 2);
  assert.equal(new Set(tenants.map((s) => s.id)).size, tenants.length);
  for (const item of tenants) {
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.match(item.accent, /^#[0-9a-f]{6}$/i);
    assert.ok(item.school && item.monogram);
    assert.ok(item.students.every((student) => /Example/i.test(student.name)));
    assert.ok(item.payments.every((payment) => payment.ref.startsWith("DEMO-")));
  }
});
test("portal has accessible interaction targets", () => {
  const html = read("index.html");
  for (const id of ["schoolSelect", "roleSelect", "mainNav", "viewRoot", "pageHeading", "openMenu"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Interactive preview/);
  assert.match(html, /synthetic/);
  assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg\.com/);
});
test("preview roles must not be treated as production authentication", () => {
  assert.match(read("README.md"), /not.*production authentication/i);
  assert.match(read("app.js"), /Not an auth gate/);
});
