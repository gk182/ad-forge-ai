'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Video as VideoIcon,
  Sparkles,
  ArrowRight,
  Upload,
  X,
  Film,
  MessageSquareQuote,
  Lightbulb,
  Moon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { OrderedAsset, ScriptMode } from '@/features/pipeline/pipeline.types';

interface AssetSelectorProps {
  productData: {
    title: string;
    description: string;
    image: string;
    screenshots: string[];
    videos: string[];
    sourceType?: string;
    confidence?: number;
    reviews?: Array<{ author: string; rating: string; title: string; body: string }>;
  };
  onGenerateScript: (
    orderedAssets: OrderedAsset[],
    scriptMode: ScriptMode,
    customNotes: string
  ) => void;
  isLoading: boolean;
}

const SCRIPT_MODES: { id: ScriptMode; label: string; icon: typeof Film; description: string }[] = [
  { id: 'standard', label: 'Standard Promo', icon: Film, description: 'High energy ad with hook, benefits, and CTA' },
  { id: 'customer_review', label: 'Customer Review', icon: MessageSquareQuote, description: 'First-person testimonial using real reviews' },
  { id: 'problem_solution', label: 'Problem → Solution', icon: Lightbulb, description: 'Lead with pain points, then reveal product as answer' },
  { id: 'asmr_unboxing', label: 'ASMR / Unboxing', icon: Moon, description: 'Calm, sensory-focused unboxing experience' },
];

function isLikelyVideoUrl(url: string) {
  if (!url) return false;
  if (/^data:video\//i.test(url)) return true;
  return /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url);
}

/**
 * Extract keyframes from a video at 25%, 50%, and 75% of its duration.
 * Runs offscreen using a hidden video element and canvas.
 */
async function extractVideoKeyframes(videoSrc: string): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    // Use proxy for CORS
    const proxiedUrl = `/api/proxy?url=${encodeURIComponent(videoSrc)}`;
    video.src = proxiedUrl;

    const keyframes: string[] = [];
    const percentages = [0.25, 0.5, 0.75];
    let currentIdx = 0;

    const captureFrame = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          keyframes.push(canvas.toDataURL('image/jpeg', 0.8));
        }
      } catch {
        // CORS may block - skip this frame
      }
    };

    video.addEventListener('loadedmetadata', () => {
      if (!video.duration || !Number.isFinite(video.duration)) {
        resolve([]);
        return;
      }
      video.currentTime = video.duration * percentages[0];
    });

    video.addEventListener('seeked', () => {
      captureFrame();
      currentIdx++;
      if (currentIdx < percentages.length) {
        video.currentTime = video.duration * percentages[currentIdx];
      } else {
        video.removeAttribute('src');
        video.load();
        resolve(keyframes);
      }
    });

    video.addEventListener('error', () => {
      resolve(keyframes); // Return whatever we captured
    });

    // Timeout safety
    setTimeout(() => {
      video.removeAttribute('src');
      video.load();
      resolve(keyframes);
    }, 15000);
  });
}

export function AssetSelector({ productData, onGenerateScript, isLoading }: AssetSelectorProps) {
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [orderedAssets, setOrderedAssets] = useState<OrderedAsset[]>([]);
  const [videoKeyframesMap, setVideoKeyframesMap] = useState<Record<string, string[]>>({});
  const [extractingVideo, setExtractingVideo] = useState<string | null>(null);
  const [customNotes, setCustomNotes] = useState('');
  const [scriptMode, setScriptMode] = useState<ScriptMode>('standard');

  // Build unified asset list: images first, then videos
  const crawledImages = [productData.image, ...(productData.screenshots || [])].filter(Boolean);
  const crawledVideos = (productData.videos || []).filter(Boolean);
  const allImages = [...crawledImages, ...uploadedImages];
  
  // Unified gallery: images + videos
  const allAssets: { type: 'image' | 'video'; url: string }[] = [
    ...allImages.map((url) => ({ type: 'image' as const, url })),
    ...crawledVideos.map((url) => ({ type: 'video' as const, url })),
  ];

  const handleUploadImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64Url = event.target.result as string;
          setUploadedImages((prev) => [...prev, base64Url]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const toggleAsset = useCallback(async (type: 'image' | 'video', url: string) => {
    const existingIndex = orderedAssets.findIndex((a) => a.url === url);
    
    if (existingIndex !== -1) {
      // Deselect
      setOrderedAssets((prev) => prev.filter((a) => a.url !== url));
      return;
    }

    // Select new asset
    if (type === 'video') {
      // Auto-extract keyframes for videos
      if (!videoKeyframesMap[url]) {
        setExtractingVideo(url);
        toast.loading('Extracting video keyframes for AI analysis...', { id: `keyframes-${url}` });
        const keyframes = await extractVideoKeyframes(url);
        setVideoKeyframesMap((prev) => ({ ...prev, [url]: keyframes }));
        setExtractingVideo(null);
        
        if (keyframes.length > 0) {
          toast.success(`Captured ${keyframes.length} keyframes from video!`, { id: `keyframes-${url}`, icon: '📸' });
        } else {
          toast.error('Could not capture keyframes (CORS). Video will still be included.', { id: `keyframes-${url}` });
        }
        
        setOrderedAssets((prev) => [...prev, { type: 'video', url, keyframes }]);
      } else {
        setOrderedAssets((prev) => [...prev, { type: 'video', url, keyframes: videoKeyframesMap[url] }]);
      }
    } else {
      setOrderedAssets((prev) => [...prev, { type: 'image', url }]);
    }
  }, [orderedAssets, videoKeyframesMap]);

  const getSelectionOrder = (url: string) => {
    const index = orderedAssets.findIndex((a) => a.url === url);
    return index !== -1 ? index + 1 : null;
  };

  const handleSubmit = () => {
    if (orderedAssets.length === 0) {
      toast.error('Please select at least one image or video.');
      return;
    }
    onGenerateScript(orderedAssets, scriptMode, customNotes);
  };

  const hasReviews = productData.reviews && productData.reviews.length > 0;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20 animate-fade-in">
      <div className="glass-card p-6 md:p-8 space-y-6">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--primary)]" />
            Select Media & Configure Script
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Click assets in the order you want them to appear in the video. Videos will have keyframes auto-captured for AI analysis.
          </p>
          {(productData.sourceType || typeof productData.confidence === 'number') && (
            <p className="text-xs text-[var(--muted)] mt-2">
              Source: {productData.sourceType || 'website'}
              {' · '}
              Confidence: {typeof productData.confidence === 'number' ? `${Math.round(productData.confidence * 100)}%` : 'n/a'}
            </p>
          )}
        </div>

        {/* 1. Unified Asset Gallery with Ordered Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[var(--secondary)]" />
              Media Gallery ({orderedAssets.length} selected)
            </h4>
            <div className="flex items-center gap-2">
              {orderedAssets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOrderedAssets([])}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-xs font-medium text-red-400 transition-all"
                >
                  <X className="w-3 h-3" />
                  Clear All
                </button>
              )}
              <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/30 hover:bg-[var(--primary)]/20 text-xs font-semibold text-[var(--primary)] transition-all">
                <Upload className="w-3.5 h-3.5" />
                Upload
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleUploadImages} />
              </label>
            </div>
          </div>

          {allAssets.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {allAssets.map((asset, idx) => {
                const selectionOrder = getSelectionOrder(asset.url);
                const isSelected = selectionOrder !== null;
                const isExtracting = extractingVideo === asset.url;

                return (
                  <div
                    key={`${asset.type}-${idx}`}
                    onClick={() => !isExtracting && toggleAsset(asset.type, asset.url)}
                    className={`relative aspect-square rounded-xl overflow-hidden border cursor-pointer group transition-all duration-300 ${
                      isSelected
                        ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/30 scale-[0.98]'
                        : 'border-[var(--border)] hover:border-[var(--border-glow)]'
                    } ${isExtracting ? 'pointer-events-none opacity-70' : ''}`}
                  >
                    {/* Media type badge */}
                    <div className="absolute top-2 left-2 z-20">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        asset.type === 'video'
                          ? 'bg-purple-500/80 text-white'
                          : 'bg-blue-500/80 text-white'
                      }`}>
                        {asset.type === 'video' ? <VideoIcon className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                        {asset.type}
                      </span>
                    </div>

                    {/* Thumbnail */}
                    {asset.type === 'video' ? (
                      <video
                        src={`/api/proxy?url=${encodeURIComponent(asset.url)}`}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                        crossOrigin="anonymous"
                      />
                    ) : (
                      <img
                        src={asset.url}
                        alt={`Asset ${idx}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    )}

                    {/* Dark overlay */}
                    <div
                      className={`absolute inset-0 transition-opacity duration-300 ${
                        isSelected
                          ? 'bg-black/50 opacity-100'
                          : 'bg-black/30 opacity-0 group-hover:opacity-100'
                      }`}
                    />

                    {/* Selection order badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-20">
                        <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-[var(--primary)]/30 animate-scale-in">
                          {selectionOrder}
                        </div>
                      </div>
                    )}

                    {/* Extracting indicator */}
                    {isExtracting && (
                      <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                          <span className="text-[10px] text-purple-300 font-medium">Capturing...</span>
                        </div>
                      </div>
                    )}

                    {/* Keyframe count badge for videos */}
                    {asset.type === 'video' && videoKeyframesMap[asset.url] && videoKeyframesMap[asset.url].length > 0 && (
                      <div className="absolute bottom-2 right-2 z-20">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/80 text-white text-[10px] font-bold">
                          <Camera className="w-2.5 h-2.5" />
                          {videoKeyframesMap[asset.url].length} frames
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Selection Order Preview */}
        {orderedAssets.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-[var(--border)]/40 animate-slide-up">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-[var(--primary)]" />
              Scene Order Preview ({orderedAssets.length} scenes)
            </h4>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {orderedAssets.map((asset, idx) => (
                <div key={idx} className="relative shrink-0 w-20 aspect-video rounded-lg overflow-hidden border border-[var(--primary)]/30 group">
                  {asset.type === 'video' ? (
                    asset.keyframes && asset.keyframes[0] ? (
                      <img src={asset.keyframes[0]} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-purple-900/30 flex items-center justify-center">
                        <VideoIcon className="w-4 h-4 text-purple-400" />
                      </div>
                    )
                  ) : (
                    <img src={asset.url} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                  )}
                  <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-[10px] font-bold">
                    {idx + 1}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOrderedAssets((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="absolute top-1 right-1 p-0.5 rounded bg-black/70 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Script Mode Selector */}
        <div className="space-y-3 pt-4 border-t border-[var(--border)]/40">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Script Style
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SCRIPT_MODES.map((mode) => {
              const Icon = mode.icon;
              const isActive = scriptMode === mode.id;
              const isDisabled = mode.id === 'customer_review' && !hasReviews;

              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => !isDisabled && setScriptMode(mode.id)}
                  disabled={isDisabled}
                  className={`relative p-3 rounded-xl border text-left transition-all duration-300 ${
                    isActive
                      ? 'bg-[var(--primary)]/15 border-[var(--primary)]/50 ring-1 ring-[var(--primary)]/20'
                      : isDisabled
                        ? 'bg-white/2 border-[var(--border)]/30 opacity-40 cursor-not-allowed'
                        : 'bg-white/5 border-[var(--border)] hover:bg-white/8 hover:border-[var(--border-glow)]'
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-1.5 ${isActive ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`} />
                  <p className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
                    {mode.label}
                  </p>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5 leading-snug">{mode.description}</p>
                  {isDisabled && (
                    <p className="text-[9px] text-red-400 mt-1">No reviews available</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Custom Notes */}
        <div className="space-y-2 pt-4 border-t border-[var(--border)]/40">
          <label htmlFor="custom-notes" className="text-sm font-semibold text-white block">
            Custom Instructions for AI (Optional)
          </label>
          <textarea
            id="custom-notes"
            rows={3}
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            placeholder="e.g. Focus on the durability. Highlight waterproof features. Use an engaging hook in the first 3 seconds..."
            className="w-full px-4 py-3 bg-white/5 border border-[var(--border)] rounded-xl text-white placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all"
          />
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSubmit}
            disabled={isLoading || orderedAssets.length === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] hover:brightness-110 active:scale-95 transition-all text-white font-semibold shadow-lg shadow-[var(--primary)]/20 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Analyzing & Scripting...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate AI Script
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
