import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import process from "node:process";

const MAX_BODY = 4096;
const MAX_OUTPUT = 9000;
const ALLOWED_KEYS = new Set(["subject", "grade", "topic", "curriculum"]);
const PROMPT =
  "You are assisting a classroom teacher. Produce a DRAFT lesson plan only, not an official grade or school decision. " +
  "Include 3 learning objectives, 25-minute teaching steps, 5 age-appropriate questions, a short inclusive activity and a review checklist. " +
  "Do not ask for, reproduce or infer student personal data. Cite uncertainty where local curriculum details are missing. " +
  "The teacher must check facts, suitability and curriculum alignment before use.";

function respond(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
  res.end(JSON.stringify(payload));
}

export function constantTimeTokenMatch(provided, expected) {
  if (!expected || !provided || typeof provided !== "string") return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateLessonInput(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "An object with subject, grade and topic is required." };
  }
  if (Object.keys(payload).some((k) => !ALLOWED_KEYS.has(k))) {
    return { error: "Only subject, grade, topic and curriculum are accepted. Do not send pupil information." };
  }
  for (const [key, max] of [["subject", 80], ["grade", 60], ["topic", 160]]) {
    if (typeof payload[key] !== "string" || payload[key].trim().length < 2 || payload[key].length > max) {
      return { error: key + " must be a short non-empty string (max " + max + " characters)." };
    }
  }
  if (payload.curriculum !== undefined &&
      (typeof payload.curriculum !== "string" || payload.curriculum.length > 240)) {
    return { error: "curriculum must be a short optional string." };
  }
  return { value: {
    subject: payload.subject.trim(), grade: payload.grade.trim(),
    topic: payload.topic.trim(), curriculum: (payload.curriculum || "").trim()
  }};
}

function configFromEnvironment() {
  return {
    internalToken: process.env.SCHOOL_SUITE_INTERNAL_TOKEN,
    providerKey: process.env.LLM_API_KEY,
    providerUrl: process.env.LLM_CHAT_COMPLETIONS_URL,
    providerModel: process.env.LLM_MODEL || ""
  };
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const err = new Error("Request too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const err = new Error("Invalid JSON");
    err.statusCode = 400;
    throw err;
  }
}

async function generateDraft(input, config, fetchImpl) {
  const url = new URL(config.providerUrl);
  if (url.protocol !== "https:") throw new Error("LLM_CHAT_COMPLETIONS_URL must use HTTPS");
  const response = await fetchImpl(url, {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + config.providerKey
    },
    body: JSON.stringify({
      model: config.providerModel,
      temperature: 0.35,
      max_tokens: 1300,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: JSON.stringify(input) }
      ]
    })
  });
  if (!response.ok) throw new Error("LLM provider returned status " + response.status);
  const result = await response.json();
  const message = result?.choices?.[0]?.message?.content;
  if (typeof message !== "string" || message.trim().length === 0) throw new Error("LLM provider returned no text");
  return message.slice(0, MAX_OUTPUT);
}

export function createHandler({ config = configFromEnvironment(), fetchImpl = globalThis.fetch } = {}) {
  return async function handler(req, res) {
    const route = (req.url || "").split("?")[0];
    if (route === "/healthz" && req.method === "GET") {
      return respond(res, 200, { status: "ok", configured: Boolean(
        config.internalToken && config.providerKey && config.providerUrl && config.providerModel
      ) });
    }
    if (route !== "/v1/lesson-draft" || req.method !== "POST") {
      return respond(res, 404, { error: "Not found" });
    }
    if (!config.internalToken || !config.providerKey || !config.providerUrl || !config.providerModel) {
      return respond(res, 503, { error: "AI gateway is not configured" });
    }
    const authorization = req.headers.authorization || "";
    const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!constantTimeTokenMatch(provided, config.internalToken)) {
      return respond(res, 401, { error: "Unauthorized" });
    }
    const tenant = req.headers["x-tenant-id"];
    if (typeof tenant !== "string" || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenant)) {
      return respond(res, 400, { error: "A valid internal tenant identifier is required" });
    }
    if (!(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      return respond(res, 415, { error: "application/json is required" });
    }
    const length = Number(req.headers["content-length"] || 0);
    if (!Number.isFinite(length) || length > MAX_BODY) {
      return respond(res, 413, { error: "Request body too large" });
    }
    let body;
    try {
      body = await readJson(req);
    } catch (e) {
      return respond(res, e.statusCode || 400, { error: e.message === "Request too large" ? "Request body too large" : "Invalid JSON" });
    }
    const parsed = validateLessonInput(body);
    if (parsed.error) return respond(res, 422, { error: parsed.error });
    try {
      const content = await generateDraft(parsed.value, config, fetchImpl);
      return respond(res, 200, {
        tenant, kind: "lesson_draft", content,
        review_required: true,
        warning: "Draft only. A teacher must verify accuracy and age appropriateness before use."
      });
    } catch {
      return respond(res, 502, { error: "AI lesson draft unavailable. Retry through an approved administrator." });
    }
  };
}

const invokedAsMain = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsMain) {
  const port = Number(process.env.PORT || 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
  const bind = process.env.BIND_HOST || "127.0.0.1";
  createServer(createHandler()).listen(port, bind, () => {
    console.log("SchoolSuite AI gateway listening on " + bind + ":" + port);
  });
}
