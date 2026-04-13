// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * RunningHub Angle Constants
 * 96种Viewpoint定义：8方向 × 4俯仰角 × 3景别
 */

export type HorizontalDirection = 
  | 'front'              // 正面 0°
  | 'front-right-quarter' // 右前 45°
  | 'right-side'         // 右侧 90°
  | 'back-right-quarter' // 右后 135°
  | 'back'               // 背面 180°
  | 'back-left-quarter'  // 左后 225°
  | 'left-side'          // 左侧 270°
  | 'front-left-quarter'; // 左前 315°

export type ElevationAngle = 
  | 'low-angle'    // Low Angle
  | 'eye-level'    // Eye Level
  | 'elevated'     // 微Bird's Eye View
  | 'high-angle';  // 大Bird's Eye View

export type ShotSize = 
  | 'close-up'      // Close-up
  | 'medium-shot'   // Medium Shot
  | 'wide-shot';    // Long Shot

export interface AnglePreset {
  id: string;
  direction: HorizontalDirection;
  elevation: ElevationAngle;
  shotSize: ShotSize;
  prompt: string;
  label: {
    zh: string;
    en: string;
  };
}

// 水平方向定义
export const HORIZONTAL_DIRECTIONS: Array<{
  id: HorizontalDirection;
  label: string;
  degrees: number;
}> = [
  { id: 'front', label: 'Front', degrees: 0 },
  { id: 'front-right-quarter', label: 'Front-Right', degrees: 45 },
  { id: 'right-side', label: 'Right Side', degrees: 90 },
  { id: 'back-right-quarter', label: 'Back-Right', degrees: 135 },
  { id: 'back', label: 'Back', degrees: 180 },
  { id: 'back-left-quarter', label: 'Back-Left', degrees: 225 },
  { id: 'left-side', label: 'Left Side', degrees: 270 },
  { id: 'front-left-quarter', label: 'Front-Left', degrees: 315 },
];

// 俯仰角度定义
export const ELEVATION_ANGLES: Array<{
  id: ElevationAngle;
  label: string;
  description: string;
}> = [
  { id: 'low-angle', label: 'Low Angle', description: 'Shot from below looking up' },
  { id: 'eye-level', label: 'Eye Level', description: 'Horizontal eye-level angle' },
  { id: 'elevated', label: 'Slight High Angle', description: 'Slightly elevated high angle' },
  { id: 'high-angle', label: 'High Angle', description: 'Shot from above looking down' },
];

// 景别定义
export const SHOT_SIZES: Array<{
  id: ShotSize;
  label: string;
  description: string;
}> = [
  { id: 'close-up', label: 'Close-up', description: 'Close-up' },
  { id: 'medium-shot', label: 'Medium Shot', description: 'Medium Shot' },
  { id: 'wide-shot', label: 'Long Shot', description: 'Wide Shot' },
];

// 方向到Prompt的精确映射
const DIRECTION_PROMPTS: Record<HorizontalDirection, string> = {
  'front': 'front view',
  'front-right-quarter': 'front-right quarter view',
  'right-side': 'right side view',
  'back-right-quarter': 'back-right quarter view',
  'back': 'back view',
  'back-left-quarter': 'back-left quarter view',
  'left-side': 'left side view',
  'front-left-quarter': 'front-left quarter view',
};

// 俯仰角到Prompt的精确映射
const ELEVATION_PROMPTS: Record<ElevationAngle, string> = {
  'low-angle': 'low-angle shot',
  'eye-level': 'eye-level shot',
  'elevated': 'elevated shot',
  'high-angle': 'high-angle shot',
};

// 景别到Prompt的精确映射
const SHOT_SIZE_PROMPTS: Record<ShotSize, string> = {
  'close-up': 'close-up',
  'medium-shot': 'medium shot',
  'wide-shot': 'wide shot',
};

/**
 * 生成单Viewpoint的Prompt
 * 精确匹配96种StandardPrompt格式
 */
export function generateAnglePrompt(
  direction: HorizontalDirection,
  elevation: ElevationAngle,
  shotSize: ShotSize
): string {
  const directionText = DIRECTION_PROMPTS[direction];
  const elevationText = ELEVATION_PROMPTS[elevation];
  const shotSizeText = SHOT_SIZE_PROMPTS[shotSize];
  
  return `<sks> ${directionText} ${elevationText} ${shotSizeText}`;
}

/**
 * 生成所有96种Viewpoint预设
 */
export function generateAllAnglePresets(): AnglePreset[] {
  const presets: AnglePreset[] = [];
  
  for (const direction of HORIZONTAL_DIRECTIONS) {
    for (const elevation of ELEVATION_ANGLES) {
      for (const shotSize of SHOT_SIZES) {
        const prompt = generateAnglePrompt(
          direction.id,
          elevation.id,
          shotSize.id
        );
        
        const id = `${direction.id}-${elevation.id}-${shotSize.id}`;
        
        presets.push({
          id,
          direction: direction.id,
          elevation: elevation.id,
          shotSize: shotSize.id,
          prompt,
          label: {
            zh: `${direction.label} ${elevation.label} ${shotSize.label}`,
            en: prompt.replace('<sks> ', ''),
          },
        });
      }
    }
  }
  
  return presets;
}

/**
 * 获取中文标签
 */
export function getAngleLabel(
  direction: HorizontalDirection,
  elevation: ElevationAngle,
  shotSize: ShotSize
): string {
  const dir = HORIZONTAL_DIRECTIONS.find(d => d.id === direction)?.label || '';
  const elev = ELEVATION_ANGLES.find(e => e.id === elevation)?.label || '';
  const size = SHOT_SIZES.find(s => s.id === shotSize)?.label || '';
  
  return `${dir} ${elev} ${size}`;
}

/**
 * 常用Viewpoint快捷方式
 */
export const COMMON_ANGLES: Array<{
  name: string;
  preset: Pick<AnglePreset, 'direction' | 'elevation' | 'shotSize'>;
}> = [
  {
    name: 'Front Eye-Level Medium Shot',
    preset: { direction: 'front', elevation: 'eye-level', shotSize: 'medium-shot' },
  },
  {
    name: 'Front-Right Eye-Level Medium Shot',
    preset: { direction: 'front-right-quarter', elevation: 'eye-level', shotSize: 'medium-shot' },
  },
  {
    name: 'Side Eye-Level Medium Shot',
    preset: { direction: 'right-side', elevation: 'eye-level', shotSize: 'medium-shot' },
  },
  {
    name: 'Back Eye-Level Medium Shot',
    preset: { direction: 'back', elevation: 'eye-level', shotSize: 'medium-shot' },
  },
];
