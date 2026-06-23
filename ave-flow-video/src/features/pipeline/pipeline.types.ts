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
  screenshots: string[];
  videos: string[];
  sourceType?: 'amazon' | 'app_store' | 'website' | 'unknown';
  confidence?: number;
}

export interface ScriptScene {
  media_type: 'image' | 'video';
  media_url: string;
  duration: number;
  subtitle: string;
  motion: string;
  transition_type?: 'fade' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down' | 'zoom_in' | 'none';
  video_start_offset?: number;
}

export interface ScriptVariant {
  variant_id: string;
  creative_angle: string;
  script_text: string;
  elevenlabs_voice_id: string;
  scenes: ScriptScene[];
  rationale: string;
  score: number;
  coverageNotes: string[];
  on_video_script?: string;
}

export interface ScriptBundle {
  variants: ScriptVariant[];
  selectedVariantIndex: number;
  selectedVariant: ScriptVariant;
  selectionReason: string;
  on_video_script?: string;
  sourceType?: ProductData['sourceType'];
  confidence?: number;
}

export interface PipelineResult {
  productData: ProductData;
  script: string;
  videoUrl: string;
  isMockVideo: boolean;
  scriptBundle?: ScriptBundle;
  selectedVariant?: ScriptVariant;
  variants?: ScriptVariant[];
  selectionReason?: string;
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
