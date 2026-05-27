import asyncio
import hashlib
import logging
from datetime import datetime
from typing import Any, Optional
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Crawl4aiScraper:
    def __init__(self, max_concurrent: int = 3, delay_ms: int = 2000):
        self.max_concurrent = max_concurrent
        self.delay_ms = delay_ms
        self.crawler: Optional[AsyncWebCrawler] = None

    async def __aenter__(self):
        self.crawler = AsyncWebCrawler(
            max_concurrent=self.max_concurrent,
        )
        await self.crawler.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.crawler:
            await self.crawler.close()

    async def crawl(
        self,
        url: str,
        css_selector: Optional[str] = None,
        word_count_threshold: int = 50,
        timeout: int = 30000,
        js_enabled: bool = True,
    ) -> dict[str, Any]:
        if not self.crawler:
            raise RuntimeError("Crawler not initialized. Use 'async with' context manager.")

        config = CrawlerRunConfig(
            css_selector=css_selector,
            word_count_threshold=word_count_threshold,
            timeout=timeout,
            js_enabled=js_enabled,
            cache_mode=CacheMode.BYPASS,
            scan_full_page=True,
            scroll_delay=500,
            remove_forms=True,
            remove_popups=True,
        )

        try:
            result = await self.crawler.arun(url, config=config)

            return {
                "success": result.success,
                "url": result.url,
                "html": result.html,
                "markdown": result.markdown,
                "text": result.extracted_text,
                "content_hash": self._hash_content(result.html or ""),
                "error": result.error_message if hasattr(result, 'error_message') else None,
                "metadata": {
                    "crawled_at": datetime.utcnow().isoformat(),
                    "word_count": len(result.extracted_text.split()) if result.extracted_text else 0,
                }
            }
        except Exception as e:
            logger.error(f"Error crawling {url}: {e}")
            return {
                "success": False,
                "url": url,
                "html": None,
                "markdown": None,
                "text": None,
                "content_hash": None,
                "error": str(e),
            }

    async def crawl_multiple(
        self,
        urls: list[str],
        css_selector: Optional[str] = None,
        delay_ms: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        results = []
        delay = delay_ms or self.delay_ms

        for url in urls:
            result = await self.crawl(url, css_selector=css_selector)
            results.append(result)

            if delay > 0:
                await asyncio.sleep(delay / 1000)

        return results

    def _hash_content(self, content: str) -> str:
        return hashlib.md5(content.encode(), usedforsecurity=False).hexdigest()


class ScholarshipScraper(Crawl4aiScraper):
    SOURCES = {
        "opportunities_circle": {
            "url": "https://opportunitiescircle.com/scholarships/",
            "name": "Opportunities Circle",
            "list_selector": ".post-item, .opportunity-card, article",
            "title_selector": "h2, h3, .entry-title",
            "link_selector": "a[href*='/scholarship/'], a[href*='/opportunity/']",
        },
        "oya_opportunities": {
            "url": "https://oyaopportunities.com/scholarships/",
            "name": "OYA Opportunities",
            "list_selector": ".listing-item, .opportunity",
            "title_selector": ".title, h3",
            "link_selector": "a.button, a[href*='/apply']",
        },
        "global_scholar": {
            "url": "https://globalscholardesk.com/scholarships/",
            "name": "Global Scholar Desk",
            "list_selector": ".scholarship-card, .post",
            "title_selector": "h2, .scholarship-title",
            "link_selector": "a[href*='/scholarship/']",
        },
        "scholars4dev": {
            "url": "https://scholars4dev.com/",
            "name": "Scholars4Dev",
            "list_selector": ".td-module-image-wrap, .wpb_text_column",
            "title_selector": "h3, .entry-title",
            "link_selector": "a[href*='/']",
        },
        "scholarship_portal": {
            "url": "https://www.scholarshipportal.com/scholarships",
            "name": "Scholarship Portal",
            "list_selector": ".scholarship-item, .program-card",
            "title_selector": ".scholarship-title, h3",
            "link_selector": "a[href*='/scholarship/']",
        },
    }

    async def crawl_source(self, source_key: str, max_pages: int = 5) -> list[dict[str, Any]]:
        if source_key not in self.SOURCES:
            raise ValueError(f"Unknown source: {source_key}")

        source = self.SOURCES[source_key]
        results = []

        for page in range(1, max_pages + 1):
            url = source["url"] if page == 1 else f"{source['url']}page/{page}/"

            result = await self.crawl(url, css_selector=source.get("list_selector"))

            if result["success"] and result["html"]:
                results.append({
                    **result,
                    "source": source["name"],
                    "source_key": source_key,
                })

            await asyncio.sleep(self.delay_ms / 1000)

        return results

    async def crawl_all_sources(self, max_pages: int = 3) -> list[dict[str, Any]]:
        all_results = []

        for source_key in self.SOURCES:
            logger.info(f"Crawling {source_key}...")
            results = await self.crawl_source(source_key, max_pages)
            all_results.extend(results)

        return all_results


if __name__ == "__main__":
    async def test():
        async with ScholarshipScraper(max_concurrent=2, delay_ms=1500) as scraper:
            results = await scraper.crawl_source("opportunities_circle", max_pages=1)
            print(f"Crawled {len(results)} pages")
            for r in results:
                print(f"  - {r['url']}: {r['metadata']['word_count']} words")

    asyncio.run(test())
