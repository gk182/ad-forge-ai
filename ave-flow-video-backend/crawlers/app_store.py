import json
import re

from bs4 import BeautifulSoup


def _pick_best_srcset_url(srcset):
    if not srcset:
        return None

    candidates = []
    for part in srcset.split(','):
        chunk = part.strip()
        if not chunk:
            continue
        url = chunk.split(' ')[0].strip()
        if url:
            candidates.append(url)

    return candidates[-1] if candidates else None


def _extract_meta_content(soup, selectors):
    for selector in selectors:
        tag = soup.select_one(selector)
        if tag:
            content = tag.get('content')
            if content:
                return content.strip()
    return None


def _parse_ld_json_app_data(soup):
    for script in soup.find_all('script', type='application/ld+json'):
        raw = script.string or script.get_text(strip=True)
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except Exception:
            continue

        if isinstance(parsed, dict) and parsed.get('@type') == 'SoftwareApplication':
            return parsed

        if isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, dict) and item.get('@type') == 'SoftwareApplication':
                    return item

    return None


def _find_first_image(soup, selectors, use_srcset=True):
    for selector in selectors:
        for elem in soup.select(selector):
            src = elem.get('src')
            if src:
                return src.strip()

            if use_srcset:
                best = _pick_best_srcset_url(elem.get('srcset'))
                if best:
                    return best.strip()

    return None


def _extract_image_urls_from_html(html_content):
    patterns = [
        r'https?://[^"\']+(?:mzstatic|apple)\.com/[^"\']+\.(?:png|jpe?g|webp|gif)',
        r'https?://[^"\']+\.mzstatic\.com/[^"\']+\.(?:png|jpe?g|webp|gif)',
    ]

    results = []
    for pattern in patterns:
        results.extend(re.findall(pattern, html_content, flags=re.IGNORECASE))
    return results


def _dedupe_keep_order(items):
    seen = set()
    output = []
    for item in items:
        if not item or item in seen:
            continue
        seen.add(item)
        output.append(item)
    return output


def _looks_like_icon(src, alt='', width=None, height=None):
    src_lower = (src or '').lower()
    alt_lower = (alt or '').lower()

    if any(token in src_lower for token in ['icon', 'logo', 'badge', 'touch-icon', 'favicon']):
        return True
    if any(token in alt_lower for token in ['icon', 'logo', 'badge', 'app icon']):
        return True

    try:
        if width is not None and int(width) and int(width) <= 128:
            return True
    except Exception:
        pass

    try:
        if height is not None and int(height) and int(height) <= 128:
            return True
    except Exception:
        pass

    return False


def _looks_like_screenshot(src, alt='', width=None, height=None, class_name=''):
    src_lower = (src or '').lower()
    alt_lower = (alt or '').lower()
    class_lower = (class_name or '').lower()

    if _looks_like_icon(src, alt, width, height):
        return False

    if any(token in src_lower for token in ['screenshot', 'screen-shot', 'preview', 'gallery']):
        return True
    if any(token in alt_lower for token in ['screenshot', 'screen shot', 'preview', 'gallery']):
        return True
    if any(token in class_lower for token in ['screenshot', 'gallery', 'preview']):
        return True

    try:
        if width is not None and height is not None:
            width_val = int(width)
            height_val = int(height)
            # Screenshots are usually larger and more rectangular.
            if width_val >= 200 and height_val >= 200:
                return True
    except Exception:
        pass

    return False


def _append_screenshot_candidate(candidates, src, alt='', width=None, height=None, class_name='', force=False):
    if not src:
        return
    if _looks_like_icon(src, alt, width, height):
        return
    if force or _looks_like_screenshot(src, alt, width, height, class_name):
        candidates.append(src.strip())


def parse_app_store(html_content, url, media=None):
    """
    Parse Apple App Store or Google Play Store HTML and return structured data.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    app_data = _parse_ld_json_app_data(soup)

    data = {
        'url': url,
        'platform': 'Unknown',
        'title': 'N/A',
        'subtitle': 'N/A',
        'developer': 'N/A',
        'price': 'N/A',
        'rating': 'N/A',
        'reviews_count': 'N/A',
        'category': 'N/A',
        'size': 'N/A',
        'description': 'N/A',
        'whats_new': 'N/A',
        'installs': 'N/A',
        'icon': 'N/A',
        'screenshots': [],
        'videos': [],
    }

    url_lower = url.lower()

    if 'apps.apple.com' in url_lower:
        data['platform'] = 'Apple App Store'

        if app_data:
            data['title'] = app_data.get('name', 'N/A')
            data['description'] = app_data.get('description', 'N/A')
            data['category'] = app_data.get('applicationCategory', 'N/A')

            offers = app_data.get('offers')
            if isinstance(offers, dict):
                price = offers.get('price')
                currency = offers.get('priceCurrency', '')
                if price == 0 or price == '0':
                    data['price'] = 'Free'
                elif price is not None:
                    data['price'] = f'{price} {currency}'.strip()

            aggregate_rating = app_data.get('aggregateRating')
            if isinstance(aggregate_rating, dict):
                data['rating'] = str(aggregate_rating.get('ratingValue', 'N/A'))
                data['reviews_count'] = str(aggregate_rating.get('reviewCount', 'N/A'))

            author = app_data.get('author')
            if isinstance(author, dict):
                data['developer'] = author.get('name', 'N/A')

        if data['title'] == 'N/A':
            title_elem = soup.select_one('h1')
            if title_elem:
                data['title'] = title_elem.get_text(strip=True)

        if data['description'] == 'N/A':
            desc = _extract_meta_content(
                soup,
                [
                    'meta[name="description"]',
                    'meta[property="og:description"]',
                    'meta[name="twitter:description"]',
                ],
            )
            if desc:
                data['description'] = desc

        subtitle_elem = soup.select_one('p.subtitle')
        if subtitle_elem:
            data['subtitle'] = subtitle_elem.get_text(strip=True)

        if data['price'] == 'N/A':
            attr_elem = soup.select_one('p.attributes')
            if attr_elem:
                data['price'] = attr_elem.get_text(strip=True)

        whats_new_section = (
            soup.find('section', {'aria-label': "What's New"})
            or soup.find('section', {'aria-label': 'What’s New'})
        )
        if whats_new_section:
            whats_new_p = whats_new_section.find('p')
            if whats_new_p:
                data['whats_new'] = whats_new_p.get_text(strip=True)

        meta_image = _extract_meta_content(
            soup,
            [
                'meta[property="og:image"]',
                'meta[property="og:image:secure_url"]',
                'meta[name="twitter:image"]',
                'meta[name="twitter:image:src"]',
            ],
        )
        if meta_image:
            data['icon'] = meta_image

        if data['icon'] == 'N/A':
            data['icon'] = _find_first_image(
                soup,
                [
                    'link[rel="apple-touch-icon"]',
                    'link[rel="icon"]',
                    'picture source',
                    'picture img',
                    'img',
                ],
            ) or 'N/A'

        screenshot_candidates = []
        for selector in [
            'div[class*="we-screenshot-viewer"] picture source',
            'ul[class*="we-screenshot-viewer"] picture source',
            'picture source',
            'picture img',
            'img[alt*="Screenshot"]',
            'img[alt*="preview"]',
            'img[src*="mzstatic"]',
        ]:
            for elem in soup.select(selector):
                src = elem.get('src')
                if not src and elem.get('srcset'):
                    src = _pick_best_srcset_url(elem.get('srcset'))
                alt = elem.get('alt', '')
                class_name = ' '.join(elem.get('class', [])) if isinstance(elem.get('class', []), list) else str(elem.get('class', '') or '')
                width = elem.get('width')
                height = elem.get('height')
                force = 'we-screenshot-viewer' in selector
                _append_screenshot_candidate(
                    screenshot_candidates,
                    src,
                    alt=alt,
                    width=width,
                    height=height,
                    class_name=class_name,
                    force=force,
                )

        if not screenshot_candidates:
            for src in _extract_image_urls_from_html(html_content):
                _append_screenshot_candidate(screenshot_candidates, src, force='screenshot' in src.lower())

        data['screenshots'] = _dedupe_keep_order(screenshot_candidates)

        if data['icon'] == 'N/A' and data['screenshots']:
            data['icon'] = data['screenshots'][0]

    elif 'play.google.com' in url_lower:
        data['platform'] = 'Google Play Store'

        if app_data:
            data['title'] = app_data.get('name', 'N/A')
            data['description'] = app_data.get('description', 'N/A')
            data['category'] = app_data.get('applicationCategory', 'N/A')

            offers = app_data.get('offers')
            if isinstance(offers, list) and offers:
                price = offers[0].get('price')
                if price == '0':
                    data['price'] = 'Free'
                elif price:
                    data['price'] = price

            aggregate_rating = app_data.get('aggregateRating')
            if isinstance(aggregate_rating, dict):
                data['rating'] = str(aggregate_rating.get('ratingValue', 'N/A'))
                data['reviews_count'] = str(aggregate_rating.get('ratingCount', 'N/A'))

            author = app_data.get('author')
            if isinstance(author, dict):
                data['developer'] = author.get('name', 'N/A')

        if data['title'] == 'N/A':
            title_elem = soup.select_one('h1[itemprop="name"]')
            if title_elem:
                data['title'] = title_elem.get_text(strip=True)

        if data['developer'] == 'N/A':
            dev_elem = soup.select_one('.Vbfug a span') or soup.select_one('div.Vbfug a')
            if dev_elem:
                data['developer'] = dev_elem.get_text(strip=True)

        desc_elem = soup.select_one('div[data-g-id="description"]')
        if desc_elem:
            data['description'] = desc_elem.get_text(strip=True)

        info_items = soup.select('.ClM7O')
        for item in info_items:
            text = item.get_text(strip=True).lower()
            if '+' in text and ('m' in text or 'k' in text or 'b' in text or 'downloads' in text):
                data['installs'] = item.get_text(strip=True)

        icon_img = _find_first_image(
            soup,
            ['img[alt*="Icon image"]', 'img[alt*="app icon"]', 'img[alt*="logo"]'],
        )
        if icon_img:
            data['icon'] = icon_img

        screenshot_imgs = []
        for img in soup.select(
            'img[alt*="Screenshot"], img[alt*="screen"], img[alt*="preview"]'
        ):
            src = img.get('src')
            if src:
                screenshot_imgs.append(src.strip())
        data['screenshots'] = _dedupe_keep_order(screenshot_imgs)

        video_candidates = []
        for selector in ['video source', 'video']:
            for elem in soup.select(selector):
                src = elem.get('src')
                if src and src.lower().endswith(('.mp4', '.mov', '.webm')):
                    video_candidates.append(src.strip())
        data['videos'] = _dedupe_keep_order(video_candidates)

    # Media fallback from the crawler object
    if getattr(media, 'images', None) or isinstance(media, dict):
        images_list = media.get('images', []) if isinstance(media, dict) else getattr(media, 'images', [])
        for img in images_list:
            src = img.get('src', '') if isinstance(img, dict) else getattr(img, 'src', '')
            alt = img.get('alt', '').lower() if isinstance(img, dict) else getattr(img, 'alt', '').lower()
            width = img.get('width') if isinstance(img, dict) else getattr(img, 'width', None)
            height = img.get('height') if isinstance(img, dict) else getattr(img, 'height', None)

            if data['icon'] == 'N/A' and src and ('icon' in alt or 'logo' in alt):
                data['icon'] = src

            if src and _looks_like_screenshot(src, alt=alt, width=width, height=height):
                _append_screenshot_candidate(data['screenshots'], src, alt=alt, width=width, height=height)

    media_videos = []
    if getattr(media, 'videos', None) or isinstance(media, dict):
        videos_list = media.get('videos', []) if isinstance(media, dict) else getattr(media, 'videos', [])
        for video in videos_list:
            src = video.get('src', '') if isinstance(video, dict) else getattr(video, 'src', '')
            if src and src.lower().endswith(('.mp4', '.mov', '.webm')):
                media_videos.append(src)
    data['videos'] = _dedupe_keep_order(data['videos'] + media_videos)

    data['screenshots'] = _dedupe_keep_order(data['screenshots'])

    return data


def generate_app_markdown(data):
    """
    Generate structured Markdown report for an app.
    """
    md = []

    if data['icon'] != 'N/A':
        md.append(f'<img src="{data["icon"]}" width="100" height="100" style="border-radius: 20px;" />\n')

    md.append(f"# {data['title']}\n")
    if data['subtitle'] != 'N/A':
        md.append(f"*{data['subtitle']}*\n")

    md.append('## General Information')
    md.append(f'- **Platform**: {data["platform"]}')
    md.append(f'- **URL**: [{data["url"]}]({data["url"]})')
    md.append(f'- **Developer**: {data["developer"]}')
    if data['category'] != 'N/A':
        md.append(f'- **Category**: {data["category"]}')
    if data['price'] != 'N/A':
        md.append(f'- **Price**: {data["price"]}')
    if data['size'] != 'N/A':
        md.append(f'- **Size**: {data["size"]}')
    if data['installs'] != 'N/A':
        md.append(f'- **Installs**: {data["installs"]}')

    md.append(f'- **Ratings**: {data["rating"]} ⭐ ({data["reviews_count"]} reviews)')

    if data['whats_new'] != 'N/A':
        md.append("\n## What\'s New")
        md.append(data['whats_new'])

    md.append('\n## Description')
    md.append(data['description'])

    if data['screenshots']:
        md.append('\n## Screenshots')
        for i, src in enumerate(data['screenshots'][:10]):
            md.append(f'![Screenshot {i + 1}]({src})')

    if data.get('videos'):
        md.append('\n## Videos')
        for i, src in enumerate(data['videos'][:5]):
            md.append(f'- [Video {i + 1}]({src})')

    return '\n'.join(md)
