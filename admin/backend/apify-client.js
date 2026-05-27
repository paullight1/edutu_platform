import axios from 'axios';

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const SCHOLARSHIP_API_KEY = process.env.SCHOLARSHIP_API_KEY;



// ScholarshipAPI.com integration
async function runScholarshipApiScraper(input = {}) {
    if (!SCHOLARSHIP_API_KEY) {
        throw new Error('SCHOLARSHIP_API_KEY not configured');
    }

    const query = input.query || 'scholarship';
    const limit = input.maxResults || input.limit || 20;

    console.log(`[ScholarshipAPI] Searching for: ${query}, limit: ${limit}`);

    try {
        const response = await axios.post(
            'https://api.scholarshipapi.com/v1/search',
            {
                q: query,
                limit: limit,
                ...input
            },
            {
                headers: {
                    'Authorization': `Bearer ${SCHOLARSHIP_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const data = response.data;
        const hits = data.hits || [];

        console.log(`[ScholarshipAPI] Found ${hits.length} scholarships`);

        return hits.map(transformScholarshipApiItem);
    } catch (error) {
        console.error('[ScholarshipAPI] Error:', error.message);
        throw new Error(`ScholarshipAPI failed: ${error.message}`);
    }
}

function transformScholarshipApiItem(item) {
    const title = item.name || item.title || 'Untitled Scholarship';
    const description = item.description || item.summary || item.about || '';
    const organization = item.provider || item.organization || item.sponsor || item.school_name || '';
    const location = item.location || item.country || item.state || 'Multiple Locations';
    const deadline = item.deadline || item.closes_at || item.application_deadline || null;
    const amount = item.amount || item.award_amount || 0;
    const currency = item.currency || 'USD';

    const benefits = amount > 0 ? [`${currency} ${amount}`] : [];

    return {
        title: title,
        organization: organization,
        description: description,
        category: mapCategory(item.category || item.type || 'scholarship'),
        type: 'scholarship',
        location: location,
        deadline: deadline,
        requirements: item.requirements ? [item.requirements] : [],
        skills: [],
        benefits: benefits,
        credits_reward: 0,
        external_url: item.url || item.link || item.apply_url || '',
        difficulty: 'medium',
        featured: false,
        status: 'active',
        // Additional fields from ScholarshipAPI
        raw_data: item
    };
}

const ACTOR_CONFIGS = {
    edutu: {
        primary: process.env.APIFY_ACTOR_EDUTU || 'paullight/edutu-scraper1',
    },
    intel: {
        primary: process.env.APIFY_ACTOR_INTEL || 'fiery_dream/scholarship-intel',
    },
    custom: {
        primary: process.env.APIFY_ACTOR_CUSTOM || 'paullight/my-actor',
    }
};

const ACTOR_IDS = Object.fromEntries(
    Object.entries(ACTOR_CONFIGS).map(([key, config]) => [key, config.primary || ''])
);

function getActorCandidates(configOrSource) {
    const config = typeof configOrSource === 'string' ? ACTOR_CONFIGS[configOrSource] : configOrSource;
    if (!config) return [];

    return [...new Set([config.primary, ...(config.fallbacks || [])].filter(Boolean))];
}

function encodeActorId(actorId) {
    return actorId.includes('/') ? actorId.replace('/', '~') : actorId;
}

function isRetryableActorLookupError(error) {
    const status = error?.response?.status;
    return status === 403 || status === 404;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapCategory(category) {
    if (!category) return 'Scholarships';
    const cat = String(category).toLowerCase();
    if (cat.includes('grant') || cat.includes('federal')) return 'Grants';
    if (cat.includes('intern')) return 'Internships';
    if (cat.includes('fellow')) return 'Fellowships';
    if (cat.includes('program')) return 'Programs';
    if (cat.includes('competition')) return 'Competitions';
    return 'Scholarships';
}

function parseDeadline(deadlineValue) {
    if (!deadlineValue) return null;
    if (typeof deadlineValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(deadlineValue)) {
        return deadlineValue.split('T')[0];
    }
    return deadlineValue;
}

function normalizeUrl(value) {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return '';
}

function firstNonEmptyString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function extractUrlCandidates(item) {
    if (!item || typeof item !== 'object') return [];

    const directCandidates = [
        item.sourceUrl,
        item.source_url,
        item.url,
        item.link,
        item.applicationUrl,
        item.application_url,
        item.applyUrl,
        item.apply_url,
        item.apply_link,
        item.website,
        item.website_url,
    ].map(normalizeUrl).filter(Boolean);

    const nestedCandidates = [];
    for (const [key, value] of Object.entries(item)) {
        if (Array.isArray(value)) {
            for (const child of value) {
                if (child && typeof child === 'object') {
                    nestedCandidates.push(...extractUrlCandidates(child));
                }
            }
            continue;
        }

        if (value && typeof value === 'object' && key.toLowerCase().includes('url')) {
            nestedCandidates.push(...extractUrlCandidates(value));
        }
    }

    return [...new Set([...directCandidates, ...nestedCandidates])];
}

function normalizeTags(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map((tag) => String(tag).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((tag) => tag.trim()).filter(Boolean);
    }
    return [];
}

function normalizeOpportunity(item, source, extra = {}) {
    const sourceUrl = firstNonEmptyString(
        normalizeUrl(item.source_url),
        normalizeUrl(item.sourceUrl),
        normalizeUrl(item.url),
        normalizeUrl(item.link),
        normalizeUrl(item.application_url),
        normalizeUrl(item.applicationUrl),
        normalizeUrl(item.apply_url),
        normalizeUrl(item.applyUrl),
        normalizeUrl(item.apply_link),
    );

    const applicationUrl = firstNonEmptyString(
        normalizeUrl(item.application_url),
        normalizeUrl(item.applicationUrl),
        normalizeUrl(item.apply_url),
        normalizeUrl(item.applyUrl),
        normalizeUrl(item.apply_link),
        sourceUrl,
    );

    const description = firstNonEmptyString(
        item.description,
        item.summary,
        item.details,
        item.full_description,
        item.report_text,
        extra.description,
    );

    const title = firstNonEmptyString(
        item.title,
        item.name,
        item.opportunity_title,
        item.scholarship_name,
        item.program_name,
        item.university,
        item.school_name,
        extra.title,
    ) || 'Untitled';

    return {
        title,
        summary: firstNonEmptyString(item.summary, description).slice(0, 200),
        description,
        organization: firstNonEmptyString(
            item.organization,
            item.provider,
            item.agency,
            item.host_organization,
            item.university,
            item.school_name,
            extra.organization,
        ),
        category: mapCategory(item.category || item.type || item.scholarship_type || item.opportunity_type || extra.category || 'scholarship'),
        location: firstNonEmptyString(item.location, item.country, item.state, item.region, item.nation, extra.location) || 'Multiple Locations',
        is_remote: Boolean(item.is_remote || item.remote || extra.is_remote),
        application_url: applicationUrl,
        source_url: sourceUrl,
        close_date: parseDeadline(item.deadline || item.close_date || item.closes_at || item.application_deadline || extra.close_date || null),
        image_url: firstNonEmptyString(item.image_url, item.imageUrl, item.image, item.cover_image, item.school_logo, extra.image_url) || null,
        award_amount: firstNonEmptyString(item.amount, item.award_amount, item.award, item.funding, item.scholarship_amount, item.value, extra.award_amount),
        eligibility: firstNonEmptyString(item.eligibility, item.requirements, item.eligibility_criteria, item.eligibilityCriteria, extra.eligibility) || null,
        tags: normalizeTags(item.tags || extra.tags),
        source,
        type: 'scholarship',
        saveable: Boolean(sourceUrl),
        raw_data: item,
        ...extra,
    };
}

function transformIntelItem(item) {
    const direct = normalizeOpportunity(item, 'scholarship-intel', {
        organization: firstNonEmptyString(item.organization, item.provider, item.agency),
    });
    if (direct.source_url) {
        return [direct];
    }

    const nestedCollections = [
        item.opportunities,
        item.scholarships,
        item.universities,
        item.federal_grants,
        item.education_spending,
        item.results,
        item.items,
    ].filter(Array.isArray);

    const flattened = [];
    for (const collection of nestedCollections) {
        for (const child of collection) {
            if (!child || typeof child !== 'object') continue;

            const normalized = normalizeOpportunity(child, 'scholarship-intel', {
                description: direct.description,
                category: direct.category,
                organization: direct.organization,
                location: direct.location,
                tags: direct.tags,
            });

            if (normalized.source_url) {
                flattened.push(normalized);
            }
        }
    }

    if (flattened.length > 0) {
        return flattened;
    }

    return [{
        ...direct,
        summary: direct.summary || 'AI intelligence report without source URLs',
        saveable: false,
        normalization_warning: 'Intel actor returned an aggregated report without opportunity URLs, so this item cannot be saved yet.',
    }];
}

function transformEdutuItem(item) {
    return normalizeOpportunity(item, 'edutu-scraper');
}

function transformToDbSchema(item) {
    // Map apify fields to database schema
    const title = item.title || item.name || item.scholarship_name || item.program_name || item.university || item.school_name || 'Untitled';
    const description = item.description || item.summary || item.report_text || item.details || item.full_description || '';
    const organization = item.organization || item.provider || item.agency || item.university || item.school_name || item.host_organization || '';
    const location = item.is_remote ? 'Remote' : (item.location || item.state || item.country || item.nation || item.region || 'Remote');
    const deadline = item.deadline || item.close_date || item.closes_at || item.application_deadline || null;
    const category = item.category || item.type || item.scholarship_type || item.opportunity_type || 'scholarship';

    // Map type to database enum
    const typeMap = {
        'scholarship': 'scholarship',
        'grant': 'scholarship',
        'fellowship': 'fellowship',
        'internship': 'internship',
        'job': 'job',
        'program': 'course',
        'competition': 'competition',
        'mentorship': 'mentorship',
        'certification': 'certification',
        'bootcamp': 'bootcamp'
    };

    const type = typeMap[category?.toLowerCase()] || 'scholarship';
    const benefits = item.award_amount ? [item.award_amount] : [];
    const requirements = item.eligibility ? [item.eligibility] : [];

    return {
        title: title,
        organization: organization,
        description: description,
        category: category,
        type: type,
        location: location,
        deadline: deadline,
        requirements: requirements,
        skills: [],
        benefits: benefits,
        credits_reward: 0,
        external_url: item.apply_url || item.url || item.link || item.applicationUrl || item.apply_link || '',
        difficulty: 'medium',
        featured: item.is_featured || false,
        status: 'active'
    };
}

function transformCustomItem(item) {
    return normalizeOpportunity(item, 'custom-scraper');
}

async function getActor(actorId) {
    const actorIdEncoded = encodeActorId(actorId);
    const response = await axios.get(`${APIFY_API_BASE}/acts/${actorIdEncoded}?token=${APIFY_TOKEN}`);
    return response.data;
}

async function startActorRun(actorId, input = {}) {
    const actorIdEncoded = encodeActorId(actorId);
    return axios.post(
        `${APIFY_API_BASE}/acts/${actorIdEncoded}/runs?token=${APIFY_TOKEN}`,
        input,
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000,
        }
    );
}

async function waitForRun(runId) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < RUN_TIMEOUT_MS) {
        const response = await axios.get(`${APIFY_API_BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`, {
            timeout: 30000,
        });

        const run = response.data?.data || response.data;
        if (['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(run.status)) {
            return run;
        }

        await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`Apify actor run did not finish within ${Math.round(RUN_TIMEOUT_MS / 1000)}s`);
}

async function listDatasetItems(datasetId) {
    const response = await axios.get(`${APIFY_API_BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true`, {
        timeout: 60000,
    });
    return Array.isArray(response.data) ? response.data : [];
}

async function runApifyScraper(actorIdOrSource, input = {}) {
    if (!APIFY_TOKEN) {
        throw new Error('APIFY_API_TOKEN not configured');
    }

    const actorCandidates = ACTOR_CONFIGS[actorIdOrSource]
        ? getActorCandidates(actorIdOrSource)
        : [actorIdOrSource];

    let lastError = null;

    for (const actorId of actorCandidates) {
        console.log(`[Apify] Running actor: ${actorId}`);
        console.log('[Apify] Input:', JSON.stringify(input));

        try {
            const startResponse = await startActorRun(actorId, input);
            const run = startResponse.data?.data || startResponse.data;
            const finishedRun = await waitForRun(run.id);

            if (finishedRun.status !== 'SUCCEEDED') {
                throw new Error(`Run ${finishedRun.id} ended with status ${finishedRun.status}`);
            }

            const datasetId = finishedRun.defaultDatasetId;
            const items = datasetId ? await listDatasetItems(datasetId) : [];

            console.log(`[Apify] Retrieved ${items.length} items from ${actorId}`);
            return { items, run: finishedRun, actorId };
        } catch (error) {
            lastError = error;
            const status = error?.response?.status;
            const message = error?.response?.data?.error?.message || error.message;
            console.error(`[Apify] Error running ${actorId}:`, message);

            if (!isRetryableActorLookupError(error)) {
                break;
            }

            console.warn(`[Apify] Falling back from actor ${actorId} (${status || 'no-status'})`);
        }
    }

    const details = lastError?.response?.data?.error?.message || lastError?.message || 'Unknown error';
    throw new Error(`Apify actor failed: ${details}`);
}

async function runEdutuScraper(input = {}) {
    const actorId = ACTOR_IDS.edutu;
    const runInput = { maxResults: input.maxResults || 20 };
    const { items } = await runApifyScraper(actorId, runInput);
    // Transform to database schema
    return items.map(transformToDbSchema);
}

async function runIntelScraper(input = {}) {
    const actorId = ACTOR_IDS.intel;
    const runInput = {
        search_type: input.search_type || 'all',
        query: input.query || 'scholarship',
        first_generation: false,
        include_ai_analysis: true,
        model_name: input.model_name || 'gemini/gemini-2.0-flash'
    };
    console.log('[Apify Intel] Running with input:', JSON.stringify(runInput));
    const { items } = await runApifyScraper(actorId, runInput);

    // Filter out non-scholarship data and transform
    const validItems = items.filter(item => item.scholarship_types || item.universities || item.federal_grants).map(transformToDbSchema);
    console.log('[Apify Intel] Transformed items:', validItems.length);
    return validItems;
}

async function runCustomScraper(input = {}) {
    const runInput = { maxResults: input.maxResults || 20, ...input };
    const { items, actorId } = await runApifyScraper('custom', runInput);
    return { items: items.map(transformCustomItem), actorId };
}

async function checkActorExists(actorIdOrSource) {
    if (!APIFY_TOKEN) {
        return { exists: false, error: 'APIFY_API_TOKEN not configured' };
    }

    const actorCandidates = ACTOR_CONFIGS[actorIdOrSource]
        ? getActorCandidates(actorIdOrSource)
        : [actorIdOrSource];

    let lastError = null;

    for (const actorId of actorCandidates) {
        try {
            const actor = await getActor(actorId);
            return { exists: true, actor, actorId };
        } catch (error) {
            lastError = error;
            if (!isRetryableActorLookupError(error)) {
                break;
            }
        }
    }

    const details = lastError?.response?.data?.error?.message || lastError?.message || 'Unknown error';
    return { exists: false, error: details };
}

async function checkAllActors() {
    const results = {};
    for (const key of Object.keys(ACTOR_CONFIGS)) {
        results[key] = await checkActorExists(key);
    }
    return results;
}

export {
    runApifyScraper,
    runEdutuScraper,
    runIntelScraper,
    runCustomScraper,
    runScholarshipApiScraper,
    transformEdutuItem,
    transformIntelItem,
    transformCustomItem,
    normalizeOpportunity,
    checkActorExists,
    checkAllActors,
    ACTOR_IDS
};
