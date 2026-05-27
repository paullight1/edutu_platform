import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';
import { Actor } from 'apify';
import axios from 'axios';
import { router } from './routes.js';

await Actor.init();

const input = await Actor.getInput();
const {
    startUrls = ['https://opportunitiescircle.com/explore-opportunities'],
    maxResults = 20,
    proxyConfiguration = { useApifyProxy: true },
    backendUrl = '',
    backendApiKey = '',
    autoSaveToBackend = true
} = input || {};

const proxyConfig = await Actor.createProxyConfiguration({
    useApifyProxy: true,
});

const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfig,
    requestHandler: router,
    maxConcurrency: 2,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 120,
    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        },
    },
});

Actor.on('aborting', async () => {
    await crawler.abort();
});

// Run crawler with both listing and detail pages
await crawler.run(startUrls);

const dataset = await Dataset.open();
const items = await dataset.getData();

// Save to Apify dataset
await Actor.setValue('OUTPUT', {
    itemCount: items.items.length,
    items: items.items
});

// Auto-save to backend if enabled
if (autoSaveToBackend && backendUrl && items.items.length > 0) {
    try {
        Actor.log.info('Sending scraped data to backend: ' + backendUrl);
        
        const response = await axios.post(backendUrl, {
            items: items.items,
            apiKey: backendApiKey
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        Actor.log.info('Backend response: ' + JSON.stringify(response.data));
        
        await Actor.setValue('BACKEND_SYNC_RESULT', {
            success: true,
            backendUrl,
            result: response.data
        });
    } catch (error) {
        Actor.log.error('Failed to send data to backend: ' + error.message);
        
        await Actor.setValue('BACKEND_SYNC_RESULT', {
            success: false,
            backendUrl,
            error: error.message
        });
    }
}

await Actor.exit();
