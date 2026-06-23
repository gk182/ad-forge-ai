import asyncio
from crawlers.amazon import parse_amazon_product
import re

async def main():
    from crawl4ai import AsyncWebCrawler
    async with AsyncWebCrawler(verbose=True) as crawler:
        result = await crawler.arun(url='https://www.amazon.com/dp/B0G2PQQTW1')
        html = result.html
        
        # We can extract all large/hiRes images from the entire HTML!
        # Amazon often uses 'hiRes':"URL" or 'large':"URL"
        hires = re.findall(r'hiRes[\"\']?\s*:\s*[\"\']([^\"\']+)[\"\']', html)
        large = re.findall(r'large[\"\']?\s*:\s*[\"\']([^\"\']+)[\"\']', html)
        
        images = []
        def get_base_img_url(url):
            if not url: return None
            return re.sub(r'\._.*?_\.(jpg|jpeg|png|gif)$', r'.\1', url)
            
        for url in hires + large:
            base = get_base_img_url(url)
            if base and base not in images and "m.media-amazon.com" in base:
                images.append(base)
                
        print('Total unique images found via regex:', len(images))
        for img in images:
            print(img)

if __name__ == '__main__':
    asyncio.run(main())
