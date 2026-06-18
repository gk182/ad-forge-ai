import { NextRequest, NextResponse } from 'next/server';

const CRAWLER_BACKEND_URL = 'http://127.0.0.1:8000/scrape';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'A valid URL is required.' }, { status: 400 });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format. Please provide a valid HTTP/HTTPS URL.' },
        { status: 400 }
      );
    }

    console.log(`Forwarding scrape request for ${parsedUrl.toString()} to local Python crawler backend...`);

    // Call Local Python Crawl Backend
    const response = await fetch(CRAWLER_BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: parsedUrl.toString(),
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      console.error('Local crawler backend error:', errText);
      return NextResponse.json(
        { error: `Local crawler backend failed: ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check if we got an image; if not, extract from markdown fallback
    let image = data.image || '';
    if (!image && data.markdown) {
      const match = data.markdown.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
      if (match && match[1]) {
        image = match[1].split(' ')[0];
      } else {
        const rawMatch = data.markdown.match(/(https?:\/\/[^\s\)]+?\.(?:png|jpe?g|gif|webp|svg))/i);
        if (rawMatch && rawMatch[1]) {
          image = rawMatch[1];
        }
      }
    }

    return NextResponse.json({
      title: (data.title || 'Unknown Product').trim().substring(0, 200),
      description: (data.description || '').trim().substring(0, 500),
      image: typeof image === 'string' ? image : '',
      markdown: data.markdown || '',
      screenshots: Array.isArray(data.screenshots) ? data.screenshots : [],
      videos: Array.isArray(data.videos) ? data.videos : [],
    });
  } catch (error) {
    console.error('Scrape error:', error);
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred during scraping.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
