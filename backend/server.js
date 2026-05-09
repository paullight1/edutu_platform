import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import xlsx from 'xlsx';
import { scrapeUrl, scrapeBulk, isValidUrl } from './scraper.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

const corsOrigins = [
    'http://localhost:5173',  // Admin dev
    'http://localhost:8081',  // Mobile dev (Expo)
    'exp://localhost:8081',   // Expo app
    'edutu://',               // Production mobile app
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
];

app.use(cors({
    origin: NODE_ENV === 'production' 
        ? ['https://admin.edutu.com', 'edutu://'] 
        : corsOrigins,
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Single URL scrape
app.post('/api/scrape', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url || !isValidUrl(url)) {
            return res.status(400).json({ 
                error: 'Invalid URL provided',
                data: null,
                confidence: 0,
                source: 'manual'
            });
        }

        console.log(`Scraping URL: ${url}`);
        const result = await scrapeUrl(url);
        
        res.json(result);
    } catch (error) {
        console.error('Scrape error:', error);
        res.status(500).json({
            error: error.message || 'Failed to scrape URL',
            data: null,
            confidence: 0,
            source: 'manual'
        });
    }
});

// Bulk URL scrape
app.post('/api/scrape/bulk', async (req, res) => {
    try {
        const { urls } = req.body;
        
        if (!Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: 'URLs array required' });
        }

        if (urls.length > 50) {
            return res.status(400).json({ error: 'Maximum 50 URLs allowed per batch' });
        }

        // Validate URLs
        const validUrls = urls.filter(url => isValidUrl(url));
        
        console.log(`Bulk scraping ${validUrls.length} URLs...`);
        const results = await scrapeBulk(validUrls);
        
        res.json({
            success: true,
            total: results.length,
            results,
            errors: results.filter(r => r.errors.length > 0).length
        });
    } catch (error) {
        console.error('Bulk scrape error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Excel/CSV upload and parse
app.post('/api/scrape/upload', async (req, res) => {
    try {
        const { fileData, fileType } = req.body;
        
        if (!fileData) {
            return res.status(400).json({ error: 'File data required' });
        }

        let urls = [];
        
        if (fileType === 'csv' || fileData.includes('\n')) {
            // Parse CSV
            const lines = fileData.split('\n');
            urls = lines
                .map(line => line.trim())
                .filter(line => line && isValidUrl(line.split(',')[0]))
                .map(line => line.split(',')[0]);
        } else {
            // Parse Excel (base64)
            try {
                const buffer = Buffer.from(fileData, 'base64');
                const workbook = xlsx.read(buffer, { type: 'buffer' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                
                // Assume first column contains URLs
                urls = data
                    .map(row => row[0])
                    .filter(url => url && isValidUrl(url.toString()));
            } catch (e) {
                return res.status(400).json({ error: 'Invalid Excel file' });
            }
        }

        if (urls.length === 0) {
            return res.status(400).json({ error: 'No valid URLs found in file' });
        }

        if (urls.length > 50) {
            return res.status(400).json({ error: 'Maximum 50 URLs allowed per upload' });
        }

        console.log(`Processing ${urls.length} URLs from upload...`);
        const results = await scrapeBulk(urls);
        
        res.json({
            success: true,
            total: results.length,
            urls: urls.slice(0, 5),
            results,
            errors: results.filter(r => r.errors.length > 0).length
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get API status and limits
app.get('/api/status', (req, res) => {
    res.json({
        status: 'operational',
        version: '1.0.0',
        endpoints: {
            scrape: '/api/scrape - Single URL extraction',
            bulk: '/api/scrape/bulk - Bulk URL extraction (max 50)',
            upload: '/api/scrape/upload - Excel/CSV upload (max 50)'
        },
        limits: {
            maxUrlsPerBatch: 50,
            rateLimit: '100 requests per hour'
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`🚀 Scraper API server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📚 API docs: http://localhost:${PORT}/api/status`);
});
