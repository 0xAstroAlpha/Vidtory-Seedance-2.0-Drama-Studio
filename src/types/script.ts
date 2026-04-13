// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
// Done状态
export type CompletionStatus = 'pending' | 'in_progress' | 'completed';

// Prompt语言选项
export type PromptLanguage = 'zh' | 'en' | 'zh+en';

// AI角色校准严格度
export type CalibrationStrictness = 'strict' | 'normal' | 'loose';

/** Filtered character records (for recovery) */
export interface FilteredCharacterRecord {
  name: string;
  reason: string;
}

/**
 * 角色阶段信息
 * 用于标识角色在特定Episodes范围内的形象版本
 */
export interface CharacterStageInfo {
  stageName: string;              // Stage name: 'Youth version', 'Middle-aged version', 'Early startup'
  episodeRange: [number, number]; // Applicable episode range: [Start episode, End episode]
  ageDescription?: string;        // Age description for this stage: '25 years old', '50 years old'
}

/**
 * 角色一致性元素
 * 用于保持同一角色不同阶段的可识别性
 */
export interface CharacterConsistencyElements {
  facialFeatures?: string;  // Facial features (invariant): eye shape, facial feature proportions
  bodyType?: string;        // Body type features: height, physique
  uniqueMarks?: string;     // Unique marks: birthmarks, scars, signature features
}

/**
 * 角色身份锚点 - 6层特征锁定系统
 * 用于确保AI生图中同一角色在不同Scene保持一致
 */
export interface CharacterIdentityAnchors {
  // ① Face Structure - 面部骨骼结构
  faceShape?: string;       // Face shape：oval/square/heart/round/diamond/oblong
  jawline?: string;         // Jawline: sharp angular/soft rounded/prominent
  cheekbones?: string;      // Cheekbones: high prominent/subtle/wide set
  
  // ② Facial Features - 眼鼻Lips精确描述
  eyeShape?: string;        // Eye shape：almond/round/hooded/monolid/upturned
  eyeDetails?: string;      // Eye details：double eyelids, slight epicanthic fold
  noseShape?: string;       // Nose shape：straight bridge, rounded tip, medium width
  lipShape?: string;        // Lip shape：full lips, defined cupid's bow
  
  // ③ 辨识标记层 - 最强锚点
  uniqueMarks: string[];    // Required! Exact location of birthmark/scar/mole: 'small mole 2cm below left eye'
  
  // ④ 色彩锚点层 - Hex色值
  colorAnchors?: {
    iris?: string;          // Iris color: #3D2314 (dark brown)
    hair?: string;          // Hair color: #1A1A1A (jet black)
    skin?: string;          // Skin tone: #E8C4A0 (warm beige)
    lips?: string;          // Lips color: #C4727E (dusty rose)
  };
  
  // ⑤ Skin Texture
  skinTexture?: string;     // visible pores on nose, light smile lines
  
  // ⑥ Hair型锚点层
  hairStyle?: string;       // Hairstyle: shoulder-length, layered, side-parted
  hairlineDetails?: string; // Hairline details: natural hairline, slight widow's peak
}

/**
 * 角色负面Prompt
 * 用于排除不符合角色设定的生成结果
 */
export interface CharacterNegativePrompt {
  avoid: string[];          // Features to avoid: ['blonde hair', 'blue eyes', 'beard']
  styleExclusions?: string[]; // Style exclusions: ['anime style', 'cartoon']
}

export interface ScriptCharacter {
  id: string; // Script-level id
  name: string;
  gender?: string;
  age?: string;
  personality?: string; // Personality traits (detailed description)
  role?: string; // Identity/Background (detailed description)
  traits?: string; // Core traits (detailed description)
  skills?: string; // Skills/Abilities (e.g. martial arts, magic, etc.)
  keyActions?: string; // Key actions/deeds
  appearance?: string; // Appearance description
  relationships?: string; // Primary relationships
  tags?: string[]; // Character tags, e.g.: #Wuxia #MaleLead #Swordsman
  notes?: string; // Character notes (plot description)
  status?: CompletionStatus; // Character image generation status
  characterLibraryId?: string; // Associated Character Library ID
  
  // === 多阶段角色支持 ===
  baseCharacterId?: string;        // Original character ID (stage character points to base character, e.g., 'Youth Zhang Ming' points to 'Zhang Ming')
  stageInfo?: CharacterStageInfo;  // Stage info (only stage characters have this field)
  stageCharacterIds?: string[];    // Derived stage character IDs list (only base characters have this field)
  consistencyElements?: CharacterConsistencyElements; // Consistency elements (defined by base character, inherited by stage characters)
  visualPromptEn?: string;         // English visual prompt (for AI image generation)
  visualPromptZh?: string;         // Chinese visual prompt
  
  // === 6层身份锚点（AI校准时填充）===
  identityAnchors?: CharacterIdentityAnchors;  // Identity anchors (for character consistency)
  negativePrompt?: CharacterNegativePrompt;    // Negative prompt (exclude non-conforming features)
}

export interface ScriptScene {
  id: string; // Script-level id
  name?: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string; // Chinese scene visual description (for scene concept art generation)
  tags?: string[]; // Scene tags, e.g.: #WoodenPillar #WindowLattice #AncientArchitecture
  notes?: string; // Location notes (plot description)
  status?: CompletionStatus; // Scene generation status
  sceneLibraryId?: string; // Associated Scene Library ID
  
  // === 专业Scene设计字段（AI校准时填充）===
  visualPromptEn?: string;      // English visual prompt (for AI image generation)
  architectureStyle?: string;   // Architecture style (Modern minimalist/Chinese classical/Industrial/European, etc.)
  lightingDesign?: string;      // Lighting design (Natural light/Lamp light/Dim/Bright, etc.)
  colorPalette?: string;        // Color palette (Warm/Cool/Neutral, etc.)
  keyProps?: string[];          // Key props list
  spatialLayout?: string;       // Spatial layout description
  eraDetails?: string;          // Era details (e.g. 2000s decor style)
  
  // === 出场统计（AI校准时填充）===
  episodeNumbers?: number[];    // Appears in which episodes
  appearanceCount?: number;     // Appearance count
  importance?: 'main' | 'secondary' | 'transition';  // Scene importance
  
  // === 多Viewpoint联合图（Scene背景一致性）===
  contactSheetImage?: string;   // Contact sheet original image (base64 or URL)
  contactSheetImageUrl?: string; // Contact sheet HTTP URL
  viewpoints?: SceneViewpointData[]; // Viewpoint list
  viewpointImages?: Record<string, {
    imageUrl: string;           // Cropped image (base64 or URL)
    imageBase64?: string;       // Base64 for persistence
    gridIndex: number;          // Grid index in contact sheet (0-5)
  }>;
}

/**
 * SceneViewpoint数据（简化版，存储在 ScriptScene 中）
 */
export interface SceneViewpointData {
  id: string;           // Viewpoint ID, e.g. 'dining', 'sofa', 'window'
  name: string;         // Chinese name: Dining area, Sofa area, Window area
  nameEn: string;       // English name
  shotIds: string[];    // Associated Shot IDs list
  keyProps: string[];   // Props required for this viewpoint
  gridIndex: number;    // Grid index in contact sheet (0-5)
}

export interface ScriptParagraph {
  id: number;
  text: string;
  sceneRefId: string;
}

// Scene原始内容（保留完整对白和动作）
export interface SceneRawContent {
  sceneHeader: string;        // Scene header: e.g. '1-1 Day Int Shanghai Zhang House'
  characters: string[];       // Characters present
  content: string;            // Full scene content (dialogue + action + subtitles, etc.)
  dialogues: DialogueLine[];  // Parsed dialogue list
  actions: string[];          // Action description list (starting with △)
  subtitles: string[];        // Subtitles 【】
  weather?: string;           // Weather (Sunny/Rain/Snow/Fog/Cloudy, detected from scene content)
  timeOfDay?: string;         // Time (Day/Night/Dawn/Dusk, extracted from scene header)
}

// 对白行
export interface DialogueLine {
  character: string;          // Character name
  parenthetical?: string;     // Parenthetical action/mood, e.g. (drinking)
  line: string;               // Dialogue content
}

// Episode的原始剧本内容
export interface EpisodeRawScript {
  episodeIndex: number;       // Episode number
  title: string;              // Episode title
  synopsis?: string;          // Episode synopsis/summary (AI generated or manually edited)
  keyEvents?: string[];       // Key events in this episode
  rawContent: string;         // Original full content
  scenes: SceneRawContent[];  // Parsed scenes list
  shotGenerationStatus: 'idle' | 'generating' | 'completed' | 'error';  // Shot generation status
  lastGeneratedAt?: number;   // Last generated time
  synopsisGeneratedAt?: number; // Synopsis generated time
  season?: string;            // Season (Spring/Summer/Autumn/Winter, extracted from subtitles)
}

// 项目背景信息
export interface ProjectBackground {
  title: string;              // Series name
  genre?: string;             // Genre (Business/Wuxia/Romance, etc.)
  era?: string;               // Era background (Republic of China/Modern/Ancient, etc.)
  timelineSetting?: string;   // Precise timeline setting (e.g. 'Summer 2022', '1990-2020')
  storyStartYear?: number;    // Story start year (used to calculate character age)
  storyEndYear?: number;      // Story end year
  totalEpisodes?: number;     // Total episodes
  outline: string;            // Story outline
  characterBios: string;      // Character biographies
  worldSetting?: string;      // World setting / style
  themes?: string[];          // Theme keywords
}

// ==================== 剧级数据（SeriesMeta）— 跨EpisodeTotal享 ====================

/** Named entities: Geography/Items/Factions, etc. */
export interface NamedEntity {
  name: string;
  desc: string;
}

/** Factions/Forces */
export interface Faction {
  name: string;
  members: string[];
}

/** Character relationships */
export interface CharacterRelationship {
  from: string;
  to: string;
  type: string;
}

/**
 * 剧级元数据 — 项目主页展示，所有EpisodeTotal享
 * 首次Import时由 AI + 正则自动填充，校准后回写丰富
 */
export interface SeriesMeta {
  // === 故事核心 ===
  title: string;
  logline?: string;                   // Logline summary
  outline?: string;                   // 100-500 words full storyline
  centralConflict?: string;           // Mainline conflict
  themes?: string[];                  // [Revenge, Ploy, Friendship]

  // === 世界观 ===
  era?: string;                       // Ancient/Modern/Future
  genre?: string;                     // Wuxia/Business/Romance
  timelineSetting?: string;           // Precise timeline
  geography?: NamedEntity[];          // Geography setting
  socialSystem?: string;              // Social system
  powerSystem?: string;               // Power system
  keyItems?: NamedEntity[];           // Key items
  worldNotes?: string;                // Worldview supplement (free text)

  // === 角色体系 ===
  characters: ScriptCharacter[];      // Elevated from scriptData.characters
  factions?: Faction[];               // Factions/Forces
  relationships?: CharacterRelationship[];  // Character relationships

  // === 视觉系统 ===
  styleId?: string;
  recurringLocations?: ScriptScene[]; // Recurring scene library (appears in >= 2 episodes)
  colorPalette?: string;              // Overall color palette

  // === 制作设定 ===
  language?: string;
  promptLanguage?: PromptLanguage;
  calibrationStrictness?: CalibrationStrictness;
  metadataMarkdown?: string;          // AI Knowledge Base MD
  metadataGeneratedAt?: number;
}

// Episode（Episode）
export interface Episode {
  id: string;
  index: number;
  title: string;
  description?: string;
  sceneIds: string[]; // Scene IDs included in this episode
}

export interface ScriptData {
  title: string;
  genre?: string;
  logline?: string;
  language: string;
  targetDuration?: string;
  characters: ScriptCharacter[];
  scenes: ScriptScene[];
  episodes: Episode[]; // Episodes list
  storyParagraphs: ScriptParagraph[];
}

// ==================== Video拍摄控制类型（灯光/焦点/器材/特效/速度） ====================

// 灯光师 (Gaffer)
export type LightingStyle = 
  | 'high-key'      // 高调：明亮、低对比，适合喜剧/日常
  | 'low-key'       // 低调：暗沉、高对比，适合悬疑/noir
  | 'silhouette'    // 剪影：逆光全黑轮廓
  | 'chiaroscuro'   // 明暗法：伦勃朗式强烈明暗
  | 'natural'       // 自然光：真实日光感
  | 'neon'          // 霓虹：赛博朋克/夜店
  | 'candlelight'   // 烛光：暖黄微弱光
  | 'moonlight';    // 月光：冷蓝柔和

export type LightingDirection = 
  | 'front'         // 正面光：平坦、None阴影
  | 'side'          // 侧光：强调轮廓和纹理
  | 'back'          // 逆光：轮廓光/剪影
  | 'top'           // 顶光：审讯感/戏剧性
  | 'bottom'        // 底光：恐怖/不自然
  | 'rim'           // 轮廓光：边缘Hair光，与背景分离
  | 'three-point';  // 三点布光：Standard影视照明

export type ColorTemperature = 
  | 'warm'          // 暖色 3200K：烛光/钨丝灯
  | 'neutral'       // 中性 5500K：日光
  | 'cool'          // 冷色 7000K：阴天/月光
  | 'golden-hour'   // 黄金时段：日出日落
  | 'blue-hour'     // 蓝调时分：日落后
  | 'mixed';        // 混合色温：冷暖交织

// 跟焦员 (Focus Puller / 1st AC)
export type DepthOfField = 
  | 'ultra-shallow' // f/1.4 极浅：只有眼睛清晰，强烈虚化
  | 'shallow'       // f/2.8 浅：人物清晰，背景虚化
  | 'medium'        // f/5.6 中等：前景到Medium Shot清晰
  | 'deep'          // f/11 深：全画面清晰
  | 'split-diopter';// 分屈光镜：前后都清晰但中间虚

export type FocusTransition = 
  | 'rack-to-fg'    // 转焦到前景
  | 'rack-to-bg'    // 转焦到背景
  | 'rack-between'  // 人物间转焦
  | 'pull-focus'    // 跟焦（跟随运动主体）
  | 'none';         // 固定焦点

// 器材组 (Camera Rig)
export type CameraRig = 
  | 'tripod'        // 三脚架：绝对稳定
  | 'handheld'      // 手持：呼吸感/纪实/紧张
  | 'steadicam'     // 斯坦尼康：丝滑跟随
  | 'dolly'         // 轨道车：匀速直线推拉
  | 'crane'         // 摇臂：垂直升降/大幅弧线
  | 'drone'         // 航拍：俯瞰/大范围运动
  | 'shoulder'      // 肩扛：轻微晃动/新闻纪实
  | 'slider';       // 滑轨：短距离平滑移动

export type MovementSpeed = 'very-slow' | 'slow' | 'normal' | 'fast' | 'very-fast';

// 特效师 (On-set SFX)
export type AtmosphericEffect = 
  | 'rain'          | 'heavy-rain'     // 雨 / 暴雨
  | 'snow'          | 'blizzard'       // 雪 / 暴风雪
  | 'fog'           | 'mist'           // 浓雾 / 薄雾
  | 'dust'          | 'sandstorm'      // 尘土 / 沙暴
  | 'smoke'         | 'haze'           // 烟雾 / 薄霾
  | 'fire'          | 'sparks'         // 火焰 / 火花
  | 'lens-flare'    | 'light-rays'     // Shot光晕 / 丁达尔效应
  | 'falling-leaves'| 'cherry-blossom' // 落叶 / 樱花
  | 'fireflies'     | 'particles';     // 萤火虫 / 粒子

export type EffectIntensity = 'subtle' | 'moderate' | 'heavy';

// 速度控制 (Speed Ramping)
export type PlaybackSpeed = 
  | 'slow-motion-4x'  // 0.25x 超慢：子弹时间
  | 'slow-motion-2x'  // 0.5x 慢动作：动作高潮
  | 'normal'           // 1x
  | 'fast-2x'          // 2x 快进：时间流逝
  | 'timelapse';       // 延时摄影

// 拍摄角度 (Camera Angle)
export type CameraAngle =
  | 'eye-level'      // Eye Level：自然Viewpoint
  | 'high-angle'     // 俯拍：居高临下
  | 'low-angle'      // 仰拍：英雄感
  | 'birds-eye'      // 鸟瞰：俄视俄视
  | 'worms-eye'      // 虫视：极端低角
  | 'over-shoulder'  // 过肩：对话Scene
  | 'side-angle'     // 侧拍：侧面Viewpoint
  | 'dutch-angle'    // 荷兰角：倾斜不安感
  | 'third-person';  // 第三人称：游戏Viewpoint

// Shot焦距 (Focal Length)
export type FocalLength =
  | '8mm'    // 鱼眼：极端桶形畸变
  | '14mm'   // 超广角：强烈透视感
  | '24mm'   // 广角：环境上下文
  | '35mm'   // Standard广角：街拍/纪实感
  | '50mm'   // Standard：接近人眼Viewpoint
  | '85mm'   // 人像：脸部比例舒适
  | '105mm'  // 中焦：柔和背景压缩
  | '135mm'  // 长焦：强背景压缩
  | '200mm'  // 远摄：极端压缩
  | '400mm'; // 超长焦：最强压缩

// 摄影技法 (Photography Technique)
export type PhotographyTechnique =
  | 'long-exposure'        // 长曝光：运动模糊/光迹
  | 'double-exposure'      // 多重曝光：叠加透明效果
  | 'macro'                // 微距：极近细节
  | 'tilt-shift'           // 移轴：微缩效果
  | 'high-speed'           // 高速快门：冻结动作
  | 'bokeh'                // 浅景深虚化：梦幻光斑
  | 'reflection'           // 反射/镜面拍摄
  | 'silhouette-technique';// 剪影拍摄

// 场记/连戏 (Script Supervisor / Continuity)
export interface ContinuityCharacterState {
  position: string;      // "画面左侧站立"
  clothing: string;      // "蓝色西装，领带松开"
  expression: string;    // "眉头紧皱"
  props: string[];       // ["手持信封", "左手插兜"]
}

export interface ContinuityRef {
  prevShotId: string | null;         // 上一Shot ID
  nextShotId: string | null;         // 下一Shot ID
  prevEndFrameUrl: string | null;    // 上一ShotTail Frame（自动填充）
  characterStates: Record<string, ContinuityCharacterState>;  // charName -> 状态快照
  lightingContinuity: string;        // "与上一Shot保持同一侧光方向"
  flaggedIssues: string[];           // AI 自动检测的穿帮风险
}

export type ShotStatus = 'idle' | 'generating' | 'completed' | 'failed';
export type KeyframeStatus = 'pending' | 'generating' | 'completed' | 'failed';
export type KeyframeType = 'start' | 'end';

/**
 * Keyframe for shot generation (start/end frames for video)
 * Based on CineGen-AI types.ts
 */
export interface Keyframe {
  id: string;
  type: KeyframeType;
  visualPrompt: string;
  imageUrl?: string;
  status: KeyframeStatus;
}

/**
 * Video interval data
 */
export interface VideoInterval {
  videoUrl?: string;
  duration?: number;
  status: ShotStatus;
}

export interface Shot {
  id: string;
  index: number;
  episodeId?: string;        // 所属EpisodeID
  sceneRefId: string;        // Script scene id
  sceneId?: string;          // Scene store id
  sceneViewpointId?: string; // 关联的SceneViewpointID（联合图切割后的Viewpoint）
  
  // === Shot核心信息 ===
  actionSummary: string;     // Action Description（用户语言）
  visualDescription?: string; // 详细的Visual Description（用户语言，如：“法坛Wide Shot，黑暗中微弱光芒笼罩...”）
  completionStatus?: CompletionStatus;
  
  // === Shot语言 ===
  cameraMovement?: string;   // 鎡头运动（Dolly In, Pan Right, Static, Tracking等）
  specialTechnique?: string; // 特殊拍摄手法（希区柯克变焦、子弹时间、FPV穿梭等）
  shotSize?: string;         // 景别（Wide Shot, Medium Shot, Close-up, ECU等）
  duration?: number;         // 预估Duration（sec）
  
  // === 视觉生成 ===
  visualPrompt?: string;     // 英文视觉描述（用于Image Generation，兼容旧版）
  
  // === 三层Prompt系统 (Seedance 1.5 Pro) ===
  imagePrompt?: string;      // First FramePrompt（英文，静态描述）
  imagePromptZh?: string;    // First FramePrompt（中文）
  videoPrompt?: string;      // VideoPrompt（英文，动态动作）
  videoPromptZh?: string;    // VideoPrompt（中文）
  endFramePrompt?: string;   // Tail FramePrompt（英文，静态描述）
  endFramePromptZh?: string; // Tail FramePrompt（中文）
  needsEndFrame?: boolean;   // 是否需要Tail Frame
  
  // === Audio设计 ===
  dialogue?: string;         // 对白/Dialogue
  ambientSound?: string;     // 环境声（如：“沉重的风声伴随空旷堂内回响”）
  soundEffect?: string;      // Sound Effect（如：“远处悠长的钟声”）
  
  // === Character Info ===
  characterNames?: string[];
  characterIds: string[];
  characterVariations: Record<string, string>; // charId -> variationId
  
  // === Mood标签 ===
  emotionTags?: string[];  // Mood标签 ID 数组，如 ['sad', 'tense', 'serious']
  
  // === 叙事驱动字段（基于《电影语言的语法》） ===
  narrativeFunction?: string;   // 叙事Feature：铺垫/升级/高潮/转折/过渡/尾声
  conflictStage?: string;       // 冲突阶段：引入/激化/对抗/转折/解决/余波/辅助
  shotPurpose?: string;         // Shot目的：此Shot如何服务于故事核心
  storyAlignment?: string;      // 与世界观/故事核心的一致性：aligned/minor-deviation/needs-review
  visualFocus?: string;         // 视觉焦点：观众应该看什么（按顺序）
  cameraPosition?: string;      // 机位描述：摄影机相对于人物的位置
  characterBlocking?: string;   // 人物布局：人物在画面中的位置关系
  rhythm?: string;              // 节奏描述：这Shot的节奏感

  // === 灯光师 (Gaffer) ===
  lightingStyle?: LightingStyle;           // 灯光风格预设
  lightingDirection?: LightingDirection;   // 主光源方向
  colorTemperature?: ColorTemperature;     // 色温
  lightingNotes?: string;                  // 灯光自由描述（补充）

  // === 跟焦员 (Focus Puller) ===
  depthOfField?: DepthOfField;             // 景深
  focusTarget?: string;                    // 焦点目标: "人物面部" / "桌上的信封"
  focusTransition?: FocusTransition;       // 转焦动作

  // === 器材组 (Camera Rig) ===
  cameraRig?: CameraRig;                   // 拍摄器材
  movementSpeed?: MovementSpeed;           // 运动速度

  // === 特效师 (On-set SFX) ===
  atmosphericEffects?: AtmosphericEffect[]; // 氛围特效（可多选）
  effectIntensity?: EffectIntensity;       // 特效强度

  // === 速度控制 (Speed Ramping) ===
  playbackSpeed?: PlaybackSpeed;           // 播放速度

  // === 拍摄角度 / 焦距 / 技法 ===
  cameraAngle?: CameraAngle;               // 拍摄角度
  focalLength?: FocalLength;               // Shot焦距
  photographyTechnique?: PhotographyTechnique; // 摄影技法

  // === 场记/连戏 (Continuity) ===
  continuityRef?: ContinuityRef;           // 连戏参考

  // Keyframes for start/end frame generation (CineGen-AI pattern)
  keyframes?: Keyframe[];

  // Generation (legacy single-image mode)
  imageStatus: ShotStatus;
  imageProgress: number;
  imageError?: string;
  imageUrl?: string;
  imageMediaId?: string;

  // Video generation
  videoStatus: ShotStatus;
  videoProgress: number;
  videoError?: string;
  videoUrl?: string;
  videoMediaId?: string;
  
  // Video interval (CineGen-AI pattern)
  interval?: VideoInterval;
}
