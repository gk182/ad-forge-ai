/**
 * Types for the Mobile App Video Generator Remotion pipeline.
 */

export type MobileAnimationType =
  | 'highlight_pulse'
  | 'stagger_in'
  | 'spring_scale'
  | 'fade_in'
  | 'slide_up'
  | 'none';

export type SceneTransitionType =
  | 'fade'
  | 'slide_left'
  | 'slide_right'
  | 'slide_up'
  | 'zoom_in'
  | 'none';

export interface MobileAppScene {
  /** The screenshot/image URL for this scene */
  imageUrl: string;
  /** Duration of this scene in seconds */
  duration: number;
  /** The subtitle/voiceover text for this scene */
  subtitle: string;
  /** What feature/button/element is highlighted */
  featureLabel: string;
  /** Short description of the feature shown */
  featureDescription: string;
  /** Animation type for the phone mockup entry */
  animation: MobileAnimationType;
  /** Transition to the next scene */
  transition: SceneTransitionType;
  /** Optional CTA text to overlay (e.g. "Download Now") */
  ctaText?: string;
  /** Word timings for karaoke subtitles */
  word_timings?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}

export type MobileAppPreset =
  | 'hero_floating'
  | 'orbit_reveal'
  | 'screenshot_cascade'
  | 'tiktok_hook'
  | 'phone_wall'
  | 'phone_explosion'
  | 'blueprint_style'
  | 'ai_assistant'
  | 'feature_spotlight'
  | 'premium_luxury'
  | 'floating_cards'
  | 'cinematic_reveal'
  | 'front_flat';

export interface MobileAppVideoProps {
  /** App name */
  appName?: string;
  /** App tagline / short description */
  tagline?: string;
  /** App logo icon URL */
  logoUrl?: string;
  /** Scenes to render */
  scenes?: MobileAppScene[];
  /** Audio URL for voiceover */
  audioUrl?: string;
  /** Audio duration in seconds */
  audioDuration?: number;
  /** Primary brand color (hex) */
  primaryColor?: string;
  /** Secondary brand color (hex) */
  secondaryColor?: string;
  /** Text color */
  textColor?: string;
  /** Font family */
  fontFamily?: string;
  /** Selected video style preset */
  preset?: MobileAppPreset;
}

/** Schema for what the AI endpoint returns */
export interface MobileAppScriptResponse {
  appName: string;
  tagline: string;
  preset: MobileAppPreset;
  primaryColor: string;
  secondaryColor: string;
  scenes: MobileAppScene[];
  scriptText: string;
  rationale: string;
}
