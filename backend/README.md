# Edutu Scraper API

AI-powered opportunity scraping service for the Edutu admin panel. Extracts structured data from scholarship, internship, and grant opportunity URLs.

## Features

- **Single URL Scraping**: Extract opportunity details from any URL
- **Bulk Processing**: Process up to 50 URLs simultaneously
- **AI-Powered Extraction**: Uses GPT-3.5 Turbo for intelligent content parsing
- **Multi-Tier Approach**: Combines meta tag extraction with AI for maximum accuracy
- **Confidence Scoring**: Validates extraction quality (0-100%)
- **Excel/CSV Support**: Import URLs from spreadsheet files

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Browser Automation**: Playwright (Chromium)
- **AI Model**: OpenAI GPT-3.5 Turbo
- **HTML Parsing**: Cheerio
- **Excel Parsing**: xlsx

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=sk-your-key-here
PORT=3001
```

### 3. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 4. Start Server

```bash
npm run dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

### 1. Health Check
```bash
GET /health
```

### 2. Scrape Single URL
```bash
POST /api/scrape
Content-Type: application/json

{
  "url": "https://scholarship-site.com/opportunity"
}
```

**Response:**
```json
{
  "data": {
    "title": "Global Excellence Scholarship",
    "summary": "Full tuition for international students",
    "description": "Full description...",
    "organization": "Harvard University",
    "category": "Scholarships",
    "location": "Cambridge, MA",
    "is_remote": false,
    "application_url": "https://apply.com",
    "close_date": "2024-12-31",
    "image_url": "https://...",
    "award_amount": "$50,000",
    "eligibility": {
      "school": "Any",
      "major": "Any",
      "min_cgpa": "3.5",
      "countries": ["International"]
    },
    "requirements": ["Transcript", "Essay"],
    "benefits": ["Full tuition", "Housing"]
  },
  "confidence": 85,
  "source": "hybrid",
  "errors": []
}
```

### 3. Bulk Scrape
```bash
POST /api/scrape/bulk
Content-Type: application/json

{
  "urls": [
    "https://site1.com/scholarship1",
    "https://site2.com/internship1",
    "..."
  ]
}
```

**Response:**
```json
{
  "success": true,
  "total": 3,
  "results": [...],
  "errors": 0
}
```

### 4. File Upload (Excel/CSV)
```bash
POST /api/scrape/upload
Content-Type: application/json

{
  "fileData": "base64-encoded-file-data",
  "fileType": "xlsx"
}
```

## How It Works

### Extraction Pipeline

1. **Tier 1 - Meta Tags** (0.2s)
   - Extracts Open Graph, Twitter Card, and standard meta tags
   - Pattern matching for deadlines in page text
   - Fast and free

2. **Tier 2 - AI Extraction** (3-5s)
   - Playwright renders JavaScript content
   - GPT-3.5 Turbo extracts structured data
   - Handles unstructured/unformatted pages

3. **Confidence Scoring**
   - Title: 20 points
   - Organization: 15 points
   - Description: 15 points
   - Deadline: 20 points
   - Eligibility: 15 points
   - Application URL: 15 points
   
   **Score Ranges:**
   - 80-100%: High confidence, auto-approve
   - 60-79%: Medium confidence, quick review
   - Below 60%: Low confidence, manual review

## Cost Analysis

At 100 URLs/month:
- GPT-3.5 Turbo: ~$2.00 ($0.02 per URL)
- Playwright/Chromium: Free (self-hosted)
- **Total**: ~$2/month

## File Upload Format

### CSV
```csv
url,category,priority
ttps://example.com/scholarship1,Scholarships,high
https://example.com/internship1,Internships,medium
```

### Excel
- First column: URLs (required)
- Second column: Category (optional)
- Third column: Priority (optional)

## Error Handling

Common errors and solutions:

1. **"Failed to fetch"**
   - URL may be blocked or require authentication
   - Site may have anti-bot protection
   - Solution: Try manual entry

2. **"AI extraction failed"**
   - Content may be in unsupported format
   - Page may require JavaScript interactions
   - Solution: Review page structure

3. **Low confidence score**
   - Missing critical fields
   - Unusual page structure
   - Solution: Review and fill in missing data

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-3.5 |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | Environment (development/production) |

## Rate Limits

- **Single scrape**: No limit
- **Bulk scrape**: Max 50 URLs per request
- **Concurrent**: 3 URLs processed simultaneously
- **API requests**: 100/hour recommended

## Deployment

### Option 1: Railway
```bash
railway login
railway init
railway up
```

### Option 2: Render
1. Create new Web Service
2. Connect GitHub repo
3. Set build command: `npm install && npx playwright install chromium`
4. Set start command: `npm start`
5. Add environment variables

### Option 3: VPS/Docker
```dockerfile
FROM node:18-slim
RUN npx playwright install chromium
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3001
CMD ["npm", "start"]
```

## Testing

```bash
# Test health endpoint
curl http://localhost:3001/health

# Test single scrape
curl -X POST http://localhost:3001/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/scholarship"}'

# Test bulk scrape
curl -X POST http://localhost:3001/api/scrape/bulk \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://url1.com", "https://url2.com"]}'
```

## Troubleshooting

### Playwright Issues
```bash
# Reinstall browsers
npx playwright install --force chromium

# Check browser installation
npx playwright chromium --version
```

### Memory Issues
For bulk processing of 50 URLs:
- Ensure 2GB+ RAM available
- Process will batch URLs (3 concurrent)
- Automatic cleanup after each batch

### CORS Issues
Update CORS settings in `server.js`:
```javascript
app.use(cors({
    origin: ['http://localhost:5173', 'https://yourdomain.com']
}));
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Test thoroughly
5. Submit PR

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- Email: support@edutu.com
- GitHub Issues: [repository]/issues
