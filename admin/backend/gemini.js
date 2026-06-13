const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL =
  process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';

const refinementCache = new Map();
const matchCache = new Map();

function stableKey(prefix, payload) {
  return `${prefix}:${JSON.stringify(payload)}`;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normaliseJsonResponse(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const direct = safeJsonParse(trimmed);
  if (direct) return direct;

  const fenced =
    trimmed.match(/```json\s*([\s\S]+?)```/i) ||
    trimmed.match(/```\s*([\s\S]+?)```/i);
  if (fenced?.[1]) {
    return safeJsonParse(fenced[1].trim());
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return safeJsonParse(objectMatch[0]);
  }

  return null;
}

export function isDeepSeekConfigured() {
  return Boolean(DEEPSEEK_API_KEY);
}

export async function generateDeepSeekJson({ systemInstruction, prompt, cacheKey }) {
  if (!DEEPSEEK_API_KEY) {
    return null;
  }

  if (cacheKey && refinementCache.has(cacheKey)) {
    return refinementCache.get(cacheKey);
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: 'system',
            content:
              systemInstruction ||
              'Return strict JSON only and never invent fields.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    const text =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.message?.text ||
      '';
    const parsed = normaliseJsonResponse(text);

    if (cacheKey) {
      refinementCache.set(cacheKey, parsed);
    }

    return parsed;
  } catch (error) {
    console.error('[DeepSeek] JSON generation failed:', error.message);
    return null;
  }
}

export async function refineOpportunityWithDeepSeek(opportunity) {
  const cacheKey = stableKey('opportunity-refine', {
    title: opportunity.title,
    category: opportunity.category,
    organization: opportunity.organization,
    description: opportunity.description,
    deadline: opportunity.close_date || opportunity.deadline,
    location: opportunity.location,
    eligibility: opportunity.eligibility,
  });

  const parsed = await generateDeepSeekJson({
    cacheKey,
    systemInstruction:
      'You normalize scholarship and opportunity records for matching. Return strict JSON only and never invent URLs.',
    prompt: `Refine this opportunity for personalized matching and dashboard display.

Opportunity:
${JSON.stringify(
  {
    title: opportunity.title || '',
    organization: opportunity.organization || '',
    category: opportunity.category || '',
    description: opportunity.description || opportunity.summary || '',
    deadline: opportunity.close_date || opportunity.deadline || '',
    location: opportunity.location || '',
    eligibility: opportunity.eligibility || {},
    source_url: opportunity.source_url || opportunity.application_url || '',
  },
  null,
  2,
)}

Return JSON:
{
  "summary": "one concise dashboard summary under 180 characters",
  "tags": ["3 to 6 short tags"],
  "eligibleMajors": ["majors or fields"],
  "eligibleCountries": ["country names or International"],
  "recommendedLevels": ["undergraduate", "masters", "phd", "early-career", "general"],
  "fundingHighlights": ["bullet-sized funding facts"],
  "matchKeywords": ["keywords that should help user matching"]
}`,
  });

  return {
    summary: parsed?.summary || opportunity.summary || opportunity.description || '',
    tags: Array.isArray(parsed?.tags) ? parsed.tags : [],
    eligibleMajors: Array.isArray(parsed?.eligibleMajors)
      ? parsed.eligibleMajors
      : [],
    eligibleCountries: Array.isArray(parsed?.eligibleCountries)
      ? parsed.eligibleCountries
      : [],
    recommendedLevels: Array.isArray(parsed?.recommendedLevels)
      ? parsed.recommendedLevels
      : [],
    fundingHighlights: Array.isArray(parsed?.fundingHighlights)
      ? parsed.fundingHighlights
      : [],
    matchKeywords: Array.isArray(parsed?.matchKeywords)
      ? parsed.matchKeywords
      : [],
  };
}

export async function scoreOpportunityMatchWithDeepSeek(opportunity, profile) {
  const cacheKey = stableKey('opportunity-match', {
    opportunityId: opportunity.id || opportunity.source_url || opportunity.application_url || opportunity.title,
    updatedAt: opportunity.updated_at || opportunity.created_at || '',
    profile,
  });

  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey);
  }

  const parsed = await generateDeepSeekJson({
    cacheKey,
    systemInstruction:
      'You are a scholarship matching engine. Score fit conservatively and explain the strongest reasons. Return strict JSON only.',
    prompt: `Match this user profile to this opportunity.

User Profile:
${JSON.stringify(profile || {}, null, 2)}

Opportunity:
${JSON.stringify(
  {
    title: opportunity.title || '',
    organization: opportunity.organization || '',
    category: opportunity.category || '',
    description: opportunity.description || opportunity.summary || '',
    location: opportunity.location || '',
    deadline: opportunity.close_date || opportunity.deadline || '',
    eligibility: opportunity.eligibility || {},
    tags: opportunity.tags || [],
  },
  null,
  2,
)}

Return JSON:
{
  "score": 0,
  "reasons": ["2 to 4 short reasons"],
  "risks": ["0 to 3 short risks or unknowns"],
  "personalizedSummary": "one short personalized sentence"
}`,
  });

  const result = {
    score: Math.max(0, Math.min(100, Number(parsed?.score) || 0)),
    reasons: Array.isArray(parsed?.reasons) ? parsed.reasons.slice(0, 4) : [],
    risks: Array.isArray(parsed?.risks) ? parsed.risks.slice(0, 3) : [],
    personalizedSummary: parsed?.personalizedSummary || '',
  };

  matchCache.set(cacheKey, result);
  return result;
}
