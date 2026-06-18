'use client';

import { useState, useCallback } from 'react';
import { Settings, Zap, Film, Sparkles, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { URLInput } from './components/URLInput';
import { SettingsModal } from '@/features/settings/SettingsModal';
import { getApiKeys } from '@/features/settings/settings.storage';
import { PipelineStepper } from './components/PipelineStepper';
import { VideoPreview } from './components/VideoPreview';
import { runPipeline, INITIAL_STEPS } from '@/features/pipeline/runPipeline';
import type { PipelineStep, PipelineResult, StepStatus } from '@/features/pipeline/pipeline.types';
import type { ScriptTone } from '@/features/settings/URLInput.types';
import { SITE_NAME, SITE_TAGLINE } from '@/config/site';

export function HomeView() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);

  const handleStepChange = useCallback((stepId: string, status: StepStatus, error?: string) => {
    setSteps((previous) =>
      previous.map((step) => (step.id === stepId ? { ...step, status, error } : step))
    );
  }, []);

  const handleGenerate = async (
    url: string,
    tone: ScriptTone,
    options: { duration: number; voiceId: string; useFreeTTS: boolean }
  ) => {
    const apiKeys = getApiKeys();

    if (!apiKeys.geminiApiKey) {
      toast.error('Please add your Gemini API key in Settings first.', { duration: 5000 });
      setSettingsOpen(true);
      return;
    }

    if (!options.useFreeTTS && !apiKeys.elevenLabsApiKey) {
      toast.error('Please add ElevenLabs API key or switch to Free TTS.', { duration: 5000 });
      setSettingsOpen(true);
      return;
    }

    setResult(null);
    setSteps(INITIAL_STEPS);
    setShowPipeline(true);
    setIsProcessing(true);

    // Cleanup previous render to save disk space
    if (result?.videoUrl) {
      const prevFilename = result.videoUrl.split('/').pop();
      if (prevFilename) {
        fetch(`/api/cleanup?file=${encodeURIComponent(prevFilename)}`, { method: 'DELETE' }).catch(() => {});
      }
    }

    try {
      const pipelineResult = await runPipeline(
        url,
        apiKeys,
        handleStepChange,
        tone,
        options.duration,
        options.voiceId,
        options.useFreeTTS
      );
      setResult(pipelineResult);

      toast.success(
        pipelineResult.isMockVideo
          ? 'Video ad generated. Using demo avatar.'
          : 'Video ad generated successfully!',
        { icon: '🎬', duration: 4000 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pipeline failed';
      toast.error(message, { duration: 6000 });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="relative z-10 flex-1">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">{SITE_NAME}</h1>
            <p className="text-[10px] text-[var(--muted)] font-medium tracking-widest uppercase">
              {SITE_TAGLINE}
            </p>
          </div>
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-[var(--border)] hover:bg-white/10 hover:border-[var(--border-glow)] transition-all duration-300 text-sm font-medium text-[var(--text-secondary)]"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </header>

      <section className="px-6 pt-16 pb-12 text-center">
        <div className="animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 mb-6">
            <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span className="text-xs font-medium text-[var(--primary)]">Powered by AI</span>
          </div>
        </div>

        <h2 className="animate-slide-up text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] max-w-3xl mx-auto">
          Turn Any Product Into a <span className="gradient-text">Viral Video Ad</span>
        </h2>

        <p className="animate-slide-up delay-200 mt-5 text-base sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
          Paste a product URL, choose your script tone, and watch AI generate a TikTok-style video
          ad in one click.
        </p>

        <div className="animate-slide-up delay-300 flex flex-wrap items-center justify-center gap-3 mt-8">
          {[
            { icon: <Zap className="w-3.5 h-3.5" />, label: 'URL Scraping' },
            { icon: <ArrowRight className="w-3 h-3 text-[var(--muted)]" />, label: '' },
            { icon: <Sparkles className="w-3.5 h-3.5" />, label: 'AI Script' },
          ].map((item, index) =>
            item.label ? (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)]"
              >
                {item.icon}
                {item.label}
              </span>
            ) : (
              <span key={index}>{item.icon}</span>
            )
          )}
        </div>
      </section>

      <section className="px-6 pb-10 animate-slide-up delay-400">
        <URLInput onGenerate={handleGenerate} isLoading={isProcessing} />
      </section>

      {showPipeline && (
        <section className="px-6 pb-10 max-w-2xl mx-auto animate-fade-in">
          <div className="glass-card p-6">
            <PipelineStepper steps={steps} />
          </div>
        </section>
      )}

      {result && (
        <section className="px-6 pb-20 max-w-5xl mx-auto">
          <div className="mb-6 text-center">
            <h3 className="text-2xl font-bold text-white">Your Video Ad is Ready</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Preview your AI-generated TikTok video ad below
            </p>
          </div>
          <VideoPreview result={result} />
        </section>
      )}

      <footer className="mt-auto border-t border-[var(--border)]/30 px-6 py-6">
        <p className="text-center text-xs text-[var(--muted)]">
          AveFlow Video. Built with Next.js, Firecrawl, Gemini, and D-ID.
        </p>
      </footer>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

