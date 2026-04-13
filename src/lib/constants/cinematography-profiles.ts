// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Cinematography Profile Presets — 摄影风格档案预设
 *
 * 在「画风Select」和「逐镜拍摄控制字段」之间，提供项目级摄影语言基准。
 * AI 校准时以此为默认倾向，prompt builder 在逐镜字段为空时回退到此处。
 */

import type {
  LightingStyle,
  LightingDirection,
  ColorTemperature,
  DepthOfField,
  FocusTransition,
  CameraRig,
  MovementSpeed,
  AtmosphericEffect,
  EffectIntensity,
  PlaybackSpeed,
  CameraAngle,
  FocalLength,
  PhotographyTechnique,
} from '@/types/script';

// ==================== 类型定义 ====================

export type CinematographyCategory =
  | 'cinematic'     // Cinematic
  | 'documentary'   // Documentary
  | 'stylized'      // Stylized
  | 'genre'         // Genre Film
  | 'era';          // Era Style

export interface CinematographyProfile {
  id: string;
  name: string;          // Chinese Name
  nameEn: string;        // English Name
  category: CinematographyCategory;
  description: string;   // Chinese Description (1-2 sentences)
  emoji: string;         // Identifier Emoji

  // ---- 灯光默认 (Gaffer) ----
  defaultLighting: {
    style: LightingStyle;
    direction: LightingDirection;
    colorTemperature: ColorTemperature;
  };

  // ---- 焦点默认 (Focus Puller) ----
  defaultFocus: {
    depthOfField: DepthOfField;
    focusTransition: FocusTransition;
  };

  // ---- 器材默认 (Camera Rig) ----
  defaultRig: {
    cameraRig: CameraRig;
    movementSpeed: MovementSpeed;
  };

  // ---- 氛围默认 (On-set SFX) ----
  defaultAtmosphere: {
    effects: AtmosphericEffect[];
    intensity: EffectIntensity;
  };

  // ---- 速度默认 (Speed Ramping) ----
  defaultSpeed: {
    playbackSpeed: PlaybackSpeed;
  };

  // ---- 拍摄角度 / 焦距 / 技法默认（可选） ----
  defaultAngle?: CameraAngle;
  defaultFocalLength?: FocalLength;
  defaultTechnique?: PhotographyTechnique;

  // ---- AI 指导 ----
  /** Chinese Cinematography Guidelines for AI (2-3 sentences, injected into system prompt) */
  promptGuidance: string;
  /** Reference Film List (Helps AI understand target style) */
  referenceFilms: string[];
}

// ==================== 分类信息 ====================

export const CINEMATOGRAPHY_CATEGORIES: { id: CinematographyCategory; name: string; emoji: string }[] = [
  { id: 'cinematic', name: 'Cinematic', emoji: '🎬' },
  { id: 'documentary', name: 'Documentary', emoji: '📹' },
  { id: 'stylized', name: 'Stylized', emoji: '🎨' },
  { id: 'genre', name: 'Genre Film', emoji: '🎭' },
  { id: 'era', name: 'Era Style', emoji: '📅' },
];

// ==================== 预设列表 ====================

// ---------- 电影类 (cinematic) ----------

const CINEMATIC_PROFILES: CinematographyProfile[] = [
  {
    id: 'classic-cinematic',
    name: 'Classic Cinematic',
    nameEn: 'Classic Cinematic',
    category: 'cinematic',
    description: 'Standard theatrical film texture, 3-point lighting, natural color temp, steady dolly movement, upright composition',
    emoji: '🎞️',
    defaultLighting: { style: 'natural', direction: 'three-point', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'dolly', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'Follow classic cinema syntax, base on 3-point lighting, warm tones for warmth. Push/pull dolly for stability, DOF adjusts based on story—shallow for dialogue focus, deep for wide shots of environment.',
    referenceFilms: ['The Shawshank Redemption', 'Forrest Gump', 'The Godfather'],
  },
  {
    id: 'film-noir',
    name: 'Film Noir',
    nameEn: 'Film Noir',
    category: 'cinematic',
    description: 'Low-key lighting, strong contrast, mainly side lighting, cool tones, foggy, handheld breathing effect',
    emoji: '🖤',
    defaultLighting: { style: 'low-key', direction: 'side', colorTemperature: 'cool' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-fg' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['fog', 'smoke'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '35mm',
    promptGuidance: 'Noir soul is light and shadow—large shadows with one side light on character. Cool tones and fog create unease, shaky handheld adds tension. Half face in shadow implies duality.',
    referenceFilms: ['Blade Runner', 'Chinatown', 'The Third Man', 'Sin City'],
  },
  {
    id: 'epic-blockbuster',
    name: 'Epic Blockbuster',
    nameEn: 'Epic Blockbuster',
    category: 'cinematic',
    description: 'High-key bright, strong frontal, deep DOF, huge crane moves, lens flares, epic scale',
    emoji: '⚔️',
    defaultLighting: { style: 'high-key', direction: 'front', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'deep', focusTransition: 'none' },
    defaultRig: { cameraRig: 'crane', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: ['lens-flare', 'dust'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '24mm',
    promptGuidance: 'Epic feel hits with depth—deep DOF and sweeping crane shots show scale. Bright high-key light highlights grandeur, add lens flares/dust for cinematic feel. Use handheld for combat scenes.',
    referenceFilms: ['The Lord of the Rings', 'Gladiator', 'Braveheart', 'Kingdom of Heaven'],
  },
  {
    id: 'intimate-drama',
    name: 'Intimate Drama',
    nameEn: 'Intimate Drama',
    category: 'cinematic',
    description: 'Natural sidelight, warm tone, shallow DOF, tripod static, quiet and introverted, focus on character mood',
    emoji: '🫂',
    defaultLighting: { style: 'natural', direction: 'side', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'tripod', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '85mm',
    promptGuidance: 'Intimate drama uses static shots and shallow DOF to pull viewers into character thoughts. Natural sidelight shapes faces, warm tones convey emotion. Camera stays still, focusing pure attention on micro-expressions.',
    referenceFilms: ['Manchester by the Sea', 'Marriage Story', 'In the Mood for Love'],
  },
  {
    id: 'romantic-film',
    name: 'Romantic Love',
    nameEn: 'Romantic Film',
    category: 'cinematic',
    description: 'Golden hour backlight, extremely shallow DOF, silky Steadicam follow, Tyndall effect, dreamy softness',
    emoji: '💕',
    defaultLighting: { style: 'natural', direction: 'back', colorTemperature: 'golden-hour' },
    defaultFocus: { depthOfField: 'ultra-shallow', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'steadicam', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['light-rays', 'cherry-blossom'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '85mm',
    defaultTechnique: 'bokeh',
    promptGuidance: 'Core of romance is backlighting—warm golden hour backlight gives character a glowing halo. Extreme shallow DOF blurs world into bokeh, soft Steadicam follows like a dream. Falling petals or light beams add poetry.',
    referenceFilms: ['The Notebook', 'La La Land', 'Pride & Prejudice', 'Love Letter'],
  },
];

// ---------- 纪实类 (documentary) ----------

const DOCUMENTARY_PROFILES: CinematographyProfile[] = [
  {
    id: 'documentary-raw',
    name: 'Documentary Handheld',
    nameEn: 'Raw Documentary',
    category: 'documentary',
    description: 'Handheld breathing, natural light, medium DOF, frontal light, unpolished, realistic grit',
    emoji: '📹',
    defaultLighting: { style: 'natural', direction: 'front', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '35mm',
    promptGuidance: 'Documentary style seeks "presence"—slight handheld shake puts viewers in the scene. 100% natural light, no artificial touches. Follow focus trails movement, allowing occasional softness as flaws add realism.',
    referenceFilms: ['Life Is Fruity', 'The Cove', 'Free Solo'],
  },
  {
    id: 'news-report',
    name: 'News Docudrama',
    nameEn: 'News Report',
    category: 'documentary',
    description: 'Shoulder-mount, high-key, deep DOF, neutral temp, information-first, sharp and clear',
    emoji: '📡',
    defaultLighting: { style: 'high-key', direction: 'front', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'deep', focusTransition: 'none' },
    defaultRig: { cameraRig: 'shoulder', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '24mm',
    promptGuidance: 'News doc priority is info delivery—deep DOF keeps all elements readable, high-key limits shadow hiding details. Shoulder rig is responsive but stabler than handheld. Composition highlights info hierarchy.',
    referenceFilms: ['Spotlight', 'All the President\'s Men', 'The Post'],
  },
];

// ---------- 风格化 (stylized) ----------

const STYLIZED_PROFILES: CinematographyProfile[] = [
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk',
    nameEn: 'Cyberpunk Neon',
    category: 'stylized',
    description: 'Neon light, rim light, mixed colors, shallow DOF, gimbal slide, light haze',
    emoji: '🌃',
    defaultLighting: { style: 'neon', direction: 'rim', colorTemperature: 'mixed' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-bg' },
    defaultRig: { cameraRig: 'steadicam', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['haze', 'lens-flare'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '35mm',
    defaultTechnique: 'reflection',
    promptGuidance: 'Cyberpunk visual language is "warm/cool conflict"—neon magenta and ice blue clash, rim lights separate subjects from darkness. Shallow DOF turns neon to psychedelic bokeh, haze gives light volume. Slow glides through rainy streets.',
    referenceFilms: ['Blade Runner 2049', 'Ghost in the Shell', 'The Matrix', 'Tron: Legacy'],
  },
  {
    id: 'wuxia-classic',
    name: 'Classical Wuxia',
    nameEn: 'Classic Wuxia',
    category: 'stylized',
    description: 'Natural sidelight, warm tone, medium/deep DOF, crane lift, misty, ancient charm',
    emoji: '🗡️',
    defaultLighting: { style: 'natural', direction: 'side', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'crane', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['mist', 'falling-leaves'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'Wuxia seeks "mood"—mountain mists and falling leaves create martial arts world. Crane descends like viewing the world from above. Natural sidelight mimics dappled bamboo light, warm tones reflect ink paintings. Slow-mo for combat.',
    referenceFilms: ['Crouching Tiger, Hidden Dragon', 'Hero', 'The Assassin', 'The Grandmaster'],
  },
  {
    id: 'horror-thriller',
    name: 'Horror/Thriller',
    nameEn: 'Horror Thriller',
    category: 'stylized',
    description: 'Low-key, eerie underlighting, cold tone, shallow DOF, nervous handheld, obscured by fog',
    emoji: '👻',
    defaultLighting: { style: 'low-key', direction: 'bottom', colorTemperature: 'cool' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-bg' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: ['fog', 'haze'], intensity: 'heavy' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '24mm',
    promptGuidance: 'Horror rule: "Hiding is scarier than showing"—shallow DOF blurs background threats, heavy fog blocks vision. Underlighting creates unnatural face shadows, painfully slow handheld builds tension, broken by sudden whip pans.',
    referenceFilms: ['The Shining', 'Hereditary', 'The Conjuring', 'Ringu'],
  },
  {
    id: 'music-video',
    name: 'Music Video Style',
    nameEn: 'Music Video',
    category: 'stylized',
    description: 'Neon backlight, mixed temp, extremely shallow DOF, Steadicam orbit, light particles, strong visual impact',
    emoji: '🎵',
    defaultLighting: { style: 'neon', direction: 'back', colorTemperature: 'mixed' },
    defaultFocus: { depthOfField: 'ultra-shallow', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'steadicam', movementSpeed: 'fast' },
    defaultAtmosphere: { effects: ['particles', 'lens-flare'], intensity: 'heavy' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '35mm',
    defaultTechnique: 'bokeh',
    promptGuidance: 'MV pushes extreme visual impact—every frame a poster. Super shallow DOF turns backgrounds to bokeh, neon backlight rims figures. Fast Steadicam orbits with speed ramps. Heavy use of light particles and flares.',
    referenceFilms: ['爱乐之城MV段落', 'Beyoncé - Lemonade', 'The Weeknd - Blinding Lights'],
  },
];

// ---------- 类型片 (genre) ----------

const GENRE_PROFILES: CinematographyProfile[] = [
  {
    id: 'family-warmth',
    name: 'Family Warmth',
    nameEn: 'Family Warmth',
    category: 'genre',
    description: 'Natural frontal light, warm 3200K, mid DOF, stable tripod, warm like sunlight in living room',
    emoji: '🏠',
    defaultLighting: { style: 'natural', direction: 'front', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'tripod', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: ['light-rays'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'Family drama cinematography is a quiet observer—stable tripod, warm light like afternoon sun. Mid DOF keeps family members clear, conveying "reunion". Occasional Tyndall rays add poetry to ordinary scenes.',
    referenceFilms: ['Shoplifters', 'Still Walking', 'Reply 1988', 'All Is Well'],
  },
  {
    id: 'action-intense',
    name: 'Intense Action',
    nameEn: 'Intense Action',
    category: 'genre',
    description: 'High-key sidelight, neutral temp, medium/deep DOF, fast shoulder tracking, flying dust',
    emoji: '💥',
    defaultLighting: { style: 'high-key', direction: 'side', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'shoulder', movementSpeed: 'fast' },
    defaultAtmosphere: { effects: ['dust', 'sparks'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '24mm',
    defaultTechnique: 'high-speed',
    promptGuidance: 'Action seeks "kinetic transfer"—fast shoulder rigs deliver impact, sidelight highlights muscles/motion. Deep DOF keeps subjects clear. Slow-mo 0.5x on key hits (punches/explosions) for power, then snap back to normal. Dust/sparks add realism.',
    referenceFilms: ['Mad Max: Fury Road', 'The Bourne Identity', 'The Raid', 'Mission: Impossible'],
  },
  {
    id: 'suspense-mystery',
    name: 'Mystery Thriller',
    nameEn: 'Suspense Mystery',
    category: 'genre',
    description: 'Low-key sidelight, cold tone, shallow DOF, slow dolly push, misty, hide and reveal',
    emoji: '🔍',
    defaultLighting: { style: 'low-key', direction: 'side', colorTemperature: 'cool' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-fg' },
    defaultRig: { cameraRig: 'dolly', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: ['mist'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'Mystery core is "controlled info reveal"—shallow DOF selectively shows only what director wants. Slow dolly creeps build pressure, low-key sidelight leaves half the frame in shadow. Rack focus connects clues to suspects. Fog adds ambiguity.',
    referenceFilms: ['Gone Girl', 'Se7en', 'Memories of Murder', '12 Angry Men'],
  },
];

// ---------- 时代风格 (era) ----------

const ERA_PROFILES: CinematographyProfile[] = [
  {
    id: 'hk-retro-90s',
    name: '90s Hong Kong Film',
    nameEn: '90s Hong Kong',
    category: 'era',
    description: 'Neon sidelight, mixed temp, mid/deep DOF, shaky handheld, misty, Wong Kar-wai melancholy',
    emoji: '🌙',
    defaultLighting: { style: 'neon', direction: 'side', colorTemperature: 'mixed' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: ['haze', 'smoke'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '35mm',
    promptGuidance: '90s HK DNA is "urban neon + handheld wandering"—mixed neon colors turn streets into red/blue dreams. Handheld weaves through crowds, under-cranking creates Wong Kar-wai motion blur smears. Foggy streets, everyone has a story.',
    referenceFilms: ['Chungking Express', 'Fallen Angels', 'Infernal Affairs', 'A Better Tomorrow'],
  },
  {
    id: 'golden-age-hollywood',
    name: 'Golden Age of Hollywood',
    nameEn: 'Golden Age Hollywood',
    category: 'era',
    description: 'High-key 3-point lighting, warm tone, deep DOF, elegant dolly, radiant, dignified glamour',
    emoji: '⭐',
    defaultLighting: { style: 'high-key', direction: 'three-point', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'deep', focusTransition: 'none' },
    defaultRig: { cameraRig: 'dolly', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['light-rays'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'Golden Age aims for "perfection"—3-point lighting kills ugly shadows, makes stars glow. Deep DOF and tight composition make paintings, dollies waltz slowly. Warm tones add nostalgic golden glow. Everything must be flawless glamour.',
    referenceFilms: ['Casablanca', 'Citizen Kane', 'Sunset Boulevard', 'Gone with the Wind'],
  },
];

// ==================== Export ====================

/** All Cinematography Profile Presets */
export const CINEMATOGRAPHY_PROFILES: readonly CinematographyProfile[] = [
  ...CINEMATIC_PROFILES,
  ...DOCUMENTARY_PROFILES,
  ...STYLIZED_PROFILES,
  ...GENRE_PROFILES,
  ...ERA_PROFILES,
] as const;

/** Organized by Category */
export const CINEMATOGRAPHY_PROFILE_CATEGORIES: {
  id: CinematographyCategory;
  name: string;
  emoji: string;
  profiles: readonly CinematographyProfile[];
}[] = [
  { id: 'cinematic', name: 'Cinematic', emoji: '🎬', profiles: CINEMATIC_PROFILES },
  { id: 'documentary', name: 'Documentary', emoji: '📹', profiles: DOCUMENTARY_PROFILES },
  { id: 'stylized', name: 'Stylized', emoji: '🎨', profiles: STYLIZED_PROFILES },
  { id: 'genre', name: 'Genre Film', emoji: '🎭', profiles: GENRE_PROFILES },
  { id: 'era', name: 'Era Style', emoji: '📅', profiles: ERA_PROFILES },
];

/** Get Cinematography Profile by ID */
export function getCinematographyProfile(profileId: string): CinematographyProfile | undefined {
  return CINEMATOGRAPHY_PROFILES.find(p => p.id === profileId);
}

/** Default Cinematography Profile ID */
export const DEFAULT_CINEMATOGRAPHY_PROFILE_ID = 'classic-cinematic';

/**
 * 生成 AI 校准用的摄影档案指导文本
 * 注入到 system prompt 中，作为拍摄控制字段的默认基准
 */
export function buildCinematographyGuidance(profileId: string): string {
  const profile = getCinematographyProfile(profileId);
  if (!profile) return '';

  const { defaultLighting, defaultFocus, defaultRig, defaultAtmosphere, defaultSpeed } = profile;

  const lines = [
    `[🎬 Cinematography Profile — ${profile.nameEn}]`,
    `${profile.description}`,
    '',
    '**Default Cinematography Baseline (Per-shot can deviate based on plot, but needs a reason):**',
    `Lighting: ${profile.defaultLighting.style} style + ${profile.defaultLighting.direction} direction + ${profile.defaultLighting.colorTemperature} temp`,
    `Focus: ${defaultFocus.depthOfField} DOF + ${defaultFocus.focusTransition} rack focus`,
    `Equipment: ${defaultRig.cameraRig} + ${defaultRig.movementSpeed} speed`,
    defaultAtmosphere.effects.length > 0
      ? `Atmosphere: ${defaultAtmosphere.effects.join('+')} (${defaultAtmosphere.intensity})`
      : 'Atmosphere: No special effects',
    `Speed: ${defaultSpeed.playbackSpeed}`,
    profile.defaultAngle ? `Shooting Angle: ${profile.defaultAngle}` : '',
    profile.defaultFocalLength ? `Focal Length: ${profile.defaultFocalLength}` : '',
    profile.defaultTechnique ? `Technique: ${profile.defaultTechnique}` : '',
    '',
    `**Cinematography Guidance:** ${profile.promptGuidance}`,
    '',
    `**Reference Films:** ${profile.referenceFilms.join(', ')}`,
    '',
    '⚠️ Above is the cinematography baseline. Shot controls should default to this, but can be adjusted for narrative beats (climax, twists)—changes must have a story reason, not random.',
  ].filter(Boolean);

  return lines.join('\n');
}
