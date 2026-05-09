/**
 * Advanced Discovery Filters - Handle messy, unfiltered websites
 */

// Patterns to exclude (advertisements, navigation, non-opportunities)
export const EXCLUDE_PATTERNS = {
    // Navigation & meta
    nav: /\/nav|\/menu|\/header|\/footer|\/sidebar|\/widget/i,
    category: /\/category\/|\/tag\/|\/taxonomy|\/archive/i,
    author: /\/author\/|\/profile\/|\/user\//i,
    system: /\/feed\/|\/rss|\/sitemap|\/robots|\/admin\/|\/login|\/register/i,
    social: /\/share|\/follow|\/subscribe|\/newsletter/i,
    comments: /\/comment|\/review|\/testimonial/i,
    search: /\/search\/|\/query\/|\/filter\/|\/sort\//i,
    pagination: /\/page\/\d+|\/p\/\d+|offset=\d+/i,
    
    // File types (not opportunities)
    media: /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar)$/i,
    images: /\.(jpg|jpeg|png|gif|svg|webp)\?|\/thumb|\/preview/i,
    
    // Advertisements (common ad patterns)
    ads: /\/ads\/|\/advert|\/sponsor|\/promo|\/banner|\/out\/|\/click\//i,
    affiliate: /\/ref\/|\/goto\/|\/track\/|\/recommend\//i,
    
    // Tree route / breadcrumbs
    breadcrumb: /\/home\/|\/root\/|\/directory\/|\/list\//i,
    
    // External links (usually ads or partners)
    external: /^https?:\/\/(?!.*opportunitiescircle|.*oyaopportunities|.*scholars|.*fellowship)/i,
    
    // JavaScript & special links
    javascript: /javascript:|mailto:|tel:/i,
    
    // Very short or meaningless titles
    shortTitle: /^(read more|click here|learn more|apply now|view all|next|prev|back|home)$/i,
    
    // Numbers only (page numbers, dates)
    numberOnly: /^\d+$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d+$/i
};

// Quality thresholds
export const QUALITY_THRESHOLDS = {
    minTitleLength: 10,
    maxTitleLength: 200,
    minDescriptionLength: 50,
    
    // Minimum text content ratio (not mostly ads/images)
    minContentRatio: 0.3,
    
    // Maximum links per container (likely a nav/menu)
    maxLinksPerContainer: 20,
    
    // Exclude containers that are clearly ads
    adClassNames: /ad|sponsor|promo|banner|advertisement|sidebar|widget|related|popular/i,
    adIdNames: /ad-|ads-|sponsor-|promo-|banner-/i
};

/**
 * Check if a link should be excluded
 * @param {string} url - Link URL
 * @param {string} text - Link text
 * @param {HTMLElement} element - Link element
 * @returns {Object} - { shouldExclude, reasons }
 */
export function shouldExcludeLink(url, text, element = null) {
    const reasons = [];
    
    if (!url || !url.startsWith('http')) {
        return { shouldExclude: true, reasons: ['invalid URL'] };
    }
    
    // Check all exclude patterns
    for (const [category, pattern] of Object.entries(EXCLUDE_PATTERNS)) {
        if (pattern.test(url)) {
            reasons.push(`url matches ${category} pattern`);
        }
    }
    
    // Check link text
    if (text.length < QUALITY_THRESHOLDS.minTitleLength) {
        reasons.push('title too short');
    }
    
    if (QUALITY_THRESHOLDS.shortTitle.test(text.toLowerCase())) {
        reasons.push('meaningless title');
    }
    
    if (QUALITY_THRESHOLDS.numberOnly.test(text)) {
        reasons.push('number-only title');
    }
    
    // Check parent container for ad indicators
    if (element) {
        const parent = element.closest('[class], [id]');
        if (parent) {
            const className = parent.className || '';
            const id = parent.id || '';
            
            if (QUALITY_THRESHOLDS.adClassNames.test(className)) {
                reasons.push('parent has ad class');
            }
            if (QUALITY_THRESHOLDS.adIdNames.test(id)) {
                reasons.push('parent has ad ID');
            }
        }
        
        // Check link density (if parent has too many links, it's likely nav)
        const parentContainer = element.closest('nav, ul, ol, .menu, .nav, .sidebar, .links');
        if (parentContainer) {
            const linkCount = parentContainer.querySelectorAll('a').length;
            if (linkCount > QUALITY_THRESHOLDS.maxLinksPerContainer) {
                reasons.push(`too many links in container (${linkCount})`);
            }
        }
    }
    
    return {
        shouldExclude: reasons.length > 0,
        reasons
    };
}

/**
 * Filter and clean discovered links
 * @param {Array<{url: string, title: string}>} opportunities - Raw discoveries
 * @returns {Array<{url: string, title: string, quality: Object}>}
 */
export function filterDiscoveries(opportunities) {
    const filtered = [];
    
    for (const opp of opportunities) {
        const { shouldExclude, reasons } = shouldExcludeLink(opp.url, opp.title);
        
        if (!shouldExclude) {
            filtered.push({
                url: opp.url,
                title: cleanTitle(opp.title),
                quality: {
                    score: calculateLinkQuality(opp.url, opp.title),
                    isLikelyOpportunity: isLikelyOpportunity(opp.url, opp.title)
                }
            });
        }
    }
    
    // Sort by quality score (highest first)
    return filtered.sort((a, b) => b.quality.score - a.quality.score);
}

/**
 * Clean title text
 * @param {string} title - Raw title
 * @returns {string}
 */
function cleanTitle(title) {
    return title
        .replace(/\s+/g, ' ')           // Normalize whitespace
        .replace(/^[>\-\d\s]+/, '')     // Remove leading bullets/numbers
        .replace(/[>\-\s]+$/, '')        // Remove trailing
        .trim()
        .slice(0, 200);                  // Limit length
}

/**
 * Calculate quality score for a link
 * @param {string} url
 * @param {string} title
 * @returns {number} 0-100
 */
function calculateLinkQuality(url, title) {
    let score = 50;
    
    // URL-based scoring
    const urlLower = url.toLowerCase();
    
    // Strong opportunity indicators
    if (/scholarship/i.test(urlLower)) score += 20;
    if (/internship/i.test(urlLower)) score += 20;
    if (/fellowship/i.test(urlLower)) score += 20;
    if (/grant/i.test(urlLower)) score += 15;
    if (/apply/i.test(urlLower)) score += 10;
    if (/program/i.test(urlLower)) score += 10;
    
    // Title-based scoring
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('scholarship')) score += 15;
    if (titleLower.includes('fellowship')) score += 15;
    if (titleLower.includes('internship')) score += 15;
    if (titleLower.includes('grant')) score += 10;
    if (titleLower.includes('award')) score += 10;
    
    // Penalties
    if (/\/202[0-9]\//.test(url)) score += 5; // Year-based (usually opportunities)
    if (/\?/.test(url)) score -= 10; // Query params (often tracking)
    if (url.length > 200) score -= 10; // Very long URLs often tracking
    
    return Math.max(0, Math.min(100, score));
}

/**
 * Determine if URL is likely an opportunity
 * @param {string} url
 * @param {string} title
 * @returns {boolean}
 */
function isLikelyOpportunity(url, title) {
    const patterns = [
        /scholarship/i,
        /internship/i,
        /fellowship/i,
        /grant/i,
        /program/i,
        /opportunity/i,
        /award/i,
        /funding/i,
        /contest/i,
        /competition/i
    ];
    
    return patterns.some(p => p.test(url) || p.test(title));
}

/**
 * Detect page type to adjust scraping strategy
 * @param {Page} page - Playwright page
 * @returns {Object}
 */
export async function analyzePageStructure(page) {
    return await page.evaluate(() => {
        const result = {
            hasPagination: false,
            hasInfiniteScroll: false,
            hasLoadMore: false,
            articleCount: 0,
            adContainers: 0,
            navLinks: 0
        };
        
        // Check for pagination
        result.hasPagination = !!(
            document.querySelector('.pagination, .pager, .page-numbers, a[rel="next"], .next') ||
            document.querySelectorAll('a[href*="page"]').length > 0
        );
        
        // Check for load more button
        result.hasLoadMore = !!(
            document.querySelector('.load-more, .loadmore, [data-action="load-more"], button:contains("Load More")')
        );
        
        // Check for infinite scroll (scrollable container)
        const scrollable = document.querySelector('[style*="overflow"]');
        result.hasInfiniteScroll = !!(scrollable && scrollable.scrollHeight > scrollable.clientHeight);
        
        // Count articles/posts
        result.articleCount = document.querySelectorAll('article, .post, .entry, .card, .opportunity, .scholarship').length;
        
        // Count ad containers
        result.adContainers = document.querySelectorAll('[class*="ad"], [id*="ad"], .sponsor, .promo').length;
        
        // Count navigation links
        result.navLinks = document.querySelectorAll('nav a, .menu a, .nav a').length;
        
        return result;
    });
}

/**
 * Enhanced discover with filtering
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function discoverWithFilters(url, options = {}) {
    const { enableFiltering = true, minQualityScore = 30 } = options;
    
    // ... (uses the filtering logic above)
    // This would integrate with the main discoverOpportunities function
}

export default {
    EXCLUDE_PATTERNS,
    QUALITY_THRESHOLDS,
    shouldExcludeLink,
    filterDiscoveries,
    calculateLinkQuality,
    isLikelyOpportunity,
    analyzePageStructure
};
