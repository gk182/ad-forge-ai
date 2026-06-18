import type { ScriptTone } from '../settings/URLInput.types';
import type { ApiKeys, PipelineResult, PipelineStep, StepStatus, ProductData } from './pipeline.types';

export const INITIAL_STEPS: PipelineStep[] = [
  { id: 'scrape', label: 'Scraping Product Data', icon: 'search', status: 'pending' },
  { id: 'generate', label: 'AI Planning & Scripting', icon: 'sparkles', status: 'pending' },
  { id: 'render', label: 'Rendering Video', icon: 'video', status: 'pending' },
];

type OnStepChange = (stepId: string, status: StepStatus, error?: string) => void;

export async function runPipeline(
  url: string,
  apiKeys: ApiKeys,
  onStepChange: OnStepChange,
  tone: ScriptTone = 'fun',
  targetDurationSeconds = 30,
  voiceId?: string,
  useFreeTTS = false
): Promise<PipelineResult> {
  onStepChange('scrape', 'active');

  let productData: ProductData;
  try {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, firecrawlApiKey: apiKeys.firecrawlApiKey }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to scrape product data');
    productData = data;
    onStepChange('scrape', 'completed');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scraping failed';
    onStepChange('scrape', 'error', message);
    throw new Error(message);
  }

  onStepChange('generate', 'active');
  try {
    if (!apiKeys.geminiApiKey) {
      throw new Error('Gemini API key is required. Open Settings to add it.');
    }
    if (!useFreeTTS && !apiKeys.elevenLabsApiKey) {
      throw new Error('ElevenLabs API key is required or enable Free TTS.');
    }

    const response = await fetch('/api/generate-structured', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: productData.title,
        description: productData.description,
        markdown: productData.markdown,
        image: productData.image,
        screenshots: productData.screenshots || [],
        videos: productData.videos || [],
        tone,
        targetDuration: targetDurationSeconds,
        geminiApiKey: apiKeys.geminiApiKey,
        geminiModel: apiKeys.geminiModel || 'gemini-2.5-flash',
        elevenLabsApiKey: apiKeys.elevenLabsApiKey || '',
        useFreeTTS,
        customNotes: apiKeys.promptTemplate || '',
      }),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to generate video');
    
    onStepChange('generate', 'completed');
    onStepChange('render', 'completed');

    return {
      productData,
      script: data.script,
      videoUrl: data.videoUrl,
      isMockVideo: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video generation failed';
    onStepChange('generate', 'error', message);
    throw new Error(message);
  }
}
