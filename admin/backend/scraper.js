/**
 * Edutu Scraper Engine - Enhanced Version
 * Phase 1: Core Scraper with retry logic, rate limiting, and site-specific configs
 */

import playwright from 'playwright';
const { chromium, Browser, Page, BrowserContext } = playwright;
import * as cheerio from 'cheerio';
import pRetry from 'p-retry';
import PQueue from 'p-queue';
import { 
    shouldExcludeLink, 
    filterDiscoveries, 
    analyzePageStructure,
    QUALITY_THRESHOLDS 
} from './filters.js';
import { format, parseISO, isValid, addDays, addMonths } from 'date-fns';
import { generateGeminiJson, isGeminiConfigured } from './gemini.js';

/**
 * @typedef {Object} ScrapeResult
 * @property {Object} data - Extracted opportunity data
 * @property {number} confidence - Confidence score 0-100
 * @property {string} source - Source of extraction (meta, hybrid, ai, failed)
 * @property {string[]} errors - Error messages
 * @property {number} httpStatus - HTTP status code
 */

/**
 * @typedef {Object} SourceConfig
 * @property {Object} selectors - CSS selectors for site-specific scraping
 * @property {string[]} patterns - URL patterns to match
 * @property {string[]} excludePatterns - URL patterns to exclude
 */

/**
 * @typedef {Object} OpportunityData
 * @property {string} title
 * @property {string} summary
 * @property {string} description
 * @property {string} organization
 * @property {string} category
 * @property {string} location
 * @property {boolean} is_remote
 * @property {string} application_url
 * @property {string} close_date
 * @property {string} image_url
 * @property {string} award_amount
 * @property {string} duration
 * @property {Object} eligibility
 * @property {string[]} requirements
 * @property {string[]} benefits
 */

/**
 * Default configuration for scraper
 * @type {Object}
 */
export const DEFAULT_CONFIG = {
    maxRetries: 3,
    retryDelay: 1000,
    concurrency: 3,
    rateLimitDelay: 2000,
    timeout: 30000,
    minConfidence: 50,
    autoApproveConfidence: 80
};

// Queue management for rate limiting
const globalQueue = new PQueue({ concurrency: DEFAULT_CONFIG.concurrency });
const sourceQueues = new Map();

/**
 * Get or create a rate-limited queue for a specific source
 * @param {number|string} sourceId - Unique source identifier
 * @param {number} rateLimitDelay - Delay between requests in ms
 * @returns {PQueue}
 */
function getSourceQueue(sourceId, rateLimitDelay = DEFAULT_CONFIG.rateLimitDelay) {
    const key = String(sourceId);
    if (!sourceQueues.has(key)) {
        sourceQueues.set(key, new PQueue({
            concurrency: 1,
            interval: 60000,
            intervalCap: 10
        }));
    }
    return sourceQueues.get(key);
}

/**
 * Site-specific configurations for Tier 1 aggregators
 * @type {Object.<string, SourceConfig>}
 */
export const SOURCE_CONFIGS = {
    'opportunitiescircle.com': {
        selectors: {
            list: '.post-item, .opportunity-card, article, .entry-card',
            title: 'h2, h3, .entry-title, .post-title',
            link: 'a[href*="/scholarship/"], a[href*="/opportunity/"], a[href*="/fellowship/"]'
        },
        patterns: ['scholarship', 'fellowship', 'internship', 'grant', 'program'],
        excludePatterns: ['/category/', '/tag/', '/page/', '/author/']
    },
    'oyaopportunities.com': {
        selectors: {
            list: '.listing-item, .opportunity, .card',
            title: '.title, h3, h2',
            link: 'a.button, a[href*="/apply"], a[href*="/opp/"]'
        },
        patterns: ['scholarship', 'internship', 'fellowship', 'grant'],
        excludePatterns: ['/category/', '/page/']
    },
    'globalscholardesk.com': {
        selectors: {
            list: '.scholarship-card, .post, .card',
            title: 'h2, .scholarship-title, .entry-title',
            link: 'a[href*="/scholarship/"], a[href*="/opp/"]'
        },
        patterns: ['scholarship', 'grant', 'fellowship'],
        excludePatterns: ['/category/', '/page/']
    },
    'scholars4dev.com': {
        selectors: {
            list: '.td-module-image-wrap, .wpb_text_column, .post',
            title: 'h3, .entry-title, h2',
            link: 'a[href*="/"]'
        },
        patterns: ['scholarship'],
        excludePatterns: ['/category/', '/tag/']
    },
    'scholarshipportal.com': {
        selectors: {
            list: '.scholarship-item, .program-card, .listing',
            title: '.scholarship-title, h3, h2',
            link: 'a[href*="/scholarship/"]'
        },
        patterns: ['scholarship'],
        excludePatterns: ['/search/', '/page/']
    },
    'scholarship-positions.com': {
        selectors: {
            list: '.post, .scholarship-listing, .entry',
            title: 'h2, .entry-title, h3',
            link: 'a[href*="/202"], a[href*="/scholarship/"]'
        },
        patterns: ['scholarship', 'fellowship'],
        excludePatterns: ['/category/', '/tag/']
    },
    'internationalscholarships.com': {
        selectors: {
            list: '.listing, .scholarship, .item',
            title: 'h3, .title, h2',
            link: 'a[href*="/details"], a[href*="/scholarship/"]'
        },
        patterns: ['scholarship'],
        excludePatterns: ['/search/', '/page/']
    }
};

/**
 * Extract domain from URL
 * @param {string} url - URL to parse
 * @returns {string}
 */
function getDomainFromUrl(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return '';
    }
}

/**
 * Get source-specific configuration for a URL
 * @param {string} url - URL to get config for
 * @returns {SourceConfig|null}
 */
function getSourceConfig(url) {
    const domain = getDomainFromUrl(url);
    return SOURCE_CONFIGS[domain] || null;
}

/**
 * Extract data from meta tags (Tier 1 extraction)
 * @param {string} html - Raw HTML
 * @param {string} url - Source URL
 * @returns {OpportunityData}
 */
function extractFromMetaTags(html, url) {
    const $ = cheerio.load(html);
    
    /**
     * @param {string} name - Meta tag name
     * @returns {string}
     */
    const getMeta = (name) => {
        return $(`meta[property="og:${name}"]`).attr('content') ||
               $(`meta[name="${name}"]`).attr('content') ||
               $(`meta[name="twitter:${name}"]`).attr('content') || '';
    };
    
    /**
     * Extract deadline from page text
     * @returns {string}
     */
    const extractDeadline = () => {
        const text = $('body').text();
        const patterns = [
            /deadline[:\s]+([\w\s,]+\d{4})/i,
            /closes?[:\s]+([\w\s,]+\d{4})/i,
            /due[:\s]+([\w\s,]+\d{4})/i,
            /apply\s+by[:\s]+([\w\s,]+\d{4})/i,
            /(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4})/,
            /(\d{4}-\d{2}-\d{2})/,
            /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}/i,
            /\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*\d{4}/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                try {
                    const dateStr = match[1] || match[0];
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime()) && date > new Date()) {
                        return date.toISOString().split('T')[0];
                    }
                } catch {
                    continue;
                }
            }
        }
        return '';
    };
    
    /**
     * Extract organization from domain
     * @returns {string}
     */
    const extractOrg = () => {
        try {
            const domain = new URL(url).hostname.replace('www.', '').split('.')[0];
            return domain.charAt(0).toUpperCase() + domain.slice(1);
        } catch {
            return '';
        }
    };
    
    /**
     * Detect opportunity category
     * @returns {string}
     */
    const detectCategory = () => {
        const text = ($('title').text() + ' ' + $('body').text()).toLowerCase();
        if (text.includes('scholarship') && !text.includes('internship')) return 'Scholarships';
        if (text.includes('internship')) return 'Internships';
        if (text.includes('fellowship')) return 'Fellowships';
        if (text.includes('grant')) return 'Grants';
        if (text.includes('program') || text.includes('bootcamp')) return 'Programs';
        if (text.includes('competition') || text.includes('hackathon')) return 'Competitions';
        return 'Scholarships';
    };
    
    /**
     * Check if opportunity is remote
     * @returns {boolean}
     */
    const isRemote = () => {
        const text = $('body').text().toLowerCase();
        return text.includes('remote') || text.includes('work from home') || 
               text.includes('virtual') || text.includes('online');
    };
    
    const title = getMeta('title') || $('title').text() || '';
    const description = getMeta('description') || '';
    
    return {
        title: title.trim(),
        summary: description.slice(0, 150).trim(),
        description: description.trim(),
        organization: extractOrg(),
        category: detectCategory(),
        location: isRemote() ? 'Remote' : '',
        is_remote: isRemote(),
        application_url: url,
        close_date: extractDeadline(),
        image_url: getMeta('image') || '',
        eligibility: {
            school: '',
            major: '',
            min_cgpa: '',
            countries: []
        },
        requirements: [],
        benefits: []
    };
}

/**
 * AI-powered extraction using Gemini (Tier 2)
 * @param {string} html - Cleaned HTML content
 * @param {string} url - Source URL
 * @returns {Promise<OpportunityData>}
 */
async function extractWithAI(html, url) {
    if (!isGeminiConfigured()) {
        console.warn('[Scraper] Gemini client not configured');
        return {};
    }

    const $ = cheerio.load(html);
    
    // Remove unnecessary elements
    $('script, style, nav, footer, header, aside, .advertisement, .ads, .sidebar, .comments, .related-posts').remove();
    
    // Get main content
    const mainContent = $('main, article, .content, #content, .main-content, .entry-content, .post-content, body')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .slice(0, 8000);

    const prompt = `Extract opportunity details from this webpage content and return ONLY valid JSON.

URL: ${url}

Content: ${mainContent}

Extract these fields in JSON format:
{
  "title": "exact opportunity title",
  "summary": "brief 150-character summary for preview cards",
  "description": "full description (max 500 words)",
  "organization": "hosting organization name",
  "category": "one of: Scholarships, Internships, Fellowships, Grants, Programs, Competitions",
  "location": "city, country or 'Remote' or 'Multiple Locations'",
  "is_remote": true/false,
  "application_url": "direct application URL if different from source",
  "close_date": "deadline in YYYY-MM-DD format if found (must be future date)",
  "image_url": "featured image URL if found",
  "award_amount": "funding amount with currency (e.g., '$5,000', 'Full tuition')",
  "duration": "duration if specified (e.g., '4 years', 'Summer 2024')",
  "eligibility": {
    "school": "school requirements or 'Any'",
    "major": "field of study or 'Any'",
    "min_cgpa": "minimum GPA (e.g., '3.5') or empty",
    "countries": ["list of allowed countries or 'International' for any"]
  },
  "requirements": ["list of required documents/materials"],
  "benefits": ["list of benefits/perks"]
}

Rules:
- If deadline mentions relative time ("in 2 weeks", "next month"), calculate actual date from today (${format(new Date(), 'yyyy-MM-dd')})
- Convert all dates to YYYY-MM-DD format
- Include currency symbols for amounts
- If info is missing, use empty string or empty array
- application_url should be direct apply link, not info page
- Be precise and extract actual values, not placeholders
- Return ONLY valid JSON, no explanations`;

    try {
        const parsed = await generateGeminiJson({
            systemInstruction: 'You are a precise data extraction assistant. Extract opportunity information from web content and return only valid JSON. Be thorough and accurate. Never fabricate information.',
            prompt,
            cacheKey: `scrape:${url}:${mainContent.slice(0, 1200)}`,
        });
        if (!parsed) throw new Error('No structured response from Gemini');
        
        let finalCloseDate = parsed.close_date || '';
        if (finalCloseDate && finalCloseDate.length > 0) {
            try {
                const date = new Date(finalCloseDate);
                if (!isNaN(date.getTime())) {
                    finalCloseDate = format(date, 'yyyy-MM-dd');
                }
            } catch {
                finalCloseDate = '';
            }
        }
        
        return {
            title: parsed.title || '',
            summary: parsed.summary || parsed.description?.slice(0, 150) || '',
            description: parsed.description || '',
            organization: parsed.organization || '',
            category: parsed.category || 'Scholarships',
            location: parsed.location || '',
            is_remote: parsed.is_remote || false,
            application_url: parsed.application_url || url,
            close_date: finalCloseDate,
            image_url: parsed.image_url || '',
            award_amount: parsed.award_amount || '',
            duration: parsed.duration || '',
            eligibility: {
                school: parsed.eligibility?.school || '',
                major: parsed.eligibility?.major || '',
                min_cgpa: parsed.eligibility?.min_cgpa || '',
                countries: Array.isArray(parsed.eligibility?.countries) 
                    ? parsed.eligibility.countries 
                    : [parsed.eligibility?.countries || 'International'].filter(Boolean)
            },
            requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
            benefits: Array.isArray(parsed.benefits) ? parsed.benefits : []
        };
    } catch (error) {
        console.error('[Scraper] AI extraction failed:', error.message);
        return {};
    }
}

/**
 * Calculate confidence score for extracted data
 * @param {OpportunityData} data - Extracted data
 * @returns {number}
 */
function calculateConfidence(data) {
    let score = 0;
    const weights = {
        title: 20,
        organization: 15,
        description: 15,
        close_date: 20,
        eligibility: 15,
        application_url: 15
    };

    for (const [field, weight] of Object.entries(weights)) {
        const value = data[field];
        if (value && (typeof value === 'string' ? value.length > 0 : true)) {
            score += weight;
        }
    }

    // Deductions
    if (!data.close_date) score -= 10;
    if (!data.description || data.description.length < 100) score -= 10;
    
    // Validate deadline is not past
    if (data.close_date) {
        try {
            const deadline = new Date(data.close_date);
            if (!isNaN(deadline.getTime()) && deadline < new Date()) {
                score -= 20;
            }
        } catch {
            score -= 10;
        }
    }

    return Math.max(0, Math.min(100, score));
}

/**
 * Core scraping function with retry logic
 * @param {string} url - URL to scrape
 * @param {Object} options - Scrape options
 * @returns {Promise<ScrapeResult>}
 */
async function scrapeWithRetry(url, options = {}) {
    const {
        maxRetries = DEFAULT_CONFIG.maxRetries,
        timeout = DEFAULT_CONFIG.timeout,
        sourceConfig = null
    } = options;

    const operation = async () => {
        /** @type {Browser|null} */
        let browser = null;
        
        try {
            browser = await chromium.launch({ 
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 720 }
            });
            
            const page = await context.newPage();
            await page.setDefaultTimeout(timeout);
            
            const response = await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout 
            });
            
            if (!response || response.status() >= 400) {
                throw new Error(`HTTP ${response?.status() || 'no response'}`);
            }
            
            await page.waitForTimeout(2000);
            
            const html = await page.content();
            
            // Tier 1: Meta tag extraction
            const metaData = extractFromMetaTags(html, url);
            
            // Tier 2: AI extraction
            const aiData = await extractWithAI(html, url);
            
            // Merge data (AI takes precedence)
            const merged = {
                ...metaData,
                ...aiData,
                title: aiData.title || metaData.title,
                description: aiData.description || metaData.description,
                organization: aiData.organization || metaData.organization,
                close_date: aiData.close_date || metaData.close_date,
                eligibility: aiData.eligibility || metaData.eligibility,
            };
            
            const finalConfidence = calculateConfidence(merged);
            
            return {
                data: merged,
                confidence: finalConfidence,
                source: finalConfidence >= 60 ? 'hybrid' : 'meta',
                errors: finalConfidence < 60 ? ['Low confidence extraction - please review'] : [],
                httpStatus: response?.status() || 200
            };
            
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    };

    return pRetry(operation, {
        retries: maxRetries,
        onFailedAttempt: (error) => {
            console.log(`[Scraper] Retry ${error.attemptNumber} for ${url}: ${error.message}`);
        }
    });
}

/**
 * Main scrape function with error handling
 * @param {string} url - URL to scrape
 * @param {Object} options - Scrape options
 * @returns {Promise<ScrapeResult>}
 */
export async function scrapeUrl(url, options = {}) {
    const errors = [];
    
    try {
        const result = await scrapeWithRetry(url, options);
        return result;
    } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Unknown error');
        
        return {
            data: {
                title: '',
                summary: '',
                description: '',
                organization: '',
                category: 'Scholarships',
                location: '',
                is_remote: false,
                application_url: url,
                close_date: '',
                image_url: '',
                eligibility: {
                    school: '',
                    major: '',
                    min_cgpa: '',
                    countries: []
                },
                requirements: [],
                benefits: []
            },
            confidence: 0,
            source: 'failed',
            errors
        };
    }
}

/**
 * Bulk scrape multiple URLs with rate limiting
 * @param {string[]} urls - Array of URLs to scrape
 * @param {Object} options - Scrape options
 * @returns {Promise<ScrapeResult[]>}
 */
export async function scrapeBulk(urls, options = {}) {
    const results = [];
    const { 
        concurrency = DEFAULT_CONFIG.concurrency, 
        rateLimitDelay = DEFAULT_CONFIG.rateLimitDelay 
    } = options;
    
    const queue = new PQueue({ concurrency });
    
    const scrapeTasks = urls.map(url => async () => {
        await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
        return scrapeUrl(url, options);
    });
    
    results.push(...await queue.addAll(scrapeTasks));
    
    return results;
}

/**
 * Validate URL format
 * @param {string} string - URL to validate
 * @returns {boolean}
 */
export function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Discover opportunity URLs from an aggregator page
 * @param {string} url - Aggregator page URL
 * @param {Object} options - Discovery options
 * @returns {Promise<{success: boolean, count: number, opportunities: Array<{url: string, title: string}>, source_config_used: string|null, error?: string}>}
 */
export async function discoverOpportunities(url, options = {}) {
    const { useSiteConfig = true, enableFiltering = true, minQualityScore = 30 } = options;
    /** @type {Browser|null} */
    let browser = null;
    
    try {
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        });
        
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        
        // Analyze page structure to adjust strategy
        const pageAnalysis = await analyzePageStructure(page);
        console.log(`[Discover] Page analysis: ${pageAnalysis.articleCount} articles, ${pageAnalysis.adContainers} ads`);
        
        // Get site-specific config if enabled
        const sourceConfig = useSiteConfig ? getSourceConfig(url) : null;
        
        /** @type {Array<{url: string, title: string}>} */
        const opportunities = await page.evaluate((config, filtersEnabled, minScore) => {
            const results = [];
            const seen = new Set();
            
            // Try site-specific selectors first
            if (config?.selectors?.list) {
                const cards = document.querySelectorAll(config.selectors.list);
                cards.forEach(card => {
                    const link = card.querySelector(config.selectors.link) || card.querySelector('a[href]');
                    const titleEl = card.querySelector(config.selectors.title) || card.querySelector('h2, h3, h4, .title');
                    
                    if (link && link.href && link.href.startsWith('http')) {
                        const href = link.href;
                        const title = titleEl?.textContent?.trim() || link.textContent?.trim() || '';
                        
                        if (!seen.has(href) && title.length > 3) {
                            seen.add(href);
                            results.push({ url: href, title: title.slice(0, 100), element: card });
                        }
                    }
                });
            }
            
            // Fallback: generic pattern matching with enhanced filtering
            if (results.length < 10 || filtersEnabled) {
                const allLinks = Array.from(document.querySelectorAll('a[href]'));
                const opportunityPatterns = [
                    /scholarship/i, /internship/i, /fellowship/i, /grant/i,
                    /program/i, /opportunity/i, /apply/i, /vacancy/i,
                    /position/i, /award/i, /funding/i, /contest/i, /competition/i
                ];
                
                const excludePatterns = [
                    /\/category\//i, /\/tag\//i, /\/search\//i, /\/page\//i,
                    /\/author\//i, /\/feed\//i, /\/comments\//i, /#comment/i,
                    /javascript:/i, /mailto:/i,
                    /\.(pdf|doc|docx|ppt|xls|zip)$/i,  // File types
                    /\/ads\/|\/sponsor\/|\/banner\//i,   // Ads
                    /\/ref\/|\/track\/|\/click\//i       // Tracking
                ];
                
                for (const link of allLinks) {
                    const href = link.href;
                    const text = link.textContent?.trim() || '';
                    
                    if (!href || !href.startsWith('http')) continue;
                    
                    // Apply exclude patterns
                    const shouldExclude = excludePatterns.some(p => p.test(href));
                    if (shouldExclude) continue;
                    
                    // Check quality thresholds
                    if (text.length < 5) continue;
                    if (/^(read more|click here|learn more|apply now|view all|next|prev|back|home)$/i.test(text)) continue;
                    
                    // Check opportunity patterns
                    const isOpportunity = opportunityPatterns.some(p => 
                        p.test(href) || p.test(text)
                    );
                    
                    if (isOpportunity && !seen.has(href)) {
                        seen.add(href);
                        results.push({ url: href, title: text.slice(0, 100), element: link });
                    }
                }
            }
            
            // Remove duplicates and apply quality filters
            const uniqueResults = [];
            const uniqueUrls = new Set();
            
            for (const item of results) {
                if (!uniqueUrls.has(item.url)) {
                    // Calculate quality score
                    let score = 50;
                    const urlLower = item.url.toLowerCase();
                    const titleLower = item.title.toLowerCase();
                    
                    if (/scholarship/i.test(urlLower)) score += 20;
                    if (/internship/i.test(urlLower)) score += 20;
                    if (/fellowship/i.test(urlLower)) score += 20;
                    if (/\/202[0-9]\//.test(urlLower)) score += 10;
                    
                    // Only include if meets quality threshold
                    if (score >= minScore) {
                        uniqueUrls.add(item.url);
                        uniqueResults.push({ url: item.url, title: item.title, quality: score });
                    }
                }
            }
            
            return uniqueResults;
        }, sourceConfig, enableFiltering, minQualityScore);
        
        // Deduplicate
        const uniqueUrls = [];
        const seen = new Set();
        
        for (const opp of opportunities) {
            if (!seen.has(opp.url)) {
                seen.add(opp.url);
                uniqueUrls.push(opp);
            }
        }
        
        return {
            success: true,
            count: uniqueUrls.length,
            opportunities: uniqueUrls,
            source_config_used: sourceConfig ? getDomainFromUrl(url) : null
        };
        
    } catch (error) {
        return {
            success: false,
            count: 0,
            opportunities: [],
            error: error instanceof Error ? error.message : 'Unknown error',
            source_config_used: null
        };
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * Get all source configurations
 * @returns {Object}
 */
export function getSourceConfigs() {
    return SOURCE_CONFIGS;
}

/**
 * Get default configuration
 * @returns {Object}
 */
export function getDefaultConfig() {
    return { ...DEFAULT_CONFIG };
}

/**
 * Validate extracted opportunity data
 * @param {OpportunityData} data - Data to validate
 * @returns {Promise<{isValid: boolean, errors: string[], warnings: string[]}>}
 */
export async function validateOpportunityData(data) {
    const errors = [];
    const warnings = [];
    
    // Validate title
    if (!data.title || data.title.length < 5) {
        errors.push('Title is missing or too short');
    }
    
    // Validate organization
    if (!data.organization || data.organization.length < 2) {
        warnings.push('Organization name is missing');
    }
    
    // Validate close date
    if (data.close_date) {
        try {
            const closeDate = new Date(data.close_date);
            if (!isValid(closeDate)) {
                errors.push('Invalid close date format');
            } else if (closeDate < new Date()) {
                warnings.push('Close date is in the past');
            }
        } catch {
            errors.push('Invalid close date');
        }
    }
    
    // Validate description
    if (!data.description || data.description.length < 50) {
        warnings.push('Description is missing or too short');
    }
    
    // Validate application URL
    if (!data.application_url || !isValidUrl(data.application_url)) {
        errors.push('Application URL is invalid');
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Calculate title similarity for duplicate detection (0-100%)
 * @param {string} title1 - First title
 * @param {string} title2 - Second title  
 * @returns {number}
 */
function calculateTitleSimilarity(title1, title2) {
    const normalize = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const n1 = normalize(title1);
    const n2 = normalize(title2);
    
    if (n1 === n2) return 100;
    if (!n1 || !n2) return 0;
    
    // Levenshtein-like simple similarity
    const longer = n1.length > n2.length ? n1 : n2;
    const shorter = n1.length > n2.length ? n2 : n1;
    
    if (longer.length === 0) return 100;
    
    const editDistance = (a, b) => {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const cost = a[i-1] === b[j-1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i-1] + 1,
                    matrix[j-1][i] + 1,
                    matrix[j-1][i-1] + cost
                );
            }
        }
        return matrix[b.length][a.length];
    };
    
    const distance = editDistance(longer, shorter);
    return Math.round((1 - distance / longer.length) * 100);
}

/**
 * Check if opportunity is likely expired
 * @param {string} closeDate - Close date string
 * @returns {boolean}
 */
function isExpired(closeDate) {
    if (!closeDate) return false;
    try {
        const close = new Date(closeDate);
        const now = new Date();
        const daysUntilClose = (close - now) / (1000 * 60 * 60 * 24);
        return daysUntilClose < -7; // More than 7 days past
    } catch {
        return false;
    }
}

/**
 * Enhanced quality scoring with auto-approval thresholds
 * @param {OpportunityData} data - Extracted data
 * @param {Object} thresholds - Custom thresholds
 * @returns {Object} - { score, autoApprove, review, reject }
 */
export function calculateQualityScore(data, thresholds = {}) {
    const {
        minAcceptance = DEFAULT_CONFIG.minConfidence,
        autoApproveThreshold = DEFAULT_CONFIG.autoApproveConfidence
    } = thresholds;
    
    let score = calculateConfidence(data);
    
    // Bonus points for completeness
    if (data.award_amount && data.award_amount.length > 0) score += 5;
    if (data.duration && data.duration.length > 0) score += 3;
    if (data.eligibility?.school && data.eligibility.school !== 'Any') score += 3;
    if (data.eligibility?.major && data.eligibility.major !== 'Any') score += 3;
    if (data.requirements?.length > 0) score += 3;
    if (data.benefits?.length > 0) score += 3;
    
    // Penalties for issues
    if (isExpired(data.close_date)) score -= 30;
    if (!data.image_url) score -= 2;
    if (!data.eligibility?.countries?.length) score -= 2;
    
    score = Math.max(0, Math.min(100, score));
    
    return {
        score,
        autoApprove: score >= autoApproveThreshold,
        review: score >= minAcceptance && score < autoApproveThreshold,
        reject: score < minAcceptance,
        reasons: {
            hasDeadline: !!data.close_date,
            hasAmount: !!data.award_amount,
            hasOrg: !!data.organization,
            hasDescription: (data.description?.length || 0) > 100,
            isExpired: isExpired(data.close_date)
        }
    };
}

/**
 * Find similar opportunities by title (for duplicate detection)
 * @param {string} title - Title to check
 * @param {Array<{title: string}>} existingOpportunities - Existing opportunities
 * @param {number} similarityThreshold - Minimum similarity (default 80%)
 * @returns {Array<{title: string, similarity: number}>}
 */
export function findSimilarOpportunities(title, existingOpportunities, similarityThreshold = 80) {
    const similar = [];
    
    for (const opp of existingOpportunities) {
        const similarity = calculateTitleSimilarity(title, opp.title);
        if (similarity >= similarityThreshold) {
            similar.push({ title: opp.title, similarity });
        }
    }
    
    return similar.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Discover opportunities with pagination support
 * @param {string} url - Base URL to discover from
 * @param {Object} options - Discovery options
 * @returns {Promise<DiscoverResult>}
 */
export async function discoverWithPagination(url, options = {}) {
    const {
        maxPages = 3,
        maxItemsPerPage = 30,
        useSiteConfig = true,
        handleInfiniteScroll = false
    } = options;
    
    const allOpportunities = [];
    const seenUrls = new Set();
    
    /** @type {Browser|null} */
    let browser = null;
    
    try {
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        const page = await context.newPage();
        
        const sourceConfig = useSiteConfig ? getSourceConfig(url) : null;
        
        // Paginate through results
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
            const pageUrl = pageNum === 1 ? url : `${url}${url.includes('?') ? '&' : '?'}page=${pageNum}`;
            
            try {
                await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
                await page.waitForTimeout(2000);
                
                // Handle infinite scroll if enabled
                if (handleInfiniteScroll) {
                    await page.evaluate(async () => {
                        for (let i = 0; i < 3; i++) {
                            window.scrollTo(0, document.body.scrollHeight);
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    });
                }
                
                const opportunities = await page.evaluate((config) => {
                    const results = [];
                    const seen = new Set();
                    
                    // Site-specific selectors
                    if (config?.selectors?.list) {
                        const cards = document.querySelectorAll(config.selectors.list);
                        cards.slice(0, 30).forEach(card => {
                            const link = card.querySelector(config.selectors.link) || card.querySelector('a[href]');
                            const titleEl = card.querySelector(config.selectors.title) || card.querySelector('h2, h3, h4, .title');
                            
                            if (link?.href?.startsWith('http')) {
                                const href = link.href;
                                const title = titleEl?.textContent?.trim() || link.textContent?.trim() || '';
                                
                                if (!seen.has(href) && title.length > 3) {
                                    seen.add(href);
                                    results.push({ url: href, title: title.slice(0, 100), page: window.location.href });
                                }
                            }
                        });
                    }
                    
                    // Fallback: generic pattern matching
                    if (results.length < 5) {
                        const allLinks = Array.from(document.querySelectorAll('a[href]'));
                        const patterns = [/scholarship/i, /internship/i, /fellowship/i, /grant/i, /program/i];
                        const exclude = [/\/category\//i, /\/tag\//i, /\/page\//i, /javascript:/i];
                        
                        for (const link of allLinks) {
                            const href = link.href;
                            const text = link.textContent?.trim() || '';
                            
                            if (!href?.startsWith('http')) continue;
                            if (exclude.some(p => p.test(href))) continue;
                            
                            const isMatch = patterns.some(p => p.test(href) || p.test(text));
                            if (isMatch && text.length > 5 && !seen.has(href)) {
                                seen.add(href);
                                results.push({ url: href, title: text.slice(0, 100), page: window.location.href });
                            }
                        }
                    }
                    
                    return results;
                }, sourceConfig);
                
                // Add unique opportunities
                for (const opp of opportunities) {
                    if (!seenUrls.has(opp.url) && allOpportunities.length < maxItemsPerPage * maxPages) {
                        seenUrls.add(opp.url);
                        allOpportunities.push(opp);
                    }
                }
                
                // Check if there are more pages
                const nextButton = await page.$('a.next, a[rel="next"], .next-page, a:contains("Next")');
                if (!nextButton && pageNum > 1) break;
                
            } catch (pageError) {
                console.log(`[Pagination] Error on page ${pageNum}:`, pageError.message);
                break;
            }
        }
        
        return {
            success: true,
            count: allOpportunities.length,
            opportunities: allOpportunities,
            source_config_used: sourceConfig ? getDomainFromUrl(url) : null,
            pages_scanned: maxPages
        };
        
    } catch (error) {
        return {
            success: false,
            count: 0,
            opportunities: allOpportunities,
            error: error.message,
            source_config_used: null
        };
    } finally {
        if (browser) await browser.close();
    }
}

export default {
    scrapeUrl,
    scrapeBulk,
    discoverOpportunities,
    discoverWithPagination,
    isValidUrl,
    getSourceConfigs,
    getDefaultConfig,
    validateOpportunityData,
    calculateQualityScore,
    findSimilarOpportunities,
    isExpired,
    calculateTitleSimilarity,
    DEFAULT_CONFIG,
    SOURCE_CONFIGS
};
