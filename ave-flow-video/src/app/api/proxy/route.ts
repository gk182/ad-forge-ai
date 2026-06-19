import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const headers = new Headers();
    const range = req.headers.get('range');
    if (range) {
      headers.set('Range', range);
    }
    
    headers.set(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );

    const res = await fetch(targetUrl, {
      headers,
    });

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    
    const contentType = res.headers.get('content-type');
    if (contentType) responseHeaders.set('Content-Type', contentType);
    
    const contentRange = res.headers.get('content-range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    
    const contentLength = res.headers.get('content-length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);
    
    const acceptRanges = res.headers.get('accept-ranges');
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Error proxying media asset', { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
