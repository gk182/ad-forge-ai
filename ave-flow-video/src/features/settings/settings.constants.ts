export interface KeyField {
  key: string;
  label: string;
  storageKey: string;
  placeholder: string;
}

export interface VoiceOption {
  id: string;
  label: string;
  provider: string;
  gender: 'female' | 'male';
}

export const KEY_FIELDS: KeyField[] = [
  {
    key: 'firecrawl',
    label: 'Firecrawl API Key',
    storageKey: 'firecrawl_api_key',
    placeholder: 'fc-...',
  },
  {
    key: 'gemini',
    label: 'Google Gemini API Key',
    storageKey: 'gemini_api_key',
    placeholder: 'AIza...',
  },
  {
    key: 'elevenlabs',
    label: 'ElevenLabs API Key',
    storageKey: 'elevenlabs_api_key',
    placeholder: 'sk_...',
  },
  {
    key: 'did',
    label: 'D-ID API Key',
    storageKey: 'did_api_key',
    placeholder: 'Khóa D-ID của bạn (tùy chọn cho demo)',
  },
];

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'en-US-JennyNeural', label: 'Jenny (Nữ, Mỹ)', provider: 'microsoft', gender: 'female' },
  { id: 'en-US-AriaNeural', label: 'Aria (Nữ, Mỹ)', provider: 'microsoft', gender: 'female' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma (Nữ, Mỹ, đa ngôn ngữ)', provider: 'microsoft', gender: 'female' },
  { id: 'en-US-GuyNeural', label: 'Guy (Nam, Mỹ)', provider: 'microsoft', gender: 'male' },
  { id: 'en-US-AndrewNeural', label: 'Andrew (Nam, Mỹ)', provider: 'microsoft', gender: 'male' },
  { id: 'en-US-ChristopherNeural', label: 'Christopher (Nam, Mỹ)', provider: 'microsoft', gender: 'male' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (Nữ, Anh)', provider: 'microsoft', gender: 'female' },
  { id: 'en-GB-OliviaNeural', label: 'Olivia (Nữ, Anh)', provider: 'microsoft', gender: 'female' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (Nam, Anh)', provider: 'microsoft', gender: 'male' },
  { id: 'vi-VN-HoaiMyNeural', label: 'Hoài My (Nữ, VN)', provider: 'microsoft', gender: 'female' },
  { id: 'vi-VN-NamMinhNeural', label: 'Nam Minh (Nam, VN)', provider: 'microsoft', gender: 'male' },
];

export const DEFAULT_AVATAR_URL =
  'https://d-id-public-bucket.s3.us-west-2.amazonaws.com/alice.jpg';

export const TTS_PROVIDERS = [
  { id: 'free', label: 'Free (Kokoro Local TTS)', cost: 'Free', icon: '🎙️' },
  { id: 'elevenlabs', label: 'ElevenLabs (Premium)', cost: 'Paid', icon: '✨' },
] as const;

export const PROMPT_TEMPLATE_PLACEHOLDER = `For example your style notes:
- Prioritize youthful, modern, natural voice
- Focus on the feeling of "wanting to buy now"
- Avoid overly promotional language
- Emphasize time-saving features`;
