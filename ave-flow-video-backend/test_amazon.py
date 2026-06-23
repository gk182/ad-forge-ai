import asyncio
from crawlers.amazon import parse_amazon_product
import json
import re

async def main():
    from crawl4ai import AsyncWebCrawler
    async with AsyncWebCrawler(verbose=True) as crawler:
        result = await crawler.arun(url='https://www.amazon.com/dp/B0G2PQQTW1')
        html = result.html
        
        # Test colorImages JSON extraction
        match = re.search(r"'colorImages':\s*({.*?}),", html)
        if match:
            print("FOUND colorImages!")
            try:
                # The JSON from Amazon might use single quotes or unquoted keys.
                # Let's try fixing it for parsing, or we can just regex the URLs out of it!
                raw_json = match.group(1)
                hires_urls = re.findall(r'"hiRes":\s*"([^"]+)"', raw_json)
                large_urls = re.findall(r'"large":\s*"([^"]+)"', raw_json)
                
                print("Found HiRes URLs:", len(hires_urls))
                for u in hires_urls[:5]: print(u)
                
                print("Found Large URLs:", len(large_urls))
                for u in large_urls[:5]: print(u)
            except Exception as e:
                print("Error:", e)
        else:
            print("colorImages not found.")

if __name__ == '__main__':
    asyncio.run(main())
