import asyncio
from bs4 import BeautifulSoup
from crawl4ai import *

async def inspect():
    url = "https://play.google.com/store/apps/details?id=com.ave.grv&hl=vi"
    browser_config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(scan_full_page=True, wait_for_images=True, cache_mode=CacheMode.BYPASS)
    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=url, config=run_config)
        soup = BeautifulSoup(result.html, 'html.parser')
        
        # Save prettified HTML so we can check it
        with open("google_dump.html", "w", encoding="utf-8") as f:
            f.write(soup.prettify())
            
if __name__ == "__main__":
    asyncio.run(inspect())
