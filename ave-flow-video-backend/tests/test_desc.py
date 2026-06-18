import asyncio
import sys
from crawl4ai import AsyncWebCrawler
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding='utf-8')

async def main():
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun("https://play.google.com/store/apps/details?id=com.ave.grv&hl=vi")
        soup = BeautifulSoup(result.html, 'html.parser')
        
        # Test 1: data-g-id="description"
        desc1 = soup.select_one('div[data-g-id="description"]')
        print("TEST 1 data-g-id='description':", desc1.text[:200] if desc1 else "NOT FOUND")
        
        # Test 2: The actual modal content is usually inside a div with attribute itemprop="description"
        desc2 = soup.select_one('[itemprop="description"]')
        print("\nTEST 2 itemprop='description':", desc2.text[:200] if desc2 else "NOT FOUND")
        
        # Print full text of desc2 to see if it has the full content
        if desc2:
            print("\nTEST 2 FULL LENGTH:", len(desc2.text))

if __name__ == "__main__":
    asyncio.run(main())
