import type { ScriptTone } from '../settings/URLInput.types';

export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

export interface PipelineStep {
  id: string;
  label: string;
  icon: string;
  status: StepStatus;
  error?: string;
}

export interface ProductData {
  title: string;
  description: string;
  image: string;
  markdown?: string;
  screenshots?: string[];
  videos?: string[];
}

export interface PipelineResult {
  productData: ProductData;
  script: string;
  videoUrl: string;
  isMockVideo: boolean;
}

export interface ApiKeys {
  firecrawlApiKey: string;
  geminiApiKey: string;
  elevenLabsApiKey: string;
  didApiKey: string;
  geminiModel?: string;
  avatarImageUrl?: string;
  didVoiceId?: string;
  didVoiceProvider?: string;
  promptTemplate?: string;
}

export type { ScriptTone };

