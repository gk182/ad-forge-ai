import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/config/env';

const BACKEND_BASE_URL = BACKEND_URL;

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
  }

  try {
    const response = await fetch(`${BACKEND_BASE_URL}/download/${encodeURIComponent(filename)}`);
    if (!response.ok) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const blob = await response.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[Download Error]', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
