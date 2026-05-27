import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ScraperCLI:
    def __init__(self):
        self.base_url = os.getenv("SCRAPER_API_URL", "http://localhost:3001")
        self.api_key = os.getenv("API_KEY", "")

    def _get_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def scrape(
        self,
        source: str = None,
        all_sources: bool = False,
        max_pages: int = 3,
        dry_run: bool = False,
    ):
        payload = {
            "source": source,
            "allSources": all_sources,
            "maxPages": max_pages,
            "dryRun": dry_run,
        }

        logger.info(f"Starting scrape: {json.dumps(payload, indent=2)}")

        if dry_run:
            logger.info("[DRY RUN] No actual scraping will occur")
            return {"dry_run": True, "payload": payload}

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/scrape/crawl4ai",
                    json=payload,
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"Scraping complete: {json.dumps(result, indent=2)}")
                return result
        except httpx.ConnectError:
            logger.warning(f"Could not connect to {self.base_url}, running local scrape...")
            return await self._scrape_local(source, all_sources, max_pages)
        except Exception as e:
            logger.error(f"Scraping failed: {e}")
            return {"error": str(e)}

    async def _scrape_local(self, source, all_sources, max_pages):
        from crawler import ScholarshipScraper
        from extractors.scholarship_extractor import ScholarshipExtractor
        from processors.data_cleaner import DataCleaner
        from database.supabase_client import MockSupabaseClient

        scraper = ScholarshipScraper(max_concurrent=2, delay_ms=2000)
        extractor = ScholarshipExtractor()
        cleaner = DataCleaner()
        db = MockSupabaseClient()

        async with scraper:
            if source:
                results = await scraper.crawl_source(source, max_pages)
            elif all_sources:
                results = await scraper.crawl_all_sources(max_pages)
            else:
                logger.error("Please specify --source or --all")
                return {"error": "No source specified"}

        all_items = []
        for result in results:
            if result.get("html"):
                items = extractor.extract_from_html(
                    result["html"],
                    result.get("source", "Unknown"),
                    result.get("url"),
                )
                all_items.extend(items)

        cleaned_items = [cleaner.clean(item) for item in all_items]
        valid_items = cleaner.deduplicate(cleaned_items, db.get_existing_urls())

        saved = db.bulk_upsert(valid_items)

        return {
            "crawled_pages": len(results),
            "extracted_items": len(all_items),
            "cleaned_items": len(cleaned_items),
            "valid_items": len(valid_items),
            "saved": saved,
        }

    async def status(self):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/api/scrape/status",
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.warning(f"Could not fetch status from API: {e}")
            return {"status": "offline", "error": str(e)}

    async def add_source(self, url: str, name: str, selectors: str = None):
        payload = {
            "url": url,
            "name": name,
            "config": json.loads(selectors) if selectors else {},
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/scrape/sources",
                json=payload,
                headers=self._get_headers(),
            )
            response.raise_for_status()
            return response.json()

    async def list_sources(self):
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/scrape/sources",
                headers=self._get_headers(),
            )
            response.raise_for_status()
            return response.json()


async def main():
    parser = argparse.ArgumentParser(description="Edutu Scholarship Scraper CLI")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    scrape_parser = subparsers.add_parser("scrape", help="Start scraping")
    scrape_parser.add_argument("--source", type=str, help="Source to scrape")
    scrape_parser.add_argument("--all", dest="all_sources", action="store_true", help="Scrape all sources")
    scrape_parser.add_argument("--max-pages", type=int, default=3, help="Max pages per source")
    scrape_parser.add_argument("--dry-run", action="store_true", help="Dry run (no actual scrape)")

    subparsers.add_parser("status", help="Check scraper status")

    add_parser = subparsers.add_parser("add-source", help="Add a new source")
    add_parser.add_argument("--url", required=True, help="Source URL")
    add_parser.add_argument("--name", required=True, help="Source name")
    add_parser.add_argument("--selectors", type=str, help="CSS selectors JSON")

    subparsers.add_parser("list-sources", help="List all sources")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    cli = ScraperCLI()

    if args.command == "scrape":
        result = await cli.scrape(
            source=args.source,
            all_sources=args.all_sources,
            max_pages=args.max_pages,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, indent=2))

    elif args.command == "status":
        result = await cli.status()
        print(json.dumps(result, indent=2))

    elif args.command == "add-source":
        result = await cli.add_source(args.url, args.name, args.selectors)
        print(json.dumps(result, indent=2))

    elif args.command == "list-sources":
        result = await cli.list_sources()
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
