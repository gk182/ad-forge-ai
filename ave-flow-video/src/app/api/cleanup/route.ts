import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/config/env';

const BACKEND_BASE_URL = BACKEND_URL;

export async function DELETE(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${BACKEND_BASE_URL}/cleanup/${encodeURIComponent(filename)}`,
      { method: 'DELETE' }
    );
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Cleanup Error]', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
