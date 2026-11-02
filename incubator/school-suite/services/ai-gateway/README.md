# SchoolSuite AI teaching gateway

**Status:** isolated prototype; not connected to an ERP or pupil data. Uses Node.js 20+ and no external npm dependencies.

## Local setup

Export variables from .env.example into a private local environment (do not commit real secrets). Then run:

    node incubator/school-suite/services/ai-gateway/server.mjs

By default the gateway binds only to 127.0.0.1:8788. Lesson generation remains unavailable until SCHOOL_SUITE_INTERNAL_TOKEN, LLM_CHAT_COMPLETIONS_URL, LLM_API_KEY and LLM_MODEL are configured.

A trusted backend (not a browser) can POST /v1/lesson-draft with Authorization: Bearer <internal token>, X-Tenant-ID: <verified tenant slug> and the following JSON object:

    { "subject": "Mathematics", "grade": "JSS 2", "topic": "Fractions", "curriculum": "Nigerian basic education" }

Responses include review_required: true. GET /healthz reports readiness without exposing credentials. Provider failures return safe errors.

## Guardrails and limits

- Only subject, grade, topic and optional curriculum strings are accepted. Unexpected fields are rejected.
- No pupil names, IDs, images, grades, essays or behavioral records may be included.
- Do not log lesson prompts, provider keys, or child records.
- HTTPS LLM provider is required. Unconfigured model = 503, not fake AI.
- Teacher must approve output before using it in class.
- Shared internal token is for this general-curriculum gateway only, NOT user login or cross-tenant school record access.
- Production requires trusted tenant resolution, rate limiting, queueing, abuse monitoring, private networking and an external security assessment.

## Tests

    cd incubator/school-suite/services/ai-gateway
    npm test

Provider responses are mocked, so no API key is needed for tests.
