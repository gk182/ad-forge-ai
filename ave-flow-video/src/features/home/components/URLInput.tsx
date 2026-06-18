'use client';

import { useEffect, useState } from 'react';
import { Link2, Sparkles, Loader2, Theater, Volume2, Radio } from 'lucide-react';
import type { ScriptTone } from '@/features/settings/URLInput.types';
import { VOICE_OPTIONS, TTS_PROVIDERS } from '@/features/settings/settings.constants';
import { getStoredSetting, saveStoredSetting } from '@/features/settings/settings.storage';

export const SCRIPT_TONES = [
  { id: 'professional', label: 'Professional', emoji: '💼', description: 'Clean, confident, business-like' },
  { id: 'fun', label: 'Fun & Playful', emoji: '🎉', description: 'Upbeat, energetic, casual' },
  { id: 'humorous', label: 'Humorous', emoji: '😂', description: 'Witty, comedic, attention-grabbing' },
  { id: 'romantic', label: 'Romantic', emoji: '💕', description: 'Warm, emotional, heartfelt' },
  { id: 'urgent', label: 'Urgent / FOMO', emoji: '⚡', description: 'Limited time, act now, scarcity' },
  { id: 'luxury', label: 'Luxury / Premium', emoji: '✨', description: 'Elegant, exclusive, sophisticated' },
  { id: 'friendly', label: 'Friendly', emoji: '😊', description: 'Conversational, relatable, warm' },
  { id: 'asmr', label: 'ASMR / Calm', emoji: '🌙', description: 'Soft-spoken, relaxing, soothing' },
] as const;

interface URLInputProps {
  onGenerate: (url: string, tone: ScriptTone, options: { duration: number; voiceId: string; useFreeTTS: boolean }) => void;
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

export function URLInput({ onGenerate, isLoading }: URLInputProps) {
  const [url, setUrl] = useState('');
  const [tone, setTone] = useState<ScriptTone>('fun');
  const [duration, setDuration] = useState(30);
  const [voiceId, setVoiceId] = useState('en-US-JennyNeural');
  const [ttsProvider, setTtsProvider] = useState<'free' | 'elevenlabs'>('free');

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
    if (url.trim() && !isLoading) {
      onGenerate(url.trim(), tone, { duration, voiceId, useFreeTTS: ttsProvider === 'free' });
    }
  };

  const canSubmit = url.trim().length > 0 && isValidHttpUrl(url.trim()) && !isLoading;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-4">
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
            placeholder="Paste your product URL here..."
            className="flex-1 bg-transparent px-2 py-4.5 text-base text-white placeholder-[var(--muted)] outline-none"
            disabled={isLoading}
          />

          <div className="pr-2.5">
            <button
              type="submit"
              disabled={!canSubmit}
              className="gradient-btn flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Video Ad
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)] shrink-0">
          <Theater className="w-3.5 h-3.5" />
          <span className="font-medium">Script tone:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SCRIPT_TONES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTone(option.id)}
              disabled={isLoading}
              title={option.description}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                tone === option.id
                  ? 'bg-[var(--primary)]/20 border border-[var(--primary)]/50 text-[var(--primary)] shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                  : 'bg-white/5 border border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/10 hover:border-[var(--border-glow)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
            <Radio className="w-3.5 h-3.5" />
            Voice Provider
          </label>
          <select
            value={ttsProvider}
            onChange={(event) => {
              const next = event.target.value as 'free' | 'elevenlabs';
              setTtsProvider(next);
              saveStoredSetting('tts_provider', next);
            }}
            disabled={isLoading}
            className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--border)] text-sm text-white input-focus-ring transition-all"
          >
            {TTS_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.icon} {provider.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
            Target video length
          </label>
          <select
            value={duration}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDuration(next);
              saveStoredSetting('video_duration', String(next));
            }}
            disabled={isLoading}
            className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--border)] text-sm text-white input-focus-ring transition-all"
          >
            <option value={20}>20s - fast cut</option>
            <option value={30}>30s - balanced</option>
            <option value={45}>45s - detailed</option>
            <option value={60}>60s - longer story</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5" />
            Voice
          </label>
          <select
            value={voiceId}
            onChange={(event) => {
              const next = event.target.value;
              setVoiceId(next);
              saveStoredSetting('did_voice_id', next);
            }}
            disabled={isLoading || ttsProvider === 'elevenlabs'}
            className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--border)] text-sm text-white input-focus-ring transition-all disabled:opacity-50"
          >
            <optgroup label="US English">
              {VOICE_OPTIONS.filter((voice) => voice.id.startsWith('en-US')).map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="UK English">
              {VOICE_OPTIONS.filter((voice) => voice.id.startsWith('en-GB')).map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Vietnamese">
              {VOICE_OPTIONS.filter((voice) => voice.id.startsWith('vi-VN')).map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </optgroup>
          </select>
          {ttsProvider === 'elevenlabs' && (
            <p className="text-xs text-[var(--muted)] mt-1">Voice auto-selected by AI</p>
          )}
        </div>
      </div>

      {url.length > 0 && !isValidHttpUrl(url) && (
        <p className="mt-2 text-xs text-[var(--danger)] text-center animate-fade-in">
          Please enter a valid URL, for example https://example.com/product
        </p>
      )}
    </form>
  );
}
