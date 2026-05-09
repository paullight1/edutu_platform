# Quick Start Guide

## Prerequisites

1. Node.js 18+
2. OpenAI API key
3. Supabase project (optional for development)
4. GitHub repository

## Step 1: Clone and Install

```bash
# Navigate to backend
cd admin/backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

## Step 2: Configure Environment

Edit `.env` file:

```env
# Supabase (optional for local dev - uses in-memory fallback)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key

# API Key (for continuous scraping)
API_KEY=edutu-scraper-2024

# OpenAI (required for scraping)
OPENAI_API_KEY=sk-...
```

## Step 3: Test Locally

```bash
# Start the server
npm run dev

# Test endpoints
curl http://localhost:3001/health
curl http://localhost:3001/api/status
```

## Step 4: Test Scraping

### Single URL
```bash
curl -X POST http://localhost:3001/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://opportunitiescircle.com"}'
```

### Discover Opportunities
```bash
curl -X POST http://localhost:3001/api/scrape/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://opportunitiescircle.com"}'
```

### Continuous Scrape (requires auth)
```bash
curl -X POST http://localhost:3001/api/scrape/continuous \
  -H "Authorization: Bearer edutu-scraper-2024" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Step 5: Deploy Backend

Recommended: Render, Railway, or DigitalOcean

```bash
# Example: Deploy to Render
# 1. Connect GitHub repo to Render
# 2. Set environment variables in Render dashboard
# 3. Deploy from main branch
```

## Step 6: Configure GitHub Actions

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Add secrets:
   - `API_URL`: Your deployed backend URL
   - `API_KEY`: Your API key
   - `OPENAI_API_KEY`: Your OpenAI key
   - `SUPABASE_URL`: Your Supabase URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key

## Step 7: Run First Scrape

1. Go to **Actions** → **Continuous Scrape**
2. Click **Run workflow**
3. Select branch and click **Run workflow**

## Troubleshooting

### Backend won't start
- Check `.env` file exists
- Verify all required variables are set

### Scraping fails
- Check OpenAI API key is valid
- Verify target URL is accessible

### Data not saving to Supabase
- Verify Supabase credentials
- Check Supabase project is not paused

## Support

For issues, check:
1. GitHub Actions logs
2. Backend server logs
3. Supabase project status
