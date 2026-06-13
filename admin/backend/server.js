import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import xlsx from 'xlsx';
import axios from 'axios';

dotenv.config();
import { 
    scrapeUrl, 
    scrapeBulk, 
    discoverOpportunities, 
    isValidUrl,
    getSourceConfigs,
    getDefaultConfig,
    validateOpportunityData
} from './scraper.js';
import {
    insertOpportunity,
    opportunityExistsByUrl,
    getScrapingSources,
    updateSourceLastScraped,
    insertScrapingSource,
    getAllOpportunityUrls,
    getScrapeLogs,
    supabase,
    isSupabaseConnected
} from './database.js';
import { runApifyScraper, runEdutuScraper, runIntelScraper, runCustomScraper, runScholarshipApiScraper, normalizeOpportunity, checkActorExists, ACTOR_IDS } from './apify-client.js';
import {
  isDeepSeekConfigured,
  refineOpportunityWithDeepSeek,
  scoreOpportunityMatchWithDeepSeek,
} from './gemini.js';

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY?.trim();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !API_KEY) {
    throw new Error('API_KEY is required in production');
}

app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:3001',
            'https://admin.edutu.org',
            undefined
        ];
        if (allowedOrigins.includes(origin) || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const clientIp = req.ip || req.connection?.remoteAddress;

    console.log(`[Auth] Attempt from ${clientIp} for ${req.method} ${req.url}`);

    try {
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'No Bearer token provided',
                code: 'NO_TOKEN'
            });
        }

        const token = authHeader.split(' ')[1].trim();

        if (API_KEY && token === API_KEY) {
            console.log(`[Auth] API Key accepted from ${clientIp}`);
            return next();
        }

        if (!supabase) {
            return res.status(503).json({
                error: 'Service Unavailable',
                message: 'Authentication service unavailable',
                code: 'AUTH_SERVICE_DOWN'
            });
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired session',
                code: 'INVALID_SESSION',
                details: error?.message
            });
        }

        console.log(`[Auth] User authenticated: ${user.email} (${user.id})`);
        req.user = user;
        next();
    } catch (err) {
        console.error('[Auth] Critical failure:', err);
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication process failed',
            code: 'AUTH_EXCEPTION'
        });
    }
};

const requireAdmin = (req, res, next) => {
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
    const userEmail = req.user?.email?.toLowerCase();
    if (userEmail && adminEmails.includes(userEmail)) {
        return next();
    }
    if (!userEmail && !isProduction) {
        return next();
    }
    console.warn(`[Admin] Non-admin user attempted access: ${req.user?.email}`);
    return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required',
        code: 'ADMIN_REQUIRED'
    });
};

app.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {}
    };

    // Check Supabase
    try {
        if (isSupabaseConnected && supabase) {
            const { error } = await supabase.from('scraping_sources').select('id').limit(1);
            health.services.supabase = error ? 'error' : 'connected';
        } else {
            health.services.supabase = 'fallback';
        }
    } catch {
        health.services.supabase = 'disconnected';
    }

    // Check DeepSeek
    health.services.deepseek = isDeepSeekConfigured()
        ? 'configured' 
        : 'missing';
    health.services.gemini = health.services.deepseek;

    // Check Playwright (implicit - if server runs, playwright is available)
    health.services.playwright = 'available';

    // Overall status
    const allHealthy = health.services.supabase !== 'disconnected' &&
                       health.services.deepseek !== 'missing';
    
    health.status = allHealthy ? 'ok' : 'degraded';
    
    res.status(allHealthy ? 200 : 503).json(health);
});

// Health check for GitHub Actions (simple, no async)
app.get('/health/simple', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString()
    });
});

// Detailed health check with dependency status
app.get('/health/detailed', async (req, res) => {
    const checks = {
        timestamp: new Date().toISOString(),
        checks: {}
    };

    // Supabase check
    try {
        if (isSupabaseConnected && supabase) {
            const start = Date.now();
            await supabase.from('scraping_sources').select('id').limit(1);
            checks.checks.supabase = {
                status: 'pass',
                responseTime: Date.now() - start
            };
        } else {
            checks.checks.supabase = {
                status: 'fallback',
                message: 'Using in-memory storage'
            };
        }
    } catch (error) {
        checks.checks.supabase = {
            status: 'fail',
            error: error.message
        };
    }

    // DeepSeek check
    if (isDeepSeekConfigured()) {
        checks.checks.deepseek = { status: 'pass' };
    } else {
        checks.checks.deepseek = {
          status: 'warn',
          message: 'API key not configured',
        };
    }
    checks.checks.gemini = checks.checks.deepseek;

    // Database stats
    try {
        const { getDatabaseStats } = await import('./database.js');
        const stats = await getDatabaseStats();
        checks.checks.database = {
            status: 'pass',
            ...stats
        };
    } catch {
        checks.checks.database = { status: 'warn' };
    }

    const allPass = Object.values(checks.checks).every(c => c.status === 'pass' || c.status === 'fallback');
    checks.status = allPass ? 'healthy' : 'unhealthy';

    res.json(checks);
});

// Scheduled scrape endpoint (for GitHub Actions)
app.post('/api/scrape/scheduled', async (req, res) => {
    try {
        const { sourceId, maxItems = 10 } = req.body;
        const authHeader = req.headers.authorization;

        // Verify API key for scheduled jobs
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'Authorization required',
                code: 'NO_AUTH'
            });
        }

        const token = authHeader.split(' ')[1]?.trim();
        const validKey = API_KEY;
        
        if ((!validKey || token !== validKey) && !supabase) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key',
                code: 'INVALID_KEY'
            });
        }

        console.log(`[Scheduled] Starting scrape - source: ${sourceId || 'all'}, maxItems: ${maxItems}`);

        const sources = await getScrapingSources(true);

        if (sources.length === 0) {
            return res.json({
                success: true,
                message: 'No enabled sources found',
                scraped: 0,
                skipped: 0
            });
        }

        let totalScraped = 0;
        let totalSkipped = 0;
        const errors = [];
        const existingUrls = await getAllOpportunityUrls();
        const urlSet = new Set(existingUrls);

        for (const source of sources) {
            if (sourceId && source.id !== sourceId) continue;

            try {
                const discoverResult = await discoverOpportunities(source.url);

                if (!discoverResult.success) {
                    errors.push({ source: source.name, error: discoverResult.error });
                    continue;
                }

                const newOpportunities = [];
                for (const opp of discoverResult.opportunities.slice(0, maxItems)) {
                    if (urlSet.has(opp.url)) {
                        totalSkipped++;
                    } else {
                        newOpportunities.push(opp);
                        urlSet.add(opp.url);
                    }
                }

                for (const opp of newOpportunities) {
                    try {
                        const scrapeResult = await scrapeUrl(opp.url);

                        if (scrapeResult.data?.title && scrapeResult.confidence >= 50) {
                            await insertOpportunity({
                                ...scrapeResult.data,
                                source_url: opp.url,
                                source_name: source.name,
                                scraped_at: new Date().toISOString(),
                                confidence_score: scrapeResult.confidence,
                                status: scrapeResult.confidence >= 80 ? 'active' : 'pending'
                            });
                            totalScraped++;
                        }
                    } catch (scrapeErr) {
                        console.error(`[Scheduled] Scrape error: ${scrapeErr.message}`);
                    }
                }

                await updateSourceLastScraped(source.id);

            } catch (sourceErr) {
                errors.push({ source: source.name, error: sourceErr.message });
            }
        }

        res.json({
            success: true,
            scraped: totalScraped,
            skipped: totalSkipped,
            errors: errors.length > 0 ? errors : undefined,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Scheduled] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'SCHEDULED_ERROR'
        });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        status: 'operational',
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            scrape: 'POST /api/scrape - Single URL extraction',
            bulk: 'POST /api/scrape/bulk - Bulk URL extraction (max 50)',
            discover: 'POST /api/scrape/discover - Find opportunity URLs',
            continuous: 'POST /api/scrape/continuous - Full scrape cycle',
            upload: 'POST /api/scrape/upload - Excel/CSV upload',
            sources: 'GET/POST /api/sources - Source management',
            sourceById: 'GET/PATCH/DELETE /api/sources/:id - Single source',
            logs: 'GET /api/logs - Scrape history',
            preview: 'POST /api/scrape/preview - Test scrape (no save)',
            validate: 'POST /api/validate - Validate opportunity data',
            stats: 'GET /api/stats - Scraping statistics'
        },
        limits: {
            maxUrlsPerBatch: 50,
            rateLimit: '100 requests per hour'
        }
    });
});

app.post('/api/scrape', authenticate, async (req, res) => {
    try {
        const { url, options } = req.body;

        if (!url || !isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid URL provided',
                code: 'INVALID_URL',
                data: null,
                confidence: 0
            });
        }

        console.log(`[Scrape] Single URL: ${url}`);
        
        const result = await scrapeUrl(url, options);

        if (result.confidence < 50) {
            result.warnings = result.warnings || [];
            result.warnings.push('Low confidence extraction - manual review recommended');
        }

        res.json({
            success: true,
            data: result.data,
            confidence: result.confidence,
            source: result.source,
            errors: result.errors,
            warnings: result.warnings
        });
    } catch (error) {
        console.error('[Scrape] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to scrape URL',
            code: 'SCRAPE_ERROR',
            data: null,
            confidence: 0
        });
    }
});

app.post('/api/scrape/preview', authenticate, async (req, res) => {
    try {
        const { url } = req.body;

        if (!url || !isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid URL provided',
                code: 'INVALID_URL'
            });
        }

        console.log(`[Preview] Testing URL: ${url}`);
        const result = await scrapeUrl(url);
        
        const validation = await validateOpportunityData(result.data);

        res.json({
            success: true,
            data: result.data,
            confidence: result.confidence,
            validation,
            errors: result.errors
        });
    } catch (error) {
        console.error('[Preview] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'PREVIEW_ERROR'
        });
    }
});

app.post('/api/scrape/bulk', authenticate, async (req, res) => {
    try {
        const { urls, options } = req.body;

        if (!Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'URLs array required',
                code: 'INVALID_INPUT'
            });
        }

        if (urls.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 50 URLs allowed per batch',
                code: 'RATE_LIMIT'
            });
        }

        const validUrls = urls.filter(url => isValidUrl(url));
        console.log(`[Bulk] Processing ${validUrls.length} URLs...`);

        const results = await scrapeBulk(validUrls, options);

        const summary = {
            total: results.length,
            successful: results.filter(r => r.confidence >= 50).length,
            failed: results.filter(r => r.confidence < 50).length,
            averageConfidence: Math.round(results.reduce((sum, r) => sum + r.confidence, 0) / results.length) || 0
        };

        res.json({
            success: true,
            summary,
            results: results.map(r => ({
                url: r.data?.application_url || r.data?.source_url || 'unknown',
                title: r.data?.title || 'Unknown',
                confidence: r.confidence,
                success: r.confidence >= 50,
                errors: r.errors
            }))
        });
    } catch (error) {
        console.error('[Bulk] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'BULK_ERROR'
        });
    }
});

app.post('/api/scrape/discover', authenticate, async (req, res) => {
    try {
        const { url, useSiteConfig } = req.body;

        if (!url || !isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid URL provided',
                code: 'INVALID_URL',
                count: 0,
                opportunities: []
            });
        }

        console.log(`[Discover] Finding opportunities on: ${url}`);
        const result = await discoverOpportunities(url, { useSiteConfig: useSiteConfig !== false });

        res.json(result);
    } catch (error) {
        console.error('[Discover] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'DISCOVER_ERROR',
            count: 0,
            opportunities: []
        });
    }
});

app.post('/api/scrape/continuous', authenticate, async (req, res) => {
    try {
        const { sourceId, maxItems = 10 } = req.body;

        console.log(`[Continuous] Starting scrape for source ID: ${sourceId || 'all'}`);

        const sources = await getScrapingSources(true);

        if (sources.length === 0) {
            return res.json({
                success: true,
                message: 'No enabled sources found',
                scraped: 0,
                skipped: 0,
                errors: []
            });
        }

        let totalScraped = 0;
        let totalSkipped = 0;
        const errors = [];

        const existingUrls = await getAllOpportunityUrls();
        const urlSet = new Set(existingUrls);

        for (const source of sources) {
            if (sourceId && source.id !== sourceId) continue;

            console.log(`[Continuous] Processing: ${source.name} (${source.url})`);

            try {
                const discoverResult = await discoverOpportunities(source.url);

                if (!discoverResult.success) {
                    errors.push({ source: source.name, error: discoverResult.error });
                    continue;
                }

                const newOpportunities = [];
                for (const opp of discoverResult.opportunities.slice(0, maxItems)) {
                    if (urlSet.has(opp.url)) {
                        totalSkipped++;
                    } else {
                        newOpportunities.push(opp);
                        urlSet.add(opp.url);
                    }
                }

                for (const opp of newOpportunities) {
                    try {
                        const scrapeResult = await scrapeUrl(opp.url);

                        if (scrapeResult.data && scrapeResult.data.title && scrapeResult.confidence >= 50) {
                            const saveResult = await insertOpportunity({
                                ...scrapeResult.data,
                                source_url: opp.url,
                                source_name: source.name,
                                scraped_at: new Date().toISOString(),
                                confidence_score: scrapeResult.confidence,
                                status: scrapeResult.confidence >= 80 ? 'active' : 'pending'
                            });

                            if (saveResult) {
                                totalScraped++;
                            }
                        }
                    } catch (scrapeErr) {
                        console.error(`[Continuous] Scrape error for ${opp.url}:`, scrapeErr.message);
                    }
                }

                await updateSourceLastScraped(source.id);

            } catch (sourceErr) {
                console.error(`[Continuous] Source error for ${source.name}:`, sourceErr.message);
                errors.push({ source: source.name, error: sourceErr.message });
            }
        }

        res.json({
            success: true,
            scraped: totalScraped,
            skipped: totalSkipped,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('[Continuous] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'CONTINUOUS_ERROR',
            scraped: 0,
            skipped: 0
        });
    }
});

app.post('/api/scrape/upload', authenticate, async (req, res) => {
    try {
        const { fileData, fileType } = req.body;

        if (!fileData) {
            return res.status(400).json({
                success: false,
                error: 'File data required',
                code: 'INVALID_INPUT'
            });
        }

        let urls = [];

        if (fileType === 'csv' || fileData.includes('\n')) {
            const lines = fileData.split('\n');
            urls = lines
                .map(line => line.trim())
                .filter(line => line && isValidUrl(line.split(',')[0]))
                .map(line => line.split(',')[0]);
        } else {
            try {
                const buffer = Buffer.from(fileData, 'base64');
                const workbook = xlsx.read(buffer, { type: 'buffer' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                urls = data.map(row => row[0]).filter(url => url && isValidUrl(url?.toString()));
            } catch (e) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Excel file',
                    code: 'INVALID_FILE'
                });
            }
        }

        if (urls.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid URLs found in file',
                code: 'NO_URLS'
            });
        }

        if (urls.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 50 URLs allowed per upload',
                code: 'RATE_LIMIT'
            });
        }

        console.log(`[Upload] Processing ${urls.length} URLs from file...`);
        const results = await scrapeBulk(urls);

        res.json({
            success: true,
            total: results.length,
            urls: urls.slice(0, 5),
            results: results.map(r => ({
                url: r.data?.application_url || 'unknown',
                title: r.data?.title || 'Unknown',
                confidence: r.confidence
            })),
            errors: results.filter(r => r.errors?.length > 0).length
        });
    } catch (error) {
        console.error('[Upload] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'UPLOAD_ERROR'
        });
    }
});

app.get('/api/sources', authenticate, async (req, res) => {
    try {
        const { enabled, tier, category } = req.query;
        let sources = await getScrapingSources(enabled !== 'false');

        if (tier) {
            sources = sources.filter(s => s.tier === parseInt(tier));
        }
        if (category) {
            sources = sources.filter(s => s.category === category);
        }

        res.json({
            success: true,
            total: sources.length,
            sources: sources.map(s => ({
                id: s.id,
                url: s.url,
                name: s.name,
                tier: s.tier,
                category: s.category,
                enabled: s.enabled,
                priority: s.priority,
                last_scraped: s.last_scraped,
                last_success: s.last_success,
                last_error: s.last_error,
                total_scraped: s.total_scraped,
                total_urls_discovered: s.total_urls_discovered
            }))
        });
    } catch (error) {
        console.error('[Sources] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'SOURCES_ERROR'
        });
    }
});

app.get('/api/sources/configs', authenticate, (req, res) => {
    res.json({
        success: true,
        configs: getSourceConfigs(),
        defaultConfig: getDefaultConfig()
    });
});

app.get('/api/sources/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        const sources = await getScrapingSources(false);
        const source = sources.find(s => s.id === parseInt(id));

        if (!source) {
            return res.status(404).json({
                success: false,
                error: 'Source not found',
                code: 'NOT_FOUND'
            });
        }

        res.json({
            success: true,
            source
        });
    } catch (error) {
        console.error('[Source] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'SOURCE_ERROR'
        });
    }
});

app.post('/api/sources', authenticate, requireAdmin, async (req, res) => {
    try {
        const { url, name, description, tier, category, priority, config, enabled } = req.body;

        if (!url || !name) {
            return res.status(400).json({
                success: false,
                error: 'URL and name are required',
                code: 'INVALID_INPUT'
            });
        }

        if (!isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid URL',
                code: 'INVALID_URL'
            });
        }

        const result = await insertScrapingSource({
            url,
            name,
            description,
            tier: tier || 2,
            category: category || 'general',
            priority: priority || 5,
            config: config || {},
            enabled: enabled !== false
        });

        res.status(201).json({
            success: true,
            source: result
        });
    } catch (error) {
        console.error('[Source Create] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'CREATE_ERROR'
        });
    }
});

app.patch('/api/sources/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, tier, category, priority, config, enabled, rate_limit_requests, rate_limit_delay_ms } = req.body;

        if (!isSupabaseConnected || !supabase) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                code: 'DB_UNAVAILABLE'
            });
        }

        const updateData = {
            updated_at: new Date().toISOString()
        };
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (tier !== undefined) updateData.tier = tier;
        if (category !== undefined) updateData.category = category;
        if (priority !== undefined) updateData.priority = priority;
        if (config !== undefined) updateData.config = config;
        if (enabled !== undefined) updateData.enabled = enabled;
        if (rate_limit_requests !== undefined) updateData.rate_limit_requests = rate_limit_requests;
        if (rate_limit_delay_ms !== undefined) updateData.rate_limit_delay_ms = rate_limit_delay_ms;

        const { data, error } = await supabase
            .from('scraping_sources')
            .update(updateData)
            .eq('id', parseInt(id))
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            source: data
        });
    } catch (error) {
        console.error('[Source Update] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'UPDATE_ERROR'
        });
    }
});

app.delete('/api/sources/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!isSupabaseConnected || !supabase) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                code: 'DB_UNAVAILABLE'
            });
        }

        const { error } = await supabase
            .from('scraping_sources')
            .update({ enabled: false })
            .eq('id', parseInt(id));

        if (error) throw error;

        res.json({
            success: true,
            message: 'Source disabled'
        });
    } catch (error) {
        console.error('[Source Delete] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'DELETE_ERROR'
        });
    }
});

app.post('/api/sources/:id/toggle', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!isSupabaseConnected || !supabase) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                code: 'DB_UNAVAILABLE'
            });
        }

        const sources = await getScrapingSources(false);
        const source = sources.find(s => s.id === parseInt(id));

        if (!source) {
            return res.status(404).json({
                success: false,
                error: 'Source not found',
                code: 'NOT_FOUND'
            });
        }

        const { error } = await supabase
            .from('scraping_sources')
            .update({ 
                enabled: !source.enabled,
                updated_at: new Date().toISOString()
            })
            .eq('id', parseInt(id));

        if (error) throw error;

        res.json({
            success: true,
            enabled: !source.enabled,
            message: `Source ${!source.enabled ? 'enabled' : 'disabled'}`
        });
    } catch (error) {
        console.error('[Source Toggle] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'TOGGLE_ERROR'
        });
    }
});

// ============ LOGS ENDPOINTS ============

app.get('/api/logs', authenticate, async (req, res) => {
    try {
        const { limit = 50, source_id, status, run_type } = req.query;
        
        const logs = await getScrapeLogs(parseInt(limit) || 50);
        
        let filteredLogs = logs;
        
        if (source_id) {
            filteredLogs = filteredLogs.filter(log => log.source_id === parseInt(source_id));
        }
        if (status) {
            filteredLogs = filteredLogs.filter(log => log.status === status);
        }
        if (run_type) {
            filteredLogs = filteredLogs.filter(log => log.run_type === run_type);
        }

        res.json({
            success: true,
            total: filteredLogs.length,
            logs: filteredLogs
        });
    } catch (error) {
        console.error('[Logs] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'LOGS_ERROR'
        });
    }
});

app.get('/api/logs/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!isSupabaseConnected || !supabase) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                code: 'DB_UNAVAILABLE'
            });
        }

        const { data, error } = await supabase
            .from('scrape_logs')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        res.json({
            success: true,
            log: data
        });
    } catch (error) {
        console.error('[Log Detail] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'LOG_ERROR'
        });
    }
});

app.get('/api/logs/stats/summary', authenticate, async (req, res) => {
    try {
        const logs = await getScrapeLogs(100);
        
        const summary = {
            total_runs: logs.length,
            successful: logs.filter(l => l.status === 'completed').length,
            failed: logs.filter(l => l.status === 'failed').length,
            partial: logs.filter(l => l.status === 'partial').length,
            total_urls_discovered: logs.reduce((sum, l) => sum + (l.urls_discovered || 0), 0),
            total_urls_scraped: logs.reduce((sum, l) => sum + (l.urls_scraped || 0), 0),
            total_urls_saved: logs.reduce((sum, l) => sum + (l.urls_saved || 0), 0),
            average_duration_seconds: logs.length > 0 
                ? Math.round(logs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0) / logs.length)
                : 0
        };

        res.json({
            success: true,
            summary
        });
    } catch (error) {
        console.error('[Log Stats] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'STATS_ERROR'
        });
    }
});

app.post('/api/validate', authenticate, async (req, res) => {
    try {
        const { data } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Data required for validation',
                code: 'INVALID_INPUT'
            });
        }

        const validation = await validateOpportunityData(data);

        res.json({
            success: true,
            ...validation
        });
    } catch (error) {
        console.error('[Validate] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'VALIDATE_ERROR'
        });
    }
});

app.get('/api/stats', authenticate, (req, res) => {
    res.json({
        success: true,
        stats: {
            environment: process.env.NODE_ENV || 'development',
            database: isSupabaseConnected ? 'connected' : 'fallback',
            deepseek: isDeepSeekConfigured() ? 'configured' : 'missing',
            gemini: isDeepSeekConfigured() ? 'configured' : 'missing',
            sourceConfigs: Object.keys(getSourceConfigs()).length,
            defaultConfig: getDefaultConfig()
        }
    });
});

// ============ PHASE 4: ADVANCED SCRAPING ENDPOINTS ============

// Quality scoring endpoint
app.post('/api/scrape/quality', authenticate, async (req, res) => {
    try {
        const { data, thresholds } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Data required for quality check',
                code: 'INVALID_INPUT'
            });
        }

        const { calculateQualityScore } = await import('./scraper.js');
        const quality = calculateQualityScore(data, thresholds);

        res.json({
            success: true,
            quality
        });
    } catch (error) {
        console.error('[Quality] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'QUALITY_ERROR'
        });
    }
});

// Find similar opportunities (duplicate detection)
app.post('/api/scrape/duplicates', authenticate, async (req, res) => {
    try {
        const { title, threshold = 80 } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                error: 'Title required',
                code: 'INVALID_INPUT'
            });
        }

        const { findSimilarOpportunities, isValidUrl } = await import('./scraper.js');
        
        // Get existing opportunities from database
        const existingUrls = await getAllOpportunityUrls();
        
        // For now, return that we need Supabase to check duplicates
        // In production, you'd fetch recent opportunities and compare
        res.json({
            success: true,
            message: 'Use getAllOpportunityUrls() with findSimilarOpportunities() locally',
            title,
            threshold,
            note: 'Requires Supabase connection for full duplicate detection'
        });
    } catch (error) {
        console.error('[Duplicates] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'DUPLICATE_ERROR'
        });
    }
});

// Discover with pagination
app.post('/api/scrape/discover/paginated', authenticate, async (req, res) => {
    try {
        const { url, maxPages = 3, maxItemsPerPage = 30, useSiteConfig = true, handleInfiniteScroll = false } = req.body;

        if (!url || !isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Valid URL required',
                code: 'INVALID_URL'
            });
        }

        const { discoverWithPagination } = await import('./scraper.js');
        
        const result = await discoverWithPagination(url, {
            maxPages,
            maxItemsPerPage,
            useSiteConfig,
            handleInfiniteScroll
        });

        res.json(result);
    } catch (error) {
        console.error('[Discover Paginated] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'DISCOVER_PAGINATED_ERROR'
        });
    }
});

// Test source configuration
app.get('/api/sources/:id/test', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        const sources = await getScrapingSources(false);
        const source = sources.find(s => s.id === parseInt(id));

        if (!source) {
            return res.status(404).json({
                success: false,
                error: 'Source not found',
                code: 'NOT_FOUND'
            });
        }

        const { discoverOpportunities, scrapeUrl } = await import('./scraper.js');
        
        // Test discovery
        const discoverResult = await discoverOpportunities(source.url);
        
        // Test scrape on first opportunity if available
        let scrapeResult = null;
        if (discoverResult.opportunities?.length > 0) {
            scrapeResult = await scrapeUrl(discoverResult.opportunities[0].url);
        }

        res.json({
            success: true,
            source: {
                id: source.id,
                name: source.name,
                url: source.url
            },
            discovery: {
                count: discoverResult.count,
                success: discoverResult.success,
                error: discoverResult.error
            },
            scrape: scrapeResult ? {
                title: scrapeResult.data?.title,
                confidence: scrapeResult.confidence,
                success: scrapeResult.confidence >= 50
            } : null
        });
    } catch (error) {
        console.error('[Source Test] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'TEST_ERROR'
        });
    }
});

// Expire check endpoint
app.post('/api/scrape/expire-check', authenticate, async (req, res) => {
    try {
        const { closeDate } = req.body;
        
        const { isExpired } = await import('./scraper.js');
        
        const expired = isExpired(closeDate);
        
        res.json({
            success: true,
            closeDate,
            expired,
            message: expired ? 'Opportunity has expired' : 'Opportunity is still active'
        });
    } catch (error) {
        console.error('[Expire Check] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'EXPIRE_CHECK_ERROR'
        });
    }
});

// Apify check endpoint
app.post('/api/scrape/apify/check', authenticate, async (req, res) => {
    try {
        const result = await checkActorExists();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[Apify Check] Error:', error);
        res.status(500).json({ success: false, error: error.message, code: 'APIFY_CHECK_ERROR' });
    }
});

function calculateMatchScore(opportunity, profile) {
    if (!profile) return 50;
    
    let score = 0;
    let criteriaCount = 0;
    let eligibility = opportunity.eligibility || {};
    
    if (typeof eligibility === 'string') {
        try {
            eligibility = JSON.parse(eligibility);
        } catch {
            return 50;
        }
    }
    
    if (profile.major) {
        criteriaCount++;
        const userMajor = profile.major.toLowerCase();
        const oppMajor = eligibility.major?.toLowerCase() || '';
        
        if (oppMajor && userMajor === oppMajor) {
            score += 1;
        } else {
            const searchText = `${opportunity.title || ''} ${opportunity.summary || ''} ${opportunity.description || ''}`.toLowerCase();
            if (searchText.includes(userMajor)) {
                score += 1;
            }
        }
    }
    
    if (profile.school) {
        const userSchool = profile.school.toLowerCase();
        const oppSchool = eligibility.school?.toLowerCase();
        if (oppSchool && userSchool === oppSchool) {
            score += 1.5;
            criteriaCount++;
        }
    }
    
    if (eligibility.min_cgpa) {
        criteriaCount++;
        const minCgpa = parseFloat(eligibility.min_cgpa) || 0;
        if ((profile.cgpa || 0) >= minCgpa) {
            score += 1;
        } else {
            return 0;
        }
    }
    
    if (eligibility.countries && Array.isArray(eligibility.countries) && eligibility.countries.length > 0) {
        criteriaCount++;
        const userCountry = profile.country?.toLowerCase();
        if (eligibility.countries.map((c) => c.toLowerCase()).includes(userCountry) || 
            eligibility.countries.map((c) => c.toLowerCase()).includes('international')) {
            score += 1;
        } else {
            return 0;
        }
    }
    
    if (criteriaCount === 0) return 75;
    return Math.min(100, Math.round((score / criteriaCount) * 100));
}

async function mapWithConcurrency(items, mapper, concurrency = 4) {
    const results = new Array(items.length);
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const currentIndex = index++;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker())
    );

    return results;
}

async function buildOpportunityFeed(opportunities, profile) {
    return mapWithConcurrency(opportunities, async (opp) => {
        const heuristicMatch = profile && Object.keys(profile).length > 0
            ? calculateMatchScore(opp, profile)
            : 75;

        const aiRefinement = await refineOpportunityWithDeepSeek(opp);
        const aiMatch = profile && Object.keys(profile).length > 0
            ? await scoreOpportunityMatchWithDeepSeek({
                ...opp,
                tags: aiRefinement.tags,
                summary: aiRefinement.summary,
            }, profile)
            : null;

        return {
            ...opp,
            refined_summary: aiRefinement.summary || opp.summary || opp.description || '',
            ai_tags: aiRefinement.tags,
            ai_eligible_majors: aiRefinement.eligibleMajors,
            ai_eligible_countries: aiRefinement.eligibleCountries,
            ai_recommended_levels: aiRefinement.recommendedLevels,
            ai_funding_highlights: aiRefinement.fundingHighlights,
            ai_match_keywords: aiRefinement.matchKeywords,
            heuristic_match: heuristicMatch,
            match: aiMatch ? Math.round((heuristicMatch * 0.35) + (aiMatch.score * 0.65)) : heuristicMatch,
            match_reasons: aiMatch?.reasons || [],
            match_risks: aiMatch?.risks || [],
            personalized_summary: aiMatch?.personalizedSummary || aiRefinement.summary || '',
        };
    }, 4);
}

app.post('/api/opportunities/filter', async (req, res) => {
    try {
        const { profile, category, search, minMatchScore = 30 } = req.body;
        
        console.log('[Filter] Request with profile:', profile);
        
        let query = supabase
            .from('opportunities')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (category) {
            query = query.eq('category', category);
        }

        if (search) {
            query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
        }

        const { data: opportunities, error } = await query;

        if (error) throw error;

        const enriched = await buildOpportunityFeed(opportunities, profile);
        const filtered = enriched
            .filter(o => (o.match || 0) >= minMatchScore)
            .sort((a, b) => (b.match || 0) - (a.match || 0));

        console.log(`[Filter] ${opportunities.length} total, ${filtered.length} matched`);

        res.json({ 
            success: true, 
            count: filtered.length,
            aiEnabled: isDeepSeekConfigured(),
            deepseekEnabled: isDeepSeekConfigured(),
            opportunities: filtered 
        });

    } catch (error) {
        console.error('[Filter] Error:', error);
        res.status(500).json({ success: false, error: error.message, code: 'FILTER_ERROR' });
    }
});

// Preview endpoint - just scrape, don't save
app.get('/api/opportunities/apify-preview', authenticate, async (req, res) => {
    try {
        const sourcesParam = req.query.sources;
        const query = req.query.query || 'scholarship';
        
        const sourceList = sourcesParam 
            ? (Array.isArray(sourcesParam) ? sourcesParam : sourcesParam.split(','))
            : ['intel'];

        console.log(`[Apify Preview] Starting with sources: ${sourceList.join(', ')}`);

        const results = { errors: [], sources: {}, opportunities: [] };

        for (const source of sourceList) {
            const actorId = ACTOR_IDS[source];
            if (!actorId) {
                results.errors.push(`Unknown source: ${source}`);
                continue;
            }

            try {
                let items;
                let resolvedActorId = actorId;
                
                if (source === 'intel') {
                    items = await runIntelScraper({ query, maxResults: 20 });
                } else if (source === 'edutu') {
                    items = await runEdutuScraper({ maxResults: 20 });
                } else if (source === 'custom') {
                    items = await runCustomScraper({ maxResults: 20 });
                } else if (source === 'scholarship-api') {
                    items = await runScholarshipApiScraper({ query, maxResults: 20 });
                } else {
                    const { items: rawItems } = await runApifyScraper(actorId, { maxResults: 20 });
                    items = rawItems.map(i => transformApifyItem(i, `apify-${source}`));
                }

                console.log(`[Apify Preview] ${source}: ${items.length} items`);
                console.log(`[Apify Preview] Sample:`, items[0] ? JSON.stringify(items[0]).slice(0, 200) : 'none');

                results.sources[source] = {
                    actorId: resolvedActorId,
                    itemsFound: items.length,
                };
                results.opportunities.push(...items);

            } catch (srcErr) {
                console.error(`[Apify Preview] ${source} error:`, srcErr.message);
                results.errors.push(`${source}: ${srcErr.message}`);
                results.sources[source] = { error: srcErr.message };
            }
        }

        res.json({ success: true, ...results, message: `Preview from ${sourceList.length} source(s)` });

    } catch (error) {
        console.error('[Apify Preview] Error:', error);
        res.status(500).json({ success: false, error: error.message, code: 'APIFY_PREVIEW_ERROR' });
    }
});

// Save endpoint - save previewed opportunities
app.post('/api/opportunities/apify-save', authenticate, async (req, res) => {
    try {
        const { opportunities } = req.body;
        
        if (!opportunities || !Array.isArray(opportunities)) {
            return res.status(400).json({ success: false, error: 'No opportunities to save', code: 'INVALID_INPUT' });
        }

        console.log(`[Apify Save] Saving ${opportunities.length} opportunities`);
        console.log('[Apify Save] First opportunity:', JSON.stringify(opportunities[0]));

        let inserted = 0, skipped = 0;
        const savedOpportunities = [];

        for (const opp of opportunities) {
            const externalUrl = opp.external_url || opp.url || '';
            
            if (!externalUrl) {
                console.log('[Apify Save] Skipping - no external_url:', opp.title);
                continue;
            }
            
            console.log('[Apify Save] Checking URL:', externalUrl);
            
            const exists = await opportunityExistsByUrl(externalUrl);
            if (exists) {
                console.log('[Apify Save] Exists (duplicate):', externalUrl);
                skipped++;
            } else {
                console.log('[Apify Save] Inserting:', opp.title);
                const saved = await insertOpportunity(opp);
                if (saved) {
                    console.log('[Apify Save] Inserted successfully:', saved.id || saved.title);
                    inserted++;
                    savedOpportunities.push(saved);
                } else {
                    console.log('[Apify Save] Insert failed for:', opp.title);
                }
            }
        }

        console.log(`[Apify Save] Done: ${inserted} inserted, ${skipped} skipped`);
        res.json({ success: true, inserted, skipped, opportunities: savedOpportunities });

    } catch (error) {
        console.error('[Apify Save] Error:', error);
        res.status(500).json({ success: false, error: error.message, code: 'APIFY_SAVE_ERROR' });
    }
});

// Old sync endpoint (kept for backward compatibility)
app.get('/api/opportunities/apify-sync', authenticate, async (req, res) => {
    try {
        const sourcesParam = req.query.sources;
        const query = req.query.query || 'scholarship';
        
        const sourceList = sourcesParam 
            ? (Array.isArray(sourcesParam) ? sourcesParam : sourcesParam.split(','))
            : ['intel', 'custom'];

        console.log(`[Apify Sync] Starting with sources: ${sourceList.join(', ')}`);

        const results = { inserted: 0, skipped: 0, errors: [], sources: {}, opportunities: [] };

        for (const source of sourceList) {
            const actorId = ACTOR_IDS[source];
            if (!actorId) {
                results.errors.push(`Unknown source: ${source}`);
                continue;
            }

            try {
                let items;
                let resolvedActorId = actorId;
                
                if (source === 'intel') {
                    const result = await runIntelScraper({ query, maxResults: 20 });
                    items = result.items;
                    resolvedActorId = result.actorId || actorId;
                } else if (source === 'edutu') {
                    const result = await runEdutuScraper({ maxResults: 20 });
                    items = result.items;
                    resolvedActorId = result.actorId || actorId;
                } else if (source === 'custom') {
                    const result = await runCustomScraper({ maxResults: 20 });
                    items = result.items;
                    resolvedActorId = result.actorId || actorId;
                } else {
                    const { items: rawItems } = await runApifyScraper(actorId, { maxResults: 20 });
                    items = rawItems.map(i => transformApifyItem(i, `apify-${source}`));
                }

                console.log(`[Apify Sync] ${source}: ${items.length} items`);

                let srcInserted = 0, srcSkipped = 0;

                for (const item of items) {
                    const opp = typeof item === 'object' && item.title ? item : transformApifyItem(item, `apify-${source}`);
                    if (!opp.source_url) continue;
                    const storedOpp = toStoredOpportunity(opp);
                    
                    const exists = await opportunityExistsByUrl(storedOpp.source_url);
                    if (!exists) {
                        const saved = await insertOpportunity(storedOpp);
                        if (saved) {
                            srcInserted++;
                            results.opportunities.push(saved);
                        }
                    } else {
                        srcSkipped++;
                    }
                }

                results.sources[source] = { actorId: resolvedActorId, itemsFound: items.length, inserted: srcInserted, skipped: srcSkipped };
                results.inserted += srcInserted;
                results.skipped += srcSkipped;

            } catch (srcErr) {
                console.error(`[Apify Sync] ${source} error:`, srcErr.message);
                results.errors.push(`${source}: ${srcErr.message}`);
                results.sources[source] = { error: srcErr.message };
            }
        }

        console.log(`[Apify Sync] Done: ${results.inserted} inserted, ${results.skipped} skipped`);
        res.json({ success: true, ...results, message: `Synced from ${sourceList.length} source(s)` });

    } catch (error) {
        console.error('[Apify Sync] Error:', error);
        res.status(500).json({ success: false, error: error.message, code: 'APIFY_SYNC_ERROR' });
    }
});

function transformApifyItem(item, source = 'apify') {
    return {
        title: item.title || item.name || item.opportunity_title || 'Untitled',
        summary: (item.summary || item.description || item.excerpt || '').slice(0, 150),
        description: item.description || item.summary || item.details || '',
        organization: item.organization || item.agency || item.provider || item.host_organization || '',
        category: mapItemCategory(item.category || item.type || item.opportunity_type || 'scholarship'),
        location: item.location || item.state || item.country || 'Multiple Locations',
        is_remote: item.is_remote || item.remote || false,
        application_url: item.apply_url || item.url || item.link || item.application_url || '',
        source_url: item.url || item.link || item.source_url || '',
        close_date: item.deadline || item.close_date || item.closes_at || null,
        image_url: item.image || item.image_url || item.cover_image || null,
        award_amount: item.amount || item.award_amount || item.funding || item.scholarship_amount || '',
        duration: item.duration || item.term || null,
        eligibility: item.eligibility || item.requirements || item.eligibility_criteria || null,
        source: source,
        type: 'scholarship'
    };
}

function toStoredOpportunity(item) {
    const normalized = normalizeOpportunity(item, item.source || 'apify');
    return {
        title: normalized.title,
        summary: normalized.summary || null,
        description: normalized.description || null,
        category: normalized.category || 'Scholarships',
        organization: normalized.organization || null,
        location: normalized.location || null,
        is_remote: normalized.is_remote || false,
        application_url: normalized.application_url || normalized.source_url,
        close_date: normalized.close_date || null,
        image_url: normalized.image_url || null,
        award_amount: normalized.award_amount || null,
        eligibility: normalized.eligibility || null,
        source_url: normalized.source_url,
        source_name: normalized.source || 'apify',
        status: 'pending'
    };
}

function mapItemCategory(category) {
    if (!category) return 'Scholarships';
    const cat = category.toLowerCase();
    if (cat.includes('grant') || cat.includes('federal')) return 'Grants';
    if (cat.includes('intern')) return 'Internships';
    if (cat.includes('fellow')) return 'Fellowships';
    if (cat.includes('program')) return 'Programs';
    if (cat.includes('competition')) return 'Competitions';
    return 'Scholarships';
}

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║   🚀 Edutu Scraper Engine v2.0.0                          ║
║   ─────────────────────────────────────────────────────   ║
║   Server:       http://localhost:${PORT}                    ║
║   Health:       http://localhost:${PORT}/health              ║
║   API Status:   http://localhost:${PORT}/api/status          ║
║   ─────────────────────────────────────────────────────   ║
║   Sources:      ${Object.keys(getSourceConfigs()).length} configured                           ║
║   Environment:  ${process.env.NODE_ENV || 'development'}                            ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

export default app;
