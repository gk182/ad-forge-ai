import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> | { filename: string } }
) {
  // Safe resolution of params for both Next.js 14 and Next.js 15+
  const resolvedParams = await (params instanceof Promise ? params : Promise.resolve(params));
  const filename = resolvedParams?.filename;

  if (!filename) {
    return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
  }

  try {
    // 1. Check if the file exists locally inside the Next.js public/renders directory
    const localFilePath = path.resolve('public', 'renders', filename);
    if (fs.existsSync(localFilePath)) {
      const fileStream = fs.createReadStream(localFilePath);
      const fileStats = fs.statSync(localFilePath);

      const headers = new Headers();
      headers.set('Content-Type', 'video/mp4');
      headers.set('Content-Length', fileStats.size.toString());
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Access-Control-Allow-Origin', '*');

      // Return local stream response
      return new Response(fileStream as any, {
        status: 200,
        headers,
      });
    }

    // 2. Fallback to local python backend crawler proxy
    console.log(`[Renders Serve] File not found locally. Proxying ${filename} to backend...`);
    const response = await fetch(`${BACKEND_BASE_URL}/outputs/renders/${encodeURIComponent(filename)}`);
    if (!response.ok) {
      return NextResponse.json({ error: 'File not found on server or backend' }, { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp4');
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    
    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
    headers.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error('[Renders Serve Error]', error);
    return NextResponse.json({ error: 'Failed to serve video asset' }, { status: 500 });
  }
}
