# Archived Files

This folder contains projects and files that are no longer actively used but kept for reference.

## Contents

### 1. **crawl4ai-study/**
- Initial Crawl4AI testing and experimentation
- Basic examples and test scripts
- **Status**: Replaced by `../crawl4ai-scraper`

### 2. **edutu-scraper1/**
- First-generation scraper using Apify
- Actor-based scraping
- **Status**: Replaced by `../crawl4ai-scraper`

### 3. **SCRAPER/**
- Second-generation scraper project
- Had Supabase integration and admin panel
- **Status**: Functionality merged into `../crawl4ai-scraper` and `../backend`

### 4. **documentation/**
- Various documentation files
- Setup guides and deployment docs
- **Status**: Should be consolidated into main project READMEs

### 5. **.github/**
- Old GitHub Actions workflows
- CI/CD configurations
- **Status**: May need to be restored if you want automated workflows

### 6. **Root Markdown Files**
- Various planning and summary documents
- `plans.md`, `summary.md`, `rule.md`, etc.

---

## Active Project Structure

```
Edutu_Folder/
├── admin/                    # Admin dashboard (React + Vite)
├── backend/                  # NestJS API server
│   └── services/
│       └── services/
│           └── api/         # Main backend code
├── crawl4ai-scraper/        # New Crawl4AI-based scraper ⭐
├── edutu_mobile/            # Mobile app (React Native)
├── supabase/                # Supabase edge functions
└── other-files/             # Archived files (this folder)
```

---

## Recovery

If you need to restore any archived files:
```bash
# Example: Restore old scraper
mv other-files/edutu-scraper1 ./
```

---

## Cleanup Date
April 20, 2026
