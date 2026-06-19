import { NextRequest, NextResponse } from 'next/server';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const props = await req.json();

    if (!props.scenes || !Array.isArray(props.scenes) || props.scenes.length === 0) {
      return NextResponse.json({ error: 'Scenes are required for rendering' }, { status: 400 });
    }

    // Ensure output directory exists inside public/renders
    const outputDir = path.resolve('public', 'renders');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const videoId = `video-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const outputFilePath = path.join(outputDir, `${videoId}.mp4`);

    console.log('[Remotion Render] Bundling React composition...');
    const entryPoint = path.resolve('src/remotion/index.ts');
    
    const bundleLocation = await bundle({
      entryPoint,
      webpackOverride: (config) => {
        return {
          ...config,
          // Custom Webpack overrides if needed
        };
      },
    });

    console.log('[Remotion Render] Selecting composition "AdVideo"...');
    const compositionId = 'AdVideo';
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: compositionId,
      inputProps: props,
    });

    const fps = composition.fps;
    // Compute duration in frames. Default to composition default if no audioDuration provided
    const durationInFrames = props.audioDuration
      ? Math.round(props.audioDuration * fps)
      : composition.durationInFrames;

    console.log(
      `[Remotion Render] Starting rendering process for ${durationInFrames} frames (${(
        durationInFrames / fps
      ).toFixed(2)}s) at ${fps}fps...`
    );

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames,
      },
      serveUrl: bundleLocation,
      outputLocation: outputFilePath,
      inputProps: props,
      codec: 'h264',
      concurrency: 4,
    });

    console.log(`[Remotion Render] Successfully saved video to: ${outputFilePath}`);

    return NextResponse.json({
      success: true,
      videoUrl: `/api/renders/${videoId}.mp4`,
      filename: `${videoId}.mp4`,
      duration: durationInFrames / fps,
    });
  } catch (error) {
    console.error('[Remotion Render Route Error]', error);
    const message = error instanceof Error ? error.message : 'Server-side rendering failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
