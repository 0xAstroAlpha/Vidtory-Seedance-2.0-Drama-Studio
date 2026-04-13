// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Viewpoint Analyzer
 * 
 * 使用 AI 分析Scene和Shot内容，智能生成合适的Viewpoint列表
 * 替代原有的硬编码Keywords匹配
 */

import type { Shot, ScriptScene } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';

export interface AnalyzedViewpoint {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  keyProps: string[];
  keyPropsEn: string[];
  shotIndexes: number[];  // 关联的ShotIndex
}

export interface ViewpointAnalysisResult {
  viewpoints: AnalyzedViewpoint[];
  analysisNote: string;
}

export interface ViewpointAnalysisOptions {
  /** 本Episode大纲/Plot摘要 */
  episodeSynopsis?: string;
  /** 本Episode关键事件 */
  keyEvents?: string[];
  /** 剧名 */
  title?: string;
  /** 类型（商战/武侠/爱情等） */
  genre?: string;
  /** 时代背景 */
  era?: string;
  /** 世界观/风格设定 */
  worldSetting?: string;
}

/**
 * AI 分析SceneViewpoint
 * 根据Scene信息和Shot内容，智能生成该Scene需要的Viewpoint列表
 */
export async function analyzeSceneViewpoints(
  scene: ScriptScene,
  shots: Shot[],
  options?: ViewpointAnalysisOptions
): Promise<ViewpointAnalysisResult> {
  
  // 如果没有Shot，Back默认Viewpoint
  if (shots.length === 0) {
    return {
      viewpoints: [
        { id: 'overview', name: 'Wide Shot', nameEn: 'Overview', description: '整体空间', descriptionEn: 'Overall space', keyProps: [], keyPropsEn: [], shotIndexes: [] },
        { id: 'detail', name: '细节', nameEn: 'Detail', description: '细节Close-up', descriptionEn: 'Detail close-up', keyProps: [], keyPropsEn: [], shotIndexes: [] },
      ],
      analysisNote: 'NoneShot，使用默认Viewpoint',
    };
  }
  
  // 构建Shot内容摘要（使用更多详细字段）
  const shotSummaries = shots.map((shot, idx) => {
    const parts = [
      `【Shot${idx + 1}】`,
      shot.actionSummary && `Action Description: ${shot.actionSummary}`,
      shot.visualDescription && `Visual Description: ${shot.visualDescription}`,
      shot.visualFocus && `视觉焦点: ${shot.visualFocus}`,
      shot.dialogue && `对白: ${shot.dialogue.slice(0, 80)}`,
      shot.ambientSound && `环境声: ${shot.ambientSound}`,
      shot.characterBlocking && `人物布局: ${shot.characterBlocking}`,
      shot.shotSize && `景别: ${shot.shotSize}`,
      shot.cameraMovement && `Shot运动: ${shot.cameraMovement}`,
    ].filter(Boolean);
    return parts.join('\n  ');
  }).join('\n\n');
  
  // 统一处理可选参数
  const opts = options || {};

  // 构建本Episode大纲部分
  const synopsisPart = opts.episodeSynopsis 
    ? `【本Episode大纲】\n${opts.episodeSynopsis}\n`
    : '';
  const keyEventsPart = opts.keyEvents && opts.keyEvents.length > 0
    ? `【本Episode关键事件】\n${opts.keyEvents.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n`
    : '';

  // 构建全局故事上下文
  const globalContextParts = [
    opts.title ? `剧名：《${opts.title}》` : '',
    opts.genre ? `类型：${opts.genre}` : '',
    opts.era ? `时代背景：${opts.era}` : '',
    opts.worldSetting ? `世界观：${opts.worldSetting.slice(0, 200)}` : '',
  ].filter(Boolean);
  const globalContextSection = globalContextParts.length > 0
    ? `【剧本信息】\n${globalContextParts.join('\n')}\n\n`
    : '';

  const systemPrompt = `你是专业的影视美术指导，擅长分析Scene并Confirm需要的拍摄Viewpoint。

${globalContextSection}【任务】
根据本Episode大纲、Scene信息和Shot内容，分析该Scene需要哪些不同的Viewpoint/机位来生成Scene背景图。

【重要原则】
1. Viewpoint必须与Scene类型匹配：
   - 大巴车/汽车Scene：车窗、座位区、过道、驾驶位等
   - Indoor家居：客厅、卧室、厨房、窗边等
   - 户外Scene：Wide Shot、Close Shot、特定地标等
   - 古代Scene：堂屋、庭院、案几等
2. 从Shot动作和Visual Description中提取实际需要的Viewpoint
3. 结合本Episode大纲理解Scene的叙事Feature，Confirm哪些Viewpoint是核心的
4. 每Viewpoint要有关键道具（从Shot的视觉焦点和环境声中提取）
5. 输出4-6Viewpoint

【Output Format】
Back JSON:
{
  "viewpoints": [
    {
      "id": "唯一ID如window/seat/overview",
      "name": "中文名称",
      "nameEn": "English Name",
      "description": "中文描述（20字内）",
      "descriptionEn": "English description",
      "keyProps": ["道具1", "道具2"],
      "keyPropsEn": ["prop1", "prop2"],
      "shotIndexes": [1, 2]  // 哪些Shot需要这Viewpoint
    }
  ],
  "analysisNote": "分析说明"
}`;

  const userPrompt = `${synopsisPart}${keyEventsPart}【Scene信息】
Location: ${scene.location || scene.name}
时间: ${scene.time || '日'}
氛围: ${scene.atmosphere || '平静'}

【Shot内容（Total ${shots.length} Shot）】
${shotSummaries}

请根据以上本Episode大纲和Shot内容，分析该Scene需要的Viewpoint，Back JSON。`;

  try {
    console.log('[analyzeSceneViewpoints] 🚀 开始调用 AI API...');
    console.log('[analyzeSceneViewpoints] Scene:', scene.location || scene.name);
    console.log('[analyzeSceneViewpoints] Shot数量:', shots.length);
    
    // 统一从服务映射获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
    
    console.log('[analyzeSceneViewpoints] ✅ AI API 调用Success，Back内容长度:', result.length);
    console.log('[analyzeSceneViewpoints] 原始响应前 200 字符:', result.slice(0, 200));
    
    // 解析 JSON
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    console.log('[analyzeSceneViewpoints] 🎯 JSON 解析Success，Viewpoint数量:', parsed.viewpoints?.length || 0);
    
    const viewpoints = (parsed.viewpoints || []).map((v: any, idx: number) => ({
      id: v.id || `viewpoint_${idx}`,
      name: v.name || 'UntitledViewpoint',
      nameEn: v.nameEn || 'Unnamed Viewpoint',
      description: v.description || '',
      descriptionEn: v.descriptionEn || '',
      keyProps: v.keyProps || [],
      keyPropsEn: v.keyPropsEn || [],
      shotIndexes: v.shotIndexes || [],
    }));
    
    console.log('[analyzeSceneViewpoints] 📦 BackViewpoint:', viewpoints.map((v: any) => v.name).join(', '));
    
    return {
      viewpoints,
      analysisNote: parsed.analysisNote || '',
    };
  } catch (error) {
    const err = error as Error;
    console.error('[analyzeSceneViewpoints] ❌ AI 分析Failed:');
    console.error('[analyzeSceneViewpoints] Error name:', err.name);
    console.error('[analyzeSceneViewpoints] Error message:', err.message);
    console.error('[analyzeSceneViewpoints] Error stack:', err.stack);
    
    // 降级：Back基础Viewpoint
    return {
      viewpoints: [
        { id: 'overview', name: 'Wide Shot', nameEn: 'Overview', description: '整体空间布局', descriptionEn: 'Overall spatial layout', keyProps: [], keyPropsEn: [], shotIndexes: [] },
        { id: 'medium', name: 'Medium Shot', nameEn: 'Medium Shot', description: 'Medium ShotViewpoint', descriptionEn: 'Medium view', keyProps: [], keyPropsEn: [], shotIndexes: [] },
        { id: 'detail', name: '细节', nameEn: 'Detail', description: '细节Close-up', descriptionEn: 'Detail close-up', keyProps: [], keyPropsEn: [], shotIndexes: [] },
      ],
      analysisNote: 'AI 分析Failed，使用默认Viewpoint',
    };
  }
}

/**
 * 批量分析多Scene的Viewpoint
 */
export async function analyzeMultipleScenesViewpoints(
  scenesWithShots: Array<{ scene: ScriptScene; shots: Shot[] }>,
  options: ViewpointAnalysisOptions,
  onProgress?: (current: number, total: number, sceneName: string) => void
): Promise<Map<string, ViewpointAnalysisResult>> {
  const results = new Map<string, ViewpointAnalysisResult>();
  
  for (let i = 0; i < scenesWithShots.length; i++) {
    const { scene, shots } = scenesWithShots[i];
    
    onProgress?.(i + 1, scenesWithShots.length, scene.name || scene.location || '未知Scene');
    
    const result = await analyzeSceneViewpoints(scene, shots, options);
    results.set(scene.id, result);
    
    // 避免 API 频率限制
    if (i < scenesWithShots.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}
