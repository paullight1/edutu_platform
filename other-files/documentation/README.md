# Edutu Documentation

## Table of Contents

1. [Scraping System](SCRAPING_SYSTEM.md) - Complete scraping system documentation
2. [Quick Start](QUICKSTART.md) - Get up and running in 5 minutes

## Quick Links

- [API Endpoints](SCRAPING_SYSTEM.md#api-endpoints)
- [GitHub Actions Setup](SCRAPING_SYSTEM.md#github-actions-setup)
- [Supabase Setup](SCRAPING_SYSTEM.md#supabase-database-setup)
- [Target Sites](SCRAPING_SYSTEM.md#target-sites-tier-1---aggregators)

## Architecture Overview

```
User/Admin → Backend API → Scrape → Supabase DB
                  ↑
GitHub Actions (Schedule)
```

## Common Tasks

| Task | Guide |
|------|-------|
| Run single scrape | [Quick Start - Test Scraping](QUICKSTART.md#step-4-test-scraping) |
| Set up continuous scraping | [GitHub Actions](SCRAPING_SYSTEM.md#github-actions-setup) |
| Add new source | [Supabase SQL](SCRAPING_SYSTEM.md#supabase-database-setup) |
| Debug issues | [Troubleshooting](SCRAPING_SYSTEM.md#troubleshooting) |
