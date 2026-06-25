import { NextRequest, NextResponse } from 'next/server';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { buildRenderObjectKey, canUploadToR2, uploadFileToR2 } from '@/lib/storage/r2';

// ── Remotion Bundle Cache ──────────────────────────────────────────
// Cache the compiled Webpack bundle at module scope to avoid re-bundling
// on every render request (saves 10-15 seconds per call).
let cachedBundleLocation: string | null = null;
let bundlingPromise: Promise<string> | null = null;
const activeCacheUsage = new Map<string, number>();

async function getCachedBundle(): Promise<string> {
  // Return cached if available
  if (cachedBundleLocation) {
    return cachedBundleLocation;
  }

  // If already bundling, wait for that promise
  if (bundlingPromise) {
    return bundlingPromise;
  }

  // Start fresh bundle
  bundlingPromise = (async () => {
    console.log('[Remotion Render] Bundling React composition (first time, will be cached)...');
    const entryPoint = path.resolve('src/remotion/index.ts');
    const location = await bundle({
      entryPoint,
      webpackOverride: (config) => ({
        ...config,
      }),
    });
    cachedBundleLocation = location;
    console.log('[Remotion Render] Bundle cached for subsequent renders.');
    return location;
  })();

  try {
    return await bundlingPromise;
  } finally {
    bundlingPromise = null;
  }
}

// Ensure cache directory exists inside public/cache
const cacheDir = path.resolve('public', 'cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Clean up any stale files in public/cache that are older than 15 minutes
function cleanupStaleCacheFiles() {
  try {
    if (!fs.existsSync(cacheDir)) return;
    const now = Date.now();
    const thresholdMs = 15 * 60 * 1000; // 15 minutes
    const files = fs.readdirSync(cacheDir);
    let deletedCount = 0;
    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > thresholdMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        console.error(`[Stale Cache Cleanup Error] Failed to process ${file}`, err);
      }
    }
    if (deletedCount > 0) {
      console.log(`[Stale Cache Cleanup] Successfully deleted ${deletedCount} stale cache files.`);
    }
  } catch (err) {
    console.error('[Stale Cache Cleanup Error] Failed to read cache directory', err);
  }
}

// Helper to download a remote URL or cache a base64 data URL to public/cache and return the relative cache URL
async function downloadAndCacheAsset(url: string): Promise<string> {
  if (!url) {
    return url;
  }

  // Handle base64 data URLs
  if (url.startsWith('data:')) {
    try {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return url;
      const mimeType = match[1];
      const base64Data = match[2];

      let ext = '.mp3';
      if (mimeType.includes('wav')) ext = '.wav';
      else if (mimeType.includes('ogg')) ext = '.ogg';
      else if (mimeType.includes('mp4')) ext = '.mp4';
      else if (mimeType.includes('mpeg')) ext = '.mp3';
      else if (mimeType.includes('image/png')) ext = '.png';
      else if (mimeType.includes('image/jpeg') || mimeType.includes('image/jpg')) ext = '.jpg';
      else if (mimeType.includes('image/webp')) ext = '.webp';
      else if (mimeType.includes('image/gif')) ext = '.gif';

      const hash = crypto.createHash('md5').update(base64Data).digest('hex');
      const filename = `${hash}${ext}`;
      const filePath = path.join(cacheDir, filename);
      const relativeUrl = `/cache/${filename}`;

      if (fs.existsSync(filePath)) {
        console.log(`[Cache Hit] Base64 asset already cached -> ${relativeUrl}`);
        return relativeUrl;
      }

      console.log(`[Cache Miss] Saving Base64 asset to: ${filePath}`);
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      console.log(`[Cache Success] Saved Base64: ${relativeUrl}`);
      return relativeUrl;
    } catch (err) {
      console.error('[Cache Error] Failed to cache base64 asset', err);
      return url;
    }
  }

  // Handle remote URLs
  if (!url.startsWith('http')) {
    return url; // Skip already local paths
  }

  try {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    let ext = path.extname(pathname);
    if (!ext) {
      ext = '.mp4'; // fallback
    }
    const filename = `${hash}${ext}`;
    const filePath = path.join(cacheDir, filename);
    const relativeUrl = `/cache/${filename}`;

    // If file already exists in cache, return the relative URL
    if (fs.existsSync(filePath)) {
      console.log(`[Cache Hit] Asset already cached: ${url} -> ${relativeUrl}`);
      return relativeUrl;
    }

    console.log(`[Cache Miss] Downloading asset: ${url} -> ${filePath}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/mp4,video/*,image/*,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.amazon.com/',
      }
    });
    if (!res.ok) {
      throw new Error(`Failed to download asset: status ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    console.log(`[Cache Success] Saved: ${relativeUrl}`);
    return relativeUrl;
  } catch (err) {
    console.error(`[Cache Error] Failed to download asset: ${url}`, err);
    return url; // fallback to remote URL if download fails
  }
}

export async function POST(req: NextRequest) {
  let uniqueUsedCacheFilenames: string[] = [];
  let bundleLocation: string | null = null;

  try {
    const props = await req.json();

    if (!props.scenes || !Array.isArray(props.scenes) || props.scenes.length === 0) {
      return NextResponse.json({ error: 'Scenes are required for rendering' }, { status: 400 });
    }

    // Cache remote media assets (videos, images) and per-scene audio locally
    console.log('[Remotion Render] Pre-caching remote assets...');
    const cachedScenes = await Promise.all(
      props.scenes.map(async (scene: any) => {
        const updatedScene = { ...scene };
        if (scene.media_url) {
          const cachedUrl = await downloadAndCacheAsset(scene.media_url);
          updatedScene.media_url = cachedUrl;
        }
        if (scene.audioUrl) {
          const cachedAudioUrl = await downloadAndCacheAsset(scene.audioUrl);
          updatedScene.audioUrl = cachedAudioUrl;
        }
        return updatedScene;
      })
    );
    props.scenes = cachedScenes;

    // Cache remote audio URL if present
    if (props.audioUrl && props.audioUrl !== 'per-scene') {
      props.audioUrl = await downloadAndCacheAsset(props.audioUrl);
    }

    // Collect all unique cache filenames used in this render to manage reference counting
    const usedCacheFilenames: string[] = [];
    const addCacheFile = (url: string) => {
      if (url && url.startsWith('/cache/')) {
        const filename = url.replace('/cache/', '');
        usedCacheFilenames.push(filename);
      }
    };

    props.scenes.forEach((scene: any) => {
      if (scene.media_url) addCacheFile(scene.media_url);
      if (scene.audioUrl) addCacheFile(scene.audioUrl);
    });
    if (props.audioUrl && props.audioUrl !== 'per-scene') {
      addCacheFile(props.audioUrl);
    }

    uniqueUsedCacheFilenames = Array.from(new Set(usedCacheFilenames));

    // Register active usage for the files in the global map
    uniqueUsedCacheFilenames.forEach((filename) => {
      const count = activeCacheUsage.get(filename) || 0;
      activeCacheUsage.set(filename, count + 1);
    });

    // Ensure output directory exists inside public/renders
    const outputDir = path.resolve('public', 'renders');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const videoId = `video-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const outputFilePath = path.join(outputDir, `${videoId}.mp4`);

    console.log('[Remotion Render] Getting cached bundle...');
    bundleLocation = await getCachedBundle();

    // Copy any locally cached assets from public/cache to bundleLocation/cache and bundleLocation/public/cache
    // so they are hosted correctly by the Remotion bundle server during rendering.
    const destDirs = [
      path.join(bundleLocation, 'cache'),
      path.join(bundleLocation, 'public', 'cache'),
    ];

    for (const dir of destDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const copyToBundleCache = (url: string) => {
      if (url && url.startsWith('/cache/')) {
        const filename = url.replace('/cache/', '');
        const sourcePath = path.join(cacheDir, filename);

        for (const dir of destDirs) {
          const destPath = path.join(dir, filename);
          if (fs.existsSync(sourcePath) && !fs.existsSync(destPath)) {
            console.log(`[Bundle Copy] Copying cache asset: ${filename} to bundle path: ${destPath}`);
            try {
              fs.copyFileSync(sourcePath, destPath);
            } catch (e) {
              console.error(`[Bundle Copy Error] Failed to copy ${filename} to bundle path ${destPath}`, e);
            }
          }
        }
      }
    };

    props.scenes.forEach((scene: any) => {
      if (scene.media_url) {
        copyToBundleCache(scene.media_url);
      }
      if (scene.audioUrl) {
        copyToBundleCache(scene.audioUrl);
      }
    });
    if (props.audioUrl && props.audioUrl !== 'per-scene') {
      copyToBundleCache(props.audioUrl);
    }

    const compositionId = props.compositionId === 'MobileAppVideo' ? 'MobileAppVideo' : 'AdVideo';
    console.log(`[Remotion Render] Selecting composition "${compositionId}"...`);
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

    // Dynamic concurrency based on CPU count
    const cpuCount = os.cpus().length;
    const renderConcurrency = Math.max(2, Math.min(cpuCount, 8));

    console.log(
      `[Remotion Render] Starting rendering process for ${durationInFrames} frames (${(
        durationInFrames / fps
      ).toFixed(2)}s) at ${fps}fps with concurrency=${renderConcurrency}...`
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
      crf: 22, // Lower CRF means higher quality (0-51)
      imageFormat: 'jpeg',
      jpegQuality: 90,
      pixelFormat: 'yuv420p',
      concurrency: renderConcurrency,
      timeoutInMilliseconds: 120000, // Increase global render timeout to 2 minutes
    });

    console.log(`[Remotion Render] Successfully saved video to: ${outputFilePath}`);

    const filename = `${videoId}.mp4`;
    const localVideoUrl = `/api/renders/${filename}`;
    const duration = durationInFrames / fps;
    let videoUrl = localVideoUrl;
    let storage: 'local' | 'cloudflare-r2' = 'local';
    let objectKey: string | null = null;

    if (canUploadToR2()) {
      const uploadStartedAt = Date.now();

      try {
        objectKey = buildRenderObjectKey(filename);
        const uploadResult = await uploadFileToR2(outputFilePath, objectKey);
        videoUrl = uploadResult.videoUrl;
        storage = uploadResult.storage;
        console.log(
          `[Remotion Render] Uploaded video to R2 in ${Date.now() - uploadStartedAt}ms: ${objectKey}`
        );
      } catch (uploadError) {
        console.error('[Remotion Render] R2 upload failed. Falling back to local file URL.', uploadError);
      }
    } else {
      console.log('[Remotion Render] R2 upload skipped because configuration is incomplete.');
    }

    return NextResponse.json({
      success: true,
      videoUrl,
      filename,
      duration,
      storage,
      objectKey,
    });
  } catch (error) {
    console.error('[Remotion Render Route Error]', error);
    const message = error instanceof Error ? error.message : 'Server-side rendering failed';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Decrement active usage counters and clean up unused files
    if (uniqueUsedCacheFilenames.length > 0) {
      console.log(`[Cache Cleanup] Checking ${uniqueUsedCacheFilenames.length} assets for cleanup...`);
      for (const filename of uniqueUsedCacheFilenames) {
        const count = activeCacheUsage.get(filename) || 1;
        const newCount = count - 1;
        if (newCount <= 0) {
          activeCacheUsage.delete(filename);
          console.log(`[Cache Cleanup] Cleaning up asset (no active renders): ${filename}`);

          // Delete from public/cache
          const publicCachePath = path.join(cacheDir, filename);
          try {
            if (fs.existsSync(publicCachePath)) {
              fs.unlinkSync(publicCachePath);
              console.log(`[Cache Cleanup] Deleted from public/cache: ${filename}`);
            }
          } catch (e) {
            console.error(`[Cache Cleanup Error] Failed to delete from public/cache: ${filename}`, e);
          }

          // Delete from bundleLocation caches
          if (bundleLocation) {
            const destDirs = [
              path.join(bundleLocation, 'cache'),
              path.join(bundleLocation, 'public', 'cache'),
            ];
            for (const dir of destDirs) {
              const destPath = path.join(dir, filename);
              try {
                if (fs.existsSync(destPath)) {
                  fs.unlinkSync(destPath);
                  console.log(`[Cache Cleanup] Deleted from bundle cache: ${destPath}`);
                }
              } catch (e) {
                console.error(`[Cache Cleanup Error] Failed to delete from bundle path: ${destPath}`, e);
              }
            }
          }
        } else {
          activeCacheUsage.set(filename, newCount);
          console.log(`[Cache Cleanup] Asset still in use by ${newCount} other render(s): ${filename}`);
        }
      }
    }

    // Also trigger cleanup of any stale cache files from older/other sessions
    cleanupStaleCacheFiles();
  }
}
