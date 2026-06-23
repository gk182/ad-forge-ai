'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { AdVideo } from '@/remotion/AdVideo';
import type { Scene } from '@/remotion/AdVideo';
import {
  Play,
  Pause,
  Volume2,
  Tv,
  Type,
  Mic,
  Download,
  Plus,
  Trash2,
  ChevronDown,
  Sparkles,
  RefreshCw,
  Video as VideoIcon,
  Image as ImageIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiKeys } from '@/features/settings/settings.storage';

interface StudioEditorProps {
  initialScript: {
    script_text: string;
    elevenlabs_voice_id: string;
    scenes: Scene[];
  };
  productImages: string[];
  productVideos: string[];
  autoBuild?: boolean;
}

const GOOGLE_FONTS = [
  'Montserrat',
  'Inter',
  'Roboto',
  'Oswald',
  'Lora',
  'Fredoka',
  'Playfair Display',
];

const MOTION_EFFECTS = [
  { value: 'center_zoom', label: 'Zoom In' },
  { value: 'slow_zoom_out', label: 'Zoom Out' },
  { value: 'pan_left', label: 'Pan Left' },
  { value: 'pan_right', label: 'Pan Right' },
  { value: 'drift_up', label: 'Drift Up' },
  { value: 'drift_down', label: 'Drift Down' },
  { value: 'ken_burns_tl', label: 'Ken Burns TL' },
  { value: 'ken_burns_br', label: 'Ken Burns BR' },
  { value: 'static', label: 'Static (No Motion)' },
];

const TRANSITION_TYPES = [
  { value: 'fade', label: 'Cross-Fade' },
  { value: 'slide_left', label: 'Slide Left' },
  { value: 'slide_right', label: 'Slide Right' },
  { value: 'slide_up', label: 'Slide Up' },
  { value: 'slide_down', label: 'Slide Down' },
  { value: 'zoom_in', label: 'Zoom In' },
  { value: 'none', label: 'Cut (None)' },
];

type BuildPhase = 'idle' | 'generating-voice' | 'voice-ready' | 'rendering' | 'completed' | 'error';

export function StudioEditor({
  initialScript,
  productImages,
  productVideos,
  autoBuild = false,
}: StudioEditorProps) {
  const playerRef = useRef<PlayerRef>(null);
  const autoBuildStartedRef = useRef(false);
  const buildLockRef = useRef(false);

  // States
  const [scenes, setScenes] = useState<Scene[]>(() => {
    const hasVideos = productVideos && productVideos.length > 0;
    return initialScript.scenes.map((s, idx) => {
      // Prioritize crawled videos sequentially if available
      const shouldAssignVideo = hasVideos && idx < productVideos.length;
      return {
        ...s,
        media_type: shouldAssignVideo ? 'video' : (s.media_type || 'image'),
        media_url: shouldAssignVideo ? productVideos[idx] : (s.media_url || ''),
        video_start_offset: s.video_start_offset || 0,
        transition_type: s.transition_type || 'fade',
      };
    });
  });
  const [title, setTitle] = useState('Product Spotlight');
  const [textColor, setTextColor] = useState('#ffffff');
  const [highlightColor, setHighlightColor] = useState('#facc15');
  const [fontFamily, setFontFamily] = useState('Montserrat');
  const [layoutType, setLayoutType] = useState<'classic' | 'splitscreen' | 'greenscreen'>('classic');
  const [subtitleStyle, setSubtitleStyle] = useState<'bounce' | 'glow' | 'slide_up' | 'rotate' | 'fade'>('bounce');

  // Audio / voiceover state
  const [audioUrl, setAudioUrl] = useState('');
  const [audioDuration, setAudioDuration] = useState<number | undefined>(undefined);
  const [useFreeTTS, setUseFreeTTS] = useState(true);
  const [voiceId, setVoiceId] = useState(initialScript.elevenlabs_voice_id || 'JBFqnCBsd6RMkjVDRZzb');

  // Export state
  const [exportUrl, setExportUrl] = useState('');
  const [buildPhase, setBuildPhase] = useState<BuildPhase>('idle');

  // active scene being edited
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);

  // Calculate sum of durations
  const totalPlannedDuration = useMemo(() => {
    return scenes.reduce((sum, s) => sum + s.duration, 0);
  }, [scenes]);

  const activeDuration = audioDuration || totalPlannedDuration;
  const durationInFrames = Math.max(90, Math.round(activeDuration * 30));
  const isBuilding = buildPhase === 'generating-voice' || buildPhase === 'rendering';
  const hasCompletedBuild = buildPhase === 'completed' && !!exportUrl;
  const hasVoiceTrack = !!audioUrl;

  const invalidateGeneratedOutput = () => {
    setAudioUrl('');
    setAudioDuration(undefined);
    setExportUrl('');
    setBuildPhase('idle');
  };

  const waitForAudioDuration = (audioSrc: string, timeoutMs = 10000): Promise<number> => {
    return new Promise((resolve) => {
      const fallbackDuration = totalPlannedDuration || 1;
      const audio = new Audio();
      let settled = false;

      const finish = (duration: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        audio.removeAttribute('src');
        audio.load();
        resolve(Number.isFinite(duration) && duration > 0 ? duration : fallbackDuration);
      };

      const timeoutId = window.setTimeout(() => {
        finish(fallbackDuration);
      }, timeoutMs);

      audio.preload = 'metadata';
      audio.addEventListener(
        'loadedmetadata',
        () => {
          finish(audio.duration);
        },
        { once: true }
      );
      audio.addEventListener(
        'error',
        () => {
          finish(fallbackDuration);
        },
        { once: true }
      );
      audio.src = audioSrc;
    });
  };

  // Update a scene property
  const updateScene = (index: number, fields: Partial<Scene>) => {
    setScenes((prev) =>
      prev.map((scene, i) => (i === index ? { ...scene, ...fields } : scene))
    );
    // Any scene-level edit invalidates the generated audio/video pair.
    invalidateGeneratedOutput();
  };

  const addScene = () => {
    const defaultImage = productImages[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';
    const newScene: Scene = {
      media_type: 'image',
      media_url: defaultImage,
      duration: 3.5,
      subtitle: 'Add subtitle here...',
      motion: 'center_zoom',
      transition_type: 'fade',
      video_start_offset: 0,
    };
    setScenes((prev) => [...prev, newScene]);
    setActiveSceneIndex(scenes.length);
    // Invalidate generated output since structure changed
    invalidateGeneratedOutput();
    toast.success('Scene added');
  };

  const deleteScene = (index: number) => {
    if (scenes.length <= 1) {
      toast.error('You must keep at least one scene');
      return;
    }
    setScenes((prev) => prev.filter((_, i) => i !== index));
    setActiveSceneIndex(Math.max(0, index - 1));
    // Invalidate generated output since structure changed
    invalidateGeneratedOutput();
    toast.success('Scene removed');
  };

  // Auto-sync durations based on subtitle word lengths
  const autoSyncDurations = () => {
    if (scenes.length === 0) return;

    // Use current planned total duration or fallback to 20s
    const targetTotal = totalPlannedDuration > 0 ? totalPlannedDuration : 20;

    const wordCounts = scenes.map((s) => {
      const words = s.subtitle.trim().split(/\s+/).filter(Boolean);
      return words.length > 0 ? words.length : 3;
    });

    const totalWords = wordCounts.reduce((sum, w) => sum + w, 0);

    const updated = scenes.map((s, idx) => {
      const share = wordCounts[idx] / (totalWords || 1);
      const allocated = share * targetTotal;
      // Ensure at least 1.5s duration per scene
      const rounded = Math.max(1.5, Math.round(allocated * 2) / 2);
      return {
        ...s,
        duration: rounded,
      };
    });

    // Balance last scene to match targetTotal precisely
    const currentSum = updated.reduce((sum, s) => sum + s.duration, 0);
    const difference = targetTotal - currentSum;
    if (difference !== 0 && updated.length > 0) {
      const lastIdx = updated.length - 1;
      updated[lastIdx].duration = Math.max(1.5, updated[lastIdx].duration + difference);
    }

    setScenes(updated);
    
    // Invalidate generated output
    invalidateGeneratedOutput();

    toast.success('Scene durations synchronized with subtitle word lengths!');
  };

  const generateVoiceTrack = async () => {
    setBuildPhase('generating-voice');
    setAudioUrl('');
    setAudioDuration(undefined);
    setExportUrl('');
    toast.loading('Generating voice track...', { id: 'build-toast' });

    const fullScript = scenes.map((s) => s.subtitle).join(' ');
    const apiKeys = getApiKeys();

    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: fullScript,
        elevenLabsApiKey: apiKeys.elevenLabsApiKey || '',
        elevenLabsVoiceId: voiceId,
        useFreeTTS,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate voice');

    const audioBase64 = data.audioBase64 as string;
    setAudioUrl(audioBase64);

    const duration = await waitForAudioDuration(audioBase64);
    setAudioDuration(duration);
    setBuildPhase('voice-ready');
    toast.success('Voice track generated successfully.', { id: 'build-toast', icon: '🎙️' });

    return { audioBase64, duration };
  };

  const renderVideo = async (audioBase64: string, duration: number) => {
    setBuildPhase('rendering');
    setExportUrl('');
    toast.loading('Rendering full video...', { id: 'build-toast' });

    const payload = {
      title,
      scenes,
      audioUrl: audioBase64,
      audioDuration: duration,
      textColor,
      highlightColor,
      fontFamily,
      layoutType,
      subtitleStyle,
    };

    const res = await fetch('/api/render-remotion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Render failed');

    setExportUrl(data.videoUrl);
    setBuildPhase('completed');
    toast.success('Full video built successfully.', { id: 'build-toast', icon: '🎉' });
    return data.videoUrl as string;
  };

  const renderCurrentVideo = async () => {
    if (buildLockRef.current) return;
    if (!audioUrl || !audioDuration) {
      toast.error('Please generate voice first before rendering MP4.');
      return;
    }

    buildLockRef.current = true;

    try {
      await renderVideo(audioUrl, audioDuration);
    } catch (e: any) {
      const message = e instanceof Error ? e.message : 'Render failed';
      setBuildPhase('error');
      toast.error(message, { id: 'build-toast', duration: 6000 });
    } finally {
      buildLockRef.current = false;
    }
  };

  const generateVoiceOnly = async () => {
    if (buildLockRef.current) return;
    buildLockRef.current = true;

    try {
      if (!useFreeTTS && !getApiKeys().elevenLabsApiKey) {
        throw new Error('ElevenLabs API key is required or enable Free TTS.');
      }

      await generateVoiceTrack();
    } catch (e: any) {
      const message = e instanceof Error ? e.message : 'Voice generation failed';
      setBuildPhase('error');
      toast.error(message, { id: 'build-toast', duration: 6000 });
    } finally {
      buildLockRef.current = false;
    }
  };

  const markRenderDirty = () => {
    setExportUrl('');
    if (buildPhase === 'completed') {
      setBuildPhase('idle');
    }
  };

  useEffect(() => {
    if (!autoBuild || autoBuildStartedRef.current) return;
    autoBuildStartedRef.current = true;
    void generateVoiceOnly();
    // Auto-run only once on the first studio mount for the generated script.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBuild]);

  // Sync player seek to scene start frame
  const seekToScene = (index: number) => {
    if (!playerRef.current) return;
    let accumulatedTime = 0;
    const scaleFactor = audioDuration ? audioDuration / totalPlannedDuration : 1;
    
    for (let i = 0; i < index; i++) {
      accumulatedTime += scenes[i].duration;
    }
    
    const targetFrame = Math.round(accumulatedTime * scaleFactor * 30);
    playerRef.current.seekTo(targetFrame);
    setActiveSceneIndex(index);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto pb-20 animate-fade-in">
      
      {/* LEFT: Video Player and Export Actions (Sticky container) */}
      <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24 h-fit">
        <div className="glass-card overflow-hidden flex flex-col items-center bg-black/40 border border-[var(--border)]/60 rounded-3xl p-6 shadow-2xl">
          <div className="w-full max-w-[280px] sm:max-w-[320px] aspect-[9/16] rounded-2xl overflow-hidden border border-white/10 shadow-inner bg-zinc-950 relative">
            <Player
              ref={playerRef}
              component={AdVideo}
              inputProps={{
                title,
                scenes,
                audioUrl,
                audioDuration,
                textColor,
                highlightColor,
                fontFamily,
                layoutType,
                subtitleStyle,
              }}
              durationInFrames={durationInFrames}
              fps={30}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{
                width: '100%',
                height: '100%',
              }}
              controls
            />
          </div>
          
          <div className="w-full mt-6 text-center text-xs text-[var(--muted)]">
            <span>Video Resolution: 1080x1920 (TikTok format)</span>
            <span className="mx-2">•</span>
            <span>Duration: {activeDuration.toFixed(1)}s</span>
          </div>
        </div>

        {/* Voiceover and Render Control Card */}
        <div className="glass-card p-6 space-y-4">
          <h4 className="font-bold text-white flex items-center gap-2 text-sm">
            <Mic className="w-4 h-4 text-[var(--primary)]" />
            Voice Pipeline
          </h4>
          
          {/* Audio generation */}
          <div className="space-y-3 p-3 bg-white/5 rounded-xl border border-[var(--border)]/30">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Text-to-Speech Engine</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useFreeTTS}
                  onChange={(e) => {
                    setUseFreeTTS(e.target.checked);
                    invalidateGeneratedOutput();
                  }}
                  className="rounded border-zinc-700 bg-zinc-900 text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                Use Free TTS
              </label>
            </div>

            {!useFreeTTS && (
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--muted)] uppercase font-semibold">ElevenLabs Voice ID</label>
                <input
                  type="text"
                  value={voiceId}
                  onChange={(e) => {
                    setVoiceId(e.target.value);
                    invalidateGeneratedOutput();
                  }}
                  className="w-full px-3 py-1.5 bg-black/40 border border-[var(--border)]/50 rounded-lg text-xs text-white"
                  placeholder="Voice ID (George, Bella...)"
                />
              </div>
            )}

            <button
              onClick={() => void generateVoiceOnly()}
              disabled={isBuilding}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/30 hover:bg-[var(--primary)]/20 text-xs font-semibold text-[var(--primary)] transition-all disabled:opacity-50"
            >
              {buildPhase === 'generating-voice' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Generating voice...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  {hasVoiceTrack ? 'Re-generate Voice Audio' : 'Generate Voice Audio'}
                </>
              )}
            </button>

            <button
              onClick={() => void renderCurrentVideo()}
              disabled={isBuilding || !audioUrl || !audioDuration}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] hover:brightness-110 text-xs font-semibold text-white transition-all disabled:opacity-50"
            >
              {buildPhase === 'rendering' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Rendering MP4...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  {hasCompletedBuild ? 'Re-render MP4' : 'Render MP4'}
                </>
              )}
            </button>

            <p className="text-[10px] text-[var(--muted)] leading-relaxed">
              {buildPhase === 'generating-voice'
                ? 'Voice track is being synthesized automatically.'
                : buildPhase === 'voice-ready'
                  ? 'Voice track is ready. You can render MP4 when needed.'
                : buildPhase === 'rendering'
                  ? 'Video is rendering with image, captions, and audio.'
                  : hasCompletedBuild
                    ? 'You can rebuild after editing scenes or style settings.'
                    : 'Generate the voice first, then render MP4 manually if needed.'}
            </p>
          </div>

          {/* Export Render */}
          {exportUrl && (
            <div className="space-y-3 pt-2">
              <a
                href={exportUrl}
                download
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 transition-all text-white font-semibold text-sm shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                Download Completed Video
              </a>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Detailed Customization Options */}
      <div className="lg:col-span-7 space-y-6">
        
        {/* TAB 1: Style Adjustments */}
        <div className="glass-card p-6 space-y-4">
          <h4 className="font-bold text-white flex items-center gap-2 text-base border-b border-[var(--border)]/40 pb-3">
            <Type className="w-5 h-5 text-[var(--secondary)]" />
            Reviewer Template Settings
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)] font-medium">Header Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markRenderDirty();
                }}
                className="w-full px-3.5 py-2 bg-white/5 border border-[var(--border)] rounded-xl text-sm text-white focus:outline-none focus:border-[var(--primary)]"
                placeholder="PROD REVIEW"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)] font-medium">Font Family</label>
              <div className="relative">
                <select
                  value={fontFamily}
                  onChange={(e) => {
                    setFontFamily(e.target.value);
                    markRenderDirty();
                  }}
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-[var(--border)] rounded-xl text-sm text-white focus:outline-none appearance-none cursor-pointer"
                >
                  {GOOGLE_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)] font-medium">Subtitle Text Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => {
                    setTextColor(e.target.value);
                    markRenderDirty();
                  }}
                  className="w-9 h-9 p-0.5 rounded border border-[var(--border)] bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={textColor}
                  onChange={(e) => {
                    setTextColor(e.target.value);
                    markRenderDirty();
                  }}
                  className="flex-1 px-3 py-1.5 bg-white/5 border border-[var(--border)] rounded-lg text-xs text-white uppercase"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)] font-medium">Subtitle Active Highlight</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={highlightColor}
                  onChange={(e) => {
                    setHighlightColor(e.target.value);
                    markRenderDirty();
                  }}
                  className="w-9 h-9 p-0.5 rounded border border-[var(--border)] bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={highlightColor}
                  onChange={(e) => {
                    setHighlightColor(e.target.value);
                    markRenderDirty();
                  }}
                  className="flex-1 px-3 py-1.5 bg-white/5 border border-[var(--border)] rounded-lg text-xs text-white uppercase"
                />
              </div>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-[var(--text-secondary)] font-medium">Subtitle Animation Style</label>
              <div className="relative">
                <select
                  value={subtitleStyle}
                  onChange={(e) => {
                    setSubtitleStyle(e.target.value as any);
                    markRenderDirty();
                  }}
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-[var(--border)] rounded-xl text-sm text-white focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="bounce">Word Bounce (Phồng to)</option>
                  <option value="glow">Word Glow (Phát sáng)</option>
                  <option value="slide_up">Word Slide Up (Nhảy lên)</option>
                  <option value="rotate">Word Rotate (Nghiêng lắc)</option>
                  <option value="fade">Cinematic Focus (Mờ xung quanh)</option>
                </select>
                <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-[var(--text-secondary)] font-medium">Video Layout Pattern</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'classic', label: 'Classic Text' },
                  { id: 'splitscreen', label: 'Split Screen' },
                  { id: 'greenscreen', label: 'Green Screen' },
                ].map((lay) => (
                  <button
                    key={lay.id}
                    onClick={() => {
                      setLayoutType(lay.id as any);
                      markRenderDirty();
                    }}
                    className={`py-2 px-3 border rounded-xl text-xs font-semibold transition-all ${
                      layoutType === lay.id
                        ? 'bg-[var(--primary)]/10 border-[var(--primary)] text-[var(--primary)]'
                        : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-zinc-500'
                    }`}
                  >
                    {lay.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* TAB 2: Scene Timeline & Content Editor */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--border)]/40 pb-3">
            <h4 className="font-bold text-white flex items-center gap-2 text-base">
              <Tv className="w-5 h-5 text-[var(--primary)]" />
              Scene Timeline Editor ({scenes.length} Scenes)
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={autoSyncDurations}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200 transition-all shadow-sm"
                title="Synchronize scene durations to match subtitle text lengths"
              >
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                Auto-Sync Durations
              </button>
              <button
                type="button"
                onClick={addScene}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 border border-[var(--primary)]/30 text-xs font-semibold text-[var(--primary)] transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Scene
              </button>
            </div>
          </div>

          {/* Quick Scene Horizontal Navigation Slider */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800">
            {scenes.map((scene, idx) => {
              const isActive = idx === activeSceneIndex;
              return (
                <button
                  key={idx}
                  onClick={() => seekToScene(idx)}
                  className={`flex-none flex items-center gap-2 px-4 py-2 border rounded-xl transition-all ${
                    isActive
                      ? 'bg-zinc-800 border-zinc-500 text-white shadow-md'
                      : 'bg-black/20 border-[var(--border)] text-[var(--muted)] hover:border-zinc-700 hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {scene.media_type === 'image' ? (
                    <ImageIcon className="w-3.5 h-3.5" />
                  ) : (
                    <VideoIcon className="w-3.5 h-3.5" />
                  )}
                  <span className="text-xs font-semibold">Scene {idx + 1}</span>
                  <span className="text-[10px] bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-[var(--muted)]">
                    {scene.duration}s
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Scene Settings Sheet */}
          <div className="p-5 bg-black/30 border border-[var(--border)]/40 rounded-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Editing Scene #{activeSceneIndex + 1}
              </span>
              <button
                onClick={() => deleteScene(activeSceneIndex)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-950/40 hover:bg-red-900/40 border border-red-500/20 text-[10px] font-bold text-red-400 transition-all"
              >
                <Trash2 className="w-3 h-3" />
                Remove Scene
              </button>
            </div>

            {/* Media Selector for Scene */}
            <div className="space-y-4 pt-2">
              {/* Media Type Toggler */}
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)] font-medium">Media Source Type</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 border border-[var(--border)]/20 rounded-xl max-w-md">
                  <button
                    type="button"
                    onClick={() => {
                      const defaultImg = productImages[0] || '';
                      updateScene(activeSceneIndex, { media_type: 'image', media_url: defaultImg });
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      scenes[activeSceneIndex].media_type === 'image'
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-[var(--muted)] hover:text-white'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Product Images
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const defaultVid = productVideos[0] || '';
                      updateScene(activeSceneIndex, { media_type: 'video', media_url: defaultVid, video_start_offset: 0 });
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      scenes[activeSceneIndex].media_type === 'video'
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-[var(--muted)] hover:text-white'
                    }`}
                  >
                    <VideoIcon className="w-3.5 h-3.5" />
                    Product Videos
                  </button>
                </div>
              </div>

              {/* Selector List and Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  {scenes[activeSceneIndex].media_type === 'image' ? (
                    <>
                      <label className="text-xs text-[var(--text-secondary)] font-medium block">Select Image Asset</label>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full scrollbar-thin">
                        {productImages.map((imgUrl, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => updateScene(activeSceneIndex, { media_url: imgUrl })}
                            className={`flex-none w-14 aspect-square rounded-lg overflow-hidden border transition-all ${
                              scenes[activeSceneIndex].media_url === imgUrl
                                ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20'
                                : 'border-transparent hover:border-zinc-500'
                            }`}
                          >
                            <img src={imgUrl} className="w-full h-full object-cover" alt="Product thumbnail" />
                          </button>
                        ))}
                        {productImages.length === 0 && (
                          <span className="text-xs text-[var(--muted)]">No images found.</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="text-xs text-[var(--text-secondary)] font-medium block">Select Video Clip</label>
                      <div className="flex flex-wrap gap-2">
                        {productVideos.map((vidUrl, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => updateScene(activeSceneIndex, { media_url: vidUrl })}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                              scenes[activeSceneIndex].media_url === vidUrl
                                ? 'bg-[var(--primary)]/20 border-[var(--primary)] text-white ring-2 ring-[var(--primary)]/20'
                                : 'bg-white/5 border-[var(--border)] text-[var(--muted)] hover:border-zinc-500 hover:text-white'
                            }`}
                            title={vidUrl}
                          >
                            <VideoIcon className="w-3.5 h-3.5" />
                            Clip #{i + 1}
                          </button>
                        ))}
                        {productVideos.length === 0 && (
                          <span className="text-xs text-[var(--muted)]">No crawled videos available.</span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Settings Column (Motion + Transition + Offset if Video) */}
                <div className="space-y-3">
                  {/* Camera Motion Style (Only applies to images) */}
                  {scenes[activeSceneIndex].media_type === 'image' && (
                    <div className="space-y-1">
                      <label className="text-xs text-[var(--text-secondary)] font-medium">Camera Motion Style</label>
                      <div className="relative">
                        <select
                          value={scenes[activeSceneIndex].motion}
                          onChange={(e) => updateScene(activeSceneIndex, { motion: e.target.value })}
                          className="w-full px-3 py-2 bg-zinc-900 border border-[var(--border)] rounded-xl text-xs text-white appearance-none cursor-pointer"
                        >
                          {MOTION_EFFECTS.map((eff) => (
                            <option key={eff.value} value={eff.value}>
                              {eff.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* Video Trim/Start Offset Control (Only applies to videos) */}
                  {scenes[activeSceneIndex].media_type === 'video' && scenes[activeSceneIndex].media_url && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-[var(--text-secondary)] font-medium">
                        <span>Video Start Offset</span>
                        <span className="font-bold text-white">{(scenes[activeSceneIndex].video_start_offset || 0).toFixed(1)}s</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="60"
                          step="0.5"
                          value={scenes[activeSceneIndex].video_start_offset || 0}
                          onChange={(e) => updateScene(activeSceneIndex, { video_start_offset: parseFloat(e.target.value) })}
                          className="flex-1 accent-[var(--secondary)] bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                        />
                        <input
                          type="number"
                          min="0"
                          max="360"
                          step="0.5"
                          value={scenes[activeSceneIndex].video_start_offset || 0}
                          onChange={(e) => updateScene(activeSceneIndex, { video_start_offset: parseFloat(e.target.value) || 0 })}
                          className="w-16 px-2 py-1 bg-black border border-[var(--border)] rounded-md text-xs text-center text-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* Transition effect selector */}
                  <div className="space-y-1">
                    <label className="text-xs text-[var(--text-secondary)] font-medium">
                      {activeSceneIndex === 0 ? 'Transition (N/A for Scene 1)' : 'Transition Effect (Into Scene)'}
                    </label>
                    <div className="relative">
                      <select
                        value={scenes[activeSceneIndex].transition_type || 'fade'}
                        disabled={activeSceneIndex === 0}
                        onChange={(e) => updateScene(activeSceneIndex, { transition_type: e.target.value as any })}
                        className="w-full px-3 py-2 bg-zinc-900 border border-[var(--border)] rounded-xl text-xs text-white appearance-none cursor-pointer disabled:opacity-50"
                      >
                        {TRANSITION_TYPES.map((trans) => (
                          <option key={trans.value} value={trans.value}>
                            {trans.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Subtitle textarea */}
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-secondary)] font-medium">Scene Voiceover & Subtitle</label>
              <textarea
                value={scenes[activeSceneIndex].subtitle}
                onChange={(e) => updateScene(activeSceneIndex, { subtitle: e.target.value })}
                rows={3}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-[var(--border)] rounded-xl text-sm text-white focus:outline-none focus:border-[var(--primary)]"
                placeholder="Narrator lines for this visual scene..."
              />
            </div>

            {/* Scene Duration slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[var(--text-secondary)] font-medium">
                <span>Scene Screen-time Duration</span>
                <span className="font-bold text-white">{scenes[activeSceneIndex].duration.toFixed(1)} seconds</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="10.0"
                step="0.5"
                value={scenes[activeSceneIndex].duration}
                onChange={(e) => updateScene(activeSceneIndex, { duration: parseFloat(e.target.value) })}
                className="w-full accent-[var(--primary)] bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
