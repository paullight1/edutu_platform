import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readWorkflow() {
  try {
    return await readFile(
      new URL("../.github/workflows/local-review-gate.yml", import.meta.url),
      "utf8",
    );
  } catch {
    return "";
  }
}

test("review evidence is validated by trusted base-branch code", async () => {
  const workflow = await readWorkflow();

  assert.match(workflow, /pull_request_target:/);
  assert.match(
    workflow,
    /ref:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha\s*\}\}/,
  );
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.doesNotMatch(
    workflow,
    /ref:\s*\$\{\{\s*github\.event\.pull_request\.(head|merge_commit_sha)/,
  );
});
