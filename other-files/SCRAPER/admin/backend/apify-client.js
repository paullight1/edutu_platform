const Apify = require('apify');
const axios = require('axios');

const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || 'majestic_fund/the-scholarship-scraper-actor';
const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

async function runApifyScraper(input) {
    if (!APIFY_TOKEN) {
        throw new Error('APIFY_API_TOKEN not configured');
    }

    const apifyClient = new Apify({ token: APIFY_TOKEN });

    console.log(`Starting Apify actor: ${APIFY_ACTOR_ID}`);

    const run = await apifyClient.actor(APIFY_ACTOR_ID).call({
        searchTerms: input.searchTerms || ['scholarship'],
        maxResults: input.maxResults || 50,
        ...input
    });

    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

    return items;
}

function transformApifyScholarship(item) {
    return {
        title: item.title || item.name || '',
        organization: item.provider || item.organization || item.sponsor || '',
        description: item.description || item.summary || '',
        amount: item.amount || item.amountAwarded || null,
        deadline: item.deadline || item.applicationDeadline || null,
        eligibility: item.eligibility || item.requirements || '',
        location: item.location || item.eligibleRegions || '',
        url: item.url || item.applicationUrl || item.link || '',
        source: 'apify',
        sourceUrl: item.sourceUrl || item.website || '',
        category: item.category || item.type || 'scholarship',
        postedDate: item.datePosted || item.publishedDate || null,
        imageUrl: item.imageUrl || item.image || null
    };
}

async function scrapeWithApify(input) {
    const rawItems = await runApifyScraper(input);
    return rawItems.map(transformApifyScholarship);
}

async function checkActorExists() {
    if (!APIFY_TOKEN) {
        return { exists: false, error: 'APIFY_API_TOKEN not configured' };
    }

    try {
        const response = await axios.get(
            `https://api.apify.com/v2/actors/${APIFY_ACTOR_ID}`,
            { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } }
        );
        return { exists: true, actor: response.data };
    } catch (error) {
        if (error.response?.status === 404) {
            return { exists: false, error: `Actor "${APIFY_ACTOR_ID}" not found` };
        }
        return { exists: false, error: error.message };
    }
}

module.exports = {
    runApifyScraper,
    transformApifyScholarship,
    scrapeWithApify,
    checkActorExists
};
