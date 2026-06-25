import json
import re
import urllib.request

from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# Image URL helpers
# ---------------------------------------------------------------------------

def _clean_image_url(url, is_play_store=False):
    if not url:
        return url
    url_lower = url.lower()
    if is_play_store:
        if 'googleusercontent.com' in url_lower:
            if '=' in url:
                return re.sub(r'=[ws]\d+.*$', '=s0', url)
            else:
                return url + '=s0'
    else:
        if 'mzstatic.com' in url_lower:
            cleaned = re.sub(r'/\d+x\d+bb', '/1280x1280bb', url)
            cleaned = re.sub(r'/\d+x\d+(?!\w)', '/1280x1280', cleaned)
            return cleaned
    return url


def _dedupe_keep_order(items):
    seen = set()
    output = []
    for item in items:
        if not item or item in seen:
            continue
        seen.add(item)
        output.append(item)
    return output


# ---------------------------------------------------------------------------
# iTunes Lookup API — reliable structured data for Apple App Store
# ---------------------------------------------------------------------------

def _extract_app_id_from_url(url):
    """Extract numeric app ID from an App Store URL like .../id389801252"""
    match = re.search(r'/id(\d+)', url)
    return match.group(1) if match else None


def _fetch_itunes_lookup(app_id):
    """Call Apple's public iTunes Lookup API and return the result dict."""
    api_url = f'https://itunes.apple.com/lookup?id={app_id}'
    try:
        req = urllib.request.Request(api_url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            results = data.get('results', [])
            return results[0] if results else None
    except Exception as e:
        print(f"[iTunes Lookup] Error: {e}")
        return None


# ---------------------------------------------------------------------------
# HTML helpers (for reviews and fallbacks)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Apple App Store parser — uses iTunes API + HTML for reviews
# ---------------------------------------------------------------------------

def _extract_apple_screenshots_from_html(soup):
    """Extract screenshot URLs from Apple App Store HTML srcset attributes.
    
    Apple uses <picture><source srcset="..."> with multiple resolutions.
    Real screenshots have 'PurpleSource' in the path and are NOT Placeholder/AppIcon.
    We pick the largest resolution from each srcset.
    """
    screenshots = []
    seen_base_paths = set()
    
    for source in soup.select('picture source'):
        srcset = source.get('srcset', '')
        if not srcset:
            continue
        
        # Parse srcset entries: "url 300w, url 460w, ..."
        entries = []
        for part in srcset.split(','):
            part = part.strip()
            if not part:
                continue
            pieces = part.split()
            url = pieces[0]
            # Parse width descriptor like "460w"
            width = 0
            if len(pieces) > 1:
                w_match = re.search(r'(\d+)w', pieces[1])
                if w_match:
                    width = int(w_match.group(1))
            entries.append((url, width))
        
        if not entries:
            continue
        
        first_url = entries[0][0]
        
        # Filter: only real screenshots (PurpleSource, not Placeholder/AppIcon/Features)
        if 'PurpleSource' not in first_url:
            continue
        if any(skip in first_url for skip in ['Placeholder', 'AppIcon', 'Features']):
            continue
        
        # Extract base path (before the size suffix) to deduplicate
        # e.g. ".../01.jpg/300x650bb.webp" -> base is ".../01.jpg"
        base_match = re.match(r'(.*?/\d+\.(?:jpg|png|jpeg))', first_url)
        base_path = base_match.group(1) if base_match else first_url[:100]
        
        if base_path in seen_base_paths:
            continue
        seen_base_paths.add(base_path)
        
        # Pick the biggest resolution entry
        best_url = max(entries, key=lambda x: x[1])[0] if entries else first_url
        screenshots.append(best_url)
    
    return screenshots


def _parse_apple_app_store(soup, url, html_content):
    """Parse Apple App Store. Uses iTunes Lookup API for metadata + HTML for screenshots."""
    data = _init_data(url, 'Apple App Store')

    # --- Primary: iTunes Lookup API for metadata ---
    app_id = _extract_app_id_from_url(url)
    itunes = _fetch_itunes_lookup(app_id) if app_id else None

    if itunes:
        print(f"[iTunes Lookup] Got data for app ID {app_id}")
        data['title'] = itunes.get('trackName', 'N/A')
        data['description'] = itunes.get('description', 'N/A')
        data['developer'] = itunes.get('artistName', 'N/A')
        data['category'] = itunes.get('primaryGenreName', 'N/A')
        data['rating'] = str(itunes.get('averageUserRating', 'N/A'))
        data['reviews_count'] = str(itunes.get('userRatingCount', 'N/A'))
        data['icon'] = itunes.get('artworkUrl512') or itunes.get('artworkUrl100', 'N/A')
        data['whats_new'] = itunes.get('releaseNotes', 'N/A')
        data['size'] = _format_bytes(itunes.get('fileSizeBytes'))

        price = itunes.get('price', 0)
        currency = itunes.get('currency', 'USD')
        data['price'] = 'Free' if price == 0 else f'{price} {currency}'

        # Screenshots from API
        api_screenshots = itunes.get('screenshotUrls', []) + itunes.get('ipadScreenshotUrls', [])

        # Preview video from API
        preview_url = itunes.get('previewUrl')
        if preview_url:
            data['videos'] = [preview_url]
    else:
        print(f"[iTunes Lookup] No API data, falling back to HTML parsing")
        _parse_apple_html_fallback(soup, data, html_content)
        api_screenshots = []

    # --- Screenshots: merge API + HTML (API may return empty) ---
    html_screenshots = _extract_apple_screenshots_from_html(soup)
    print(f"[Screenshots] API: {len(api_screenshots)}, HTML: {len(html_screenshots)}")
    
    # Prefer API screenshots if available, otherwise use HTML
    if api_screenshots:
        data['screenshots'] = _dedupe_keep_order(api_screenshots)
    elif html_screenshots:
        data['screenshots'] = _dedupe_keep_order(html_screenshots)
    
    # --- Reviews from HTML (API doesn't provide these) ---
    data['reviews_list'] = _extract_apple_reviews(soup)

    return data


def _format_bytes(size_bytes):
    if not size_bytes:
        return 'N/A'
    try:
        size_bytes = int(size_bytes)
        if size_bytes >= 1_073_741_824:
            return f'{size_bytes / 1_073_741_824:.1f} GB'
        elif size_bytes >= 1_048_576:
            return f'{size_bytes / 1_048_576:.1f} MB'
        elif size_bytes >= 1024:
            return f'{size_bytes / 1024:.1f} KB'
        return f'{size_bytes} B'
    except Exception:
        return 'N/A'


def _parse_apple_html_fallback(soup, data, html_content):
    """Fallback HTML parsing when iTunes API is unavailable."""
    app_data = _parse_ld_json_app_data(soup)

    if app_data:
        data['title'] = app_data.get('name', 'N/A')
        data['description'] = app_data.get('description', 'N/A')
        data['category'] = app_data.get('applicationCategory', 'N/A')
        offers = app_data.get('offers')
        if isinstance(offers, dict):
            price = offers.get('price')
            currency = offers.get('priceCurrency', '')
            data['price'] = 'Free' if price in (0, '0') else f'{price} {currency}'.strip() if price else 'N/A'
        agg = app_data.get('aggregateRating')
        if isinstance(agg, dict):
            data['rating'] = str(agg.get('ratingValue', 'N/A'))
            data['reviews_count'] = str(agg.get('reviewCount', 'N/A'))
        author = app_data.get('author')
        if isinstance(author, dict):
            data['developer'] = author.get('name', 'N/A')

    if data['title'] == 'N/A':
        h1 = soup.select_one('h1')
        if h1:
            data['title'] = h1.get_text(strip=True)

    if data['description'] == 'N/A':
        desc = _extract_meta_content(soup, [
            'meta[name="description"]',
            'meta[property="og:description"]',
        ])
        if desc:
            data['description'] = desc

    meta_image = _extract_meta_content(soup, [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
    ])
    if meta_image:
        data['icon'] = _clean_image_url(meta_image)

    # Try to extract screenshot URLs from HTML (often placeholder due to lazy-loading)
    screenshot_urls = re.findall(
        r'https?://[^\s"\']+mzstatic\.com/[^\s"\']+\.(?:png|jpe?g|webp)',
        html_content, re.IGNORECASE
    )
    # Filter out icon/badge sized images
    for s in screenshot_urls:
        if '/1x1' not in s and 'Placeholder' not in s and 'badge' not in s.lower():
            data['screenshots'].append(_clean_image_url(s))
    data['screenshots'] = _dedupe_keep_order(data['screenshots'])


def _extract_apple_reviews(soup):
    """Extract user reviews from Apple App Store HTML."""
    reviews = []

    # Apple App Store review structure: customer-review containers
    for review_div in soup.select('.we-customer-review'):
        title_el = review_div.select_one('.we-customer-review__title')
        title = title_el.get_text(strip=True) if title_el else ''

        body_el = review_div.select_one('.we-customer-review__body')
        body = body_el.get_text(strip=True) if body_el else ''

        user_el = review_div.select_one('.we-customer-review__user')
        author = user_el.get_text(strip=True) if user_el else 'Anonymous'

        date_el = review_div.select_one('.we-customer-review__date')
        date_val = date_el.get_text(strip=True) if date_el else ''

        rating = ''
        stars_el = review_div.select_one('[aria-label*="star" i]')
        if stars_el:
            m = re.search(r'(\d+)', stars_el.get('aria-label', ''))
            if m:
                rating = m.group(1)

        if body and not any(r['body'] == body for r in reviews):
            reviews.append({
                'title': title,
                'rating': rating,
                'date': date_val,
                'author': author,
                'body': body
            })

    # Fallback: try alternate selectors used by some App Store page versions
    if not reviews:
        for header_el in soup.select('.review-header, [class*="review"]'):
            container = header_el.find_parent(class_=re.compile(r'review|container', re.I))
            if not container:
                container = header_el

            title_el = container.select_one('h3, [class*="title"]')
            title = title_el.get_text(strip=True) if title_el else ''

            body_el = container.select_one('p[class*="content"], [class*="body"], blockquote')
            body = body_el.get_text(strip=True) if body_el else ''

            author_el = container.select_one('[class*="author"], [class*="user"]')
            author = author_el.get_text(strip=True) if author_el else 'Anonymous'

            date_el = container.select_one('time, [class*="date"]')
            date_val = date_el.get_text(strip=True) if date_el else ''

            rating = ''
            stars_el = container.select_one('[aria-label*="star" i]')
            if stars_el:
                m = re.search(r'(\d+)', stars_el.get('aria-label', ''))
                if m:
                    rating = m.group(1)

            if body and not any(r['body'] == body for r in reviews):
                reviews.append({
                    'title': title,
                    'rating': rating,
                    'date': date_val,
                    'author': author,
                    'body': body
                })

    return reviews[:10]


# ---------------------------------------------------------------------------
# Google Play Store parser — HTML-based
# ---------------------------------------------------------------------------

def _parse_google_play(soup, url):
    """Parse Google Play Store from HTML."""
    data = _init_data(url, 'Google Play Store')
    app_data = _parse_ld_json_app_data(soup)

    if app_data:
        data['title'] = app_data.get('name', 'N/A')
        data['description'] = app_data.get('description', 'N/A')
        data['category'] = app_data.get('applicationCategory', 'N/A')

        offers = app_data.get('offers')
        if isinstance(offers, list) and offers:
            price = offers[0].get('price')
            data['price'] = 'Free' if price == '0' else (price or 'N/A')

        agg = app_data.get('aggregateRating')
        if isinstance(agg, dict):
            data['rating'] = str(agg.get('ratingValue', 'N/A'))
            data['reviews_count'] = str(agg.get('ratingCount', 'N/A'))

        author = app_data.get('author')
        if isinstance(author, dict):
            data['developer'] = author.get('name', 'N/A')

    # HTML fallbacks
    if data['title'] == 'N/A':
        title_elem = soup.select_one('h1[itemprop="name"], h1')
        if title_elem:
            data['title'] = title_elem.get_text(strip=True)

    if data['developer'] == 'N/A':
        dev_elem = soup.select_one('.Vbfug a span') or soup.select_one('div.Vbfug a')
        if dev_elem:
            data['developer'] = dev_elem.get_text(strip=True)

    desc_elem = soup.select_one('div[data-g-id="description"]')
    if desc_elem:
        data['description'] = desc_elem.get_text(strip=True)

    # Installs
    for item in soup.select('.ClM7O'):
        text = item.get_text(strip=True).lower()
        if '+' in text and any(x in text for x in ['m', 'k', 'b', 'downloads']):
            data['installs'] = item.get_text(strip=True)

    # Icon
    # Prefer structured JSON-LD data for the icon first
    if app_data and app_data.get('image'):
        data['icon'] = _clean_image_url(app_data['image'], is_play_store=True)

    if data['icon'] == 'N/A':
        # Class-based selectors for Google Play Store main icon
        for selector in ['div.RhBWnf img', 'div.qxNhq img']:
            icon_el = soup.select_one(selector)
            if icon_el and (icon_el.get('src') or icon_el.get('data-src')):
                src = icon_el.get('src') or icon_el.get('data-src')
                data['icon'] = _clean_image_url(src, is_play_store=True)
                break

    if data['icon'] == 'N/A':
        # Fallback keywords for different languages
        icon_keywords = ['icon', 'logo', 'biểu tượng']
        for img in soup.find_all('img'):
            alt = (img.get('alt') or '').lower()
            if any(kw in alt for kw in icon_keywords):
                src = img.get('src') or img.get('data-src')
                if src:
                    data['icon'] = _clean_image_url(src, is_play_store=True)
                    break

    # Screenshots
    screenshots = []
    # 1. Class-based selectors (highly specific to Google Play screenshot container, language-agnostic)
    for selector in ['div.Atcj9b img', 'div.aoJE7e img', 'div.ULeU3b img']:
        for img in soup.select(selector):
            src = img.get('src') or img.get('data-src') or img.get('srcset')
            if src and '/assets/artwork' not in src:
                screenshots.append(_clean_image_url(src, is_play_store=True))

    # 2. Language-agnostic keyword check in alt attribute (fallback)
    alt_keywords = [
        'screenshot', 'screen', 'preview', 
        'ảnh chụp màn hình', 'ảnh chụp', 'giao diện',
        'captura', 'pantalla', 'capture', 'scherm', 'bildschirm'
    ]
    for img in soup.find_all('img'):
        alt = (img.get('alt') or '').lower()
        src = img.get('src') or img.get('data-src') or img.get('srcset')
        if not src:
            continue
            
        # Is it a screenshot based on alt tag in some language?
        is_screenshot_alt = any(kw in alt for kw in alt_keywords)
        
        # Exclude icons, avatars, similar apps thumbnail
        is_ignored = any(skip in alt for skip in ['icon', 'logo', 'biểu tượng', 'avatar', 'user', 'profile', 'thumbnail', 'thu nhỏ'])
        if '/a-' in src or '/a/' in src:
            is_ignored = True
            
        if is_screenshot_alt and not is_ignored and '/assets/artwork' not in src:
            screenshots.append(_clean_image_url(src, is_play_store=True))
            
    data['screenshots'] = _dedupe_keep_order(screenshots)

    # Videos
    for selector in ['video source', 'video']:
        for elem in soup.select(selector):
            src = elem.get('src')
            if src and src.lower().endswith(('.mp4', '.mov', '.webm')):
                data['videos'].append(src.strip())
    data['videos'] = _dedupe_keep_order(data['videos'])

    # Reviews
    reviews = []
    for container in soup.select('div.EGFGHd'):
        author_el = container.select_one('.X5PpBb')
        author = author_el.get_text(strip=True) if author_el else 'Anonymous'

        rating = ''
        rating_el = container.find(attrs={"aria-label": re.compile(r"Rated \d", re.I)})
        if rating_el:
            m = re.search(r'Rated\s+(\d)', rating_el.get('aria-label', ''), re.I)
            if m:
                rating = m.group(1)

        date_el = container.select_one('.bp9Aid')
        date_val = date_el.get_text(strip=True) if date_el else ''

        body_el = container.select_one('div.h3YV2d')
        body = body_el.get_text(strip=True) if body_el else ''

        if body and not any(r['body'] == body for r in reviews):
            reviews.append({
                'title': '',
                'rating': rating,
                'date': date_val,
                'author': author,
                'body': body
            })
    data['reviews_list'] = reviews[:10]

    return data


# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------

def _init_data(url, platform):
    return {
        'url': url,
        'platform': platform,
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
        'reviews_list': [],
    }


def parse_app_store(html_content, url, media=None):
    """
    Parse Apple App Store or Google Play Store HTML and return structured data.
    For Apple App Store, uses iTunes Lookup API for reliable screenshots/metadata.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    url_lower = url.lower()

    if 'apps.apple.com' in url_lower:
        data = _parse_apple_app_store(soup, url, html_content)
    elif 'play.google.com' in url_lower:
        data = _parse_google_play(soup, url)
    else:
        data = _init_data(url, 'Unknown')

    # Media fallback from crawler
    if media and (getattr(media, 'images', None) or isinstance(media, dict)):
        images_list = media.get('images', []) if isinstance(media, dict) else getattr(media, 'images', [])
        for img in images_list:
            src = img.get('src', '') if isinstance(img, dict) else getattr(img, 'src', '')
            alt = (img.get('alt', '') if isinstance(img, dict) else getattr(img, 'alt', '')).lower()
            if data['icon'] == 'N/A' and src and ('icon' in alt or 'logo' in alt):
                data['icon'] = src
            if src and 'screenshot' in alt and src not in data['screenshots']:
                data['screenshots'].append(src)

    if media and (getattr(media, 'videos', None) or isinstance(media, dict)):
        videos_list = media.get('videos', []) if isinstance(media, dict) else getattr(media, 'videos', [])
        for video in videos_list:
            src = video.get('src', '') if isinstance(video, dict) else getattr(video, 'src', '')
            if src and src.lower().endswith(('.mp4', '.mov', '.webm')) and src not in data['videos']:
                data['videos'].append(src)

    data['screenshots'] = _dedupe_keep_order(data['screenshots'])
    return data


def generate_app_markdown(data):
    """Generate structured Markdown report for an app."""
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
        md.append("\n## What's New")
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

    if data.get('reviews_list'):
        md.append('\n## User Reviews')
        for r in data['reviews_list']:
            title_str = f" - **{r['title']}**" if r.get('title') else ""
            rating_str = f" [{r['rating']} ⭐]" if r.get('rating') else ""
            md.append(f"### {r['author']}{title_str}{rating_str}")
            if r.get('date'):
                md.append(f"*{r['date']}*\n")
            md.append(f"{r['body']}\n")

    return '\n'.join(md)
