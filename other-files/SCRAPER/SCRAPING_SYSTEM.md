# Edutu Scraping System Documentation

## Overview

This document describes the continuous scraping system for Edutu's opportunity aggregation pipeline.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SCRAPING INFRASTRUCTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  SCHEDULER                                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  GitHub Actions (Runs every 2 hours)                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  BACKEND API (localhost:3001)                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  POST /api/scrape/continuous - Main scraping endpoint       │   │
│  │  POST /api/scrape/discover - Find opportunity URLs         │   │
│  │  POST /api/scrape - Single URL scrape                       │   │
│  │  POST /api/scrape/bulk - Bulk URL scrape                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  STORAGE                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Supabase (PostgreSQL) - Production                         │   │
│  │  In-memory fallback - Development                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### 1. Single URL Scrape
```bash
POST /api/scrape
Content-Type: application/json

{
  "url": "https://opportunitiescircle.com/scholarship/xyz"
}
```

### 2. Bulk Scrape
```bash
POST /api/scrape/bulk
Content-Type: application/json

{
  "urls": [
    "https://example.com/opp1",
    "https://example.com/opp2"
  ]
}
```

### 3. Discover Opportunities
```bash
POST /api/scrape/discover
Content-Type: application/json

{
  "url": "https://opportunitiescircle.com"
}
```

### 4. Continuous Scrape (Requires API Key)
```bash
POST /api/scrape/continuous
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "sourceId": 1,        // Optional: specific source
  "maxItems": 10        // Optional: max items per source
}
```

## Environment Variables

Create a `.env` file in `backend/` directory:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# API Authentication
API_KEY=your-secure-api-key

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-key

# Server
PORT=3001
NODE_ENV=development
```

## GitHub Actions Setup

### Step 1: Configure Secrets

In your GitHub repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add the following repository secrets:

| Secret | Description | Example |
|--------|-------------|---------|
| `API_URL` | Your backend URL | `https://your-backend.onrender.com` |
| `API_KEY` | Your API key | (from .env) |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJ...` |

### Step 2: Verify Workflow

The workflow is located at `.github/workflows/scrape.yml` and runs:
- Every 2 hours automatically
- Manually via GitHub Actions UI

### Step 3: Monitor Runs

1. Go to **Actions** → **Continuous Scrape**
2. Check the latest run status
3. View logs for detailed output

## Supabase Database Setup

### Run the following SQL in your Supabase SQL Editor:

```sql
-- 1. Create scraping_sources table
CREATE TABLE IF NOT EXISTS scraping_sources (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  name TEXT,
  tier INT DEFAULT 1,  -- 1=aggregator, 2=direct, 3=hidden
  category TEXT,
  enabled BOOLEAN DEFAULT true,
  last_scraped TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Add initial sources
INSERT INTO scraping_sources (url, name, tier, category) VALUES 
  ('https://opportunitiescircle.com', 'Opportunities Circle', 1, 'aggregator'),
  ('https://oyaopportunities.com', 'OYA Opportunities', 1, 'aggregator'),
  ('https://globalscholardesk.com', 'Global Scholar Desk', 1, 'aggregator')
ON CONFLICT (url) DO NOTHING;

-- 3. Add source tracking columns to opportunities (if not exist)
ALTER TABLE opportunities 
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_name TEXT,
  ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMP;

-- 4. Enable RLS (optional - requires service role for writes)
ALTER TABLE scraping_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage sources" ON scraping_sources
  FOR ALL USING (true) WITH CHECK (true);
```

## Target Sites (Tier 1 - Aggregators)

### High Priority
- Opportunities Circle
- OYA Opportunities
- Global Scholarship House
- Global Scholar Desk
- Opportunity Pool
- Opportunities Nexus
- Global Intern Opportunities

### Scholarship Platforms
- Scholars4Dev
- ScholarshipPortal
- Scholarship Positions
- International Scholarships
- DAAD
- IEFA

### Fellowships / Programs
- One Young World
- Schwarzman Scholars
- Yale Young Global Scholars
- Ashoka

## Troubleshooting

### Issue: API returns 401 Unauthorized
- Verify `API_KEY` matches between `.env` and GitHub secrets

### Issue: Supabase connection fails
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Verify Supabase project is active (not paused)

### Issue: No opportunities found
- Check the discover endpoint separately: `/api/scrape/discover`
- Verify the target URL is accessible

### Issue: GitHub Actions not triggering
- Verify workflow file is at `.github/workflows/scrape.yml`
- Check Actions permissions in repository settings
