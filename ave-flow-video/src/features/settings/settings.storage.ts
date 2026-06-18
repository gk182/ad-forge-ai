import { VOICE_OPTIONS } from './settings.constants';

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

export function getApiKeys(): ApiKeys {
  if (typeof window === 'undefined') {
    return {
      firecrawlApiKey: '',
      geminiApiKey: '',
      elevenLabsApiKey: '',
      didApiKey: '',
      geminiModel: 'gemini-2.5-flash',
      avatarImageUrl: '',
      didVoiceId: 'en-US-JennyNeural',
      didVoiceProvider: 'microsoft',
      promptTemplate: '',
    };
  }

  const voiceId = localStorage.getItem('did_voice_id') || 'en-US-JennyNeural';
  const voiceEntry = VOICE_OPTIONS.find((voice) => voice.id === voiceId);

  return {
    firecrawlApiKey: localStorage.getItem('firecrawl_api_key') || '',
    geminiApiKey: localStorage.getItem('gemini_api_key') || '',
    elevenLabsApiKey: localStorage.getItem('elevenlabs_api_key') || '',
    didApiKey: localStorage.getItem('did_api_key') || '',
    geminiModel: localStorage.getItem('gemini_model') || 'gemini-2.5-flash',
    avatarImageUrl: localStorage.getItem('avatar_image_url') || '',
    didVoiceId: voiceId,
    didVoiceProvider: voiceEntry?.provider || 'microsoft',
    promptTemplate: localStorage.getItem('prompt_template') || '',
  };
}

export function getStoredSetting(key: string, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem(key) || fallback;
}

export function saveStoredSetting(key: string, value: string) {
  if (typeof window === 'undefined') return;
  const trimmed = value.trim();
  if (trimmed) {
    localStorage.setItem(key, trimmed);
  } else {
    localStorage.removeItem(key);
  }
}

export function savePromptTemplate(value: string) {
  if (typeof window === 'undefined') return;
  const trimmed = value.trim();
  if (trimmed) {
    localStorage.setItem('prompt_template', trimmed);
  } else {
    localStorage.removeItem('prompt_template');
  }
}
