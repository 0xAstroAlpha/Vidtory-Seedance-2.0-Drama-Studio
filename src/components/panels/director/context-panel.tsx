// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Director Context Panel Component
 * 全局右栏 - AI导演模式：显示Script层级树，让用户Select要Generate的内容
 */

import { useState, useMemo, useCallback } from "react";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { useActiveScriptProject } from "@/stores/script-store";
import { getShotCompletionStatus, calculateProgress, SHOT_SIZE_MAP } from "@/lib/script/shot-utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Film,
  MapPin,
  Circle,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Send,
  FileVideo,
  Plus,
} from "lucide-react";
import type { Shot, CompletionStatus, ScriptScene } from "@/types/script";
import { DEFAULT_STYLE_ID, getStyleById } from "@/lib/constants/visual-styles";
import { useDirectorStore, useActiveDirectorProject, type SoundEffectTag } from '@/stores/director-store';
import { useCharacterLibraryStore } from '@/stores/character-library-store';
import { useSceneStore } from '@/stores/scene-store';
import { useAppSettingsStore } from '@/stores/app-settings-store';
import { useProjectStore } from '@/stores/project-store';
import { toast } from "sonner";
import { matchSceneAndViewpoint, matchSceneAndViewpointSync, type ViewpointMatchResult } from '@/lib/scene/viewpoint-matcher';

// 状态图标
function StatusIcon({ status }: { status?: CompletionStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    case "in_progress":
      return <Clock className="h-3 w-3 text-yellow-500" />;
    default:
      return <Circle className="h-3 w-3 text-muted-foreground" />;
  }
}

// Export组件
export function DirectorContextPanel() {
  const { setActiveTab, goToDirectorWithData } = useMediaPanelStore();
  const scriptProject = useActiveScriptProject();
  const { addScenesFromScript, setStoryboardConfig } = useDirectorStore();
  const { resourceSharing } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();
  
  // Get current project data
  const projectData = useActiveDirectorProject();
  const splitScenes = projectData?.splitScenes || [];
  const storyboardStatus = projectData?.storyboardStatus || 'idle';
  
  // 获取Scene Library数据
  const { scenes } = useSceneStore();
  const sceneLibraryScenes = useMemo(() => {
    if (resourceSharing.shareScenes) return scenes;
    if (!activeProjectId) return [];
    return scenes.filter((s) => s.projectId === activeProjectId);
  }, [scenes, resourceSharing.shareScenes, activeProjectId]);

  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<string>>(new Set(["default", "ep_1"]));
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  const scriptData = scriptProject?.scriptData || null;
  const shots = scriptProject?.shots || [];
  const styleId = scriptProject?.styleId || DEFAULT_STYLE_ID;

  // 从ScriptAddShot时，同步Script风格到导演面板的 storyboardConfig
  const addScenesAndSyncStyle: typeof addScenesFromScript = useCallback((scenes) => {
    addScenesFromScript(scenes);
    // 如果导演面板尚Not set visualStyleId，从Script项目继承
    const directorStyleId = projectData?.storyboardConfig?.visualStyleId;
    if (!directorStyleId && scriptProject?.styleId) {
      const style = getStyleById(scriptProject.styleId);
      if (style) {
        setStoryboardConfig({ visualStyleId: style.id, styleTokens: [style.prompt] });
        console.log('[ContextPanel] Synced script styleId to director:', style.id);
      }
    }
  }, [addScenesFromScript, setStoryboardConfig, projectData?.storyboardConfig?.visualStyleId, scriptProject?.styleId]);

  // 如果没Has episodes，Create一Default的
  const episodes = useMemo(() => {
    if (!scriptData) return [];
    if (scriptData.episodes && scriptData.episodes.length > 0) {
      return scriptData.episodes;
    }
    // Default单Episode
    return [{
      id: "default",
      index: 1,
      title: scriptData.title || "Episode 1",
      sceneIds: scriptData.scenes.map((s) => s.id),
    }];
  }, [scriptData]);

  // 按Scene分组的shots
  const shotsByScene = useMemo(() => {
    const map: Record<string, Shot[]> = {};
    shots.forEach((shot) => {
      const sceneId = shot.sceneRefId;
      if (!map[sceneId]) map[sceneId] = [];
      map[sceneId].push(shot);
    });
    return map;
  }, [shots]);

  const handleBackToScript = () => {
    setActiveTab("script");
  };

  const toggleEpisode = (id: string) => {
    setExpandedEpisodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleScene = (id: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 获取Character Library中的所Has 角色
  const { characters } = useCharacterLibraryStore();
  const libraryCharacters = useMemo(() => {
    if (resourceSharing.shareCharacters) return characters;
    if (!activeProjectId) return [];
    return characters.filter((c) => c.projectId === activeProjectId);
  }, [characters, resourceSharing.shareCharacters, activeProjectId]);
  
  // 将Script角色ID或Character Name映射到Character LibraryID
  const mapScriptCharacterIdsToLibraryIds = (scriptCharIds: string[], characterNames?: string[]): string[] => {
    const libraryIds: string[] = [];
    const addedIds = new Set<string>(); // Avoid duplicates
    
    // 1. 先通过 characterIds 匹配
    if (scriptCharIds && scriptCharIds.length > 0 && scriptData) {
      for (const scriptCharId of scriptCharIds) {
        // 查找Script角色
        const scriptChar = scriptData.characters.find(c => c.id === scriptCharId);
        if (!scriptChar) continue;
        
        // 优先使用已OFF联的Character LibraryID（需校验该ID在当前可见Character Library中仍Has 效）
        if (scriptChar.characterLibraryId && !addedIds.has(scriptChar.characterLibraryId)) {
          const linkedLibraryChar = libraryCharacters.find(c => c.id === scriptChar.characterLibraryId);
          if (linkedLibraryChar) {
            libraryIds.push(linkedLibraryChar.id);
            addedIds.add(linkedLibraryChar.id);
            continue;
          }
          console.warn(`[ContextPanel] Invalid characterLibraryId "${scriptChar.characterLibraryId}" for script character "${scriptChar.name}", fallback to name matching`);
        }
        
        // 否则通过名字匹配Character Library中的角色
        const libraryChar = libraryCharacters.find(c => c.name === scriptChar.name);
        if (libraryChar && !addedIds.has(libraryChar.id)) {
          libraryIds.push(libraryChar.id);
          addedIds.add(libraryChar.id);
        }
      }
    }
    
    // 2. 再通过 characterNames 补充匹配（AI校准的Shot可能只Has Name）
    if (characterNames && characterNames.length > 0) {
      for (const charName of characterNames) {
        if (!charName) continue;
        
        // 精确匹配
        let libraryChar = libraryCharacters.find(c => c.name === charName);
        
        // 模糊匹配：Character LibraryName包含Shot角色名，或Shot角色名包含Character LibraryName
        if (!libraryChar) {
          libraryChar = libraryCharacters.find(c => 
            c.name.includes(charName) || charName.includes(c.name)
          );
        }
        
        if (libraryChar && !addedIds.has(libraryChar.id)) {
          libraryIds.push(libraryChar.id);
          addedIds.add(libraryChar.id);
          console.log(`[ContextPanel] Matched character "${charName}" to library "${libraryChar.name}"`);
        }
      }
    }
    
    return libraryIds;
  };
  
  // 根据Shot和Scene Info查找匹配的Scene LibraryViewpoint
  // 优先使用AI分析的shotIdsOFF联，保底用ShotIndex对应ViewpointIndex
  const findMatchingSceneAndViewpointQuick = (shot: Shot, scene: ScriptScene, shotIndexInScene?: number): ViewpointMatchResult | null => {
    const sceneName = scene.name || '';
    
    // 找到Scene Library中匹配的父Scene
    const parentScene = sceneLibraryScenes.find(s => 
      !s.parentSceneId && !s.isViewpointVariant &&
      (s.name.includes(sceneName) || sceneName.includes(s.name))
    );
    
    if (!parentScene) {
      console.log(`[findMatchingSceneAndViewpointQuick] 未找到匹配的父Scene: "${sceneName}"`);
      return null;
    }
    
    // 获取该父Scene的所Has Viewpoint变体，按Create时间排序
    const variants = sceneLibraryScenes
      .filter(s => s.parentSceneId === parentScene.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    
    console.log(`[findMatchingSceneAndViewpointQuick] Scene "${sceneName}" Has  ${variants.length} Viewpoint变体`);
    
    if (variants.length === 0) {
      // 没Has Viewpoint变体，Back父Scene
      return {
        sceneLibraryId: parentScene.id,
        viewpointId: undefined,
        sceneReferenceImage: parentScene.referenceImage || parentScene.referenceImageBase64,
        matchedSceneName: parentScene.name,
        matchMethod: 'fallback' as const,
        confidence: 0.5,
      };
    }
    
    // 方案一：优先检查Scene LibraryViewpoint变体的shotIds（切割时Save的）
    const variantWithShot = variants.find(v => v.shotIds?.includes(shot.id));
    if (variantWithShot) {
      console.log(`[findMatchingSceneAndViewpointQuick] 通过Scene LibraryshotIdsMatched:  Shot${shot.id} -> Viewpoint "${variantWithShot.viewpointName || variantWithShot.name}"`);
      return {
        sceneLibraryId: variantWithShot.id,
        viewpointId: variantWithShot.viewpointId,
        sceneReferenceImage: variantWithShot.referenceImage || variantWithShot.referenceImageBase64,
        matchedSceneName: variantWithShot.viewpointName || variantWithShot.name,
        matchMethod: 'keyword' as const,
        confidence: 0.98,
      };
    }
    
    // 方案二：检查Scriptscene.viewpoints的shotIds（AI分析时Save的）
    if (scene.viewpoints && scene.viewpoints.length > 0) {
      const matchedViewpoint = scene.viewpoints.find(v => v.shotIds?.includes(shot.id));
      if (matchedViewpoint) {
        // 在Scene LibraryViewpoint变体中找到同名的
        const matchedVariant = variants.find(v => {
          const variantName = v.viewpointName || v.name || '';
          return variantName.includes(matchedViewpoint.name) || matchedViewpoint.name.includes(variantName);
        });
        if (matchedVariant) {
          console.log(`[findMatchingSceneAndViewpointQuick] 通过ScriptshotIdsMatched:  Shot${shot.id} -> Viewpoint "${matchedVariant.viewpointName || matchedVariant.name}"`);
          return {
            sceneLibraryId: matchedVariant.id,
            viewpointId: matchedVariant.viewpointId,
            sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
            matchedSceneName: matchedVariant.viewpointName || matchedVariant.name,
            matchMethod: 'keyword' as const,
            confidence: 0.95,
          };
        }
      }
    }
    
    // 方案三：保底 - 按ShotIndex对应Viewpoint变体Index
    // Shot1 -> Viewpoint1，Shot2 -> Viewpoint2，...
    // 如果Shot Count超过Viewpoint数，循环使用
    const variantIndex = shotIndexInScene !== undefined 
      ? shotIndexInScene % variants.length 
      : 0;
    
    const matchedVariant = variants[variantIndex];
    
    console.log(`[findMatchingSceneAndViewpointQuick] 通过IndexMatched:  ShotIndex ${(shotIndexInScene ?? 0) + 1} -> Viewpoint变体 ${variantIndex + 1}: "${matchedVariant.viewpointName || matchedVariant.name}"`);
    
    return {
      sceneLibraryId: matchedVariant.id,
      viewpointId: matchedVariant.viewpointId,
      sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
      matchedSceneName: matchedVariant.viewpointName || matchedVariant.name,
      matchMethod: 'keyword' as const,
      confidence: 0.9,
    };
  };
  
  // 在Scene Library中查找匹配的Viewpoint
  const findViewpointInLibrary = (sceneName: string, viewpointName: string): ViewpointMatchResult | null => {
    console.log(`[findViewpointInLibrary] 查找Scene: "${sceneName}", Viewpoint: "${viewpointName}"`);
    console.log(`[findViewpointInLibrary] Scene Library总数: ${sceneLibraryScenes.length}`);
    
    // 找到匹配的父Scene
    const parentScenes = sceneLibraryScenes.filter(s => 
      !s.parentSceneId && !s.isViewpointVariant &&
      (s.name.includes(sceneName) || sceneName.includes(s.name))
    );
    
    console.log(`[findViewpointInLibrary] 匹配的父Scene数: ${parentScenes.length}`, parentScenes.map(s => s.name));
    
    if (parentScenes.length === 0) return null;
    
    // 在父Scene的Viewpoint变体中查找匹配的Viewpoint
    for (const parent of parentScenes) {
      const variants = sceneLibraryScenes.filter(s => s.parentSceneId === parent.id);
      console.log(`[findViewpointInLibrary] 父Scene "${parent.name}" 的Viewpoint变体数: ${variants.length}`, 
        variants.map(v => ({ name: v.name, viewpointName: v.viewpointName, id: v.id })));
      
      // 模糊匹配ViewpointName
      const matchedVariant = variants.find(v => {
        const variantName = v.viewpointName || v.name || '';
        const isMatch = variantName.includes(viewpointName) || viewpointName.includes(variantName);
        console.log(`[findViewpointInLibrary] 对比: "${variantName}" vs "${viewpointName}" => ${isMatch}`);
        return isMatch;
      });
      
      if (matchedVariant) {
        console.log(`[findViewpointInLibrary] ✅ 匹配Success: ${matchedVariant.viewpointName || matchedVariant.name}`);
        console.log(`[findViewpointInLibrary] Image字段:`, {
          id: matchedVariant.id,
          referenceImage: matchedVariant.referenceImage ? `Has (${matchedVariant.referenceImage.substring(0, 50)}...)` : 'None',
          referenceImageBase64: matchedVariant.referenceImageBase64 ? `Has (${matchedVariant.referenceImageBase64.substring(0, 50)}...)` : 'None',
        });
        return {
          sceneLibraryId: matchedVariant.id,
          viewpointId: matchedVariant.viewpointId,
          sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
          matchedSceneName: matchedVariant.viewpointName || matchedVariant.name,
          matchMethod: 'keyword' as const,
          confidence: 0.95,
        };
      }
    }
    
    console.log(`[findViewpointInLibrary] ❌ 未找到Viewpoint，Back父Scene`);
    // 没找到Viewpoint，Back父Scene
    const bestParent = parentScenes[0];
    return {
      sceneLibraryId: bestParent.id,
      viewpointId: undefined,
      sceneReferenceImage: bestParent.referenceImage || bestParent.referenceImageBase64,
      matchedSceneName: bestParent.name,
      matchMethod: 'fallback' as const,
      confidence: 0.5,
    };
  };
  
  // 异步版本：Keywords + AI 匹配（用于批量Add）
  const findMatchingSceneAndViewpointWithAI = async (sceneName: string, actionSummary: string): Promise<ViewpointMatchResult | null> => {
    return matchSceneAndViewpoint(sceneName, actionSummary, sceneLibraryScenes, true);
  };

  // AddSingle shot到ShotEdit（模式二）
  const handleAddShotToSplitScenes = (shot: Shot, scene: ScriptScene) => {
    // Debug: 检查 Shot 中的三层Prompt数据
    console.log('[ContextPanel] Adding shot to split scenes:', {
      shotId: shot.id,
      imagePrompt: shot.imagePrompt?.substring(0, 50),
      imagePromptZh: shot.imagePromptZh?.substring(0, 50),
      videoPrompt: shot.videoPrompt?.substring(0, 50),
      videoPromptZh: shot.videoPromptZh?.substring(0, 50),
      endFramePrompt: shot.endFramePrompt?.substring(0, 50),
      needsEndFrame: shot.needsEndFrame,
      narrativeFunction: (shot as any).narrativeFunction,
      shotPurpose: (shot as any).shotPurpose,
    });
    // 使用详细的视觉Description作为Prompt（优先）
    let promptZh = shot.visualDescription || '';
    if (!promptZh) {
      const parts: string[] = [];
      if (scene.location) parts.push(scene.location);
      if (shot.actionSummary) parts.push(shot.actionSummary);
      promptZh = parts.join(' - ');
    }
    
    // 将Script角色ID/Name映射到Character LibraryID
    const characterLibraryIds = mapScriptCharacterIdsToLibraryIds(shot.characterIds || [], shot.characterNames);
    
    // 获取Shot在Scene内的Index
    const sceneShots = shotsByScene[scene.id] || [];
    const shotIndexInScene = sceneShots.findIndex(s => s.id === shot.id);
    
    // 自动匹配Scene Library中的Scene和Viewpoint（优先使用已Has 的ViewpointOFF联）
    const sceneMatch = findMatchingSceneAndViewpointQuick(shot, scene, shotIndexInScene >= 0 ? shotIndexInScene : undefined);
    
    addScenesAndSyncStyle([{
      // Scene Info
      sceneName: sceneMatch?.matchedSceneName || scene.name || '',
      sceneLocation: scene.location || '',
      // 旧Prompt（兼容）
      promptZh,
      promptEn: shot.visualPrompt || shot.videoPrompt || '',
      // 三层Prompt系统 (Seedance 1.5 Pro)
      imagePrompt: shot.imagePrompt || '',
      imagePromptZh: shot.imagePromptZh || '',
      videoPrompt: shot.videoPrompt || '',
      videoPromptZh: shot.videoPromptZh || '',
      endFramePrompt: shot.endFramePrompt || '',
      endFramePromptZh: shot.endFramePromptZh || '',
      needsEndFrame: shot.needsEndFrame || false,
      // 角色（使用Character LibraryID）
      characterIds: characterLibraryIds,
      // Mood标签（AI校准产出）
      emotionTags: (shot.emotionTags || []) as any,
      // 景别
      shotSize: shot.shotSize ? (SHOT_SIZE_MAP[shot.shotSize] || null) as any : null,
      // Duration
      duration: shot.duration || 5,
      // Audio
      ambientSound: shot.ambientSound || '',
      soundEffects: [] as SoundEffectTag[],
      soundEffectText: shot.soundEffect || '',
      // Dialogue
      dialogue: shot.dialogue || '',
      // Action Description
      actionSummary: shot.actionSummary || '',
      // Camera Movement
      cameraMovement: shot.cameraMovement || '',
      // Special Technique
      specialTechnique: shot.specialTechnique || '',
      // Scene LibraryOFF联（自动匹配）
      sceneLibraryId: sceneMatch?.sceneLibraryId,
      viewpointId: sceneMatch?.viewpointId,
      sceneReferenceImage: sceneMatch?.sceneReferenceImage,
      // 叙事驱动设计（基于《电影语言的语法》）
      narrativeFunction: (shot as any).narrativeFunction || '',
      shotPurpose: (shot as any).shotPurpose || '',
      visualFocus: (shot as any).visualFocus || '',
      cameraPosition: (shot as any).cameraPosition || '',
      characterBlocking: (shot as any).characterBlocking || '',
      rhythm: (shot as any).rhythm || '',
      visualDescription: (shot as any).visualDescription || '',
      // 拍摄控制（灯光/焦点/器材/特效/Speed）
      lightingStyle: shot.lightingStyle,
      lightingDirection: shot.lightingDirection,
      colorTemperature: shot.colorTemperature,
      lightingNotes: shot.lightingNotes,
      depthOfField: shot.depthOfField,
      focusTarget: shot.focusTarget,
      focusTransition: shot.focusTransition,
      cameraRig: shot.cameraRig,
      movementSpeed: shot.movementSpeed,
      atmosphericEffects: shot.atmosphericEffects,
      effectIntensity: shot.effectIntensity,
      playbackSpeed: shot.playbackSpeed,
      cameraAngle: shot.cameraAngle,
      focalLength: shot.focalLength,
      photographyTechnique: shot.photographyTechnique,
    }]);
    
    const matchInfo = sceneMatch ? ` (Matched:  ${sceneMatch.matchedSceneName})` : '';
    toast.success(`Added shot to edit list${matchInfo}`);
  };

  // Add整Scene的所Has Shot到ShotEdit（模式二）
  const handleAddSceneToSplitScenes = (scene: ScriptScene) => {
    const sceneShots = shotsByScene[scene.id] || [];
    
    if (sceneShots.length === 0) {
      const fallbackPromptZh = scene.visualPrompt?.trim()
        || [scene.location, scene.atmosphere].filter(Boolean).join(' - ')
        || scene.name
        || 'SceneDescription';
      const fallbackPromptEn = scene.visualPromptEn?.trim() || '';
      const matchedScene = sceneLibraryScenes.find((s) =>
        !s.parentSceneId &&
        !s.isViewpointVariant &&
        (
          (!!scene.name && (s.name.includes(scene.name) || scene.name.includes(s.name)))
          || (!!scene.location && (s.name.includes(scene.location) || scene.location.includes(s.name)))
        )
      );

      addScenesAndSyncStyle([{
        sceneName: scene.name || scene.location || 'UntitledScene',
        sceneLocation: scene.location || '',
        promptZh: fallbackPromptZh,
        promptEn: fallbackPromptEn,
        imagePrompt: fallbackPromptEn,
        imagePromptZh: fallbackPromptZh,
        videoPrompt: fallbackPromptEn,
        videoPromptZh: fallbackPromptZh,
        endFramePrompt: '',
        endFramePromptZh: '',
        needsEndFrame: false,
        characterIds: [],
        emotionTags: [],
        shotSize: null,
        duration: 5,
        ambientSound: scene.atmosphere || '',
        soundEffects: [] as SoundEffectTag[],
        soundEffectText: '',
        dialogue: '',
        actionSummary: scene.atmosphere || '',
        cameraMovement: '',
        specialTechnique: '',
        sceneLibraryId: matchedScene?.id,
        viewpointId: undefined,
        sceneReferenceImage: matchedScene?.referenceImage || matchedScene?.referenceImageBase64,
      }]);

      const matchInfo = matchedScene ? `（已匹配Scene Library：${matchedScene.name}）` : '';
      toast.success(`No shots for this scene, created 1 scene shot${matchInfo}`);
      return;
    }
    
    let matchedCount = 0;
    const scenesToAdd = sceneShots.map((shot, shotIndexInScene) => {
      // 使用详细的视觉Description作为Prompt（优先）
      let promptZh = shot.visualDescription || '';
      if (!promptZh) {
        const parts: string[] = [];
        if (scene.location) parts.push(scene.location);
        if (shot.actionSummary) parts.push(shot.actionSummary);
        promptZh = parts.join(' - ');
      }
      
      // 将Script角色ID/Name映射到Character LibraryID
      const characterLibraryIds = mapScriptCharacterIdsToLibraryIds(shot.characterIds || [], shot.characterNames);
      
      // 自动匹配Scene Library中的Scene和Viewpoint（优先使用已Has 的ViewpointOFF联，保底用Index）
      const sceneMatch = findMatchingSceneAndViewpointQuick(shot, scene, shotIndexInScene);
      if (sceneMatch) matchedCount++;
      
      return {
        // Scene Info
        sceneName: sceneMatch?.matchedSceneName || scene.name || '',
        sceneLocation: scene.location || '',
        // 旧Prompt（兼容）
        promptZh,
        promptEn: shot.visualPrompt || shot.videoPrompt || '',
        // 三层Prompt系统 (Seedance 1.5 Pro)
        imagePrompt: shot.imagePrompt || '',
        imagePromptZh: shot.imagePromptZh || '',
        videoPrompt: shot.videoPrompt || '',
        videoPromptZh: shot.videoPromptZh || '',
        endFramePrompt: shot.endFramePrompt || '',
        endFramePromptZh: shot.endFramePromptZh || '',
        needsEndFrame: shot.needsEndFrame || false,
        // 角色（使用Character LibraryID）
        characterIds: characterLibraryIds,
        // Mood标签（AI校准产出）
        emotionTags: (shot.emotionTags || []) as any,
        // 景别
        shotSize: shot.shotSize ? (SHOT_SIZE_MAP[shot.shotSize] || null) as any : null,
        // Duration
        duration: shot.duration || 5,
        // Audio
        ambientSound: shot.ambientSound || '',
        soundEffects: [] as SoundEffectTag[],
        soundEffectText: shot.soundEffect || '',
        // Dialogue
        dialogue: shot.dialogue || '',
        // Action Description
        actionSummary: shot.actionSummary || '',
        // Camera Movement
        cameraMovement: shot.cameraMovement || '',
        // Special Technique
        specialTechnique: shot.specialTechnique || '',
        // Scene LibraryOFF联（自动匹配）
        sceneLibraryId: sceneMatch?.sceneLibraryId,
        viewpointId: sceneMatch?.viewpointId,
        sceneReferenceImage: sceneMatch?.sceneReferenceImage,
        // 叙事驱动设计（基于《电影语言的语法》）
        narrativeFunction: (shot as any).narrativeFunction || '',
        shotPurpose: (shot as any).shotPurpose || '',
        visualFocus: (shot as any).visualFocus || '',
        cameraPosition: (shot as any).cameraPosition || '',
        characterBlocking: (shot as any).characterBlocking || '',
        rhythm: (shot as any).rhythm || '',
        visualDescription: (shot as any).visualDescription || '',
        // 拍摄控制（灯光/焦点/器材/特效/Speed）
        lightingStyle: shot.lightingStyle,
        lightingDirection: shot.lightingDirection,
        colorTemperature: shot.colorTemperature,
        lightingNotes: shot.lightingNotes,
        depthOfField: shot.depthOfField,
        focusTarget: shot.focusTarget,
        focusTransition: shot.focusTransition,
        cameraRig: shot.cameraRig,
        movementSpeed: shot.movementSpeed,
        atmosphericEffects: shot.atmosphericEffects,
        effectIntensity: shot.effectIntensity,
        playbackSpeed: shot.playbackSpeed,
        cameraAngle: shot.cameraAngle,
        focalLength: shot.focalLength,
        photographyTechnique: shot.photographyTechnique,
      };
    });
    
    addScenesAndSyncStyle(scenesToAdd);
    const matchInfo = matchedCount > 0 ? ` (${matchedCount}已匹配Scene Library)` : '';
    toast.success(`Added  ${scenesToAdd.length}  shots to edit list${matchInfo}`);
  };

  // Hair送Single shot到AI导演输入（模式一）
  const handleSendShot = (shot: Shot, scene: ScriptScene) => {
    // 构建故事Notice
    const parts: string[] = [];
    if (scene.location) parts.push(`Scene：${scene.location}`);
    if (scene.time) parts.push(`Time: ${scene.time}`);
    if (shot.actionSummary) parts.push(`Action: ${shot.actionSummary}`);
    if (shot.dialogue) parts.push(`Dialogue：${shot.dialogue}`);

    const storyPrompt = parts.join("\n");

    // 提取角色名
    const characterNames: string[] = [];
    if (shot.characterIds && scriptData) {
      shot.characterIds.forEach((charId) => {
        const char = scriptData.characters.find((c) => c.id === charId);
        if (char) characterNames.push(char.name);
      });
    }

    goToDirectorWithData({
      storyPrompt,
      characterNames,
      sceneLocation: scene.location,
      sceneTime: scene.time,
      shotId: shot.id,
      sceneCount: 1,
      styleId,
      sourceType: "shot",
    });

    setSelectedShotId(shot.id);
    setSelectedSceneId(null);
  };

  // Hair送整Scene到AI导演输入
  const handleSendScene = (scene: ScriptScene) => {
    const sceneShots = shotsByScene[scene.id] || [];

    // 构建故事Notice - 合并Scene下所Has Shot
    const parts: string[] = [];
    if (scene.location) parts.push(`Scene：${scene.location}`);
    if (scene.time) parts.push(`Time: ${scene.time}`);
    if (scene.atmosphere) parts.push(`Mood: ${scene.atmosphere}`);

    // Add所Has Shot的动作和Dialogue
    sceneShots.forEach((shot, idx) => {
      const shotParts: string[] = [];
      if (shot.actionSummary) shotParts.push(shot.actionSummary);
      if (shot.dialogue) shotParts.push(`"${shot.dialogue}"`);
      if (shotParts.length > 0) {
        parts.push(`[Shot${idx + 1}] ${shotParts.join(" - ")}`);
      }
    });

    const storyPrompt = parts.join("\n");

    // 收EpisodeScene中所Has 角色
    const characterNames: string[] = [];
    if (scriptData) {
      const charIds = new Set<string>();
      sceneShots.forEach((shot) => {
        shot.characterIds?.forEach((id) => charIds.add(id));
      });
      charIds.forEach((charId) => {
        const char = scriptData.characters.find((c) => c.id === charId);
        if (char) characterNames.push(char.name);
      });
    }

    goToDirectorWithData({
      storyPrompt,
      characterNames,
      sceneLocation: scene.location,
      sceneTime: scene.time,
      sceneCount: sceneShots.length || 1,
      styleId,
      sourceType: "scene",
    });

    setSelectedSceneId(scene.id);
    setSelectedShotId(null);
  };

  // 没Has Script数据时显示Notice
  if (!scriptData) {
    return (
      <div className="h-full min-w-0 flex flex-col overflow-x-hidden">
        <div className="p-3 border-b">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <FileVideo className="h-4 w-4" />
            Script结构
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-muted-foreground text-sm">
            <p>NoneScript数据</p>
            <p className="mt-1">Please first在Script面板Parse Script</p>
          </div>
        </div>
        <div className="p-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleBackToScript}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            去Script面板
          </Button>
        </div>
      </div>
    );
  }

  // 计算整体Progress
  const overallProgress = calculateProgress(
    shots.map((s) => ({ status: getShotCompletionStatus(s) }))
  );

  return (
    <div className="h-full min-w-0 flex flex-col overflow-x-hidden">
      {/* Title and Progress */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">{scriptData.title}</h3>
            {scriptData.genre && (
              <span className="text-xs text-muted-foreground">{scriptData.genre}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Progress: {overallProgress}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Click scene/shot to send to AI Director input
        </p>
        {/* Shot Edit Count */}
        {splitScenes.length > 0 && (
          <div className="mt-2 px-2 py-1 bg-green-500/10 rounded text-xs text-green-600 flex items-center gap-1">
            <Plus className="h-3 w-3" />
            <span>Added  {splitScenes.length}  shots to edit list</span>
          </div>
        )}
      </div>

      {/* Tree Structure */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Episode List */}
          {episodes.map((episode) => {
            const episodeScenes = scriptData.scenes.filter((s) =>
              episode.sceneIds.includes(s.id)
            );
            const episodeShots = shots.filter((shot) =>
              episodeScenes.some((s) => s.id === shot.sceneRefId)
            );
            const episodeProgress = calculateProgress(
              episodeShots.map((s) => ({ status: getShotCompletionStatus(s) }))
            );

            return (
              <div key={episode.id} className="space-y-0.5">
                {/* Episode Title */}
                <button
                  onClick={() => toggleEpisode(episode.id)}
                  className="w-full flex items-center gap-1 px-2 py-1.5 rounded hover:bg-muted text-left"
                >
                  {expandedEpisodes.has(episode.id) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <Film className="h-3 w-3 text-primary" />
                  <span className="text-sm font-medium flex-1 truncate">
                    {episode.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {episodeProgress}
                  </span>
                </button>

                {/* Scene List */}
                {expandedEpisodes.has(episode.id) && (
                  <div className="ml-4 space-y-0.5">
                    {episodeScenes.map((scene) => {
                      const sceneShots = shotsByScene[scene.id] || [];
                      const sceneProgress = calculateProgress(
                        sceneShots.map((s) => ({ status: getShotCompletionStatus(s) }))
                      );
                      const isSceneSelected = selectedSceneId === scene.id;

                      return (
                        <div key={scene.id} className="space-y-0.5">
                          {/* Scene Title */}
                          <div className="flex items-center group">
                            <button
                              onClick={() => toggleScene(scene.id)}
                              className={cn(
                                "flex-1 flex items-center gap-1 px-2 py-1 rounded hover:bg-muted text-left",
                                isSceneSelected && "bg-primary/10 ring-1 ring-primary/30"
                              )}
                            >
                              {sceneShots.length > 0 ? (
                                expandedScenes.has(scene.id) ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )
                              ) : (
                                <span className="w-3" />
                              )}
                              <MapPin className="h-3 w-3 text-blue-500" />
                              <span className="text-xs flex-1 truncate">
                                {scene.name || scene.location}
                              </span>
                              <StatusIcon status={scene.status} />
                              <span className="text-xs text-muted-foreground">
                                {sceneProgress}
                              </span>
                            </button>
                            {/* AddScene所Has Shot到ShotEdit */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddSceneToSplitScenes(scene);
                              }}
                              title="Add所Has Shot到ShotEdit"
                            >
                              <Plus className="h-3 w-3 text-green-500" />
                            </Button>
                            {/* Send Scene Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendScene(scene);
                              }}
                              title="Send full scene to AI Director to generates images"
                            >
                              <Send className="h-3 w-3 text-primary" />
                            </Button>
                          </div>

                          {/* Shot List */}
                          {expandedScenes.has(scene.id) && sceneShots.length > 0 && (
                            <div className="ml-4 space-y-0.5">
                              {sceneShots.map((shot) => {
                                const isShotSelected = selectedShotId === shot.id;

                                return (
                                  <div key={shot.id} className="flex items-center group">
                                    <button
                                      onClick={() => handleSendShot(shot, scene)}
                                      onDoubleClick={() => handleAddShotToSplitScenes(shot, scene)}
                                      className={cn(
                                        "flex-1 flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-left",
                                        isShotSelected && "bg-primary/10 ring-1 ring-primary/30"
                                      )}
                                      title="Click: Send to AI Input | Double-click: Add to Shot Edit"
                                    >
                                      <span className="text-xs font-mono text-muted-foreground w-5">
                                        {String(shot.index).padStart(2, "0")}
                                      </span>
                                      <span className="text-xs flex-1 truncate">
                                        {shot.shotSize || "Shot"} - {shot.actionSummary?.slice(0, 20)}...
                                      </span>
                                      <StatusIcon
                                        status={getShotCompletionStatus(shot)}
                                      />
                                    </button>
                                    {/* Add to Shot Button */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddShotToSplitScenes(shot, scene);
                                      }}
                                      title="Add to Shot Edit"
                                    >
                                      <Plus className="h-3 w-3 text-green-500" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Bottom Actions */}
      <div className="p-3 border-t space-y-2">
        {/* Mode Explain */}
        <div className="text-[10px] text-muted-foreground space-y-1">
          <p><span className="text-green-500">+</span> Add到Shot（单独Generate Image）</p>
          <p><span className="text-primary">→</span> Hair送到输入（Batch Generate省钱）</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleBackToScript}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          BackScript
        </Button>
      </div>
    </div>
  );
}
