import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> | { filename: string } }
) {
  // Safe resolution of params for both Next.js 14 and Next.js 15
  const resolvedParams = await (params instanceof Promise ? params : Promise.resolve(params));
  const filename = resolvedParams?.filename;

  if (!filename) {
    return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
  }

  try {
    const response = await fetch(`${BACKEND_BASE_URL}/outputs/renders/${encodeURIComponent(filename)}`);
    if (!response.ok) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp4');
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    
    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error('[Renders Serve Error]', error);
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 });
  }
}
