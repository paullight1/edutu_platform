import asyncio
import json
import logging
from crawler import ScholarshipScraper
from extractors.scholarship_extractor import ScholarshipExtractor
from processors.data_cleaner import DataCleaner
from database.supabase_client import MockSupabaseClient, SupabaseClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Crawl4ai Scholarship Scraper")
    parser.add_argument("--source", type=str, help="Specific source to scrape")
    parser.add_argument("--all", action="store_true", help="Scrape all sources")
    parser.add_argument("--max-pages", type=int, default=3)
    parser.add_argument("--output", type=str, help="Output JSON file")
    parser.add_argument("--save", action="store_true", help="Save to database")
    parser.add_argument("--mock-db", action="store_true", help="Use mock database")

    args = parser.parse_args()

    scraper = ScholarshipScraper(max_concurrent=2, delay_ms=2000)
    extractor = ScholarshipExtractor()
    cleaner = DataCleaner()

    if args.mock_db or not args.save:
        db = MockSupabaseClient()
    else:
        try:
            db = SupabaseClient()
        except ValueError as e:
            logger.warning(f"Supabase not configured: {e}, using mock db")
            db = MockSupabaseClient()

    async with scraper:
        logger.info("Starting scholarship scrape...")

        if args.source:
            results = await scraper.crawl_source(args.source, args.max_pages)
        elif args.all:
            results = await scraper.crawl_all_sources(args.max_pages)
        else:
            logger.error("Specify --source <name> or --all")
            return

    logger.info(f"Crawled {len(results)} pages")

    all_items = []
    for result in results:
        if result.get("html"):
            items = extractor.extract_from_html(
                result["html"],
                result.get("source", "Unknown"),
                result.get("url"),
            )
            logger.info(f"Extracted {len(items)} items from {result.get('url')}")
            all_items.extend(items)

    logger.info(f"Total extracted: {len(all_items)} items")

    cleaned_items = [cleaner.clean(item) for item in all_items]
    valid_items = cleaner.deduplicate(cleaned_items, db.get_existing_urls())

    logger.info(f"Valid items after cleaning: {len(valid_items)}")

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(valid_items, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved to {args.output}")

    if args.save:
        result = db.bulk_upsert(valid_items)
        logger.info(f"Saved to database: {result}")

    print(f"\n{'='*50}")
    print(f"Summary:")
    print(f"  Pages crawled: {len(results)}")
    print(f"  Items extracted: {len(all_items)}")
    print(f"  Valid items: {len(valid_items)}")
    if args.save:
        print(f"  Saved to DB: {result.get('inserted', 0)}")
    print(f"{'='*50}")


if __name__ == "__main__":
    asyncio.run(main())
