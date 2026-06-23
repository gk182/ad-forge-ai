'use client';

import { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, Video as VideoIcon, Check, Trash2, Sparkles, ArrowRight, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

interface AssetSelectorProps {
  productData: {
    title: string;
    description: string;
    image: string;
    screenshots: string[];
    videos: string[];
  };
  onGenerateScript: (selectedImages: string[], videoCaptures: string[], customNotes: string) => void;
  isLoading: boolean;
}

export function AssetSelector({ productData, onGenerateScript, isLoading }: AssetSelectorProps) {
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const allImages = [...[productData.image, ...(productData.screenshots || [])].filter(Boolean), ...uploadedImages];

  // States
  const [selectedImages, setSelectedImages] = useState<string[]>([...[productData.image, ...(productData.screenshots || [])].filter(Boolean)]);
  const [captures, setCaptures] = useState<string[]>([]);
  const [customNotes, setCustomNotes] = useState('');

  // Refs for video elements to allow frame capturing
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

  const handleUploadImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64Url = event.target.result as string;
          setUploadedImages((prev) => [...prev, base64Url]);
          setSelectedImages((prev) => [...prev, base64Url]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const toggleImage = (url: string) => {
    setSelectedImages((prev) =>
      prev.includes(url) ? prev.filter((item) => item !== url) : [...prev, url]
    );
  };

  const handleCaptureFrame = (videoUrl: string) => {
    const video = videoRefs.current[videoUrl];
    if (!video) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        toast.error('Failed to initialize canvas context');
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      setCaptures((prev) => [...prev, dataUrl]);
      toast.success('Keyframe captured and added to AI context!', { icon: '📸' });
    } catch (e) {
      console.error(e);
      toast.error('CORS blocked frame capture. Try scrubbing or playing the video first.');
    }
  };

  const removeCapture = (index: number) => {
    setCaptures((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (selectedImages.length === 0 && captures.length === 0) {
      toast.error('Please select at least one image or capture a video frame.');
      return;
    }
    onGenerateScript(selectedImages, captures, customNotes);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20 animate-fade-in">
      <div className="glass-card p-6 md:p-8 space-y-6">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--primary)]" />
            Step 1: Select Media & Capture Keyframes
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Choose which images and parts of the video Gemini should analyze to write the script.
          </p>
        </div>

        {/* 1. Images Selection Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[var(--secondary)]" />
              Select Product Images ({selectedImages.length}/{allImages.length})
            </h4>
            <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/30 hover:bg-[var(--primary)]/20 text-xs font-semibold text-[var(--primary)] transition-all">
              <Upload className="w-3.5 h-3.5" />
              Upload Image
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleUploadImages} />
            </label>
          </div>
          {allImages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {allImages.map((url, idx) => {
                const isSelected = selectedImages.includes(url);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleImage(url)}
                    className={`relative aspect-square rounded-xl overflow-hidden border cursor-pointer group transition-all duration-300 ${
                      isSelected
                        ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20'
                        : 'border-[var(--border)] hover:border-[var(--border-glow)]'
                    }`}
                  >
                    <img
                      src={url}
                      alt={`Product asset ${idx}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div
                      className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-300 ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          isSelected ? 'bg-[var(--primary)] text-white scale-100' : 'bg-white/10 text-white scale-90'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Video Capture Player */}
        {productData.videos && productData.videos.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-[var(--border)]/40">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <VideoIcon className="w-4 h-4 text-[var(--primary)]" />
              Scraped Video Clips (Scrub & Capture Keyframes)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {productData.videos.map((videoUrl, idx) => {
                // Pipe through our Next.js API proxy to bypass CORS on the Canvas capture
                const proxiedUrl = `/api/proxy?url=${encodeURIComponent(videoUrl)}`;
                return (
                  <div key={idx} className="bg-black/30 border border-[var(--border)]/50 rounded-2xl p-4 space-y-3">
                    <div className="aspect-video relative rounded-lg overflow-hidden bg-black flex items-center justify-center">
                      <video
                        ref={(el) => {
                          videoRefs.current[videoUrl] = el;
                        }}
                        src={proxiedUrl}
                        crossOrigin="anonymous"
                        controls
                        className="w-full h-full"
                        preload="metadata"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--muted)] truncate max-w-[60%]">
                        Video Source #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCaptureFrame(videoUrl)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/30 hover:bg-[var(--primary)]/20 text-xs font-semibold text-[var(--primary)] transition-all duration-300"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Capture Frame
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Display Captured Frames */}
        {captures.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-[var(--border)]/40 animate-slide-up">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-400" />
              Captured Keyframes for AI Analysis ({captures.length})
            </h4>
            <div className="flex flex-wrap gap-4">
              {captures.map((cap, idx) => (
                <div key={idx} className="relative w-28 aspect-video rounded-lg overflow-hidden border border-emerald-500/30 group">
                  <img src={cap} alt="Captured Keyframe" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeCapture(idx)}
                    className="absolute top-1 right-1 p-1 rounded bg-black/70 border border-white/10 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Prompt Custom Notes */}
        <div className="space-y-2 pt-4 border-t border-[var(--border)]/40">
          <label htmlFor="custom-notes" className="text-sm font-semibold text-white block">
            Custom Instructions for Gemini Scripting (Optional)
          </label>
          <textarea
            id="custom-notes"
            rows={3}
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            placeholder="e.g. Focus on the durability of the strap. Highlight that it is waterproof. Use a super engaging hook in the first 3 seconds..."
            className="w-full px-4 py-3 bg-white/5 border border-[var(--border)] rounded-xl text-white placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all"
          />
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSubmit}
            disabled={isLoading || (selectedImages.length === 0 && captures.length === 0)}
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
