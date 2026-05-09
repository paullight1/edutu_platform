import OpenAI from 'openai';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Tier 1: Extract from meta tags
function extractFromMetaTags(html, url) {
    const $ = cheerio.load(html);
    
    const getMeta = (name) => {
        return $(`meta[property="og:${name}"]`).attr('content') ||
               $(`meta[name="${name}"]`).attr('content') ||
               $(`meta[name="twitter:${name}"]`).attr('content') || '';
    };
    
    // Extract deadline from various patterns
    const extractDeadline = () => {
        const text = $('body').text();
        const patterns = [
            /deadline[:\s]+([\w\s,]+\d{4})/i,
            /closes?[:\s]+([\w\s,]+\d{4})/i,
            /due[:\s]+([\w\s,]+\d{4})/i,
            /apply\s+by[:\s]+([\w\s,]+\d{4})/i,
            /(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4})/,
            /(\d{4}-\d{2}-\d{2})/
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const date = new Date(match[1]);
                if (!isNaN(date.getTime())) {
                    return date.toISOString().split('T')[0];
                }
            }
        }
        return '';
    };
    
    // Extract organization from URL
    const extractOrg = () => {
        try {
            const domain = new URL(url).hostname.replace('www.', '').split('.')[0];
            return domain.charAt(0).toUpperCase() + domain.slice(1);
        } catch {
            return '';
        }
    };
    
    // Detect category
    const detectCategory = () => {
        const text = ($('title').text() + ' ' + $('body').text()).toLowerCase();
        if (text.includes('scholarship')) return 'Scholarships';
        if (text.includes('internship')) return 'Internships';
        if (text.includes('fellowship')) return 'Fellowships';
        if (text.includes('grant')) return 'Grants';
        if (text.includes('program') || text.includes('bootcamp')) return 'Programs';
        if (text.includes('competition') || text.includes('hackathon')) return 'Competitions';
        return 'Scholarships';
    };
    
    // Check for remote
    const isRemote = () => {
        const text = $('body').text().toLowerCase();
        return text.includes('remote') || text.includes('work from home') || text.includes('virtual');
    };
    
    const title = getMeta('title') || $('title').text() || '';
    const description = getMeta('description') || '';
    
    return {
        title,
        summary: description.slice(0, 150),
        description,
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

// Tier 2: AI-powered extraction
async function extractWithAI(html, url) {
    // Clean HTML for AI
    const $ = cheerio.load(html);
    
    // Remove script, style, nav, footer elements
    $('script, style, nav, footer, header, aside, .advertisement, .ads').remove();
    
    // Get main content
    const text = $('main, article, .content, #content, .main-content, body')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .slice(0, 6000);

    const prompt = `Extract opportunity details from this webpage content and return ONLY valid JSON.

URL: ${url}

Content: ${text}

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
  "close_date": "deadline in YYYY-MM-DD format if found",
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
- If deadline mentions relative time ("in 2 weeks"), calculate actual date
- Convert all dates to YYYY-MM-DD format
- Include currency symbols for amounts
- If info is missing, use empty string or empty array
- application_url should be direct apply link, not info page
- Be precise and extract actual values, not placeholders`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo-1106',
            messages: [
                {
                    role: 'system',
                    content: 'You are a precise data extraction assistant. Extract opportunity information from web content and return only valid JSON. Be thorough and accurate.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 2000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('No response from AI');

        const parsed = JSON.parse(content);
        
        return {
            title: parsed.title || '',
            summary: parsed.summary || parsed.description?.slice(0, 150) || '',
            description: parsed.description || '',
            organization: parsed.organization || '',
            category: parsed.category || 'Scholarships',
            location: parsed.location || '',
            is_remote: parsed.is_remote || false,
            application_url: parsed.application_url || url,
            close_date: parsed.close_date || '',
            image_url: parsed.image_url || '',
            award_amount: parsed.award_amount || '',
            duration: parsed.duration || '',
            eligibility: {
                school: parsed.eligibility?.school || '',
                major: parsed.eligibility?.major || '',
                min_cgpa: parsed.eligibility?.min_cgpa || '',
                countries: Array.isArray(parsed.eligibility?.countries) 
                    ? parsed.eligibility.countries 
                    : [parsed.eligibility?.countries || 'International']
            },
            requirements: parsed.requirements || [],
            benefits: parsed.benefits || []
        };
    } catch (error) {
        console.error('AI extraction failed:', error);
        return {};
    }
}

// Calculate confidence score
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
        const deadline = new Date(data.close_date);
        if (!isNaN(deadline.getTime()) && deadline < new Date()) {
            score -= 20;
        }
    }

    return Math.max(0, Math.min(100, score));
}

// Main extraction function
export async function scrapeUrl(url) {
    const errors = [];
    let browser;
    
    try {
        // Launch browser
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        const page = await context.newPage();
        
        // Navigate and wait for content
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Get page content
        const html = await page.content();
        
        // Try meta tags first (Tier 1)
        const metaData = extractFromMetaTags(html, url);
        
        // Use AI for better extraction (Tier 2)
        const aiData = await extractWithAI(html, url);
        
        // Merge meta and AI data (AI takes precedence)
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
        
        await browser.close();
        
        return {
            data: merged,
            confidence: finalConfidence,
            source: finalConfidence >= 60 ? 'hybrid' : 'manual',
            errors: finalConfidence < 60 ? ['Low confidence extraction - please review'] : []
        };
        
    } catch (error) {
        if (browser) await browser.close();
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
            source: 'manual',
            errors
        };
    }
}

// Bulk scraping function
export async function scrapeBulk(urls) {
    const results = [];
    
    // Process in batches of 3 to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const batchPromises = batch.map(url => scrapeUrl(url));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Small delay between batches
        if (i + batchSize < urls.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return results;
}

// Validate URL
export function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}
