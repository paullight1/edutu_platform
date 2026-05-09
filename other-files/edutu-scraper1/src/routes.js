import { createPlaywrightRouter, enqueueLinks } from '@crawlee/playwright';
import { Dataset } from '@crawlee/core';

export const router = createPlaywrightRouter();

function detectSite(url) {
    if (url.includes('opportunitiescircle.com')) return 'opportunitiescircle';
    if (url.includes('globalscholardesk.com')) return 'globalscholardesk';
    if (url.includes('internationalscholarships.com')) return 'internationalscholarships';
    if (url.includes('smartyacad.com/category/scholarship')) return 'smartyacad-scholarship';
    if (url.includes('smartyacad.com/category/grants')) return 'smartyacad-grants';
    return 'default';
}

function normalizeScholarship(item) {
    return {
        title: item.title?.trim() || '',
        organization: item.organization?.trim() || item.provider?.trim() || '',
        description: item.description?.trim() || item.summary?.trim() || '',
        deadline: item.deadline || null,
        amount: item.amount || item.fundingType || '',
        eligibility: item.eligibility || item.requirements || '',
        location: item.location || item.country || item.targetRegion || '',
        url: item.url || item.applyUrl || item.link || '',
        sourceUrl: item.sourceUrl || item.url || '',
        imageUrl: item.imageUrl || null,
        category: item.category || 'scholarship',
        type: 'scholarship',
    };
}

// Main handler for listing pages
router.addDefaultHandler(async ({ page, request, log, pushData, enqueueLinks }) => {
    const site = detectSite(request.url);
    log.info(`Processing ${site}: ${request.url}`);

    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    let items = [];

    try {
        switch (site) {
            case 'opportunitiescircle':
                items = await extractOpportunitiesCircle(page);
                break;
            case 'globalscholardesk':
                items = await extractGlobalScholarDesk(page);
                break;
            case 'internationalscholarships':
                items = await extractInternationalScholarships(page);
                break;
            case 'smartyacad-scholarship':
            case 'smartyacad-grants':
                items = await extractSmartYacad(page, site);
                break;
            default:
                items = await extractDefault(page);
        }
    } catch (err) {
        log.error(`Extraction error for ${request.url}: ${err.message}`);
    }

    if (items.length > 0) {
        for (const item of items) {
            const normalized = normalizeScholarship({
                ...item,
                category: site.includes('grant') ? 'grant' : 'scholarship'
            });
            if (normalized.title && normalized.url) {
                // Enqueue detail page to get apply URL
                await enqueueLinks({
                    urls: [normalized.url],
                    label: 'detail-page',
                    userData: { parentItem: normalized }
                });
            }
        }
        log.info(`Enqueued ${items.length} detail pages from ${request.url}`);
    }
});

// Detail page handler to extract apply URLs
router.addHandler('detail-page', async ({ page, request, log, pushData }) => {
    const { parentItem } = request.userData;
    log.info(`Processing detail page: ${request.url}`);
    
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    
    try {
        const detailData = await page.evaluate(() => {
            // Look for apply buttons/links
            const applySelectors = [
                'a[href*="apply"], a[href*="application"], a[href*="register"]',
                '.apply-btn, .apply-button, .btn-apply',
                'button:has-text("Apply"), button:has-text("Register")',
                'a:has-text("Apply Now"), a:has-text("Apply Here")',
                'a[href*="external"], a[href*="redirect"]',
                '.external-link, .apply-link',
                '[class*="apply"] a, [class*="application"] a'
            ];
            
            let applyUrl = '';
            for (const selector of applySelectors) {
                const el = document.querySelector(selector);
                if (el?.href) {
                    applyUrl = el.href;
                    break;
                }
            }
            
            // Get full description
            const descSelectors = [
                '.entry-content', '.post-content', '.content', '.description',
                '.scholarship-details', '.opportunity-details', '.details',
                'article p', '.main-content', '#content'
            ];
            
            let fullDescription = '';
            for (const selector of descSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    fullDescription = el.textContent?.trim().substring(0, 1000) || '';
                    break;
                }
            }
            
            // Get deadline from detail page
            const deadlineSelectors = [
                '[class*="deadline"]',
                '[class*="date"]',
                'time',
                '.close-date', '.end-date',
                'p:has-text("Deadline")', 'p:has-text("Closing")',
                'span:has-text("Deadline")', 'span:has-text("Due")'
            ];
            
            let detailDeadline = '';
            for (const selector of deadlineSelectors) {
                const els = document.querySelectorAll(selector);
                for (const el of els) {
                    const text = el.textContent?.toLowerCase() || '';
                    if (text.includes('deadline') || text.includes('due') || text.includes('close') || text.includes('end')) {
                        detailDeadline = el.textContent?.trim() || '';
                        break;
                    }
                }
                if (detailDeadline) break;
            }
            
            // Get eligibility
            const eligSelectors = [
                '[class*="eligibility"]', '[class*="requirement"]',
                'h2:has-text("Eligibility") + *', 'h3:has-text("Eligibility") + *',
                'p:has-text("eligible")', 'p:has-text("requirement")'
            ];
            
            let eligibility = '';
            for (const selector of eligSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    eligibility = el.textContent?.trim().substring(0, 500) || '';
                    break;
                }
            }
            
            return { applyUrl, fullDescription, detailDeadline, eligibility };
        });
        
        const finalItem = {
            ...parentItem,
            description: detailData.fullDescription || parentItem.description,
            applyUrl: detailData.applyUrl || parentItem.url,
            deadline: detailData.detailDeadline || parentItem.deadline,
            eligibilityCriteria: detailData.eligibility || parentItem.eligibility,
        };
        
        await pushData(finalItem);
        log.info(`Saved detail for: ${finalItem.title}`);
        
    } catch (err) {
        log.error(`Detail extraction failed: ${err.message}`);
        // Save parent item anyway if detail fails
        await pushData(parentItem);
    }
});

async function extractOpportunitiesCircle(page) {
    const items = await page.evaluate(() => {
        const results = [];
        
        const cards = document.querySelectorAll('.opportunity-card, .scholarship-card, article, .post, .entry');
        
        cards.forEach(card => {
            const titleEl = card.querySelector('h2, h3, h4, .entry-title a, .title a, a[rel="bookmark"]');
            const title = titleEl?.textContent?.trim() || '';
            
            const linkEl = card.querySelector('a[href*="opportunity"], a[href*="scholarship"], h2 a, h3 a, .entry-title a');
            const url = linkEl?.href || '';
            
            const descEl = card.querySelector('.excerpt, .entry-summary, .summary');
            const description = descEl?.textContent?.trim() || '';
            
            const deadlineEl = card.querySelector('.deadline-text, .date, [class*="deadline"]');
            const deadline = deadlineEl?.textContent?.trim() || '';
            
            const orgEl = card.querySelector('.provider, .organization, .sponsor');
            const organization = orgEl?.textContent?.trim() || '';
            
            const amountEl = card.querySelector('.amount, .funding, [class*="amount"]');
            const amount = amountEl?.textContent?.trim() || '';
            
            const imgEl = card.querySelector('img');
            const imageUrl = imgEl?.src || null;

            if (title && url) {
                results.push({ title, url, description, deadline, organization, amount, imageUrl });
            }
        });

        return results;
    });

    return items;
}

async function extractGlobalScholarDesk(page) {
    const items = await page.evaluate(() => {
        const results = [];
        
        const posts = document.querySelectorAll('.post, article, .entry');
        
        posts.forEach(post => {
            const titleEl = post.querySelector('h2 a, .entry-title a, .post-title a');
            const title = titleEl?.textContent?.trim() || '';
            
            const linkEl = post.querySelector('h2 a, .entry-title a');
            const url = linkEl?.href || '';
            
            const descEl = post.querySelector('.entry-summary, .excerpt, p');
            const description = descEl?.textContent?.trim()?.substring(0, 300) || '';
            
            const imgEl = post.querySelector('img.wp-post-image, .featured-image img');
            const imageUrl = imgEl?.src || null;
            
            if (title && url) {
                results.push({ title, url, description, imageUrl });
            }
        });

        return results;
    });

    return items;
}

async function extractInternationalScholarships(page) {
    const items = await page.evaluate(() => {
        const results = [];
        
        const rows = document.querySelectorAll('table tbody tr, .scholarship-row, .listing-item');
        
        rows.forEach(row => {
            const titleEl = row.querySelector('td:first-child a, .title a, a');
            const title = titleEl?.textContent?.trim() || '';
            
            const linkEl = row.querySelector('a[href]');
            const url = linkEl?.href || '';
            
            if (title && url && title.length > 3) {
                results.push({ title, url });
            }
        });

        if (results.length === 0) {
            const links = document.querySelectorAll('a[href*="scholarship"], a[href*="fellowship"]');
            links.forEach(link => {
                const title = link.textContent?.trim();
                const url = link.href;
                if (title && url && title.length > 5 && !title.includes('Next') && !title.includes('Previous')) {
                    results.push({ title, url });
                }
            });
        }

        return results;
    });

    return items;
}

async function extractSmartYacad(page, siteType) {
    const items = await page.evaluate((siteType) => {
        const results = [];
        
        const cards = document.querySelectorAll('.job-card, .job-listing, article, .post');
        
        cards.forEach(card => {
            const titleEl = card.querySelector('h2 a, .job-title a, .title a');
            const title = titleEl?.textContent?.trim() || '';
            
            const linkEl = card.querySelector('h2 a, .job-title a');
            const url = linkEl?.href || '';
            
            const companyEl = card.querySelector('.company, .organization');
            const organization = companyEl?.textContent?.trim() || '';
            
            const locationEl = card.querySelector('.location');
            const location = locationEl?.textContent?.trim() || '';
            
            const descEl = card.querySelector('.description, .excerpt');
            const description = descEl?.textContent?.trim()?.substring(0, 300) || '';
            
            if (title && url) {
                results.push({ 
                    title, 
                    url, 
                    description, 
                    organization, 
                    location,
                    category: siteType.includes('grant') ? 'grant' : 'scholarship'
                });
            }
        });

        return results;
    }, siteType);

    return items;
}

async function extractDefault(page) {
    const items = await page.evaluate(() => {
        const results = [];
        
        const selectors = [
            'article', '.scholarship', '.opportunity', '.listing', 
            '.card', '.item', '.post'
        ];
        
        for (const sel of selectors) {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
                elements.forEach(el => {
                    const link = el.querySelector('a[href]');
                    const title = el.querySelector('h1, h2, h3, .title')?.textContent?.trim();
                    
                    if (title && link?.href) {
                        results.push({
                            title,
                            url: link.href,
                            description: el.textContent?.trim()?.substring(0, 200) || ''
                        });
                    }
                });
                if (results.length > 0) break;
            }
        }

        return results;
    });

    return items;
}
