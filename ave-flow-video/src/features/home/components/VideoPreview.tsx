'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Info, Tv, Layers, Grid, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PipelineResult } from '@/features/pipeline/pipeline.types';

interface VideoPreviewProps {
  result: PipelineResult;
}

type PreviewLayout = 'greenscreen' | 'splitscreen' | 'classic';

export function VideoPreview({ result }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [layout, setLayout] = useState<PreviewLayout>('splitscreen');
  const subtitleChunks = useRef<{ text: string; start: number; end: number }[]>([]);

  useEffect(() => {
    const words = result.script.split(/\s+/);
    const chunkSize = 5;
    const chunks: { text: string; start: number; end: number }[] = [];
    const totalDuration = duration || 15;
    const chunkDuration = totalDuration / Math.ceil(words.length / chunkSize);

    for (let index = 0; index < words.length; index += chunkSize) {
      const chunk = words.slice(index, index + chunkSize).join(' ');
      const chunkIndex = Math.floor(index / chunkSize);
      chunks.push({
        text: chunk,
        start: chunkIndex * chunkDuration,
        end: (chunkIndex + 1) * chunkDuration,
      });
    }

    subtitleChunks.current = chunks;
  }, [result.script, duration]);

  useEffect(() => {
    const chunk = subtitleChunks.current.find(
      (item) => currentTime >= item.start && currentTime < item.end
    );
    setCurrentSubtitle(chunk?.text || '');
  }, [currentTime]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await video.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('Playback failed:', error);
    }
  };

  const handleRestart = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => { });
    }
    setIsPlaying(true);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setCurrentSubtitle('');
  };

  const handleDownload = async () => {
    try {
      const filename = result.videoUrl.split('/').pop();
      if (!filename) throw new Error('Invalid video URL');

      toast.loading('Preparing download...', { id: 'download' });
      const res = await fetch(`/api/download?file=${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error('Download failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download started!', { id: 'download' });
    } catch {
      toast.error('Download failed', { id: 'download' });
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="animate-slide-up">
      {result.isMockVideo && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-[var(--warning)]/10 border border-[var(--warning)]/20 px-4 py-3">
          <Info className="w-4 h-4 text-[var(--warning)] mt-0.5 flex-shrink-0" />
          <p className="text-xs text-[var(--warning)]">
            Using demo avatar. Add your D-ID API key in Settings for a real AI talking-head video.
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="relative mx-auto w-full max-w-[360px] md:max-w-[400px] shrink-0 aspect-[9/16] rounded-3xl overflow-hidden bg-black shadow-2xl shadow-[var(--primary)]/10 border border-[var(--border)]">

          {/* Splitscreen Product Card */}
          {layout === 'splitscreen' && result.productData.image && (
            <div className="absolute top-12 left-0 right-0 h-[calc(50%-48px)] bg-neutral-900/60 flex items-center justify-center p-4 z-0">
              <img
                src={result.productData.image}
                alt={result.productData.title}
                className="max-w-full max-h-full object-contain rounded-xl shadow-lg bg-white"
              />
            </div>
          )}

          {/* Classic Product Center Stage */}
          {layout === 'classic' && result.productData.image && (
            <>
              <div className="absolute inset-0 z-0">
                <img
                  src={result.productData.image}
                  alt=""
                  className="w-full h-full object-cover scale-125 blur-md opacity-40"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center px-6 z-0">
                <img
                  src={result.productData.image}
                  alt={result.productData.title}
                  className="max-w-full max-h-[45%] object-contain rounded-2xl shadow-lg bg-white"
                />
              </div>
            </>
          )}

          {/* Single video element with dynamic styling based on layout */}
          <video
            ref={videoRef}
            src={result.videoUrl}
            className={`transition-all duration-300 ${layout === 'greenscreen'
              ? 'absolute inset-0 w-full h-full object-cover z-0'
              : layout === 'splitscreen'
                ? 'absolute bottom-0 left-0 right-0 h-[50%] w-full object-cover border-t border-white/10 z-0'
                : 'absolute bottom-24 right-3 w-[90px] h-[90px] rounded-2xl border-2 border-white/20 shadow-lg object-cover z-10'
              }`}
            loop
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleVideoEnded}
            preload="auto"
          />

          <button
            onClick={togglePlay}
            className="absolute inset-0 z-20 flex items-center justify-center group"
          >
            <div
              className={`w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center transition-all duration-300 ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                }`}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-6 h-6 text-white ml-1" />
              )}
            </div>
          </button>

          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-20">
            <div
              className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-4">
          <div className="glass-card p-4">
            <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              Choose Video Presentation Layout
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'greenscreen', label: 'Greenscreen', icon: <Tv className="w-4 h-4" />, desc: 'Presenter full-screen with floating product card' },
                { id: 'splitscreen', label: 'Split Screen', icon: <Layers className="w-4 h-4" />, desc: 'Product on top half, presenter on bottom half' },
                { id: 'classic', label: 'Classic', icon: <Grid className="w-4 h-4" />, desc: 'Product center-stage, presenter in corner' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setLayout(item.id as PreviewLayout);
                  }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all duration-300 ${layout === item.id
                    ? 'bg-[var(--primary)]/10 border-[var(--primary)] text-white'
                    : 'bg-white/5 border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/10'
                    }`}
                >
                  {item.icon}
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">{item.label}</span>
                    <span className="text-[9px] text-[var(--muted)] mt-0.5 leading-tight hidden sm:inline-block">
                      {item.desc}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card p-4 flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center hover:bg-[var(--primary)]/20 transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-[var(--primary)]" />
              ) : (
                <Play className="w-5 h-5 text-[var(--primary)] ml-0.5" />
              )}
            </button>
            <button
              onClick={handleRestart}
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <RotateCcw className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <button
              onClick={toggleMute}
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-[var(--text-secondary)]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[var(--text-secondary)]" />
              )}
            </button>
            <button
              onClick={handleDownload}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center hover:from-emerald-500/30 hover:to-teal-500/30 transition-all duration-300"
              title="Download video"
            >
              <Download className="w-4 h-4 text-emerald-400" />
            </button>

            <div className="flex-1">
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-[var(--muted)] font-mono tabular-nums">
              {Math.floor(currentTime)}s / {Math.floor(duration)}s
            </span>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
              Generated Script
            </h3>
            <p className="text-white leading-relaxed text-sm">&ldquo;{result.script}&rdquo;</p>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
              Product Info
            </h3>
            <p className="text-white font-medium text-sm">{result.productData.title}</p>
            {result.productData.description && (
              <p className="text-[var(--text-secondary)] text-xs mt-2 line-clamp-3">
                {result.productData.description}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
