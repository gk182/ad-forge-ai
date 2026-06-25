import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, isAllowedR2PublicUrl } from '@/config/env';
import path from 'path';
import fs from 'fs';

const BACKEND_BASE_URL = BACKEND_URL;

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('file');
  const remoteUrl = req.nextUrl.searchParams.get('url');

  if (remoteUrl) {
    if (!isAllowedR2PublicUrl(remoteUrl)) {
      return NextResponse.json({ error: 'Remote download URL is not allowed.' }, { status: 400 });
    }

    try {
      const parsedUrl = new URL(remoteUrl);
      const remoteFilename = path.basename(parsedUrl.pathname) || 'video.mp4';
      const response = await fetch(remoteUrl);

      if (!response.ok || !response.body) {
        return NextResponse.json({ error: 'Remote file could not be downloaded.' }, { status: 404 });
      }

      const headers = new Headers();
      headers.set('Content-Type', response.headers.get('content-type') || 'video/mp4');
      headers.set('Content-Disposition', `attachment; filename="${remoteFilename}"`);

      const contentLength = response.headers.get('content-length');
      if (contentLength) headers.set('Content-Length', contentLength);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error('[Download Error] Failed to proxy remote video', error);
      return NextResponse.json({ error: 'Remote download failed' }, { status: 500 });
    }
  }

  if (!filename) {
    return NextResponse.json({ error: 'Missing file or url parameter' }, { status: 400 });
  }

  // Prevent directory traversal attacks by extracting base filename
  const sanitizedFilename = path.basename(filename);

  try {
    // 1. Check if the file exists locally inside public/renders
    const localFilePath = path.resolve('public', 'renders', sanitizedFilename);
    if (fs.existsSync(localFilePath)) {
      const fileStats = fs.statSync(localFilePath);
      const nodeStream = fs.createReadStream(localFilePath);

      // Convert Node.js readable stream to Web ReadableStream
      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk) => {
            controller.enqueue(chunk);
          });
          nodeStream.on('end', () => {
            controller.close();
          });
          nodeStream.on('error', (err) => {
            controller.error(err);
          });
        },
        cancel() {
          nodeStream.destroy();
        }
      });

      return new Response(webStream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
          'Content-Length': fileStats.size.toString(),
          'Accept-Ranges': 'bytes',
        },
      });
    }

    // 2. Fallback to local python backend crawler proxy
    console.log(`[Download Proxy] Local file not found. Proxying ${sanitizedFilename} to backend...`);
    const response = await fetch(`${BACKEND_BASE_URL}/download/${encodeURIComponent(sanitizedFilename)}`);
    if (!response.ok) {
      return NextResponse.json({ error: 'File not found on backend' }, { status: 404 });
    }

    if (!response.body) {
      return NextResponse.json({ error: 'Backend response has no body' }, { status: 500 });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp4');
    headers.set('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    
    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error('[Download Error]', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
