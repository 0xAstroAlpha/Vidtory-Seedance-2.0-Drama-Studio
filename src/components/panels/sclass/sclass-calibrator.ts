// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * S级「组级 AI 校准」核心模块
 *
 * Feature：
 * 1. 读取组内各 SplitScene 数据（只读，不修改 director-store）
 * 2. 调用 LLM 生成组级叙事弧线、Shot过渡、Audio设计、优化 prompt
 * 3. 写入 sclass-store 的 ShotGroup 校准字段
 *
 * 数据安全：
 * - 只读 director-store，零污染原始剧本数据
 * - 产物只写 sclass-store.ShotGroup 的校准字段
 */

import type { SplitScene } from '@/stores/director-store';
import type { ShotGroup } from '@/stores/sclass-store';
import type { Character } from '@/stores/character-library-store';
import type { Scene } from '@/stores/scene-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';
import { useSClassStore } from '@/stores/sclass-store';

// ==================== 类型定义 ====================

/** 校准产物（AI 输出的 4 项组级优化数据） */
export interface CalibrationResult {
  /** 组级叙事弧线描述 */
  narrativeArc: string;
  /** Shot间过渡指令（长度 = scenes.length - 1） */
  transitions: string[];
  /** 组级Audio设计（整段 15s 规划） */
  groupAudioDesign: string;
  /** AI 优化后的组级 prompt */
  calibratedPrompt: string;
}

// ==================== 内部工具 ====================

/**
 * 从 SplitScene 提取摘要信息（用于构建 AI 输入，不泄漏多余字段）
 */
function summarizeScene(scene: SplitScene, characters: Character[]): string {
  const charNames = (scene.characterIds || [])
    .map(id => characters.find(c => c.id === id)?.name)
    .filter(Boolean)
    .join('、');

  const parts: string[] = [];
  parts.push(`Scene：${scene.sceneName || 'Untitled'}`);
  if (scene.sceneLocation) parts.push(`Location：${scene.sceneLocation}`);
  parts.push(`Duration：${scene.duration || 5}s`);
  if (charNames) parts.push(`角色：${charNames}`);
  if (scene.actionSummary) parts.push(`动作：${scene.actionSummary}`);
  if (scene.cameraMovement) parts.push(`运镜：${scene.cameraMovement}`);
  if (scene.dialogue) parts.push(`对白：${scene.dialogue}`);
  if (scene.ambientSound) parts.push(`Ambient Sound：${scene.ambientSound}`);
  if (scene.soundEffectText) parts.push(`Sound Effect：${scene.soundEffectText}`);
  if (scene.emotionTags?.length) parts.push(`Mood：${scene.emotionTags.join('、')}`);
  if (scene.narrativeFunction) parts.push(`叙事Feature：${scene.narrativeFunction}`);

  return parts.join('\n  ');
}

// ==================== 核心函数 ====================

/**
 * 校准单组
 *
 * @param group       目标组（只读 sceneIds）
 * @param scenes      组内 SplitScene[]（只读，来自 director-store）
 * @param characters  Character Library（用于名称映射）
 * @param sceneLibrary Scene库（备用上下文）
 * @returns CalibrationResult
 */
export async function calibrateGroup(
  group: ShotGroup,
  scenes: SplitScene[],
  characters: Character[],
  _sceneLibrary: Scene[],
): Promise<CalibrationResult> {
  if (scenes.length === 0) {
    throw new Error('组内NoneShot，None法校准');
  }

  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 5), 0);

  // ---- 构建输入 ----
  const sceneSummaries = scenes.map((s, i) =>
    `【Shot${i + 1}】\n  ${summarizeScene(s, characters)}`
  ).join('\n\n');

  const systemPrompt = `你是一位资深电影导演兼剪辑师，擅长多Shot叙事Video的节奏把控和叙事连贯性优化。

【核心约束 — 严格执行】
1. 严格基于以下Shot数据，不得Add剧本中不存在的角色、Scene或对白。
2. 只做叙事连贯优化和过渡设计，不改变各Shot的核心内容和Mood基调。
3. 保留每Shot的原有运镜和动作设计，只在Shot衔接处增加过渡指令。
4. Audio设计必须基于各Shot已有的Ambient Sound/Sound Effect信息，不凭空创造新音源。
5. calibratedPrompt 是对所有Shot的整合重写，必须包含每Shot的核心信息，不遗漏。

请以 JSON 格式Back，不要有任何解释文字。`;

  const userPrompt = `【组信息】
组名：${group.name}
Shot数：${scenes.length}
总Duration：${totalDuration}s

${sceneSummaries}

请输出以下 JSON：
{
  "narrativeArc": "用一句话描述这组Shot的叙事弧线（起承转合）",
  "transitions": [
    "Shot1→Shot2 的过渡指令（如：画面溶解、硬切、声桥过渡等）"
  ],
  "groupAudioDesign": "整段 ${totalDuration}s 的Audio设计规划（Ambient Sound层次、Sound Effect时机、Mood曲线）",
  "calibratedPrompt": "整合优化后的完整组级Prompt，中文，用于 Seedance 2.0 多Shot叙事Video Generation"
}

transitions 数组长度必须为 ${scenes.length - 1}（每两相邻Shot之间一条）。
calibratedPrompt 必须覆盖全部 ${scenes.length} Shot，保持Shot编号和时间轴。`;

  // ---- 调用 LLM ----
  const raw = await callFeatureAPI('script_analysis', systemPrompt, userPrompt, {
    temperature: 0.3, // 低温度确保稳定输出
    maxTokens: 4096,
  });

  // ---- 解析 JSON ----
  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI Back的 JSON Parsing failed，Please retry');
  }

  // ---- 校验 & 容错 ----
  const result: CalibrationResult = {
    narrativeArc: typeof parsed.narrativeArc === 'string' ? parsed.narrativeArc : '',
    transitions: Array.isArray(parsed.transitions) ? parsed.transitions.map(String) : [],
    groupAudioDesign: typeof parsed.groupAudioDesign === 'string' ? parsed.groupAudioDesign : '',
    calibratedPrompt: typeof parsed.calibratedPrompt === 'string' ? parsed.calibratedPrompt : '',
  };

  // transitions 长度修正
  const expectedLen = Math.max(scenes.length - 1, 0);
  if (result.transitions.length > expectedLen) {
    result.transitions = result.transitions.slice(0, expectedLen);
  }
  while (result.transitions.length < expectedLen) {
    result.transitions.push('自然过渡');
  }

  if (!result.calibratedPrompt) {
    throw new Error('AI 未Back有效的 calibratedPrompt');
  }

  return result;
}

// ==================== Store 写入 ====================

/**
 * 执行校准并写入 store
 *
 * 这是 UI 层应该调用的入口。处理状态更新和Error。
 */
export async function runCalibration(
  groupId: string,
  scenes: SplitScene[],
  characters: Character[],
  sceneLibrary: Scene[],
): Promise<boolean> {
  const store = useSClassStore.getState();
  const projectData = store.activeProjectId
    ? store.getProjectData(store.activeProjectId)
    : null;
  const group = projectData?.shotGroups.find(g => g.id === groupId);
  if (!group) {
    console.error('[SClassCalibrator] 找不到组:', groupId);
    return false;
  }

  // 标记校准中
  store.updateShotGroup(groupId, {
    calibrationStatus: 'calibrating',
    calibrationError: null,
  });

  try {
    const result = await calibrateGroup(group, scenes, characters, sceneLibrary);

    // 写入校准产物
    store.updateShotGroup(groupId, {
      narrativeArc: result.narrativeArc,
      transitions: result.transitions,
      groupAudioDesign: result.groupAudioDesign,
      calibratedPrompt: result.calibratedPrompt,
      calibrationStatus: 'done',
      calibrationError: null,
    });

    console.log(`[SClassCalibrator] ✅ 组「${group.name}」校准Done`);
    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SClassCalibrator] ❌ 组「${group.name}」校准Failed:`, errMsg);

    store.updateShotGroup(groupId, {
      calibrationStatus: 'failed',
      calibrationError: errMsg,
    });

    return false;
  }
}

/**
 * 批量校准所有未校准的组
 *
 * @returns Success数 / 总数
 */
export async function runBatchCalibration(
  scenes: SplitScene[],
  characters: Character[],
  sceneLibrary: Scene[],
): Promise<{ success: number; total: number }> {
  const store = useSClassStore.getState();
  const projectData = store.activeProjectId
    ? store.getProjectData(store.activeProjectId)
    : null;

  if (!projectData) return { success: 0, total: 0 };

  // 筛选需要校准的组（未校准 或 校准Failed）
  const groups = projectData.shotGroups.filter(g =>
    !g.calibrationStatus || g.calibrationStatus === 'idle' || g.calibrationStatus === 'failed'
  );

  let success = 0;
  for (const group of groups) {
    const groupScenes = scenes.filter(s => group.sceneIds.includes(s.id));
    if (groupScenes.length === 0) continue;

    const ok = await runCalibration(group.id, groupScenes, characters, sceneLibrary);
    if (ok) success++;
  }

  return { success, total: groups.length };
}
