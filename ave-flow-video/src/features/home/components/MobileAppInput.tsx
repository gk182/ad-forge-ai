'use client';

import React, { useState, useEffect } from 'react';
import { Link2, Sparkles, Loader2, Theater, PhoneCall } from 'lucide-react';
import type { ScriptTone } from '@/features/settings/URLInput.types';
import { getStoredSetting } from '@/features/settings/settings.storage';
import { MobileAssetUploader } from './MobileAssetUploader';
import { SCRIPT_TONES } from './URLInput';

interface MobileAppInputProps {
  onGenerate: (
    url: string,
    tone: ScriptTone,
    options: { duration: number; voiceId: string; useFreeTTS: boolean; images: string[] }
  ) => void;
  isLoading: boolean;
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function MobileAppInput({ onGenerate, isLoading }: MobileAppInputProps) {
  const [url, setUrl] = useState('');
  const [tone, setTone] = useState<ScriptTone>('fun');
  const [duration, setDuration] = useState(30);
  const [voiceId, setVoiceId] = useState('en-US-JennyNeural');
  const [ttsProvider, setTtsProvider] = useState<'free' | 'elevenlabs'>('free');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);

  useEffect(() => {
    const storedDuration = Number(getStoredSetting('video_duration', '30'));
    if (!Number.isNaN(storedDuration) && storedDuration > 0) {
      setDuration(storedDuration);
    }
    setVoiceId(getStoredSetting('did_voice_id', 'en-US-JennyNeural'));
    setTtsProvider(getStoredSetting('tts_provider', 'free') as 'free' | 'elevenlabs');
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;
    onGenerate(url.trim(), tone, {
      duration,
      voiceId,
      useFreeTTS: ttsProvider === 'free',
      images: uploadedImages,
    });
  };

  const canSubmit = uploadedImages.length > 0 && !isLoading;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-6 bg-zinc-950/40 p-6 border border-zinc-800/60 rounded-3xl backdrop-blur-md">
      {/* Link Input Section */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
          1. App Store or Website URL (Optional)
        </label>
        <div className="relative group">
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-[var(--primary)] via-[var(--secondary)] to-[var(--primary)] opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-[1px]" />
          <div className="relative flex items-center bg-[var(--surface)] rounded-2xl border border-[var(--border)] group-focus-within:border-transparent overflow-hidden transition-all duration-300">
            <div className="pl-5 pr-2">
              <Link2 className="w-5 h-5 text-[var(--muted)]" />
            </div>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="e.g. App Store, Google Play, or landing page link..."
              className="flex-1 bg-transparent px-2 py-4.5 text-base text-white placeholder-[var(--muted)] outline-none"
              disabled={isLoading}
            />
          </div>
        </div>
        {url.length > 0 && !isValidHttpUrl(url) && (
          <p className="text-xs text-[var(--danger)] animate-fade-in">
            Please enter a valid URL or leave it blank
          </p>
        )}
      </div>

      {/* Screen Upload Section */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block flex items-center gap-1.5">
          2. Upload App Screenshots (Required)
          <span className="text-[10px] text-zinc-500 font-semibold normal-case">
            ({uploadedImages.length}/5 screens)
          </span>
        </label>
        <MobileAssetUploader
          onAssetsChange={(imgs) => setUploadedImages(imgs)}
          maxFiles={5}
        />
      </div>

      {/* Tone selection */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block flex items-center gap-1.5">
          <Theater className="w-3.5 h-3.5 text-[var(--primary)]" />
          3. Select Script Tone
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          {SCRIPT_TONES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTone(option.id)}
              disabled={isLoading}
              title={option.description}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                tone === option.id
                  ? 'bg-[var(--primary)]/20 border border-[var(--primary)]/50 text-[var(--primary)] shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                  : 'bg-white/5 border border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/10 hover:border-[var(--border-glow)]'
              }`}
            >
              <span className="mr-1">{option.emoji}</span>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Submit */}
      <div className="pt-2 border-t border-zinc-900">
        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-4.5 rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
            canSubmit
              ? 'bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] hover:opacity-95 text-white shadow-lg cursor-pointer'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating ad script with vision analysis...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Mobile App Ad Video
            </>
          )}
        </button>
      </div>
    </form>
  );
}
