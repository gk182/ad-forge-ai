function isAbsoluteUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export function extractVideoFilename(videoUrl: string) {
  if (!videoUrl) {
    return 'video.mp4';
  }

  if (isAbsoluteUrl(videoUrl)) {
    try {
      const parsedUrl = new URL(videoUrl);
      const pathname = parsedUrl.pathname.split('/').filter(Boolean);
      return pathname[pathname.length - 1] || 'video.mp4';
    } catch {
      return 'video.mp4';
    }
  }

  const cleanUrl = videoUrl.split('?')[0].split('#')[0];
  const parts = cleanUrl.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'video.mp4';
}

export function buildVideoDownloadHref(videoUrl: string) {
  if (!videoUrl) {
    return '#';
  }

  if (isAbsoluteUrl(videoUrl)) {
    return `/api/download?url=${encodeURIComponent(videoUrl)}`;
  }

  return `/api/download?file=${encodeURIComponent(extractVideoFilename(videoUrl))}`;
}
