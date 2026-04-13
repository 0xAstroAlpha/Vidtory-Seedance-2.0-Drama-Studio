// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Full Script Service - 完整剧本Import和按EpisodeShot生成服务
 * 
 * 核心Feature：
 * 1. Import完整剧本（包含大纲、人物小传、60Episode内容）
 * 2. 按Episode生成Shot（一次生成一Episode）
 * 3. 更新单Episode或全部Shot
 * 4. AI校准：为缺失标题的Episodes生成标题
 */

import type {
  EpisodeRawScript,
  ProjectBackground,
  PromptLanguage,
  ScriptData,
  Shot,
  SceneRawContent,
} from "@/types/script";
import {
  parseFullScript,
  convertToScriptData,
  parseScenes,
} from "./episode-parser";
import { normalizeScriptFormat, analyzeScriptStructureWithAI, applyAIAnalysis, preprocessLineBreaks } from "./script-normalizer";
import { populateSeriesMetaFromImport } from "./series-meta-sync";
import { callFeatureAPI } from "@/lib/ai/feature-router";
import { processBatched } from "@/lib/ai/batch-processor";
import { useScriptStore } from "@/stores/script-store";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { retryOperation } from "@/lib/utils/retry";
import { ApiKeyManager } from "@/lib/api-key-manager";
import { getStyleDescription, getMediaType } from "@/lib/constants/visual-styles";
import { buildCinematographyGuidance } from "@/lib/constants/cinematography-profiles";
import { getMediaTypeGuidance } from "@/lib/generation/media-type-tokens";
import { getVariationForEpisode } from "./character-stage-analyzer";
import { analyzeSceneViewpoints, type ViewpointAnalysisOptions } from "./viewpoint-analyzer";
import { runStaggered } from "@/lib/utils/concurrency";
import { calibrateShotsMultiStage } from "./shot-calibration-stages";
import { buildSeriesContextSummary } from "./series-meta-sync";

export interface ImportResult {
  success: boolean;
  background: ProjectBackground | null;
  projectBackground?: ProjectBackground; // 兼容字段
  episodes: EpisodeRawScript[];
  scriptData: ScriptData | null;
  error?: string;
}

export interface GenerateShotsOptions {
  apiKey: string;
  provider: string;
  baseUrl?: string;
  styleId: string;
  targetDuration: string;
  promptLanguage?: import('@/types/script').PromptLanguage;
}

export interface GenerateEpisodeShotsResult {
  shots: Shot[];
  viewpointAnalyzed: boolean;
  viewpointSkippedReason?: string;
}

/**
 * Import完整剧本
 * @param fullText 完整剧本文本
 * @param projectId 项目ID
 */
export async function importFullScript(
  fullText: string,
  projectId: string,
  importSettings?: { styleId?: string; promptLanguage?: PromptLanguage }
): Promise<ImportResult> {
  try {
    // -1. 预处理：为单行/超长行文本自动插入换行
    const preprocessed = preprocessLineBreaks(fullText);
    const processedText = preprocessed.text;
    
    // 0. AI 结构检测（第一步）→ 正则兗底
    let normalizeResult;
    const aiAnalysis = await analyzeScriptStructureWithAI(processedText);
    
    if (aiAnalysis) {
      // AI 检测Success：基于 AI 结果插入标记 + 补全大纲
      normalizeResult = applyAIAnalysis(processedText, aiAnalysis);
      console.log('[importFullScript] AI 结构检测Done:', normalizeResult.changes);
    } else {
      // AI 不可用或Failed：降级到正则兗底
      normalizeResult = normalizeScriptFormat(processedText);
      if (normalizeResult.changes.length > 0) {
        console.log('[importFullScript] 正则兜底归一化:', normalizeResult.changes);
      }
    }
    
    // 1. 解析归一化后的文本
    const { background, episodes } = parseFullScript(normalizeResult.normalized);
    
    if (episodes.length === 0) {
      return {
        success: false,
        background: null,
        episodes: [],
        scriptData: null,
        error: "Failed to parse any episodes, please check script format",
      };
    }
    
    // 1.5 用 AI 的 era/genre 覆盖正则检测值（AI 更准确）
    if (normalizeResult.aiAnalysis) {
      if (normalizeResult.aiAnalysis.era) {
        background.era = normalizeResult.aiAnalysis.era;
      }
      if (normalizeResult.aiAnalysis.genre) {
        background.genre = normalizeResult.aiAnalysis.genre;
      }
    }
    
    // 2. 转换为 ScriptData 格式
    const scriptData = convertToScriptData(background, episodes);
    
    // 3. Save到 store（原文Save，归一化文本仅用于解析）
    const store = useScriptStore.getState();
    store.setProjectBackground(projectId, background);
    store.setEpisodeRawScripts(projectId, episodes);
    store.setScriptData(projectId, scriptData);
    store.setRawScript(projectId, fullText);
    store.setParseStatus(projectId, "ready");
    
    // 4. 构建剧级元数据（SeriesMeta）— 用户选的风格和语言直接传入
    const aiResult = normalizeResult.aiAnalysis || null;
    const seriesMeta = populateSeriesMetaFromImport(background, scriptData, aiResult, importSettings);
    store.setSeriesMeta(projectId, seriesMeta);
    
    // 5. Auto Generate项目元数据 MD（作为 AI 生成的全局参考）
    const metadataMd = exportProjectMetadata(projectId);
    store.setMetadataMarkdown(projectId, metadataMd);
    console.log('[importFullScript] 元数据已Auto Generate，长度:', metadataMd.length);
    
    return {
      success: true,
      background,
      projectBackground: background, // 同时Back两字段兼容
      episodes,
      scriptData,
    };
  } catch (error) {
    console.error("Import error:", error);
    return {
      success: false,
      background: null,
      episodes: [],
      scriptData: null,
      error: error instanceof Error ? error.message : "ImportFailed",
    };
  }
}

// ==================== 单Episode结构补全 ====================

export interface SingleEpisodeImportResult {
  success: boolean;
  sceneCount: number;
  error?: string;
}

/**
 * 单Episode结构补全 — 解析用户Paste的单Episode剧本内容为Scene结构
 *
 * 流程：
 * 1. preprocessLineBreaks → parseScenes → 转换为 ScriptScene[]
 * 2. 原子写回 store（episodeRawScripts + scriptData.scenes + episodes.sceneIds）
 * 3. 清理本Episode旧 shot
 * 4. 轻量 AI 生成标题+大纲（后台不阻塞）
 */
export async function importSingleEpisodeContent(
  rawContent: string,
  episodeIndex: number,
  projectId: string,
): Promise<SingleEpisodeImportResult> {
  const TAG = '[importSingleEpisodeContent]';

  try {
    const store = useScriptStore.getState();
    const project = store.projects[projectId];
    if (!project?.scriptData) {
      return { success: false, sceneCount: 0, error: 'Project or script data does not exist' };
    }

    const scriptData = project.scriptData;
    const episode = scriptData.episodes.find(e => e.index === episodeIndex);
    if (!episode) {
      return { success: false, sceneCount: 0, error: `Cannot find episode ${episodeIndex}` };
    }

    // === 1. 预处理 + Scene解析 ===
    const preprocessed = preprocessLineBreaks(rawContent);
    const rawScenes = parseScenes(preprocessed.text);
    console.log(`${TAG} 解析出 ${rawScenes.length} Scene`);

    if (rawScenes.length === 0) {
      // 没有Scene头也更新 rawContent
      store.updateEpisodeRawScript(projectId, episodeIndex, {
        rawContent,
        scenes: [],
      });
      return { success: true, sceneCount: 0 };
    }

    // === 2. SceneRawContent → ScriptScene ===
    const timestamp = Date.now();
    const timeMap: Record<string, string> = {
      '日': 'day', '夜': 'night', '晨': 'dawn', '暮': 'dusk',
      'Dusk': 'dusk', '黎明': 'dawn', '清晨': 'dawn', '傍晚': 'dusk',
    };
    const newScenes = rawScenes.map((scene, idx) => {
      const sceneId = `scene_ep${episodeIndex}_${timestamp}_${idx + 1}`;
      const headerParts = scene.sceneHeader.split(/\s+/);
      const timeOfDay = headerParts[1] || '日';
      const hasInterior = headerParts[2] && /^(内|外|内\/外)$/.test(headerParts[2]);
      const locStart = hasInterior ? 3 : 2;
      let loc = headerParts.slice(locStart).join(' ') || headerParts[headerParts.length - 1] || '未知';
      loc = loc.replace(/\s*(?:人物|角色)[：:].*/g, '').trim();

      let atmosphere = '平静';
      if (/紧张|危险|冲突|打斗|怒/.test(scene.content)) atmosphere = '紧张';
      else if (/温馨|幸福|笑|欢/.test(scene.content)) atmosphere = '温馨';
      else if (/悲伤|哭|痛|泪/.test(scene.content)) atmosphere = '悲伤';
      else if (/神秘|阴森|黑暗/.test(scene.content)) atmosphere = '神秘';

      return {
        id: sceneId,
        name: `${episodeIndex}-${idx + 1} ${loc}`,
        location: loc,
        time: timeMap[timeOfDay] || 'day',
        atmosphere,
      };
    });
    const newSceneIds = newScenes.map(s => s.id);

    // === 3. 原子写回 store ===
    const oldSceneIds = new Set(episode.sceneIds);
    const remainingScenes = scriptData.scenes.filter(s => !oldSceneIds.has(s.id));
    const remainingShots = project.shots.filter(s => !oldSceneIds.has(s.sceneRefId));

    // 更新 episodeRawScript
    store.updateEpisodeRawScript(projectId, episodeIndex, {
      rawContent,
      scenes: rawScenes,
    });

    // 更新 scriptData（Scene列表 + episode.sceneIds）
    store.setScriptData(projectId, {
      ...scriptData,
      scenes: [...remainingScenes, ...newScenes],
      episodes: scriptData.episodes.map(e =>
        e.index === episodeIndex ? { ...e, sceneIds: newSceneIds } : e
      ),
    });

    // 清理旧 shot
    if (remainingShots.length !== project.shots.length) {
      store.setShots(projectId, remainingShots);
      console.log(`${TAG} 清理旧 shot: ${project.shots.length - remainingShots.length} `);
    }

    console.log(`${TAG} 结构补全Done: ${newScenes.length} Scene`);

    // === 4. 轻量 AI 标题+大纲（后台不阻塞） ===
    generateSingleEpisodeTitleAndSynopsis(projectId, episodeIndex).catch(e => {
      console.warn(`${TAG} 标题/Outline generation failed（不影响结构补全）:`, e);
    });

    return { success: true, sceneCount: newScenes.length };
  } catch (error) {
    console.error('[importSingleEpisodeContent] Error:', error);
    return {
      success: false,
      sceneCount: 0,
      error: error instanceof Error ? error.message : 'Structure completion failed',
    };
  }
}

/**
 * 轻量 AI 为单Episode生成标题+大纲（后台任务，不阻塞结构补全）
 */
async function generateSingleEpisodeTitleAndSynopsis(
  projectId: string,
  episodeIndex: number,
): Promise<void> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  if (!project) return;

  const epRaw = project.episodeRawScripts.find(e => e.episodeIndex === episodeIndex);
  if (!epRaw || !epRaw.rawContent) return;

  // 已有有意义标题和大纲则跳过
  const hasTitle = epRaw.title && !/^第[\d一二三四五六七八九十百千]+Episode$/.test(epRaw.title.trim());
  const hasSynopsis = !!(epRaw.synopsis && epRaw.synopsis.trim().length > 0);
  if (hasTitle && hasSynopsis) return;

  const background = project.projectBackground;
  const seriesCtx = buildSeriesContextSummary(project.seriesMeta || null);
  const contentSummary = epRaw.rawContent.slice(0, 800);

  const system = `你是剧本结构分析专家。根据剧本全局背景和单Episode内容，生成该Episode的标题和大纲。
${seriesCtx ? `\n【剧级知识参考】\n${seriesCtx}\n` : ''}剧名：${background?.title || project.scriptData?.title || 'Untitled'}
类型：${background?.genre || '未知'}
${background?.era ? `时代：${background.era}` : ''}

请以 JSON 格式Back：
{
  "title": "6-15字标题（体现本Episode核心冲突/转折）",
  "synopsis": "100-200字大纲（概括本Episode主要Plot）",
  "keyEvents": ["关键事件1", "关键事件2", "关键事件3"]
}`;

  const user = `第${episodeIndex}Episode内容：\n${contentSummary}`;

  try {
    const result = await callFeatureAPI('script_analysis', system, user, {
      temperature: 0.3,
      maxTokens: 512,
    });
    if (!result) return;

    const jsonMatch = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);
    const updates: Partial<EpisodeRawScript> = {};

    if (!hasTitle && parsed.title) {
      const fullTitle = `第${episodeIndex}Episode：${parsed.title}`;
      updates.title = fullTitle;
      // 同步到 scriptData.episodes
      const cur = useScriptStore.getState();
      const sd = cur.projects[projectId]?.scriptData;
      if (sd) {
        cur.setScriptData(projectId, {
          ...sd,
          episodes: sd.episodes.map(e =>
            e.index === episodeIndex ? { ...e, title: fullTitle } : e
          ),
        });
      }
    }

    if (!hasSynopsis && parsed.synopsis) {
      updates.synopsis = parsed.synopsis;
      updates.keyEvents = parsed.keyEvents || [];
      updates.synopsisGeneratedAt = Date.now();
    }

    if (Object.keys(updates).length > 0) {
      useScriptStore.getState().updateEpisodeRawScript(projectId, episodeIndex, updates);
      console.log(`[generateSingleEpisodeTitleAndSynopsis] 第${episodeIndex}Episode标题/大纲Generated`);
    }
  } catch (e) {
    console.warn('[generateSingleEpisodeTitleAndSynopsis] AI 调用Failed:', e);
  }
}

/**
 * 为单Episode生成Shot
 * @param episodeIndex Episode索引（1-based）
 * @param projectId 项目ID
 * @param options 生成选项
 */
export async function generateEpisodeShots(
  episodeIndex: number,
  projectId: string,
  options: GenerateShotsOptions,
  onProgress?: (message: string) => void
): Promise<GenerateEpisodeShotsResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    throw new Error("Project does not exist");
  }
  
  const episodeScript = project.episodeRawScripts.find(
    (ep) => ep.episodeIndex === episodeIndex
  );
  
  if (!episodeScript) {
    throw new Error(`Cannot find script for episode ${episodeIndex}`);
  }
  
  // 更新Episode的生成状态
  store.updateEpisodeRawScript(projectId, episodeIndex, {
    shotGenerationStatus: 'generating',
  });
  
  try {
    onProgress?.(`Generating shots for episode ${episodeIndex}...`);
    
    // 获取该Episode对应的Scene
    const scriptData = project.scriptData;
    if (!scriptData) {
      throw new Error("Script data does not exist");
    }
    
    const episode = scriptData.episodes.find((ep) => ep.index === episodeIndex);
    if (!episode) {
      throw new Error(`Cannot find structure data for episode ${episodeIndex}`);
    }
    
    const episodeScenes = scriptData.scenes.filter((s) =>
      episode.sceneIds.includes(s.id)
    );
    
    // 构建Scene内容用于Shot生成
    const scenesWithContent = episodeScenes.map((scene, idx) => {
      const rawScene = episodeScript.scenes[idx];
      return {
        ...scene,
        // 使用原始内容生成Shot
        rawContent: rawScene?.content || '',
        dialogues: rawScene?.dialogues || [],
        actions: rawScene?.actions || [],
      };
    });
    
    // 生成Shot
    const newShots = await generateShotsForEpisode(
      scenesWithContent,
      episodeIndex,
      episode.id,
      scriptData.characters,
      options,
      onProgress
    );
    
    // 更新现有Shot（移除该Episode旧Shot，Add新Shot）
    const existingShots = project.shots.filter(
      (shot) => shot.episodeId !== episode.id
    );
    const allShots = [...existingShots, ...newShots];
    
    store.setShots(projectId, allShots);
    
    // === AI Viewpoint分析（Shot生成后自动执行）===
    let viewpointAnalyzed = false;
    let viewpointSkippedReason: string | undefined;
    let analysisExecuted = false;
    let viewpointCount = 0;
    
    console.log('\n============================================');
    console.log('[generateEpisodeShots] === 开始 AI Viewpoint分析 ===');
    console.log('[generateEpisodeShots] apiKey:', options.apiKey ? `Configured(长度${options.apiKey.length})` : 'Not Configured');
    console.log('[generateEpisodeShots] provider:', options.provider);
    console.log('[generateEpisodeShots] baseUrl:', options.baseUrl || '默认');
    console.log('[generateEpisodeShots] episodeScenes.length:', episodeScenes.length);
    console.log('[generateEpisodeShots] newShots.length:', newShots.length);
    console.log('============================================\n');
    
    if (!options.apiKey) {
      viewpointSkippedReason = 'apiKey Not Configured';
      console.error('[generateEpisodeShots] ❌ 跳过 AI Viewpoint分析: apiKey Not Configured');
    } else if (episodeScenes.length === 0) {
      viewpointSkippedReason = 'No scenes';
      console.warn('[generateEpisodeShots] ⚠️ 跳过 AI Viewpoint分析: No scenes');
    }
    
    if (options.apiKey && episodeScenes.length > 0) {
      onProgress?.(`AI analyzing scene viewpoints (Total ${episodeScenes.length} scenes)...`);
      
      try {
        // 获取本Episode大纲和关键事件
        const episodeSynopsis = episodeScript.synopsis || '';
        const keyEvents = episodeScript.keyEvents || [];
        
        console.log('[generateEpisodeShots] 本Episode大纲:', episodeSynopsis ? `Configured(${episodeSynopsis.length}字)` : 'Not Configured');
        console.log('[generateEpisodeShots] 关键事件:', keyEvents.length > 0 ? keyEvents.join(', ') : 'Not Configured');
        
        const background = project.projectBackground;
        const viewpointOptions: ViewpointAnalysisOptions = {
          episodeSynopsis,  // 传入本Episode大纲
          keyEvents,        // 传入关键事件
          title: background?.title,
          genre: background?.genre,
          era: background?.era,
          worldSetting: background?.worldSetting,
        };
        
        console.log('[generateEpisodeShots] viewpointOptions 已构建, genre:', viewpointOptions.genre || '未知');
        
        // 获取并Hair数配置（使用顶部静态Import的 store）
        // 智谱 API 并Hair限制较严，Viewpoint分析最多使用 10 并Hair
        const userConcurrency = useAPIConfigStore.getState().concurrency || 1;
        const concurrency = Math.min(userConcurrency, 10);
        console.log(`[generateEpisodeShots] 使用并Hair数: ${concurrency} (用户设置: ${userConcurrency}, 上限: 10)`);
        
        // 为每Scene分析Viewpoint（支持并Hair）
        const updatedScenes = [...scriptData.scenes];
        
        // 准备Scene分析任务
        const sceneAnalysisTasks = episodeScenes.map((scene, i) => ({
          scene,
          index: i,
          sceneShots: newShots.filter(s => s.sceneRefId === scene.id),
        })).filter(task => task.sceneShots.length > 0);
        
        console.log(`[generateEpisodeShots] 🚀 待分析Scene: ${sceneAnalysisTasks.length} ，并Hair数: ${concurrency}`);
        
        // 处理单Scene的函数
        const processScene = async (taskIndex: number) => {
          const task = sceneAnalysisTasks[taskIndex];
          const { scene, index: i, sceneShots } = task;
          
          console.log(`[generateEpisodeShots] Scene ${i + 1}/${episodeScenes.length}: "${scene.location}" 有 ${sceneShots.length} Shot`);
          analysisExecuted = true;
          onProgress?.(`AI analyzing scene ${i + 1}/${episodeScenes.length}: ${scene.location}...`);
          
          console.log(`[generateEpisodeShots] 🔄 调用 analyzeSceneViewpoints for "${scene.location}"...`);
          const result = await analyzeSceneViewpoints(scene, sceneShots, viewpointOptions);
          console.log(`[generateEpisodeShots] ✅ AI 分析Done，Back ${result.viewpoints.length} Viewpoint:`, 
            result.viewpoints.map(v => v.name).join(', '));
          console.log(`[generateEpisodeShots] 📝 analysisNote: ${result.analysisNote}`);
          
          return { scene, sceneShots, result };
        };
        
        // 错开启动的并Hair控制：每5sec启动一新任务，同时最多 concurrency 
        const settledResults = await runStaggered(
          sceneAnalysisTasks.map((_, taskIndex) => async () => {
            console.log(`[generateEpisodeShots] 🚀 启动Scene ${taskIndex + 1}/${sceneAnalysisTasks.length}`);
            return await processScene(taskIndex);
          }),
          concurrency,
          5000
        );
        
        // 处理所有结果
        for (const settledResult of settledResults) {
          if (settledResult.status === 'fulfilled') {
            const { scene, sceneShots, result } = settledResult.value;
            
            // 更新Scene的Viewpoint数据
            const sceneIndex = updatedScenes.findIndex(s => s.id === scene.id);
            if (sceneIndex !== -1) {
              const viewpointsData = result.viewpoints.map((v: any, idx: number) => ({
                id: v.id,
                name: v.name,
                nameEn: v.nameEn,
                shotIds: v.shotIndexes.map((si: number) => sceneShots[si - 1]?.id).filter(Boolean),
                keyProps: v.keyProps,
                gridIndex: idx,
              }));
              
              // 检查是否有未分配的Shot，并将它们分配到合适的Viewpoint
              const allAssignedShotIds = new Set(viewpointsData.flatMap((v: any) => v.shotIds));
              const unassignedShots = sceneShots.filter((s: any) => !allAssignedShotIds.has(s.id));
              
              if (unassignedShots.length > 0) {
                console.log(`[generateEpisodeShots] ⚠️ Hair现 ${unassignedShots.length} 未分配的Shot:`, unassignedShots.map((s: any) => s.id));
                
                // 策略：根据Shot内容智能分配到最匹配的Viewpoint
                for (const shot of unassignedShots) {
                  const shotText = [
                    shot.actionSummary,
                    shot.visualDescription,
                    shot.visualFocus,
                    shot.dialogue,
                  ].filter(Boolean).join(' ').toLowerCase();
                  
                  // 查找最匹配的Viewpoint
                  let bestViewpointIdx = 0;
                  let bestScore = 0;
                  
                  for (let vIdx = 0; vIdx < viewpointsData.length; vIdx++) {
                    const vp = viewpointsData[vIdx];
                    const vpName = vp.name.toLowerCase();
                    const vpKeywords = vp.keyProps || [];
                    
                    let score = 0;
                    const nameKeywords = vpName.replace(/(Viewpoint|区|位)$/g, '').split('');
                    for (const char of nameKeywords) {
                      if (shotText.includes(char)) score += 1;
                    }
                    for (const prop of vpKeywords) {
                      if (shotText.includes(prop.toLowerCase())) score += 2;
                    }
                    
                    if (score > bestScore) {
                      bestScore = score;
                      bestViewpointIdx = vIdx;
                    }
                  }
                  
                  if (bestScore === 0) {
                    const overviewIdx = viewpointsData.findIndex((v: any) => 
                      v.name.includes('Wide Shot') || v.id === 'overview'
                    );
                    bestViewpointIdx = overviewIdx >= 0 ? overviewIdx : 0;
                  }
                  
                  viewpointsData[bestViewpointIdx].shotIds.push(shot.id);
                  console.log(`[generateEpisodeShots]   - Shot ${shot.id} 分配到Viewpoint "${viewpointsData[bestViewpointIdx].name}" (score: ${bestScore})`);
                }
              }
              
              updatedScenes[sceneIndex] = {
                ...updatedScenes[sceneIndex],
                viewpoints: viewpointsData,
              };
              viewpointCount += viewpointsData.length;
              console.log(`[generateEpisodeShots] 💾 Scene "${scene.location}" viewpoints 已更新:`, viewpointsData);
            }
          } else {
            console.error(`[generateEpisodeShots] ❌ Scene分析Failed:`, settledResult.reason);
          }
        }
        
        // 跳过NoneShot的Scene日志
        const skippedScenes = episodeScenes.filter(scene => 
          !sceneAnalysisTasks.find(t => t.scene.id === scene.id)
        );
        for (const scene of skippedScenes) {
          console.log(`[generateEpisodeShots] ⏭️ 跳过Scene "${scene.location}" (NoneShot)`);
        }
        
        // Save更新后的Scene数据
        console.log('\n============================================');
        console.log('[generateEpisodeShots] 📦 Save AI Viewpoint到 scriptData.scenes...');
        console.log('[generateEpisodeShots] updatedScenes 中有Viewpoint的Scene:');
        updatedScenes.forEach(s => {
          if (s.viewpoints && s.viewpoints.length > 0) {
            console.log(`  - ${s.location}: ${s.viewpoints.length} Viewpoint [${s.viewpoints.map((v: any) => v.name).join(', ')}]`);
          }
        });
        
        store.setScriptData(projectId, {
          ...scriptData,
          scenes: updatedScenes,
        });
        
        console.log('[generateEpisodeShots] ✅ AI Viewpoint已Save到 store');
        console.log('[generateEpisodeShots] 总计 AI 分析Viewpoint数:', viewpointCount);
        console.log('============================================\n');
        
        viewpointAnalyzed = analysisExecuted;
        if (!analysisExecuted) {
          viewpointSkippedReason = 'NoneShot';
        }
        
        onProgress?.(`AI viewpoint analysis done (${viewpointCount} viewpoints)`);
      } catch (e) {
        const err = e as Error;
        console.error('\n============================================');
        console.error('[generateEpisodeShots] ❌ AI Viewpoint分析Failed:', err);
        console.error('[generateEpisodeShots] Error name:', err.name);
        console.error('[generateEpisodeShots] Error message:', err.message);
        console.error('[generateEpisodeShots] Error stack:', err.stack);
        console.error('============================================\n');
        viewpointSkippedReason = `AI analysis failed: ${err.message}`;
        // 不影响主流程，但记录详细Error
      }
    }
    
    store.updateEpisodeRawScript(projectId, episodeIndex, {
      shotGenerationStatus: 'completed',
      lastGeneratedAt: Date.now(),
    });
    
    onProgress?.(`Episode ${episodeIndex} shot generation done! Total ${newShots.length} shots`);
    
    return { shots: newShots, viewpointAnalyzed, viewpointSkippedReason };
  } catch (error) {
    store.updateEpisodeRawScript(projectId, episodeIndex, {
      shotGenerationStatus: 'error',
    });
    throw error;
  }
}

/**
 * 为指定Episode的Scene生成Shot
 */
async function generateShotsForEpisode(
  scenes: Array<{
    id: string;
    name?: string;
    location: string;
    time: string;
    atmosphere: string;
    rawContent: string;
    dialogues: Array<{ character: string; parenthetical?: string; line: string }>;
    actions: string[];
  }>,
  episodeIndex: number,
  episodeId: string,
  characters: Array<{ id: string; name: string }>,
  options: GenerateShotsOptions,
  onProgress?: (message: string) => void
): Promise<Shot[]> {
  const shots: Shot[] = [];
  let shotIndex = 1;
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    onProgress?.(`Processing scene ${i + 1}/${scenes.length}: ${scene.name || scene.location}`);
    
    // 基于Scene内容生成Shot
    const sceneShots = generateShotsFromSceneContent(
      scene,
      episodeId,
      shotIndex,
      characters
    );
    
    shots.push(...sceneShots);
    shotIndex += sceneShots.length;
  }
  
  return shots;
}

/**
 * 基于Scene原始内容生成Shot（规则化生成，不依赖AI）
 * 每对白或动作生成一Shot
 */
function generateShotsFromSceneContent(
  scene: {
    id: string;
    name?: string;
    location: string;
    time: string;
    atmosphere: string;
    rawContent: string;
    dialogues: Array<{ character: string; parenthetical?: string; line: string }>;
    actions: string[];
  },
  episodeId: string,
  startIndex: number,
  characters: Array<{ id: string; name: string }>
): Shot[] {
  const shots: Shot[] = [];
  let index = startIndex;
  
  // 解析Scene内容，按顺序生成Shot
  const lines = scene.rawContent.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // 跳过人物行和空行（包括 markdown 格式如 **人物：xxx**）
    if (!trimmedLine) continue;
    if (trimmedLine.startsWith('人物') || trimmedLine.startsWith('**人物')) continue;
    // 跳过纯 markdown 格式行（如 **xxx**）
    if (trimmedLine.match(/^\*\*[^人物\*]+\*\*$/)) continue;
    
    // 对白行
    const dialogueMatch = trimmedLine.match(/^([^：:（\([【\n△\*]{1,10})[：:]\s*(?:[（\(]([^）\)]+)[）\)])?\s*(.+)$/);
    if (dialogueMatch) {
      const charName = dialogueMatch[1].trim();
      const parenthetical = dialogueMatch[2]?.trim() || '';
      const dialogueText = dialogueMatch[3].trim();
      
      // 跳过非对白
      if (charName.match(/^[字幕NarrationScene人物]/)) continue;
      
      const charId = characters.find(c => c.name === charName)?.id || '';
      
      shots.push(createShot({
        index: index++,
        episodeId,
        sceneRefId: scene.id,
        actionSummary: `${charName}说话`,
        visualDescription: `${scene.location}，${charName}${parenthetical ? `（${parenthetical}）` : ''}说："${dialogueText.slice(0, 50)}${dialogueText.length > 50 ? '...' : ''}"`,
        dialogue: `${charName}${parenthetical ? `（${parenthetical}）` : ''}：${dialogueText}`,
        characterNames: [charName],
        characterIds: charId ? [charId] : [],
        shotSize: dialogueText.length > 30 ? 'MS' : 'CU',
        duration: Math.max(3, Math.ceil(dialogueText.length / 10)),
      }));
      continue;
    }
    
    // 动作行 (△开头)
    if (trimmedLine.startsWith('△')) {
      const actionText = trimmedLine.slice(1).trim();
      
      // 从Action Description中提取可能的角色
      const mentionedChars = characters.filter(c => 
        actionText.includes(c.name)
      );
      
      shots.push(createShot({
        index: index++,
        episodeId,
        sceneRefId: scene.id,
        // 保留完整的原始动作文本，不要截断，便于AI校准时使用
        actionSummary: actionText,
        visualDescription: `${scene.location}，${actionText}`,
        characterNames: mentionedChars.map(c => c.name),
        characterIds: mentionedChars.map(c => c.id),
        shotSize: actionText.includes('Wide Shot') || actionText.includes('远') ? 'WS' : 'MS',
        duration: Math.max(2, Math.ceil(actionText.length / 15)),
        ambientSound: detectAmbientSound(actionText, scene.atmosphere),
      }));
      continue;
    }
    
    // 字幕【】
    if (trimmedLine.startsWith('【') && trimmedLine.endsWith('】')) {
      const subtitleText = trimmedLine.slice(1, -1);
      
      // 如果是闪回标记，生成过渡Shot
      if (subtitleText.includes('闪回')) {
        shots.push(createShot({
          index: index++,
          episodeId,
          sceneRefId: scene.id,
          actionSummary: subtitleText,
          visualDescription: `【${subtitleText}】画面渐变过渡`,
          characterNames: [],
          characterIds: [],
          shotSize: 'WS',
          duration: 2,
        }));
        continue;
      }
      
      // 字幕显示
      if (subtitleText.startsWith('字幕')) {
        shots.push(createShot({
          index: index++,
          episodeId,
          sceneRefId: scene.id,
          actionSummary: '字幕显示',
          visualDescription: `画面叠加字幕：${subtitleText.replace('字幕：', '').replace('字幕:', '')}`,
          characterNames: [],
          characterIds: [],
          shotSize: 'WS',
          duration: 3,
        }));
      }
    }
  }
  
  // 如果Scene没有生成任何Shot，Create一默认的建立Shot
  if (shots.length === 0) {
    shots.push(createShot({
      index: index,
      episodeId,
      sceneRefId: scene.id,
      actionSummary: `${scene.name || scene.location} 建立Shot`,
      visualDescription: `${scene.location}，${scene.atmosphere}的氛围`,
      characterNames: [],
      characterIds: [],
      shotSize: 'WS',
      duration: 3,
      ambientSound: detectAmbientSound('', scene.atmosphere),
    }));
  }
  
  return shots;
}

/**
 * 根据Episodes自动匹Supporting Character色的阶段变体
 * 用于Shot生成时自动Select正确版本的角色（如第50Episode自动用张明中年版）
 */
function matchCharacterVariationsForEpisode(
  characterIds: string[],
  episodeIndex: number
): Record<string, string> {
  const characterVariations: Record<string, string> = {};
  const charLibStore = useCharacterLibraryStore.getState();
  
  for (const charId of characterIds) {
    // 通过 characterLibraryId 查找Character Library中的角色
    // 注意：charId 是剧本中的ID，需要找到关联的Character Library角色
    const scriptStore = useScriptStore.getState();
    const projects = Object.values(scriptStore.projects);
    
    // 遍历项目找到角色
    for (const project of projects) {
      const scriptChar = project.scriptData?.characters.find(c => c.id === charId);
      if (scriptChar?.characterLibraryId) {
        const libChar = charLibStore.getCharacterById(scriptChar.characterLibraryId);
        if (libChar && libChar.variations.length > 0) {
          // 查找匹配当前Episodes的阶段变体
          const matchedVariation = getVariationForEpisode(libChar.variations, episodeIndex);
          if (matchedVariation) {
            characterVariations[charId] = matchedVariation.id;
            console.log(`[VariationMatch] 角色 ${scriptChar.name} 第${episodeIndex}Episode -> 使用变体 "${matchedVariation.name}"`);
          }
        }
        break;
      }
    }
  }
  
  return characterVariations;
}

/**
 * 从 episodeId 提取Episodes
 */
function getEpisodeIndexFromId(episodeId: string): number {
  // episodeId 格式为 "ep_X"
  const match = episodeId.match(/ep_(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * CreateShot对象
 */
function createShot(params: {
  index: number;
  episodeId: string;
  sceneRefId: string;
  actionSummary: string;
  visualDescription: string;
  dialogue?: string;
  characterNames: string[];
  characterIds: string[];
  shotSize: string;
  duration: number;
  ambientSound?: string;
  cameraMovement?: string;
}): Shot {
  // 自动匹Supporting Character色阶段变体
  const episodeIndex = getEpisodeIndexFromId(params.episodeId);
  const characterVariations = matchCharacterVariationsForEpisode(
    params.characterIds,
    episodeIndex
  );
  
  return {
    id: `shot_${Date.now()}_${params.index}`,
    index: params.index,
    episodeId: params.episodeId,
    sceneRefId: params.sceneRefId,
    actionSummary: params.actionSummary,
    visualDescription: params.visualDescription,
    dialogue: params.dialogue,
    characterNames: params.characterNames,
    characterIds: params.characterIds,
    characterVariations,  // 自动填充的阶段变体映射
    shotSize: params.shotSize,
    duration: params.duration,
    ambientSound: params.ambientSound,
    cameraMovement: params.cameraMovement || 'Static',
    imageStatus: 'idle',
    imageProgress: 0,
    videoStatus: 'idle',
    videoProgress: 0,
  };
}

/**
 * 检测Ambient Sound
 */
function detectAmbientSound(text: string, atmosphere: string): string {
  if (text.includes('雨') || atmosphere.includes('雨')) return '雨声';
  if (text.includes('风') || atmosphere.includes('风')) return '风声';
  if (text.includes('海') || text.includes('码头')) return '海浪声、海鸥声';
  if (text.includes('街') || text.includes('市场')) return '街道喧嚣、人声鼎沸';
  if (text.includes('夜') || atmosphere.includes('夜')) return 'Night寂静、虫鸣';
  if (text.includes('饭') || text.includes('吃')) return '餐具碰撞声';
  return 'Ambient Sound';
}

/**
 * 更新所有Episode的Shot
 */
export async function regenerateAllEpisodeShots(
  projectId: string,
  options: GenerateShotsOptions,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<void> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project || !project.episodeRawScripts.length) {
    throw new Error("No episodes to generate");
  }
  
  const totalEpisodes = project.episodeRawScripts.length;
  
  for (let i = 0; i < totalEpisodes; i++) {
    const ep = project.episodeRawScripts[i];
    onProgress?.(i + 1, totalEpisodes, `Generating episode ${ep.episodeIndex}...`);
    
    await generateEpisodeShots(
      ep.episodeIndex,
      projectId,
      options,
      (msg) => onProgress?.(i + 1, totalEpisodes, msg)
    );
  }
}

/**
 * 获取Episode的生成状态摘要
 */
export function getEpisodeGenerationSummary(projectId: string): {
  total: number;
  completed: number;
  generating: number;
  idle: number;
  error: number;
} {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { total: 0, completed: 0, generating: 0, idle: 0, error: 0 };
  }
  
  const episodes = project.episodeRawScripts;
  return {
    total: episodes.length,
    completed: episodes.filter(ep => ep.shotGenerationStatus === 'completed').length,
    generating: episodes.filter(ep => ep.shotGenerationStatus === 'generating').length,
    idle: episodes.filter(ep => ep.shotGenerationStatus === 'idle').length,
    error: episodes.filter(ep => ep.shotGenerationStatus === 'error').length,
  };
}

// ==================== AI 校准Feature ====================

// CalibrationOptions 已不需要，统一从服务映射获取配置
export interface CalibrationOptions {
  // 保留空接口以保持兼容性
}

export interface CalibrationResult {
  success: boolean;
  calibratedCount: number;
  totalMissing: number;
  error?: string;
}

/**
 * 检查Episodes是否缺失标题
 * 缺失标题的判断Standard：标题为空，或只有"第XEpisode"没有冒号后的内容
 */
function isMissingTitle(title: string): boolean {
  if (!title || title.trim() === '') return true;
  // 匹配 "第XEpisode" 或 "第XXEpisode" 但没有后续标题
  const onlyEpisodeNum = /^第[\d一二三四五六七八九十百千]+Episode$/;
  return onlyEpisodeNum.test(title.trim());
}

/**
 * 获取缺失标题的Episodes列表
 */
export function getMissingTitleEpisodes(projectId: string): EpisodeRawScript[] {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project || !project.episodeRawScripts.length) {
    return [];
  }
  
  return project.episodeRawScripts.filter(ep => isMissingTitle(ep.title));
}


/**
 * 从Episode内容中提取摘要
 */
function extractEpisodeSummary(episode: EpisodeRawScript): string {
  const parts: string[] = [];
  
  // 取前3Scene的内容摘要
  const scenesToUse = episode.scenes.slice(0, 3);
  for (const scene of scenesToUse) {
    // Scene信息（使用 sceneHeader 代替 location）
    if (scene.sceneHeader) {
      parts.push(`Scene：${scene.sceneHeader}`);
    }
    
    // 取前几条对白
    const dialogueSample = scene.dialogues.slice(0, 3).map(d => 
      `${d.character}：${d.line.slice(0, 30)}`
    ).join('\n');
    if (dialogueSample) {
      parts.push(dialogueSample);
    }
    
    // 取前几动作描写
    const actionSample = scene.actions.slice(0, 2).map(a => a.slice(0, 50)).join('\n');
    if (actionSample) {
      parts.push(actionSample);
    }
  }
  
  // 限制总长度
  const summary = parts.join('\n').slice(0, 800);
  return summary || '（None内容）';
}

/**
 * AI校准：为缺失标题的Episodes生成标题
 * @param projectId 项目ID
 * @param options AI配置
 * @param onProgress Progress回调
 */
export async function calibrateEpisodeTitles(
  projectId: string,
  _options?: CalibrationOptions, // 不再需要，保留以兼容
  onProgress?: (current: number, total: number, message: string) => void
): Promise<CalibrationResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { success: false, calibratedCount: 0, totalMissing: 0, error: 'Project does not exist' };
  }
  
  // 找出缺失标题的Episodes
  const missingEpisodes = getMissingTitleEpisodes(projectId);
  const totalMissing = missingEpisodes.length;
  
  if (totalMissing === 0) {
    return { success: true, calibratedCount: 0, totalMissing: 0 };
  }
  
  onProgress?.(0, totalMissing, `Found ${totalMissing} episodes missing titles, starting calibration...`);
  
  // 获取全局背景信息
  const background = project.projectBackground;
  const globalContext = {
    title: background?.title || project.scriptData?.title || 'Untitled剧本',
    outline: background?.outline || project.scriptData?.logline || '',
    characterBios: background?.characterBios || '',
    totalEpisodes: project.episodeRawScripts.length,
  };
  
  // 注入概览里的世界观知识（角色、阵营、时代、力量体系等）
  const seriesCtx = buildSeriesContextSummary(project.seriesMeta || null);
  
  try {
    // 准备 batch items
    type TitleItem = { index: number; contentSummary: string };
    const items: TitleItem[] = missingEpisodes.map(ep => ({
      index: ep.episodeIndex,
      contentSummary: extractEpisodeSummary(ep),
    }));
    
    const { results, failedBatches, totalBatches } = await processBatched<TitleItem, string>({
      items,
      feature: 'script_analysis',
      buildPrompts: (batch) => {
        const { title, outline, characterBios, totalEpisodes } = globalContext;
        const system = `你是好莱坞资深编剧，拥有艾美奖最佳编剧提名经历。

你的专业能力：
- 精通剧Episode命名艺术：能用简短有力的标题捕捉每Episode核心冲突和情感转折
- 叙事结构把控：理解商战、家族、情感等不同类型剧Episode的命名风格
- 市场敏感度：知道什么样的标题能吸引观众，提升点击率

你的任务是根据剧本的全局背景和每Episode内容，为每Episode生成简短有吸引力的标题。
${seriesCtx ? `\n【剧级知识参考】\n${seriesCtx}\n` : ''}
【剧本信息】
剧名：${title}
总Episodes：${totalEpisodes}Episode

【故事大纲】
${outline.slice(0, 1500)}

【主要人物】
${characterBios.slice(0, 1000)}

【要求】
1. 标题要能概括该Episode的主要内容或转折点
2. 标题长度控制在6-15字
3. 风格要符合剧本类型（如商战剧用商战术语，武侠剧用江湖气息）
4. 标题之间要有连贯性，体现PlotHair展

请以JSON格式Back，格式为：
{
  "titles": {
    "1": "第1Episode标题",
    "2": "第2Episode标题"
  }
}`;
        const episodeContents = batch.map(ep => 
          `第${ep.index}Episode内容摘要：${ep.contentSummary}`
        ).join('\n\n');
        const user = `请为以下Episodes生成标题：\n\n${episodeContents}`;
        return { system, user };
      },
      parseResult: (raw) => {
        let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const result = new Map<string, string>();
        if (parsed.titles) {
          for (const [key, value] of Object.entries(parsed.titles)) {
            result.set(key, value as string);
          }
        }
        return result;
      },
      estimateItemOutputTokens: () => 30, // 标题很短，每Episode约 30 tokens
      onProgress: (completed, total, message) => {
        onProgress?.(completed, total, `[Title Calibration] ${message}`);
      },
    });
    
    // 处理结果
    let calibratedCount = 0;
    for (const ep of missingEpisodes) {
      const newTitle = results.get(String(ep.episodeIndex));
      if (newTitle) {
        store.updateEpisodeRawScript(projectId, ep.episodeIndex, {
          title: `第${ep.episodeIndex}Episode：${newTitle}`,
        });
        
        const scriptData = store.projects[projectId]?.scriptData;
        if (scriptData) {
          const epData = scriptData.episodes.find(e => e.index === ep.episodeIndex);
          if (epData) {
            epData.title = `第${ep.episodeIndex}Episode：${newTitle}`;
            store.setScriptData(projectId, { ...scriptData });
          }
        }
        
        calibratedCount++;
      }
    }
    
    if (failedBatches > 0) {
      console.warn(`[Episode标题校准] ${failedBatches}/${totalBatches} 批次Failed`);
    }
    
    onProgress?.(calibratedCount, totalMissing, `Calibrated ${calibratedCount}/${totalMissing} Episode`);
    
    return {
      success: true,
      calibratedCount,
      totalMissing,
    };
  } catch (error) {
    console.error('[calibrate] Error:', error);
    return {
      success: false,
      calibratedCount: 0,
      totalMissing,
      error: error instanceof Error ? error.message : 'Calibration failed',
    };
  }
}

// ==================== AI Shot校准Feature ====================

export interface ShotCalibrationOptions {
  apiKey: string;
  provider: string;
  baseUrl?: string;
  model?: string;  // 可选指定Model
  styleId?: string;  // 风格标识，影响visualPrompt生成
  cinematographyProfileId?: string;  // 摄影风格档案 ID，影响拍摄控制字段默认值
  promptLanguage?: import('@/types/script').PromptLanguage;
}

export interface ShotCalibrationResult {
  success: boolean;
  calibratedCount: number;
  totalShots: number;
  error?: string;
}

/**
 * 根据用户Select的Prompt语言，清理/保留ShotPrompt字段，避免语言切换后残留旧字段
 */
function applyPromptLanguageToShotPrompts(
  existingShot: Shot,
  calibration: Record<string, any>,
  promptLanguage: PromptLanguage = 'zh+en',
): Pick<Shot, 'visualPrompt' | 'imagePrompt' | 'imagePromptZh' | 'videoPrompt' | 'videoPromptZh' | 'endFramePrompt' | 'endFramePromptZh'> {
  const nextVisualPrompt = calibration.visualPrompt || existingShot.visualPrompt;
  const nextImagePrompt = calibration.imagePrompt || existingShot.imagePrompt;
  const nextImagePromptZh = calibration.imagePromptZh || existingShot.imagePromptZh;
  const nextVideoPrompt = calibration.videoPrompt || existingShot.videoPrompt;
  const nextVideoPromptZh = calibration.videoPromptZh || existingShot.videoPromptZh;
  const nextEndFramePrompt = calibration.endFramePrompt || existingShot.endFramePrompt;
  const nextEndFramePromptZh = calibration.endFramePromptZh || existingShot.endFramePromptZh;

  if (promptLanguage === 'zh') {
    return {
      visualPrompt: undefined,
      imagePrompt: undefined,
      imagePromptZh: nextImagePromptZh,
      videoPrompt: undefined,
      videoPromptZh: nextVideoPromptZh,
      endFramePrompt: undefined,
      endFramePromptZh: nextEndFramePromptZh,
    };
  }

  if (promptLanguage === 'en') {
    return {
      visualPrompt: nextVisualPrompt,
      imagePrompt: nextImagePrompt,
      imagePromptZh: undefined,
      videoPrompt: nextVideoPrompt,
      videoPromptZh: undefined,
      endFramePrompt: nextEndFramePrompt,
      endFramePromptZh: undefined,
    };
  }

  return {
    visualPrompt: nextVisualPrompt,
    imagePrompt: nextImagePrompt,
    imagePromptZh: nextImagePromptZh,
    videoPrompt: nextVideoPrompt,
    videoPromptZh: nextVideoPromptZh,
    endFramePrompt: nextEndFramePrompt,
    endFramePromptZh: nextEndFramePromptZh,
  };
}

/**
 * AI校准Shot：优化中文描述、生成英文visualPrompt、优化Shot设计
 */
export async function calibrateEpisodeShots(
  episodeIndex: number,
  projectId: string,
  options: ShotCalibrationOptions,
  onProgress?: (current: number, total: number, message: string) => void,
  filterSceneId?: string,
): Promise<ShotCalibrationResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { success: false, calibratedCount: 0, totalShots: 0, error: 'Project does not exist' };
  }
  
  // 找到该Episode的Shot
  const scriptData = project.scriptData;
  if (!scriptData) {
    return { success: false, calibratedCount: 0, totalShots: 0, error: 'Script data does not exist' };
  }
  
  const episode = scriptData.episodes.find(ep => ep.index === episodeIndex);
  if (!episode) {
    return { success: false, calibratedCount: 0, totalShots: 0, error: `Cannot find episode ${episodeIndex}` };
  }
  
  // 获取该Episode的所有Shot（可选：只校准指定Scene的Shot）
  let episodeShots = project.shots.filter(shot => shot.episodeId === episode.id);
  if (filterSceneId) {
    episodeShots = episodeShots.filter(shot => shot.sceneRefId === filterSceneId);
  }
  const totalShots = episodeShots.length;
  
  if (totalShots === 0) {
    return { success: false, calibratedCount: 0, totalShots: 0, error: 'This episode has no shots' };
  }
  
  onProgress?.(0, totalShots, `Starting calibration for ${totalShots} shots in episode ${episodeIndex}...`);
  
  // 获取全局背景信息
  const background = project.projectBackground;
  const episodeScript = project.episodeRawScripts.find(ep => ep.episodeIndex === episodeIndex);
  
  // 提取该Episode的原始剧本内容（对白+动作）
  const episodeRawContent = episodeScript?.rawContent || '';
  
  // 构建剧级上下文摘要
  const seriesContextSummary = buildSeriesContextSummary(project.seriesMeta || null);
  
  const globalContext = {
    title: background?.title || project.scriptData?.title || 'Untitled剧本',
    genre: background?.genre || '',
    era: background?.era || '',
    outline: background?.outline || '',
    characterBios: background?.characterBios || '',
    worldSetting: background?.worldSetting || '',
    themes: background?.themes || [],
    episodeTitle: episode.title,
    episodeSynopsis: episodeScript?.synopsis || '',  // 使用每Episode大纲
    episodeKeyEvents: episodeScript?.keyEvents || [],  // 关键事件
    episodeRawContent,  // 该Episode原始剧本内容（完整对白、动作描写）
    episodeSeason: episodeScript?.season,  // 本Episode季节
    totalEpisodes: project.episodeRawScripts.length,
    currentEpisode: episodeIndex,
    seriesContextSummary,  // 剧级上下文
  };
  
  // 构建原始SceneWeather映射（从原始解析的Scene中获取 weather）
  const rawSceneWeatherMap = new Map<string, string>();
  if (episodeScript?.scenes) {
    for (const rawScene of episodeScript.scenes) {
      if (rawScene.weather) {
        // 用Scene头做 key
        rawSceneWeatherMap.set(rawScene.sceneHeader, rawScene.weather);
      }
    }
  }
  
  try {
    // 获取用户设置的并Hair数
    const concurrency = useAPIConfigStore.getState().concurrency || 1;
    const batchSize = 5; // 每 AI 调用处理 5 Shot
    let calibratedCount = 0;
    const updatedShots: Shot[] = [...project.shots];
    
    // 准备所有批次任务
    const allBatches: { batch: Shot[]; batchNum: number; batchData: any[] }[] = [];
    for (let i = 0; i < episodeShots.length; i += batchSize) {
      const batch = episodeShots.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      
      // 准备批次数据
      const batchData = batch.map(shot => {
        const scene = scriptData.scenes.find(s => s.id === shot.sceneRefId);
        let sourceText = shot.actionSummary || '';
        if (shot.dialogue) {
          sourceText += `\n对白：「${shot.dialogue}」`;
        }
        // 尝试查找Scene对应的Weather
        let sceneWeather = '';
        for (const [header, weather] of rawSceneWeatherMap) {
          if (scene?.location && header.includes(scene.location.replace(/\s+/g, ''))) {
            sceneWeather = weather;
            break;
          }
        }
        return {
          shotId: shot.id,
          sourceText,
          actionSummary: shot.actionSummary,
          dialogue: shot.dialogue,
          characterNames: shot.characterNames,
          sceneLocation: scene?.location || '',
          sceneAtmosphere: scene?.atmosphere || '',
          sceneTime: scene?.time || 'day',
          sceneWeather,
          architectureStyle: scene?.architectureStyle || '',
          colorPalette: scene?.colorPalette || '',
          eraDetails: scene?.eraDetails || '',
          lightingDesign: scene?.lightingDesign || '',
          currentShotSize: shot.shotSize,
          currentCameraMovement: shot.cameraMovement,
          currentDuration: shot.duration,
        };
      });
      
      allBatches.push({ batch, batchNum, batchData });
    }
    
    const totalBatches = allBatches.length;
    console.log(`🚀 [calibrateShots] Pending: ${totalShots} Shot，${totalBatches} 批，并Hair数: ${concurrency}`);
    
    // 错开启动的并Hair控制：每5sec启动一新批次，同时最多 concurrency 
    let completedBatches = 0;
    const settledBatchResults = await runStaggered(
      allBatches.map(({ batch, batchNum, batchData }) => async () => {
        console.log(`[calibrateShots] 🚀 启动批次 ${batchNum}/${totalBatches}`);
        onProgress?.(calibratedCount, totalShots, `🚀 Processing batch ${batchNum}/${totalBatches}...`);
        
        // 带重试机制的 AI 调用
        let calibrations: Record<string, any> = {};
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            calibrations = await calibrateShotsMultiStage(
              batchData,
              { styleId: options.styleId, cinematographyProfileId: options.cinematographyProfileId, promptLanguage: options.promptLanguage },
              globalContext,
              (stage, total, name) => {
                console.log(`[calibrateShots] 批次 ${batchNum}/${totalBatches} - Stage ${stage}/${total}: ${name}`);
                onProgress?.(calibratedCount, totalShots, `Batch ${batchNum} Phase ${stage}/${total}: ${name}`);
              }
            );
            completedBatches++;
            console.log(`[calibrateShots] ✅ 批次 ${batchNum} Done，Progress: ${completedBatches}/${totalBatches}`);
            return { batch, calibrations, success: true as const };
          } catch (err) {
            retryCount++;
            console.warn(`[calibrateShots] 批次 ${batchNum} Failed，重试 ${retryCount}/${maxRetries}:`, err);
            if (retryCount >= maxRetries) {
              console.error(`[calibrateShots] 批次 ${batchNum} 达到最大重试次数，跳过`);
              completedBatches++;
              return { batch, calibrations: {} as Record<string, any>, success: false as const };
            }
            await new Promise(r => setTimeout(r, 2000 * retryCount));
          }
        }
        completedBatches++;
        return { batch, calibrations, success: false as const };
      }),
      concurrency,
      5000
    );
    const results = settledBatchResults
      .filter((r): r is { status: 'fulfilled'; value: any } => r.status === 'fulfilled')
      .map(r => r.value);
    
    // 处理结果
    for (const { batch, calibrations, success } of results) {
      if (success) {
        for (const shot of batch) {
          const calibration = calibrations[shot.id];
          if (calibration) {
            const shotIndex = updatedShots.findIndex(s => s.id === shot.id);
            if (shotIndex !== -1) {
              updatedShots[shotIndex] = {
                ...updatedShots[shotIndex],
                visualDescription: calibration.visualDescription || updatedShots[shotIndex].visualDescription,
                shotSize: calibration.shotSize || updatedShots[shotIndex].shotSize,
                cameraMovement: calibration.cameraMovement || updatedShots[shotIndex].cameraMovement,
                duration: calibration.duration || updatedShots[shotIndex].duration,
                emotionTags: calibration.emotionTags || updatedShots[shotIndex].emotionTags,
                characterNames: calibration.characterNames?.length > 0 
                  ? calibration.characterNames 
                  : updatedShots[shotIndex].characterNames,
                ambientSound: calibration.ambientSound || updatedShots[shotIndex].ambientSound,
                soundEffect: calibration.soundEffect || updatedShots[shotIndex].soundEffect,
                ...applyPromptLanguageToShotPrompts(
                  updatedShots[shotIndex],
                  calibration,
                  options.promptLanguage || 'zh+en',
                ),
                needsEndFrame: calibration.needsEndFrame ?? updatedShots[shotIndex].needsEndFrame,
                narrativeFunction: calibration.narrativeFunction || updatedShots[shotIndex].narrativeFunction,
                conflictStage: calibration.conflictStage || updatedShots[shotIndex].conflictStage,
                shotPurpose: calibration.shotPurpose || updatedShots[shotIndex].shotPurpose,
                storyAlignment: calibration.storyAlignment || updatedShots[shotIndex].storyAlignment,
                visualFocus: calibration.visualFocus || updatedShots[shotIndex].visualFocus,
                cameraPosition: calibration.cameraPosition || updatedShots[shotIndex].cameraPosition,
                characterBlocking: calibration.characterBlocking || updatedShots[shotIndex].characterBlocking,
                rhythm: calibration.rhythm || updatedShots[shotIndex].rhythm,
                // 拍摄控制字段
                lightingStyle: calibration.lightingStyle || updatedShots[shotIndex].lightingStyle,
                lightingDirection: calibration.lightingDirection || updatedShots[shotIndex].lightingDirection,
                colorTemperature: calibration.colorTemperature || updatedShots[shotIndex].colorTemperature,
                lightingNotes: calibration.lightingNotes || updatedShots[shotIndex].lightingNotes,
                depthOfField: calibration.depthOfField || updatedShots[shotIndex].depthOfField,
                focusTarget: calibration.focusTarget || updatedShots[shotIndex].focusTarget,
                focusTransition: calibration.focusTransition || updatedShots[shotIndex].focusTransition,
                cameraRig: calibration.cameraRig || updatedShots[shotIndex].cameraRig,
                movementSpeed: calibration.movementSpeed || updatedShots[shotIndex].movementSpeed,
                atmosphericEffects: calibration.atmosphericEffects || updatedShots[shotIndex].atmosphericEffects,
                effectIntensity: calibration.effectIntensity || updatedShots[shotIndex].effectIntensity,
                playbackSpeed: calibration.playbackSpeed || updatedShots[shotIndex].playbackSpeed,
                cameraAngle: calibration.cameraAngle || updatedShots[shotIndex].cameraAngle,
                focalLength: calibration.focalLength || updatedShots[shotIndex].focalLength,
                photographyTechnique: calibration.photographyTechnique || updatedShots[shotIndex].photographyTechnique,
                specialTechnique: calibration.specialTechnique || updatedShots[shotIndex].specialTechnique,
              };
              calibratedCount++;
            }
          }
        }
      }
    }
    
    onProgress?.(calibratedCount, totalShots, `Calibrated ${calibratedCount}/${totalShots} Shot`);
    
    // Save更新后的Shot
    store.setShots(projectId, updatedShots);
    
    return {
      success: true,
      calibratedCount,
      totalShots,
    };
  } catch (error) {
    console.error('[calibrateShots] Error:', error);
    return {
      success: false,
      calibratedCount: 0,
      totalShots,
      error: error instanceof Error ? error.message : 'ShotCalibration failed',
    };
  }
}

/**
 * AI校准单Shot：用于预告片 Tab 点击单Shot进行校准
 */
export async function calibrateSingleShot(
  shotId: string,
  projectId: string,
  options: ShotCalibrationOptions,
  onProgress?: (message: string) => void
): Promise<ShotCalibrationResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { success: false, calibratedCount: 0, totalShots: 1, error: 'Project does not exist' };
  }
  
  const scriptData = project.scriptData;
  if (!scriptData) {
    return { success: false, calibratedCount: 0, totalShots: 1, error: 'Script data does not exist' };
  }
  
  // 找到目标Shot
  const shot = project.shots.find(s => s.id === shotId);
  if (!shot) {
    return { success: false, calibratedCount: 0, totalShots: 1, error: `Cannot find shot ${shotId}` };
  }
  
  onProgress?.(`Calibrating shot...`);
  
  // 获取Shot所属的Scene和Episode信息
  const scene = scriptData.scenes.find(s => s.id === shot.sceneRefId);
  const episode = scriptData.episodes.find(ep => ep.id === shot.episodeId);
  const episodeIndex = episode?.index || 1;
  
  // 获取全局背景信息
  const background = project.projectBackground;
  const episodeScript = project.episodeRawScripts.find(ep => ep.episodeIndex === episodeIndex);
  const episodeRawContent = episodeScript?.rawContent || '';
  
  const globalContext = {
    title: background?.title || scriptData?.title || 'Untitled剧本',
    genre: background?.genre || '',
    era: background?.era || '',
    outline: background?.outline || '',
    characterBios: background?.characterBios || '',
    worldSetting: background?.worldSetting || '',
    themes: background?.themes || [],
    episodeTitle: episode?.title || `第${episodeIndex}Episode`,
    episodeSynopsis: episodeScript?.synopsis || '',
    episodeKeyEvents: episodeScript?.keyEvents || [],
    episodeRawContent,
    episodeSeason: episodeScript?.season,
    totalEpisodes: project.episodeRawScripts.length,
    currentEpisode: episodeIndex,
  };
  
  try {
    // 准备Shot数据
    let sourceText = shot.actionSummary || '';
    if (shot.dialogue) {
      sourceText += `\n对白：「${shot.dialogue}」`;
    }
    
    // 查找SceneWeather
    let sceneWeather = '';
    if (episodeScript?.scenes) {
      for (const rawScene of episodeScript.scenes) {
        if (rawScene.weather && scene?.location && rawScene.sceneHeader.includes(scene.location.replace(/\s+/g, ''))) {
          sceneWeather = rawScene.weather;
          break;
        }
      }
    }
    
    const shotData = [{
      shotId: shot.id,
      sourceText,
      actionSummary: shot.actionSummary || '',
      dialogue: shot.dialogue,
      characterNames: shot.characterNames,
      sceneLocation: scene?.location || '',
      sceneAtmosphere: scene?.atmosphere || '',
      sceneTime: scene?.time || 'day',
      sceneWeather,
      // Scene美术设计字段（从AIScene校准获取）
      architectureStyle: scene?.architectureStyle || '',
      colorPalette: scene?.colorPalette || '',
      eraDetails: scene?.eraDetails || '',
      lightingDesign: scene?.lightingDesign || '',
      currentShotSize: shot.shotSize,
      currentCameraMovement: shot.cameraMovement,
      currentDuration: shot.duration,
    }];
    
    // 调用 AI 校准
    const calibrations = await callAIForShotCalibration(shotData, options, globalContext);
    const calibration = calibrations[shot.id];
    
    if (!calibration) {
      return { success: false, calibratedCount: 0, totalShots: 1, error: 'AI calibration returned no results' };
    }
    
    // 更新Shot
    const updatedShots = project.shots.map(s => {
      if (s.id !== shot.id) return s;
      return {
        ...s,
        visualDescription: calibration.visualDescription || s.visualDescription,
        shotSize: calibration.shotSize || s.shotSize,
        cameraMovement: calibration.cameraMovement || s.cameraMovement,
        duration: calibration.duration || s.duration,
        emotionTags: calibration.emotionTags || s.emotionTags,
        characterNames: calibration.characterNames?.length > 0 ? calibration.characterNames : s.characterNames,
        ambientSound: calibration.ambientSound || s.ambientSound,
        soundEffect: calibration.soundEffect || s.soundEffect,
        // 三层Prompt系统（按 promptLanguage 清理旧字段）
        ...applyPromptLanguageToShotPrompts(
          s,
          calibration,
          options.promptLanguage || 'zh+en',
        ),
        needsEndFrame: calibration.needsEndFrame ?? s.needsEndFrame,
        // 叙事驱动字段
        narrativeFunction: calibration.narrativeFunction || s.narrativeFunction,
        conflictStage: calibration.conflictStage || s.conflictStage,
        shotPurpose: calibration.shotPurpose || s.shotPurpose,
        storyAlignment: calibration.storyAlignment || s.storyAlignment,
        visualFocus: calibration.visualFocus || s.visualFocus,
        cameraPosition: calibration.cameraPosition || s.cameraPosition,
        characterBlocking: calibration.characterBlocking || s.characterBlocking,
        rhythm: calibration.rhythm || s.rhythm,
        // 拍摄控制字段
        lightingStyle: calibration.lightingStyle || s.lightingStyle,
        lightingDirection: calibration.lightingDirection || s.lightingDirection,
        colorTemperature: calibration.colorTemperature || s.colorTemperature,
        lightingNotes: calibration.lightingNotes || s.lightingNotes,
        depthOfField: calibration.depthOfField || s.depthOfField,
        focusTarget: calibration.focusTarget || s.focusTarget,
        focusTransition: calibration.focusTransition || s.focusTransition,
        cameraRig: calibration.cameraRig || s.cameraRig,
        movementSpeed: calibration.movementSpeed || s.movementSpeed,
        atmosphericEffects: calibration.atmosphericEffects || s.atmosphericEffects,
        effectIntensity: calibration.effectIntensity || s.effectIntensity,
        playbackSpeed: calibration.playbackSpeed || s.playbackSpeed,
        cameraAngle: calibration.cameraAngle || s.cameraAngle,
        focalLength: calibration.focalLength || s.focalLength,
        photographyTechnique: calibration.photographyTechnique || s.photographyTechnique,
        specialTechnique: calibration.specialTechnique || s.specialTechnique,
      } as Shot;
    });
    
    store.setShots(projectId, updatedShots);
    onProgress?.(`Shot calibration done`);
    
    return {
      success: true,
      calibratedCount: 1,
      totalShots: 1,
    };
  } catch (error) {
    console.error('[calibrateSingleShot] Error:', error);
    return {
      success: false,
      calibratedCount: 0,
      totalShots: 1,
      error: error instanceof Error ? error.message : '单ShotCalibration failed',
    };
  }
}

/**
 * 调用 AI API 校准Shot - 复用 callChatAPI
 */
async function callAIForShotCalibration(
  shots: Array<{
    shotId: string;
    sourceText: string;        // 原始剧本文本片段（该Shot对应的原文）
    actionSummary: string;
    dialogue?: string;
    characterNames?: string[];
    sceneLocation: string;
    sceneAtmosphere: string;
    sceneTime: string;
    sceneWeather?: string;        // Weather（雨/雪/雾等）
    // Scene美术设计字段（与 ScriptScene 字段名对齐）
    architectureStyle?: string;   // 建筑风格
    colorPalette?: string;        // 色彩基调
    eraDetails?: string;          // 时代特征
    lightingDesign?: string;      // 光影设计
    currentShotSize?: string;
    currentCameraMovement?: string;
    currentDuration?: number;
  }>,
  options: ShotCalibrationOptions,
  globalContext: {
    title: string;
    genre?: string;
    era?: string;
    outline: string;
    characterBios: string;
    worldSetting?: string;
    themes?: string[];
    episodeTitle: string;
    episodeSynopsis?: string;  // 每Episode大纲
    episodeKeyEvents?: string[];  // 关键事件
    episodeRawContent?: string;  // 该Episode原始剧本内容
    episodeSeason?: string;      // 本Episode季节
    totalEpisodes?: number;
    currentEpisode?: number;
  }
): Promise<Record<string, {
  visualDescription: string;
  visualPrompt: string;
  // 三层Prompt系统
  imagePrompt: string;      // First FramePrompt（静态描述）
  imagePromptZh: string;    // First FramePrompt中文
  videoPrompt: string;      // VideoPrompt（动态动作）
  videoPromptZh: string;    // VideoPrompt中文
  endFramePrompt: string;   // Tail FramePrompt（静态描述）
  endFramePromptZh: string; // Tail FramePrompt中文
  needsEndFrame: boolean;   // 是否需要Tail Frame
  shotSize: string;
  cameraMovement: string;
  duration: number;         // Duration（sec）
  emotionTags: string[];    // Mood标签
  characterNames: string[]; // 完整角色列表
  ambientSound: string;     // Ambient Sound
  soundEffect: string;      // Sound Effect
  // === 叙事驱动字段（基于《电影语言的语法》） ===
  narrativeFunction: string;  // 叙事Feature：铺垫/升级/高潮/转折/过渡/尾声
  conflictStage?: string;     // 冲突阶段
  shotPurpose: string;        // Shot目的：为什么用这Shot
  storyAlignment?: string;    // 与整体叙事的一致性
  visualFocus: string;        // 视觉焦点：观众应该看什么
  cameraPosition: string;     // 机位描述
  characterBlocking: string;  // 人物布局
  rhythm: string;             // 节奏描述
  // === 拍摄控制字段 ===
  lightingStyle?: string;
  lightingDirection?: string;
  colorTemperature?: string;
  lightingNotes?: string;
  depthOfField?: string;
  focusTarget?: string;
  focusTransition?: string;
  cameraRig?: string;
  movementSpeed?: string;
  atmosphericEffects?: string[];
  effectIntensity?: string;
  playbackSpeed?: string;
  cameraAngle?: string;
  focalLength?: string;
  photographyTechnique?: string;
  specialTechnique?: string;
}>> {
  // 不再需要 apiKey/provider/baseUrl，统一从服务映射获取
  const { styleId, cinematographyProfileId } = options;
  const { 
    title, genre, era, outline, characterBios, worldSetting, themes,
    episodeTitle, episodeSynopsis, episodeKeyEvents, episodeRawContent,
    episodeSeason, totalEpisodes, currentEpisode 
  } = globalContext;
  
  // 截取原始剧本内容（避免过长，取前3000字）
  const rawContentPreview = episodeRawContent ? episodeRawContent.slice(0, 3000) : '';
  
  // 使用Total享的风格描述函数
  const styleDesc = getStyleDescription(styleId || 'cinematic');
  
  // 摄影风格档案指导文本
  const cinematographyGuidance = cinematographyProfileId
    ? buildCinematographyGuidance(cinematographyProfileId)
    : '';
  
  // 构建更完整的上下文信息
  const contextInfo = [
    `剧名：《${title}》`,
    genre ? `类型：${genre}` : '',
    era ? `时代背景：${era}` : '',
    totalEpisodes ? `总Episodes：${totalEpisodes}Episode` : '',
    `当前：第${currentEpisode}Episode「${episodeTitle}」`,
    episodeSeason ? `季节：${episodeSeason}` : '',
  ].filter(Boolean).join(' | ');
  
  const systemPrompt = `你是世界级顶尖电影摄影大师，精通丹尼艾尔·阿里洪《电影语言的语法》的所有理论，拥有奥斯卡最佳摄影奖经验。

你的核心理念：**Shot不是孤立的画面，而是叙事链条中的一环。每Shot的景别、运动、Duration都必须服务于叙事。**

你的专业能力：
- 精通Shot语言：能准确判断每Shot的景别、运动方式、光线设计
- **叙事驱动设计**：理解每Shot在整Episode故事中的位置和Feature，确保Shot设计服务于叙事
- 场面调度：运用三角形原理、内外反拍等技法处理对话场面
- 动态捕捉：能准确判断Shot的起始状态和结束状态是否有显著差异
- AIVideo Generation经验：深谙 Seedance、Sora、Runway 等 AI VideoModel的工作原理

你的任务是根据剧本全局背景和Shot信息，为每Shot生成专业的视觉描述和三层Prompt。

【剧本信息】
${contextInfo}
${episodeSynopsis ? `
本Episode大纲：${episodeSynopsis}` : ''}
${episodeKeyEvents && episodeKeyEvents.length > 0 ? `
关键事件：${episodeKeyEvents.join('、')}` : ''}
${worldSetting ? `
世界观：${worldSetting.slice(0, 200)}` : ''}
${themes && themes.length > 0 ? `
主题：${themes.join('、')}` : ''}
${outline ? `
故事背景：${outline.slice(0, 400)}` : ''}
${characterBios ? `
主要人物：${characterBios.slice(0, 400)}` : ''}

【⚠️ 核心原则 - 必须严格遵守】

1. **Scene归属绝对固定**（最重要！）：
   - 每Shot都有一【主Scene】（由 sceneLocation 字段指定），这是**绝对不可更改的**
   - 即使Shot描述中提到了其他Scene（如闪回、叠画、回忆画面、穿插Shot），**主Scene仍然是 sceneLocation**
   - 闪回/叠画是「当前主Scene内的视觉表现手法」，不是Scene切换
   - 你生成的所有描述（visualDescription、imagePrompt 等）都必须以**主Scene为背景**
   - 如果原文包含闪回/叠画内容，用「画面叠加」「画中画」「主观回忆」等方式描述，而不是描述成另一Scene
   - 例：主Scene是"张家客厅"，原文提到"闪回台球厅"，应描述为"张家客厅中，画面叠加台球厅的回忆画面"

2. **严格基于原文**：每Shot都附带了【原始剧本文本】，你的所有Generation Content必须完全基于该原文：
   - 视觉描述必须包含原文中提到的所有关键元素（人物、动作、道具、Scene）
   - 不得Add原文中没有的内容
   - 不得混入其他Shot的内容
   - 不得遗漏原文中的重要信息

3. **角色完整识别**：出场角色必须完整来自原文，按出现顺序列出
   - 例：原文"张明与父母吃着饭" → characterNames: ["张明", "张父", "张母"]
   - 禁止遗漏角色，禁止新增原文中没有的角色

3. **中英文分离**：
   - **中文字段**（visualDescription, ambientSound, soundEffect, imagePromptZh, videoPromptZh, endFramePromptZh）：必须是纯中文
   - **英文字段**（visualPrompt, imagePrompt, videoPrompt, endFramePrompt）：必须是100%纯英文，绝对禁止夹杂任何中文字符
   - 如果不Confirm某词怎么翻译，用英文描述或近义词代替，但绝不能留中文

4. **Duration估算**：根据动作复杂度和对白长度估算合理的ShotDuration（sec）
   - 纯动作None对白：3-5sec
   - 简短对白：4-6sec
   - 较长对白：6-10sec
   - 复杂动作序列：5-8sec

5. **Audio设计**（必须用中文）：根据原文识别并输出：
   - ambientSound（Ambient Sound）：如"窗外鸟鸣"、"餐厅嗨杂声"、"风声"
   - soundEffect（Sound Effect）：如"酒杯碎裂声"、"脚步声"、"门Close声"

【任务】
为每Shot生成：

**基础字段：**
1. 中文视觉描述 (visualDescription): 详细、有画面感的**纯中文**描述，必须包含原文所有关键元素（环境、人物、动作、道具）
2. 英文视觉描述 (visualPrompt): 用于AI绘图的**纯英文**描述，40词内
3. 景别 (shotSize): ECU/CU/MCU/MS/MLS/LS/WS/FS
4. Shot运动 (cameraMovement): none/static/tracking/orbit/zoom-in/zoom-out/pan-left/pan-right/tilt-up/tilt-down/dolly-in/dolly-out/truck-left/truck-right/crane-up/crane-down/drone-aerial/360-roll
4b. 特殊拍摄手法 (specialTechnique): none/hitchcock-zoom/timelapse/crash-zoom-in/crash-zoom-out/whip-pan/bullet-time/fpv-shuttle/macro-closeup/first-person/slow-motion/probe-lens/spinning-tilt
5. Duration (duration): sec数，整数
6. Mood标签 (emotionTags): 1-3Mood标签ID
7. 出场角色 (characterNames): 完整角色列表，来自原文
8. Ambient Sound (ambientSound): **中文**，根据Scene推断
9. Sound Effect (soundEffect): **中文**，根据动作推断

**叙事驱动字段（重要！必须基于本Episode大纲分析）：**
10. 叙事Feature (narrativeFunction): 铺垫/升级/高潮/转折/过渡/尾声
11. Shot目的 (shotPurpose): 为什么用这Shot？一句话说明
12. 视觉焦点 (visualFocus): 观众应该按什么顺序看？用箭头表示
13. 机位描述 (cameraPosition): 摄影机相对于人物的位置
14. 人物布局 (characterBlocking): 人物在画面中的位置关系
15. 节奏描述 (rhythm): 这Shot的节奏感

**拍摄控制字段（Cinematography Controls）：**
16. 灯光风格 (lightingStyle): natural/high-key/low-key/silhouette/chiaroscuro/neon
17. 灯光方向 (lightingDirection): front/side/back/top/bottom/rim
18. 色温 (colorTemperature): warm-3200K/neutral-5600K/cool-7500K/mixed/golden-hour/blue-hour
19. 灯光备注 (lightingNotes): 自由文本，中文，补充灯光细节
20. 景深 (depthOfField): shallow/medium/deep/split-diopter
21. 焦点目标 (focusTarget): 自由文本，中文，描述对焦主体
22. 焦点变化 (focusTransition): none/rack-focus/pull-focus/follow-focus
23. 摄影器材 (cameraRig): tripod/handheld/steadicam/dolly/crane/drone/gimbal/shoulder
24. 运动速度 (movementSpeed): static/slow/normal/fast/whip
25. Atmospheric Effects (atmosphericEffects): 数组，可多选，如 ["雾气","烟尘"] 等Weather/环境/艺术效果
26. 效果强度 (effectIntensity): subtle/moderate/heavy
27. 播放速度 (playbackSpeed): slow-0.25x/slow-0.5x/normal/fast-1.5x/fast-2x/timelapse
28. 拍摄角度 (cameraAngle): eye-level/low-angle/high-angle/birds-eye/worms-eye/dutch-angle/over-shoulder/pov/aerial
29. Shot焦距 (focalLength): 14mm/18mm/24mm/28mm/35mm/50mm/85mm/100mm-macro/135mm/200mm
30. 摄影技法 (photographyTechnique): long-exposure/double-exposure/high-speed/timelapse-photo/tilt-shift/silhouette/reflection/bokeh（如不需要特殊技法可留空）

【三层Prompt系统 - 重要】

【16. First FramePrompt (imagePrompt/imagePromptZh): 用于 AI Image Generation，描述Video第一帧的完整静态画面
    **必须包含以下所有元素**（缺一不可）：
    
    a) **Scene环境**：
       - Location类型（家庭餐厅/办公室/街道等）
       - 环境细节（窗外景色、Indoor陈设、道具布置）
       - 时间氛围（Daytime/傍晚/Night、季节感）
    
    b) **光线设计**：
       - 光源类型（自然光/灯光/混合光）
       - 光线质感（柔和/硬朗/漫射）
       - 光影氛围（温暖/冷色调/明暗对比）
    
    c) **人物描述**（每出场人物都要写）：
       - Age Group（青年/中年/老年）
       - Costume概述（休闲装/正装/工作服等）
       - 表情神态（紧张/严肃/微笑/担忧）
       - 姿势动作（坐着/站立/俯身/手持物品）
    
    d) **构图与景别**：
       - 景别描述（Medium Shot三人入画/Close Shot半身/Close-up面部）
       - 人物位置关系（左中右布局、前后关系）
       - 视觉焦点（主体在画面何处）
    
    e) **重要道具**：
       - Plot关键道具（证书、物品、食物等）
       - 道具状态（手持/放置/展示）
    
    f) **画面风格**：
       - 电影感/写实风格/Plot照质感
       - 色调倾向（温暖/冷色/自然）
    
    - imagePromptZh: 纯中文，60-100字，包含以上所有元素
    - imagePrompt: 纯英文，60-80词，对应中文内容的完整翻译，适合AI图像Model

11. VideoPrompt (videoPrompt/videoPromptZh): 描述Video中的动态内容
    - **必须强调动作**（如"反复观看"、"紧张地吃饭"等动词）
    - 画面动作（人物动作、物体移动）
    - Shot运动描述
    - 对白Notice（如有）
    - videoPromptZh: 纯中文
    - videoPrompt: 纯英文

【18. Tail FramePrompt (endFramePrompt/endFramePromptZh): 用于 AI Image Generation，描述Video最后一帧的完整静态画面
    
    **与First Frame同等重要！必须包含以下所有元素**（缺一不可）：
    
    a) **Scene环境**：保持与First Frame一致的Scene，但反映变化后的状态
    
    b) **光线设计**：与First Frame保持一致（除非Plot有时间变化）
    
    c) **人物描述**（重点！描述动作Done后的状态）：
       - 同样包含Age、Costume
       - **新的表情神态**（动作Done后的Mood）
       - **新的姿势位置**（动作Done后的位置）
       - 道具的新状态
    
    d) **构图与景别**：
       - 如有Shot运动，描述运动结束后的新景别
       - 人物新的位置关系
    
    e) **变化对比**（核心！）：
       - 明确描述与First Frame的差异（位置/动作/表情/道具状态）
    
    f) **画面风格**：与First Frame保持一致
    
    - endFramePromptZh: 纯中文，60-100字，包含以上所有元素
    - endFramePrompt: 纯英文，60-80词，对应中文内容的完整翻译

19. 是否需要Tail Frame (needsEndFrame):
    **必须设置为 true**：
    - 人物位置变化（走动、起身、坐下等）
    - 动作序列（拿起物品、放下东西等）
    - 状态变化（门打开/Close、物品移动等）
    - Shot运动（非Static）
    - 物品状态变化（翻页、收起等）
    
    **可以设置为 false**：
    - 纯对白（位置不变）
    - 仅表情微小变化
    - 完全静态Shot
    
    **不Confirm时设为 true**（宁可多生成不要遗漏）

【Mood标签选项】
基础Mood: happy, sad, angry, surprised, fearful, calm
氛围Mood: tense, excited, mysterious, romantic, funny, touching
语气Mood: serious, relaxed, playful, gentle, passionate, low

【风格要求】
${styleDesc}
${cinematographyGuidance ? `
${cinematographyGuidance}
` : ''}
${(() => {
  const mt = getMediaType(styleId || 'cinematic');
  return mt !== 'cinematic' ? `
【媒介类型约束】
${getMediaTypeGuidance(mt)}
` : '';
})()}
Shot设计原则：
- 情感对白、内心活动: CU/ECU Close ShotClose-up
- 动作场面、追逐: MS/WS + Tracking跟随
- Scene建立、过渡: WS/FS Long Shot
- 紧张对峙: 快速切换景别
- 重要物件/细节: ECUClose-up

**重要：中英文字段必须严格分离！**
- visualDescription, ambientSound, soundEffect, imagePromptZh, videoPromptZh, endFramePromptZh → **必须是纯中文**
- visualPrompt, imagePrompt, videoPrompt, endFramePrompt → **必须是纯英文**

请以JSON格式Back，格式为:
{
  "shots": {
    "shot_id_1": {
      "visualDescription": "窗外栩子花绽放，餐桌旁，张明神情紧张地与父母吃饭，父亲手持985研究生毕业证书反复观看。",
      "visualPrompt": "Gardenias blooming outside window, at dining table Zhang Ming eating nervously with parents, father holding graduate certificate examining it repeatedly",
      "shotSize": "MS",
      "cameraMovement": "static",
      "specialTechnique": "none",
      "duration": 5,
      "emotionTags": ["tense", "serious"],
      "characterNames": ["张明", "张父", "张母"],
      "ambientSound": "餐厅Ambient Sound，碗筷轻碰声",
      "soundEffect": "",
      "narrativeFunction": "铺垫",
      "shotPurpose": "建立家庭表面和谐但暗藏张力的氛围，用毕业证书暗示父亲对儿子的期望",
      "visualFocus": "窗外栀子花 → 张明紧张的脸 → 父亲手中的证书",
      "cameraPosition": "张明侧后方45°，可见三人关系",
      "characterBlocking": "张明(中) vs 父母(两侧)，形成包围感",
      "rhythm": "缓慢、压抑，营造表面平静下的紧张感",
      "lightingStyle": "natural",
      "lightingDirection": "side",
      "colorTemperature": "warm-3200K",
      "lightingNotes": "午后侧光透过窗户，形成温暖但带有压迫感的明暗对比",
      "depthOfField": "medium",
      "focusTarget": "张明紧张的面部表情",
      "focusTransition": "rack-focus",
      "cameraRig": "tripod",
      "movementSpeed": "static",
      "atmosphericEffects": ["自然光斑"],
      "effectIntensity": "subtle",
      "playbackSpeed": "normal",
      "cameraAngle": "eye-level",
      "focalLength": "50mm",
      "photographyTechnique": "",
      "imagePrompt": "Cinematic medium shot, modern Chinese family dining room, warm afternoon sunlight through window with blooming gardenias outside, young man Zhang Ming (25, casual clothes, tense expression) sitting at dining table with his middle-aged parents, father (50s, stern face, holding graduate certificate examining it), mother (50s, worried look) beside them, wooden dining table with home-cooked dishes, warm color tones, realistic film style",
      "imagePromptZh": "电影感Medium Shot，现代中式家庭餐厅，午后温暖阳光透过窗户洒入，窗外栩子花盛开。青年张明（25岁，休闲装，神情紧张）坐在餐桌旁，中年父亲（50多岁，严肃表情，手持985研究生毕业证书反复查看），母亲（50多岁，担忧神情）坐在旁边。木质餐桌上摆着家常菜肴，温暖色调，写实电影风格。",
      "videoPrompt": "Father repeatedly examining graduate certificate with focused attention, Zhang Ming eating nervously with chopsticks, occasionally glancing at father, mother sitting beside watching silently with worried expression",
      "videoPromptZh": "父亲专注地反复观看毕业证书，张明用筷子紧张地吃饭，不时偷瞄父亲，母亲坐在旁边默默看着，神情担忧。",
      "needsEndFrame": true,
      "endFramePrompt": "Cinematic medium shot, same modern Chinese family dining room, warm afternoon light. Father (50s) now lowering the certificate with satisfied yet stern expression, Zhang Ming (25) stopped eating and looking down nervously, mother (50s) glancing between husband and son with concern. Certificate now placed on table beside dishes, tense atmosphere, warm color tones, realistic film style",
      "endFramePromptZh": "电影感Medium Shot，同样的现代中式家庭餐厅，午后温暖光线。父亲（50多岁）已放下证书，表情满意但仍严肃；张明（25岁）停下筷子，低头神情紧张；母亲（50多岁）目光在父子之间游移，神情担忧。证书已放在餐桌上菜肴旁边，气氛紧张，温暖色调，写实电影风格。"
    }
  }
}

**特别注意**：
- 栩子花 = gardenias（不是 peonies）
- visualDescription 必须是中文，不要写英文
- ambientSound/soundEffect 必须是中文`
  
  const shotDescriptions = shots.map(shot => {
    const chars = shot.characterNames?.join('、') || 'None';
    // 检测是否包含闪回/叠画内容
    const sourceText = shot.sourceText || shot.actionSummary || '';
    const hasFlashback = /闪回|叠画|回忆|穿插/.test(sourceText);
    const flashbackNote = hasFlashback 
      ? `\n⚠️ 注意：原文包含闪回/叠画内容，但主Scene仍然是「${shot.sceneLocation}」，不要描述成另一Scene！`
      : '';
    // 构建Scene美术设计信息（如果有）
    const artDesignParts = [
      shot.architectureStyle ? `建筑风格: ${shot.architectureStyle}` : '',
      shot.colorPalette ? `色彩基调: ${shot.colorPalette}` : '',
      shot.eraDetails ? `时代特征: ${shot.eraDetails}` : '',
      shot.lightingDesign ? `光影设计: ${shot.lightingDesign}` : '',
    ].filter(Boolean);
    const artDesignSection = artDesignParts.length > 0 
      ? `\n【🎨 Scene美术设计（必须严格遵循）】\n${artDesignParts.join('\n')}` 
      : '';
    return `ID: ${shot.shotId}
【⭐ 主Scene（绝对不可更改）】: ${shot.sceneLocation}${flashbackNote}${artDesignSection}
【原始剧本文本】
${sourceText}
【已解析信息】
动作: ${shot.actionSummary}
对白: ${shot.dialogue || 'None'}
当前角色: ${chars}
氛围: ${shot.sceneAtmosphere}
时间: ${shot.sceneTime}${shot.sceneWeather ? `
Weather: ${shot.sceneWeather}` : ''}
当前景别: ${shot.currentShotSize || '待定'}
当前Shot运动: ${shot.currentCameraMovement || '待定'}`;
  }).join('\n\n═══════════════════════════════════════\n\n');
  
  const userPrompt = `请严格基于每Shot的【原始剧本文本】生成校准内容。

⚠️ 重要提醒（必须遵守）：
1. **Scene归属绝对固定**：每Shot的【主Scene】已经标注，即使原文提到闪回/叠画/回忆，主Scene仍不变
2. 不要遗漏原文中的任何关键信息（人物、动作、道具、环境）
3. 不要Add原文中没有的内容
4. **中文字段必须是纯中文**：visualDescription, ambientSound, soundEffect, imagePromptZh, videoPromptZh
5. **英文字段必须是纯英文**：visualPrompt, imagePrompt, videoPrompt, endFramePrompt
6. 角色列表必须完整
7. 栩子花 = gardenias（不是 peonies/peony）

🎬 **叙事驱动分析（基于《电影语言的语法》）**：
- 根据「本Episode大纲」判断每Shot在整Episode故事中的叙事Feature
- Shot设计必须服务于故事的Mood节奏和叙事弧线
- 景别Select要配合叙事Feature（铺垫用Wide Shot、高潮用Close-up等）
- 考虑人物布局和机位对故事张力的影响

${shotDescriptions}`;
  
  // 统一从服务映射获取配置（单Shot校准用更大 token 预算）
  const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt, { maxTokens: 16384 });
  
  // 解析 JSON 结果（增强版）
  try {
    let cleaned = result;
    
    // 移除 markdown 代码块标记
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    cleaned = cleaned.trim();
    
    // 尝试找到 JSON 对象的起止位置
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    return parsed.shots || {};
  } catch (e) {
    console.error('[calibrateShots] Failed to parse AI response:', result);
    console.error('[calibrateShots] Parse error:', e);
    
    // 尝试部分解析：提取已Done的Shot
    try {
      const partialResult: Record<string, any> = {};
      // 匹配每 shot 的完整 JSON 对象
      const shotPattern = /"(shot_[^"]+)"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g;
      let match;
      while ((match = shotPattern.exec(result)) !== null) {
        try {
          const shotId = match[1];
          const shotJson = match[2];
          partialResult[shotId] = JSON.parse(shotJson);
        } catch {
          // 单 shot Parsing failed，继续下一
        }
      }
      
      if (Object.keys(partialResult).length > 0) {
        console.log(`[calibrateShots] 部分解析Success，恢复了 ${Object.keys(partialResult).length} Shot`);
        return partialResult;
      }
    } catch {
      // 部分解析也Failed
    }
    
    throw new Error('Failed to parse AI response');
  }
}

// ==================== AI 生成每Episode大纲 ====================

export interface SynopsisGenerationResult {
  success: boolean;
  generatedCount: number;
  totalEpisodes: number;
  error?: string;
}

/**
 * AI 生成每Episode大纲
 * 基于全局背景和每Episode内容，生成简洁的Episode大纲
 */
export async function generateEpisodeSynopses(
  projectId: string,
  _options?: CalibrationOptions, // 不再需要，保留以兼容
  onProgress?: (current: number, total: number, message: string) => void
): Promise<SynopsisGenerationResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { success: false, generatedCount: 0, totalEpisodes: 0, error: 'Project does not exist' };
  }
  
  const episodes = project.episodeRawScripts;
  const totalEpisodes = episodes.length;
  
  if (totalEpisodes === 0) {
    return { success: false, generatedCount: 0, totalEpisodes: 0, error: 'No episode data' };
  }
  
  // 获取全局背景
  const background = project.projectBackground;
  const globalContext = {
    title: background?.title || project.scriptData?.title || 'Untitled剧本',
    genre: background?.genre || '',
    era: background?.era || '',
    worldSetting: background?.worldSetting || '',
    themes: background?.themes || [],
    outline: background?.outline || '',
    characterBios: background?.characterBios || '',
    totalEpisodes,
  };
  
  // 注入概览里的世界观知识（角色、阵营、核心冲突、关键物品等）
  const seriesCtx = buildSeriesContextSummary(project.seriesMeta || null);
  
  onProgress?.(0, totalEpisodes, `Starting outline generation for ${totalEpisodes} episodes...`);
  
  try {
    // 准备 batch items
    type SynopsisItem = { index: number; title: string; contentSummary: string };
    type SynopsisResult = { synopsis: string; keyEvents: string[] };
    const items: SynopsisItem[] = episodes.map(ep => ({
      index: ep.episodeIndex,
      title: ep.title,
      contentSummary: extractEpisodeSummary(ep),
    }));
    
    const { results, failedBatches, totalBatches } = await processBatched<SynopsisItem, SynopsisResult>({
      items,
      feature: 'script_analysis',
      buildPrompts: (batch) => {
        const { title, genre, era, worldSetting, themes, outline, characterBios, totalEpisodes: total } = globalContext;
        const system = `你是好莱坞资深剧本医生(Script Doctor)，擅长Analyze Script结构和叙事节奏。

你的专业能力：
- 剧本结构分析：能快速提炼每Episode的核心冲突、转折点和情感高潮
- 叙事节奏把控：理解不同类型剧Episode的节奏特点
- 关键事件提取：能准确识别推动PlotHair展的关键Scene和动作

你的任务是根据剧本全局背景和每Episode内容，为每Episode生成简洁的大纲和关键事件。
${seriesCtx ? `\n【剧级知识参考】\n${seriesCtx}\n` : ''}
【剧本信息】
剧名：${title}
类型：${genre || '未知'}
${era ? `时代背景：${era}` : ''}
${worldSetting ? `世界观：${worldSetting.slice(0, 200)}` : ''}
${themes && themes.length > 0 ? `主题：${themes.join('、')}` : ''}
总Episodes：${total}Episode

【故事大纲】
${outline.slice(0, 1000)}

【主要人物】
${characterBios.slice(0, 800)}

【要求】
为每Episode生成：
1. synopsis: 100-200字的Episode大纲，概括本Episode主要PlotHair展
2. keyEvents: 3-5关键事件，每10-20字

注意：
- 大纲要突出本Episode的核心冲突和转折
- 关键事件要具体、可视觉化
- 保持前后Episode的连贯性

请以JSON格式Back：
{
  "synopses": {
    "1": {
      "synopsis": "本Episode大纲...",
      "keyEvents": ["事件1", "事件2", "事件3"]
    }
  }
}`;
        const episodeContents = batch.map(ep => 
          `第${ep.index}Episode「${ep.title}」：\n${ep.contentSummary}`
        ).join('\n\n---\n\n');
        const user = `请为以下Episodes生成大纲和关键事件：\n\n${episodeContents}`;
        return { system, user };
      },
      parseResult: (raw) => {
        let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const result = new Map<string, SynopsisResult>();
        if (parsed.synopses) {
          for (const [key, value] of Object.entries(parsed.synopses)) {
            const v = value as SynopsisResult;
            result.set(key, {
              synopsis: v.synopsis || '',
              keyEvents: v.keyEvents || [],
            });
          }
        }
        return result;
      },
      estimateItemOutputTokens: () => 200, // 大纲 + keyEvents 约 200 tokens
      onProgress: (completed, total, message) => {
        onProgress?.(completed, total, `[Outline Generation] ${message}`);
      },
    });
    
    // 处理结果
    let generatedCount = 0;
    for (const ep of episodes) {
      const res = results.get(String(ep.episodeIndex));
      if (res) {
        store.updateEpisodeRawScript(projectId, ep.episodeIndex, {
          synopsis: res.synopsis,
          keyEvents: res.keyEvents,
          synopsisGeneratedAt: Date.now(),
        });
        generatedCount++;
      }
    }
    
    if (failedBatches > 0) {
      console.warn(`[Episode大纲生成] ${failedBatches}/${totalBatches} 批次Failed`);
    }
    
    onProgress?.(generatedCount, totalEpisodes, `Generated ${generatedCount}/${totalEpisodes} episode outlines`);
    
    // 大纲生成Done后，更新项目元数据 MD
    const updatedMetadata = exportProjectMetadata(projectId);
    store.setMetadataMarkdown(projectId, updatedMetadata);
    console.log('[generateSynopses] 元数据已更新，包含新生成的大纲');
    
    return {
      success: true,
      generatedCount,
      totalEpisodes,
    };
  } catch (error) {
    console.error('[generateSynopses] Error:', error);
    return {
      success: false,
      generatedCount: 0,
      totalEpisodes,
      error: error instanceof Error ? error.message : 'Outline generation failed',
    };
  }
}

// ==================== Export项目元数据 MD ====================

/**
 * Export项目元数据为 Markdown 格式
 * 类似 Cursor 的 .cursorrules，作为项目的知识库
 */
export function exportProjectMetadata(projectId: string): string {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return '# Error\n\nProject does not exist';
  }
  
  const background = project.projectBackground;
  const episodes = project.episodeRawScripts;
  const scriptData = project.scriptData;
  const meta = project.seriesMeta;
  
  const sections: string[] = [];
  
  // 标题
  const title = meta?.title || background?.title || scriptData?.title || 'Untitled剧本';
  sections.push(`# 《${title}》`);
  sections.push('');
  
  // 基本信息
  sections.push('## Basic Info');
  const genre = meta?.genre || background?.genre;
  const era = meta?.era || background?.era;
  if (genre) sections.push(`- **类型**：${genre}`);
  if (era) sections.push(`- **Era**: ${era}`);
  sections.push(`- **Total Episodes**: ${episodes.length}Episode`);
  if (meta?.language || scriptData?.language) sections.push(`- **Language**: ${meta?.language || scriptData?.language}`);
  if (meta?.logline) sections.push(`- **Logline**：${meta.logline}`);
  if (meta?.centralConflict) sections.push(`- **Core Conflict**: ${meta.centralConflict}`);
  if (meta?.themes?.length) sections.push(`- **Theme**: ${meta.themes.join('、')}`);
  sections.push('');
  
  // 故事大纲
  const outline = meta?.outline || background?.outline;
  if (outline) {
    sections.push('## Synopsis');
    sections.push(outline);
    sections.push('');
  }
  
  // 世界观设定
  const worldNotes = meta?.worldNotes || background?.worldSetting;
  if (worldNotes || meta?.powerSystem || meta?.socialSystem) {
    sections.push('## World Setting');
    if (worldNotes) sections.push(worldNotes);
    if (meta?.socialSystem) sections.push(`- **Social System**: ${meta.socialSystem}`);
    if (meta?.powerSystem) sections.push(`- **Power System**: ${meta.powerSystem}`);
    sections.push('');
  }
  
  // 地理设定
  if (meta?.geography?.length) {
    sections.push('## Geography');
    for (const g of meta.geography) {
      sections.push(`- **${g.name}**：${g.desc}`);
    }
    sections.push('');
  }
  
  // 关键物品
  if (meta?.keyItems?.length) {
    sections.push('## Key Items');
    for (const item of meta.keyItems) {
      sections.push(`- **${item.name}**：${item.desc}`);
    }
    sections.push('');
  }
  
  // 主要人物（原始小传）
  if (background?.characterBios) {
    sections.push('## Main Characters');
    sections.push(background.characterBios);
    sections.push('');
  }
  
  // 角色列表（结构化）— 优先从 seriesMeta 读取
  const characters = meta?.characters || scriptData?.characters;
  if (characters && characters.length > 0) {
    sections.push('## Character List');
    for (const char of characters) {
      sections.push(`### ${char.name}`);
      if (char.gender) sections.push(`- Gender：${char.gender}`);
      if (char.age) sections.push(`- Age：${char.age}`);
      if (char.role) sections.push(`- Role: ${char.role}`);
      if (char.personality) sections.push(`- Personality: ${char.personality}`);
      if (char.traits) sections.push(`- Traits: ${char.traits}`);
      if (char.relationships) sections.push(`- Relationships: ${char.relationships}`);
      if (char.skills) sections.push(`- Skills: ${char.skills}`);
      sections.push('');
    }
  }
  
  // 阵营/势力
  if (meta?.factions?.length) {
    sections.push('## Factions / Forces');
    for (const f of meta.factions) {
      sections.push(`- **${f.name}**：${f.members.join('、')}`);
    }
    sections.push('');
  }
  
  // 剧Episode大纲
  sections.push('## Episode Outlines');
  for (const ep of episodes) {
    sections.push(`### 第${ep.episodeIndex}Episode：${ep.title.replace(/^第\d+Episode[：:]？/, '')}`);
    if (ep.synopsis) {
      sections.push(ep.synopsis);
    }
    if (ep.keyEvents && ep.keyEvents.length > 0) {
      sections.push('**Key Events:**');
      for (const event of ep.keyEvents) {
        sections.push(`- ${event}`);
      }
    }
    // 显示Scene数量
    sections.push(`> This episode contains ${ep.scenes.length} scenes`);
    sections.push('');
  }
  
  // 生成时间
  sections.push('---');
  sections.push(`*Export Time: ${new Date().toLocaleString('zh-CN')}*`);
  
  return sections.join('\n');
}

/**
 * 获取缺失大纲的Episodes
 */
export function getMissingSynopsisEpisodes(projectId: string): EpisodeRawScript[] {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project || !project.episodeRawScripts.length) {
    return [];
  }
  
  return project.episodeRawScripts.filter(ep => !ep.synopsis || ep.synopsis.trim() === '');
}
