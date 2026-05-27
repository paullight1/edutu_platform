# Crawl4ai Scholarship Scraper

A modern web scraping solution for gathering scholarship opportunities, built with Crawl4ai.

## Features

- Async web crawling with Crawl4ai
- Multi-source scholarship data extraction
- Data cleaning and normalization
- Supabase database integration
- Admin dashboard for monitoring
- CLI interface for automation

## Installation

```bash
cd crawl4ai-scraper
pip install -r requirements.txt
```

## Configuration

Create a `.env` file:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Usage

### CLI

```bash
# Scrape a specific source
python main.py --source opportunities_circle

# Scrape all sources
python main.py --all

# Save to database
python main.py --all --save

# Output to JSON
python main.py --all --output scholarships.json
```

### Python API

```python
import asyncio
from crawler import ScholarshipScraper
from extractors.scholarship_extractor import ScholarshipExtractor
from processors.data_cleaner import DataCleaner

async def scrape():
    scraper = ScholarshipScraper(max_concurrent=2, delay_ms=2000)
    extractor = ScholarshipExtractor()
    cleaner = DataCleaner()

    async with scraper:
        results = await scraper.crawl_source("opportunities_circle", max_pages=3)

    for result in results:
        items = extractor.extract_from_html(result["html"], result.get("source"))
        cleaned = [cleaner.clean(item) for item in items]

    print(f"Extracted {len(cleaned)} scholarships")

asyncio.run(scrape())
```

## Available Sources

- opportunities_circle
- oya_opportunities
- global_scholar
- scholars4dev
- scholarship_portal

## Admin Dashboard

Navigate to `/scraper` in the admin panel to:
- View scraper status and statistics
- Manage sources (add, enable, disable, delete)
- Trigger manual scrapes
- View recent scrape jobs

## Adding New Sources

### CLI

```bash
python cli.py add-source --url "https://example.com/scholarships" --name "Example"
```

### Code

```python
scraper.SOURCES["example"] = {
    "url": "https://example.com/scholarships/",
    "name": "Example",
    "list_selector": ".scholarship-card",
    "title_selector": "h2.scholarship-title",
    "link_selector": "a.apply-link",
}
```

## Architecture

```
crawl4ai-scraper/
├── crawler.py              # Core Crawl4ai wrapper
├── extractors/
│   └── scholarship_extractor.py  # HTML parsing
├── processors/
│   └── data_cleaner.py     # Data normalization
├── database/
│   └── supabase_client.py  # DB integration
├── cli.py                  # CLI interface
├── main.py                 # Entry point
└── frontend/
    └── (admin page)
```

## Output Format

The scraper outputs opportunities in this format:

```json
{
  "title": " Scholarship Name",
  "organization": "Provider Name",
  "category": "General",
  "deadline": "2026-12-31",
  "location": "Worldwide",
  "description": "...",
  "requirements": ["Requirement 1", "Requirement 2"],
  "benefits": ["Benefit 1"],
  "applyUrl": "https://example.com/apply",
  "amount": 5000,
  "currency": "USD",
  "difficulty": "Medium",
  "match": 75,
  "tags": ["Open", "STEM"]
}
```
