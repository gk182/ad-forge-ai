'use client';

import { useState, useCallback } from 'react';
import { Settings, Film, Sparkles, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { URLInput } from './components/URLInput';
import { AssetSelector } from './components/AssetSelector';
import { StudioEditor } from './components/StudioEditor';
import { SettingsModal } from '@/features/settings/SettingsModal';
import { getApiKeys } from '@/features/settings/settings.storage';
import type { ScriptTone } from '@/features/settings/URLInput.types';
import { SITE_NAME, SITE_TAGLINE } from '@/config/site';

type WorkflowStep = 'input' | 'scraping' | 'assets' | 'scripting' | 'studio';

interface ProductData {
  title: string;
  description: string;
  image: string;
  markdown: string;
  screenshots: string[];
  videos: string[];
}

export function HomeView() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('input');
  
  // Pipeline settings saved from URLInput
  const [tone, setTone] = useState<ScriptTone>('fun');
  const [duration, setDuration] = useState(30);

  // Loaded data states
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [scriptData, setScriptData] = useState<any | null>(null);

  // Scrape trigger
  const handleScrape = async (
    url: string,
    selectedTone: ScriptTone,
    options: { duration: number; voiceId: string; useFreeTTS: boolean }
  ) => {
    const apiKeys = getApiKeys();

    if (!apiKeys.geminiApiKey) {
      toast.error('Please add your Gemini API key in Settings first.', { duration: 5000 });
      setSettingsOpen(true);
      return;
    }

    setTone(selectedTone);
    setDuration(options.duration);
    setProductData(null);
    setScriptData(null);
    setWorkflowStep('scraping');

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to scrape product data');
      }

      setProductData(data);
      setWorkflowStep('assets');
      toast.success('Product details crawled! Now choose your media assets.', { icon: '🔍' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scraping failed';
      toast.error(message, { duration: 6000 });
      setWorkflowStep('input');
    }
  };

  // Script write trigger
  const handleGenerateScript = async (
    selectedImages: string[],
    videoCaptures: string[],
    customNotes: string
  ) => {
    if (!productData) return;
    
    const apiKeys = getApiKeys();
    setWorkflowStep('scripting');

    try {
      const response = await fetch('/api/generate-script-multimodal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: productData.title,
          description: productData.description,
          markdown: productData.markdown,
          selectedImages,
          videoCaptures,
          productVideos: productData.videos || [],
          tone,
          targetDuration: duration,
          geminiApiKey: apiKeys.geminiApiKey,
          geminiModel: apiKeys.geminiModel || 'gemini-2.5-flash',
          customNotes,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to write script');
      }

      setScriptData(data);
      setWorkflowStep('studio');
      toast.success('AI Script & Storyboard generated! Welcome to Remotion Studio.', { icon: '✨' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI analysis failed';
      toast.error(message, { duration: 6000 });
      setWorkflowStep('assets');
    }
  };

  const handleReset = () => {
    setProductData(null);
    setScriptData(null);
    setWorkflowStep('input');
  };

  return (
    <main className="relative z-10 flex-1 flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]/50 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {workflowStep !== 'input' && (
            <button
              onClick={handleReset}
              className="p-2 -ml-2 rounded-xl bg-white/5 border border-[var(--border)] hover:bg-white/10 hover:border-zinc-500 text-zinc-300 transition-all"
              title="Start over"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
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

      {/* Main Content Area */}
      <div className="flex-1 py-10 px-6">
        
        {/* State 1: Input URL form */}
        {workflowStep === 'input' && (
          <div className="space-y-10">
            <section className="text-center pt-10">
              <div className="animate-fade-in">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 mb-6">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span className="text-xs font-medium text-[var(--primary)]">Remotion Video Studio</span>
                </div>
              </div>

              <h2 className="animate-slide-up text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] max-w-3xl mx-auto">
                Turn Any Product Into a <span className="gradient-text">Viral Video Ad</span>
              </h2>

              <p className="animate-slide-up delay-200 mt-5 text-base sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
                Scrape media assets, capture custom video frames, edit with Remotion, and export TikTok reviewer-style video ads.
              </p>
            </section>

            <section className="animate-slide-up delay-400">
              <URLInput onGenerate={handleScrape} isLoading={false} />
            </section>
          </div>
        )}

        {/* State 2: Scraping Crawler Loading State */}
        {workflowStep === 'scraping' && (
          <div className="flex flex-col items-center justify-center py-24 space-y-6 max-w-md mx-auto text-center">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-[var(--primary)]/20 border-t-[var(--primary)] rounded-full animate-spin" />
              <Film className="w-8 h-8 text-[var(--primary)] absolute top-6 left-6 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">Scraping Product Information</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Reading description, downloading high-resolution media galleries, and extracting videos from the product link. Please wait...
              </p>
            </div>
          </div>
        )}

        {/* State 3: Media Selection & Keyframes Capture Screen */}
        {workflowStep === 'assets' && productData && (
          <AssetSelector
            productData={productData}
            onGenerateScript={handleGenerateScript}
            isLoading={false}
          />
        )}

        {/* State 4: Script writing loading State */}
        {workflowStep === 'scripting' && (
          <div className="flex flex-col items-center justify-center py-24 space-y-6 max-w-md mx-auto text-center">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-[var(--secondary)]/20 border-t-[var(--secondary)] rounded-full animate-spin" />
              <Sparkles className="w-8 h-8 text-[var(--secondary)] absolute top-6 left-6 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">Analyzing Media & Writing Script</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Gemini is inspecting the chosen images and video keyframe captures to craft a highly engaging marketing script with scene-accurate durations.
              </p>
            </div>
          </div>
        )}

        {/* State 5: Remotion Studio Editor */}
        {workflowStep === 'studio' && scriptData && productData && (
          <StudioEditor
            initialScript={scriptData}
            productImages={[productData.image, ...(productData.screenshots || [])].filter(Boolean)}
            productVideos={productData.videos || []}
          />
        )}

      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-[var(--border)]/30 px-6 py-6 bg-black/10">
        <p className="text-center text-xs text-[var(--muted)]">
          AveFlow Video Editor. Built with Next.js, FastAPI, Remotion & Gemini.
        </p>
      </footer>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
