// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Shot卡片组件 (Split Scene Card Component)
 * 显示Single shot的所Has 信息，包括First Frame/Tail FrameImage、Video Preview、PromptEdit等
 * 用于 SplitScene 类型（与 scene-card.tsx 中的 AIScene 类型不同）
 */

import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { readImageAsBase64 } from "@/lib/image-storage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  type SplitScene,
  type EmotionTag,
  type ShotSizeType,
  type DurationType,
  type SoundEffectTag,
  CAMERA_MOVEMENT_PRESETS,
  SPECIAL_TECHNIQUE_PRESETS,
  CAMERA_ANGLE_PRESETS,
  PHOTOGRAPHY_TECHNIQUE_PRESETS,
  FOCAL_LENGTH_PRESETS,
} from "@/stores/director-store";
import type { PromptLanguage } from "@/types/script";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Play,
  ImageIcon,
  AlertCircle,
  Loader2,
  Sparkles,
  Download,
  RefreshCw,
  Upload,
  MapPin,
  RotateCw,
  Camera,
  Grid2X2,
  Square,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { EmotionTags } from "./emotion-tags";
import { ShotSizeSelector } from "./shot-size-selector";
import { DurationSelector } from "./duration-selector";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { usePreviewStore } from "@/stores/preview-store";
import { CharacterSelector } from "./character-selector";
import { SceneLibrarySelector } from "./scene-library-selector";
import { MediaLibrarySelector } from "./media-library-selector";
import { EditableTextField } from "./editable-text-field";
import { useResolvedImageUrl } from "@/hooks/use-resolved-image-url";

export interface SplitSceneCardProps {
  scene: SplitScene;
  /** Prompt语言设置（来自Script面板），决StopEdit/显示哪语言字段 */
  promptLanguage?: PromptLanguage;
  // 三层Prompt更新回调
  onUpdateImagePrompt: (id: number, prompt: string, promptZh?: string) => void;
  onUpdateVideoPrompt: (id: number, prompt: string, promptZh?: string) => void;
  onUpdateEndFramePrompt: (id: number, prompt: string, promptZh?: string) => void;
  onUpdateNeedsEndFrame: (id: number, needsEndFrame: boolean) => void;
  onUpdateEndFrame: (id: number, imageUrl: string | null) => void;
  onUpdateCharacters: (id: number, characterIds: string[]) => void;
  onUpdateCharacterVariationMap?: (id: number, map: Record<string, string>) => void;
  onUpdateEmotions: (id: number, emotionTags: EmotionTag[]) => void;
  onUpdateShotSize: (id: number, shotSize: ShotSizeType | null) => void;
  onUpdateDuration: (id: number, duration: DurationType) => void;
  onUpdateAmbientSound: (id: number, ambientSound: string) => void;
  onUpdateSoundEffects: (id: number, soundEffects: SoundEffectTag[]) => void;
  // Scene LibraryOFF联回调
  onUpdateSceneReference?: (id: number, sceneLibraryId?: string, viewpointId?: string, referenceImage?: string, subViewId?: string) => void;
  onUpdateEndFrameSceneReference?: (id: number, sceneLibraryId?: string, viewpointId?: string, referenceImage?: string, subViewId?: string) => void;
  onDelete: (id: number) => void;
  onSaveToLibrary?: (scene: SplitScene, type: 'image' | 'video') => void;
  onGenerateImage?: (sceneId: number) => void;
  onGenerateVideo?: (sceneId: number) => void;
  onGenerateEndFrame?: (sceneId: number) => void;
  onRemoveImage?: (sceneId: number) => void;
  onUploadImage?: (sceneId: number, imageDataUrl: string) => void;
  // 通用字段更新回调（用于双击Edit）
  onUpdateField?: (sceneId: number, field: keyof SplitScene, value: any) => void;
  // 角度切换回调
  onAngleSwitch?: (sceneId: number, type: "start" | "end") => void;
  // 4-Grid回调
  onQuadGrid?: (sceneId: number, type: "start" | "end") => void;
  // 提取Video最后一帧回调
  onExtractVideoLastFrame?: (sceneId: number) => void;
  // Stop Generation回调
  onStopImageGeneration?: (sceneId: number) => void;
  onStopVideoGeneration?: (sceneId: number) => void;
  onStopEndFrameGeneration?: (sceneId: number) => void;
  isExtractingFrame?: boolean;
  isAngleSwitching?: boolean;
  isQuadGridGenerating?: boolean;
  isGeneratingAny?: boolean;
}

export function SplitSceneCard({
  scene,
  promptLanguage = 'zh',
  onUpdateImagePrompt,
  onUpdateVideoPrompt,
  onUpdateEndFramePrompt,
  onUpdateNeedsEndFrame,
  onUpdateEndFrame,
  onUpdateCharacters,
  onUpdateCharacterVariationMap,
  onUpdateEmotions,
  onUpdateShotSize,
  onUpdateDuration,
  onUpdateAmbientSound,
  onUpdateSoundEffects,
  onUpdateSceneReference,
  onUpdateEndFrameSceneReference,
  onDelete,
  onSaveToLibrary,
  onGenerateImage,
  onGenerateVideo,
  onGenerateEndFrame,
  onRemoveImage,
  onUploadImage,
  onUpdateField,
  onAngleSwitch,
  onQuadGrid,
  onExtractVideoLastFrame,
  onStopImageGeneration,
  onStopVideoGeneration,
  onStopEndFrameGeneration,
  isExtractingFrame,
  isAngleSwitching,
  isQuadGridGenerating,
  isGeneratingAny,
}: SplitSceneCardProps) {
  // Edit状态：'none' | 'image' | 'video' | 'endFrame'
  const [editingPrompt, setEditingPrompt] = useState<'none' | 'image' | 'video' | 'endFrame'>('none');
  const [editPromptValue, setEditPromptValue] = useState('');
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  // 当前选中的帧目标：'start' | 'end'，用于Media LibrarySelect
  const [selectedFrameTarget, setSelectedFrameTarget] = useState<'start' | 'end'>('start');
  const endFrameInputRef = useRef<HTMLInputElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const { setPreviewItem } = usePreviewStore();

  // Compute effective display URLs: imageDataUrl → imageHttpUrl fallback
  // (partialize strips data: base64 on save; imageHttpUrl may survive as external URL)
  const effectiveImageUrl = scene.imageDataUrl || scene.imageHttpUrl || '';
  const effectiveEndFrameUrl = scene.endFrameImageUrl || scene.endFrameHttpUrl || '';

  // Resolve local-image:// paths to displayable URLs
  const resolvedImageUrl = useResolvedImageUrl(effectiveImageUrl);
  const resolvedEndFrameUrl = useResolvedImageUrl(effectiveEndFrameUrl);

  // 根据语言设置获取对应的Prompt字段值
  const getPromptByLanguage = (zh: string | undefined, en: string | undefined): string => {
    if (promptLanguage === 'en') return en || '';
    if (promptLanguage === 'zh') return zh || '';
    // zh+en: 优先中文，回退EN
    return zh || en || '';
  };

  // ON始Edit某Prompt（根据语言Select对应字段）
  const startEditing = (type: 'image' | 'video' | 'endFrame') => {
    if (type === 'image') {
      setEditPromptValue(getPromptByLanguage(scene.imagePromptZh, scene.imagePrompt));
    } else if (type === 'video') {
      setEditPromptValue(getPromptByLanguage(scene.videoPromptZh, scene.videoPrompt));
    } else {
      setEditPromptValue(getPromptByLanguage(scene.endFramePromptZh, scene.endFramePrompt));
    }
    setEditingPrompt(type);
  };

  // SavePrompt（根据语言设置只更新对应字段，不覆盖另一种语言）
  const handleSavePrompt = () => {
    const langLabel = promptLanguage === 'en' ? 'EN' : '中文';

    if (editingPrompt === 'image') {
      if (promptLanguage === 'en') {
        // 仅EN：更新 prompt，保留 promptZh 不变
        onUpdateImagePrompt(scene.id, editPromptValue, scene.imagePromptZh);
      } else {
        // 中文 / 中EN：更新 promptZh，保留 prompt 不变
        onUpdateImagePrompt(scene.id, scene.imagePrompt, editPromptValue);
      }
      toast.success(`Shot ${scene.id + 1} First Frame${langLabel}Promptupdated`);
    } else if (editingPrompt === 'video') {
      if (promptLanguage === 'en') {
        onUpdateVideoPrompt(scene.id, editPromptValue, scene.videoPromptZh);
      } else {
        onUpdateVideoPrompt(scene.id, scene.videoPrompt, editPromptValue);
      }
      toast.success(`Shot ${scene.id + 1} Video${langLabel}Promptupdated`);
    } else if (editingPrompt === 'endFrame') {
      if (promptLanguage === 'en') {
        onUpdateEndFramePrompt(scene.id, editPromptValue, scene.endFramePromptZh);
      } else {
        onUpdateEndFramePrompt(scene.id, scene.endFramePrompt, editPromptValue);
      }
      toast.success(`Shot ${scene.id + 1} Tail Frame${langLabel}Promptupdated`);
    }
    setEditingPrompt('none');
  };

  const handleCancelEdit = () => {
    setEditingPrompt('none');
    setEditPromptValue('');
  };

  // 处理First FrameImageUpload
  const handleFirstFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onUploadImage?.(scene.id, dataUrl);
      toast.success(`Shot ${scene.id + 1} First Frameuploaded`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 处理Tail FrameImageUpload
  const handleEndFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onUpdateEndFrame(scene.id, dataUrl);
      // UploadTail Frame时自动启用 needsEndFrame，确保Video Generation时会使用Tail Frame参考
      if (!scene.needsEndFrame) {
        onUpdateNeedsEndFrame(scene.id, true);
      }
      toast.success(`Shot ${scene.id + 1} Tail Frameuploaded`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 移除Tail Frame
  const handleRemoveEndFrame = () => {
    onUpdateEndFrame(scene.id, null);
    toast.success(`Shot ${scene.id + 1} Tail Frameremoved`);
  };

  // 移除First Frame
  const handleRemoveImage = () => {
    onRemoveImage?.(scene.id);
    toast.success(`Shot ${scene.id + 1} First Frameremoved`);
  };

  // DownloadImage
  const handleDownloadImage = async (imageUrl: string, filename: string) => {
    try {
      let blob: Blob;
      if (imageUrl.startsWith('local-image://')) {
        // Electron Custom协议：通过 IPC 读取为 base64 再转 blob
        const base64 = await readImageAsBase64(imageUrl);
        if (!base64) throw new Error('Cannot read local image');
        const res = await fetch(base64);
        blob = await res.blob();
      } else {
        // data: / http: / https: 均可直接 fetch
        const res = await fetch(imageUrl);
        blob = await res.blob();
      }
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`${filename} DownloadDone`);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error('DownloadFailed');
    }
  };

  // Status helpers
  const isImageGenerating = scene.imageStatus === 'generating' || scene.imageStatus === 'uploading';
  const isVideoReady = scene.videoStatus === 'completed' && scene.videoUrl;
  const isVideoGenerating = scene.videoStatus === 'generating' || scene.videoStatus === 'uploading';
  const isVideoFailed = scene.videoStatus === 'failed';
  const isVideoModerationSkipped = isVideoFailed && scene.videoError?.startsWith('MODERATION_SKIPPED:');
  const hasImage = !!effectiveImageUrl;
  const hasEndFrame = !!effectiveEndFrameUrl;
  const canDragVideo = isVideoReady && scene.videoUrl;

  // Handle drag start for video
  const handleVideoDragStart = (e: React.DragEvent) => {
    if (!canDragVideo || !scene.videoUrl) return;
    
    const dragData = {
      id: scene.videoMediaId || `scene-${scene.id}-video`,
      type: 'video',
      name: `Shot ${scene.id + 1} - AIVideo`,
      url: scene.videoUrl,
      thumbnailUrl: scene.imageDataUrl,
      duration: 5,
    };
    
    e.dataTransfer.setData('application/x-media-item', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
    
    const dragImage = document.createElement('div');
    dragImage.className = 'bg-primary text-white px-2 py-1 rounded text-xs';
    dragImage.textContent = `Shot ${scene.id + 1} Video`;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  // 隐藏的文件Upload input
  const firstFrameInput = (
    <input
      ref={firstFrameInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleFirstFrameUpload}
    />
  );

  const endFrameInput = (
    <input
      ref={endFrameInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleEndFrameUpload}
    />
  );

  return (
    <div className="group relative border rounded-lg overflow-hidden bg-card hover:border-primary/50 transition-colors">
      {/* Shot Number and Control Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-muted-foreground">Shot #{scene.id + 1}</span>
          {(scene.sceneName || scene.sceneLocation) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary cursor-default">
                    <MapPin className="h-3 w-3" />
                    {scene.sceneName || scene.sceneLocation}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    {scene.sceneName && <p>Scene: {scene.sceneName}</p>}
                    {scene.sceneLocation && <p>Location: {scene.sceneLocation}</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <ShotSizeSelector
            value={scene.shotSize}
            onChange={(v) => onUpdateShotSize(scene.id, v)}
            disabled={isGeneratingAny}
            className="w-24"
          />
        </div>
        {!isGeneratingAny && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>DeleteShot #{scene.id + 1}？</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes all shot content, cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(scene.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Row 1: First/Tail Frame Image + Character Select */}
      <div className="p-2 space-y-2">
        <div className="flex gap-2">
          {/* First FrameImage */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <button
                onClick={() => setSelectedFrameTarget('start')}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                  selectedFrameTarget === 'start'
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                First Frame
              </button>
              {hasImage && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onAngleSwitch?.(scene.id, "start"); }}
                    disabled={isAngleSwitching}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-0.5"
                  >
                    <RotateCw className="h-2.5 w-2.5" />
                    Viewpoint
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onQuadGrid?.(scene.id, "start"); }}
                    disabled={isQuadGridGenerating}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-600 hover:bg-cyan-500/30 disabled:opacity-50 flex items-center gap-0.5"
                  >
                    <Grid2X2 className="h-2.5 w-2.5" />
                    4-Grid
                  </button>
                </div>
              )}
            </div>
            <div 
              className={cn(
                "aspect-video bg-muted rounded cursor-pointer relative group/image overflow-hidden border-2 transition-colors",
                selectedFrameTarget === 'start'
                  ? "border-primary border-solid"
                  : "border-dashed border-muted-foreground/20 hover:border-primary/50"
              )}
              onClick={() => {
                setSelectedFrameTarget('start');
                if (hasImage && resolvedImageUrl) {
                  setPreviewItem({ type: 'image', url: resolvedImageUrl, name: `Shot ${scene.id + 1} First Frame` });
                } else {
                  firstFrameInputRef.current?.click();
                }
              }}
            >
              {hasImage ? (
                <>
                  <img
                    src={resolvedImageUrl || ''}
                    alt={`Shot ${scene.id + 1} First Frame`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/image:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onAngleSwitch?.(scene.id, "start"); }}
                      disabled={isAngleSwitching}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-amber-600 disabled:opacity-50"
                      title="Switch Viewpoint"
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onQuadGrid?.(scene.id, "start"); }}
                      disabled={isQuadGridGenerating}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-cyan-600 disabled:opacity-50"
                      title="4-GridGenerate"
                    >
                      <Grid2X2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDownloadImage(resolvedImageUrl || scene.imageDataUrl, `Shot${scene.id + 1}_First Frame.png`); }}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-blue-600"
                      title="DownloadFirst Frame"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRemoveImage(); }}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-red-600"
                      title="DeleteFirst Frame"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {scene.imageSource === 'ai-generated' && (
                    <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-primary text-white px-1 rounded">AI</span>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                  <Upload className="h-4 w-4 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground/50">Upload</span>
                </div>
              )}
              {isImageGenerating && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                  <span className="text-[10px] text-white">Generating... {scene.imageProgress}%</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onStopImageGeneration?.(scene.id); }}
                    className="mt-1 px-2 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white text-[9px] flex items-center gap-0.5 transition-colors"
                    title="Stop Generation"
                  >
                    <Square className="h-2.5 w-2.5" />Stop
                  </button>
                </div>
              )}
            </div>
            {firstFrameInput}
          </div>

          {/* Tail FrameImage */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedFrameTarget('end')}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                    selectedFrameTarget === 'end'
                      ? "bg-orange-500/20 text-orange-500 font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Tail Frame
                </button>
                <button
                  onClick={() => onUpdateNeedsEndFrame(scene.id, !scene.needsEndFrame)}
                  disabled={isGeneratingAny}
                  className={cn(
                    "text-[9px] px-1 py-0.5 rounded transition-colors",
                    scene.needsEndFrame
                      ? "bg-orange-500/20 text-orange-500 hover:bg-orange-500/30"
                      : "bg-muted text-muted-foreground/60 hover:bg-muted/80"
                  )}
                >
                  {scene.needsEndFrame ? 'Required' : 'Optional'}
                </button>
              </div>
              <div className="flex items-center gap-1">
                {hasEndFrame && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAngleSwitch?.(scene.id, "end"); }}
                      disabled={isAngleSwitching}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-0.5"
                    >
                      <RotateCw className="h-2.5 w-2.5" />
                      Viewpoint
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onQuadGrid?.(scene.id, "end"); }}
                      disabled={isQuadGridGenerating}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-600 hover:bg-cyan-500/30 disabled:opacity-50 flex items-center gap-0.5"
                    >
                      <Grid2X2 className="h-2.5 w-2.5" />
                      4-Grid
                    </button>
                  </>
                )}
              {/* Tail FrameAIGenerate Button：None论是“RequiredTail Frame”还是“OptionalTail Frame”都可以Generate */}
                {!hasEndFrame && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onGenerateEndFrame?.(scene.id); }}
                    disabled={isGeneratingAny || scene.endFrameStatus === 'generating'}
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded disabled:opacity-50",
                      scene.needsEndFrame 
                        ? "bg-orange-500/20 text-orange-500 hover:bg-orange-500/30"
                        : "bg-blue-500/20 text-blue-500 hover:bg-blue-500/30"
                    )}
                  >
                    {scene.endFrameStatus === 'generating' ? (
                      <span className="flex items-center gap-0.5"><Loader2 className="h-2.5 w-2.5 animate-spin" />{scene.endFrameProgress}%</span>
                    ) : (
                      <span className="flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" />AI Generate</span>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div 
              className={cn(
                "aspect-video bg-muted rounded cursor-pointer relative group/endframe overflow-hidden border-2 transition-colors",
                selectedFrameTarget === 'end'
                  ? "border-orange-500 border-solid"
                  : scene.needsEndFrame 
                    ? "border-dashed border-orange-500/30 hover:border-orange-500/50" 
                    : "border-dashed border-blue-400/30 hover:border-blue-400/50"
              )}
              onClick={() => {
                setSelectedFrameTarget('end');
                if (hasEndFrame && resolvedEndFrameUrl) {
                  setPreviewItem({ type: 'image', url: resolvedEndFrameUrl, name: `Shot ${scene.id + 1} Tail Frame` });
                } else {
                  endFrameInputRef.current?.click();
                }
              }}
            >
              {hasEndFrame ? (
                <>
                  <img
                    src={resolvedEndFrameUrl || ''}
                    alt={`Shot ${scene.id + 1} Tail Frame`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/endframe:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onAngleSwitch?.(scene.id, "end"); }}
                      disabled={isAngleSwitching}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-amber-600 disabled:opacity-50"
                      title="Switch Viewpoint"
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onQuadGrid?.(scene.id, "end"); }}
                      disabled={isQuadGridGenerating}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-cyan-600 disabled:opacity-50"
                      title="4-GridGenerate"
                    >
                      <Grid2X2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDownloadImage(resolvedEndFrameUrl || scene.endFrameImageUrl!, `Shot${scene.id + 1}_Tail Frame.png`); }}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-blue-600"
                      title="DownloadTail Frame"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRemoveEndFrame(); }}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-red-600"
                      title="DeleteTail Frame"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {scene.endFrameSource === 'ai-generated' && (
                    <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-orange-500 text-white px-1 rounded">AI</span>
                  )}
                </>
              ) : scene.endFrameStatus === 'generating' ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-orange-500/10">
                  <Loader2 className="h-4 w-4 text-orange-500 animate-spin" />
                  <span className="text-[10px] text-orange-500">Generating... {scene.endFrameProgress}%</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onStopEndFrameGeneration?.(scene.id); }}
                    className="mt-0.5 px-2 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white text-[9px] flex items-center gap-0.5 transition-colors"
                    title="Stop Generation"
                  >
                    <Square className="h-2.5 w-2.5" />Stop
                  </button>
                </div>
              ) : scene.needsEndFrame ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-orange-500/5">
                  <span className="text-orange-500 text-lg">◉</span>
                  <span className="text-[10px] text-orange-500/70">RequiredTail Frame</span>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-blue-500/5">
                  <Upload className="h-4 w-4 text-blue-400/60" />
                  <span className="text-[10px] text-blue-400/60">Upload/Generate</span>
                </div>
              )}
            </div>
            {endFrameInput}
          </div>

          {/* Character Library + Scene Ref Select */}
          <div className="flex flex-col gap-1 justify-end">
            <CharacterSelector
              selectedIds={scene.characterIds || []}
              onChange={(ids) => onUpdateCharacters(scene.id, ids)}
              characterVariationMap={scene.characterVariationMap}
              onChangeVariation={(charId, varId) => {
                const current = { ...(scene.characterVariationMap || {}) };
                if (varId) {
                  current[charId] = varId;
                } else {
                  delete current[charId];
                }
                onUpdateCharacterVariationMap?.(scene.id, current);
              }}
              disabled={isGeneratingAny}
            />
            {onUpdateSceneReference && (
              <SceneLibrarySelector
                sceneId={scene.id}
                selectedSceneLibraryId={scene.sceneLibraryId}
                selectedViewpointId={scene.viewpointId}
                selectedSubViewId={scene.subViewId}
                isEndFrame={false}
                onChange={(sceneLibId, viewpointId, refImage, subViewId) => 
                  onUpdateSceneReference(scene.id, sceneLibId, viewpointId, refImage, subViewId)
                }
                disabled={isGeneratingAny}
              />
            )}
            {/* Scene Ref Selector - Switch by frame target */}
            {selectedFrameTarget === 'start' ? (
              // First FrameScene Reference已在上方渲染
              null
            ) : (
              // Tail Frame Scene LibrarySelect器
              onUpdateEndFrameSceneReference && (
                <SceneLibrarySelector
                  sceneId={scene.id}
                  selectedSceneLibraryId={scene.endFrameSceneLibraryId}
                  selectedViewpointId={scene.endFrameViewpointId}
                  selectedSubViewId={scene.endFrameSubViewId}
                  isEndFrame={true}
                  onChange={(sceneLibId, viewpointId, refImage, subViewId) => 
                    onUpdateEndFrameSceneReference(scene.id, sceneLibId, viewpointId, refImage, subViewId)
                  }
                  disabled={isGeneratingAny}
                />
              )
            )}
            {/* Media Library Selector - Apply by frame target */}
            {onUploadImage && (
              <MediaLibrarySelector
                sceneId={scene.id}
                isEndFrame={selectedFrameTarget === 'end'}
                onSelect={(imageUrl) => {
                  if (selectedFrameTarget === 'start') {
                    onUploadImage(scene.id, imageUrl);
                  } else {
                    onUpdateEndFrame(scene.id, imageUrl);
                  }
                }}
                disabled={isGeneratingAny}
              />
            )}
          </div>
        </div>

        {/* 第二排：Generate Image/Video按钮 + Video Preview/状态 */}
        <div className="flex items-center gap-2">
          {!hasImage ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={() => onGenerateImage?.(scene.id)}
                disabled={isGeneratingAny || isImageGenerating}
              >
                {isImageGenerating ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating... {scene.imageProgress}%</>
                ) : (
                  <><ImageIcon className="h-3 w-3 mr-1" />Generate Image</>
                )}
              </Button>
              {isImageGenerating && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs px-2"
                  onClick={() => onStopImageGeneration?.(scene.id)}
                  title="Stop Generation"
                >
                  <Square className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={isVideoReady ? "outline" : "default"}
                className="h-7 text-xs"
                onClick={() => onGenerateVideo?.(scene.id)}
                disabled={isGeneratingAny || isVideoGenerating}
              >
                {isVideoGenerating ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating... {scene.videoProgress}%</>
                ) : isVideoReady ? (
                  <><RefreshCw className="h-3 w-3 mr-1" />Regenerate</>
                ) : (
                  <><Play className="h-3 w-3 mr-1" />Generate Video</>
                )}
              </Button>
              {isVideoGenerating && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs px-2"
                  onClick={() => onStopVideoGeneration?.(scene.id)}
                  title="Stop Generation"
                >
                  <Square className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
          
          {isVideoReady && scene.videoUrl && (
            <div className="flex items-center gap-1">
              <div 
                className="flex-1 aspect-video max-w-[120px] bg-muted rounded overflow-hidden cursor-pointer relative"
                onClick={() => setPreviewItem({ type: 'video', url: scene.videoUrl!, name: `Shot ${scene.id + 1} Video` })}
                draggable={!!canDragVideo}
                onDragStart={handleVideoDragStart}
              >
                <video src={scene.videoUrl} className="w-full h-full object-cover" muted preload="none" poster={resolvedImageUrl || undefined} />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="h-4 w-4 text-white" />
                </div>
                {canDragVideo && (
                  <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-green-600 text-white px-1 rounded">Drag to Timeline</span>
                )}
              </div>
              {/* Extract Tail Frame Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExtractVideoLastFrame?.(scene.id);
                      }}
                      disabled={isExtractingFrame || isGeneratingAny}
                      className="p-1.5 rounded bg-cyan-500/20 text-cyan-600 hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
                    >
                      {isExtractingFrame ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Extract last frame to next shot's first frame</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {isVideoFailed && (
            <span className={cn(
              "text-xs flex items-center gap-1",
              isVideoModerationSkipped 
                ? "text-amber-500" 
                : "text-destructive"
            )}>
              <AlertCircle className="h-3 w-3" />
              {isVideoModerationSkipped 
                ? 'Moderation Skipped'
                : (scene.videoError || 'Generation failed')}
            </span>
          )}
        </div>

        {/* Row 3: Prompt System (Script + 3-Layer + Mood) - Colors */}
        <div className="space-y-1.5">
          {/* Collapse/Expand Header */}
          <button
            onClick={() => setShowPromptDetails(!showPromptDetails)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/50 border hover:bg-muted/70 transition-colors"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200", showPromptDetails && "rotate-90")} />
            <span className="text-xs font-medium">Prompt</span>
            {/* Fill Status Badge */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 border",
                scene.actionSummary
                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20"
                  : "bg-muted text-muted-foreground/40 border-transparent"
              )}>
                <Edit3 className="h-2.5 w-2.5" /> Script
              </span>
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 border",
                getPromptByLanguage(scene.imagePromptZh, scene.imagePrompt)
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
                  : "bg-muted text-muted-foreground/40 border-transparent"
              )}>
                <ImageIcon className="h-2.5 w-2.5" /> First Frame
              </span>
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 border",
                getPromptByLanguage(scene.endFramePromptZh, scene.endFramePrompt)
                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20"
                  : scene.needsEndFrame
                    ? "bg-orange-500/5 text-orange-400/60 border-dashed border-orange-400/30"
                    : "bg-muted text-muted-foreground/40 border-transparent"
              )}>
                ◉ Tail Frame
              </span>
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 border",
                getPromptByLanguage(scene.videoPromptZh, scene.videoPrompt)
                  ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20"
                  : "bg-muted text-muted-foreground/40 border-transparent"
              )}>
                <Play className="h-2.5 w-2.5" /> Video
              </span>
            </div>
          </button>

          {showPromptDetails ? (
            <div className="space-y-2 pl-1">
              {/* ━━ Script动作（Prompt来源）━━ 紫色左边框 */}
              <div className="border-l-[3px] border-violet-500 pl-3 py-1 space-y-1">
                <Label className="text-[10px] text-violet-600 dark:text-violet-400 flex items-center gap-1 font-medium">
                  <Edit3 className="h-3 w-3" />
                  Script动作（Prompt来源）
                </Label>
                <div className="rounded bg-violet-500/5 border border-violet-500/10">
                  <EditableTextField
                    label=""
                    value={scene.actionSummary || ''}
                    onChange={(v) => onUpdateField?.(scene.id, 'actionSummary', v)}
                    placeholder="Double click to add action (AI will generate prompts based on this)..."
                    disabled={isGeneratingAny}
                    multiline
                  />
                </div>
              </div>

              {/* ━━ First Frame Prompt - Blue border */}
              <div className="border-l-[3px] border-blue-500 pl-3 py-1 space-y-1">
                <Label className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium">
                  <ImageIcon className="h-3 w-3" />
                  First frame prompt (static shot)
                </Label>
                {editingPrompt === 'image' ? (
                  <>
                    <Textarea
                      value={editPromptValue}
                      onChange={(e) => setEditPromptValue(e.target.value)}
                      className="min-h-[150px] text-xs resize-none border-blue-500/30 focus-visible:ring-blue-500/30"
                      placeholder="DescriptionFirst Frame的静态画面..."
                      autoFocus
                    />
                    <div className="flex gap-1 justify-end mt-1">
                      <Button variant="outline" size="sm" onClick={handleCancelEdit} className="h-5 px-2 text-[10px]">
                        <X className="h-2.5 w-2.5 mr-0.5" />Cancel
                      </Button>
                      <Button size="sm" onClick={handleSavePrompt} className="h-5 px-2 text-[10px]">
                        <Check className="h-2.5 w-2.5 mr-0.5" />Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <div 
                    className="flex items-start gap-2 cursor-pointer p-1.5 rounded bg-blue-500/5 hover:bg-blue-500/10 transition-colors border border-blue-500/10"
                    onClick={() => !isGeneratingAny && startEditing('image')}
                  >
                    <p className="text-[11px] text-muted-foreground flex-1 line-clamp-6 min-h-[4.5em]">
                      {getPromptByLanguage(scene.imagePromptZh, scene.imagePrompt) || "点击AddFirst FrameDescription..."}
                    </p>
                    {!isGeneratingAny && <Edit3 className="h-2.5 w-2.5 text-blue-500/50 shrink-0 mt-0.5" />}
                  </div>
                )}
              </div>

              {/* ━━ Tail Frame Prompt - Orange border */}
              <div className="border-l-[3px] border-orange-500 pl-3 py-1 space-y-1">
                <Label className="text-[10px] text-orange-600 dark:text-orange-400 flex items-center gap-1 font-medium">
                  <span>◉</span>
                  Tail Frame Prompt{scene.needsEndFrame ? '' : '(Optional)'}
                </Label>
                {editingPrompt === 'endFrame' ? (
                  <>
                    <Textarea
                      value={editPromptValue}
                      onChange={(e) => setEditPromptValue(e.target.value)}
                      className="min-h-[150px] text-xs resize-none border-orange-500/30 focus-visible:ring-orange-500/30"
                      placeholder="DescriptionTail Frame的静态画面..."
                      autoFocus
                    />
                    <div className="flex gap-1 justify-end mt-1">
                      <Button variant="outline" size="sm" onClick={handleCancelEdit} className="h-5 px-2 text-[10px]">
                        <X className="h-2.5 w-2.5 mr-0.5" />Cancel
                      </Button>
                      <Button size="sm" onClick={handleSavePrompt} className="h-5 px-2 text-[10px]">
                        <Check className="h-2.5 w-2.5 mr-0.5" />Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <div 
                    className={cn(
                      "flex items-start gap-2 cursor-pointer p-1.5 rounded transition-colors border",
                      scene.needsEndFrame 
                        ? "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20" 
                        : "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/10"
                    )}
                    onClick={() => !isGeneratingAny && startEditing('endFrame')}
                  >
                    <p className={cn(
                      "text-[11px] flex-1 line-clamp-6 min-h-[4.5em]",
                      "text-orange-600 dark:text-orange-400"
                    )}>
                      {getPromptByLanguage(scene.endFramePromptZh, scene.endFramePrompt) || (scene.needsEndFrame ? "点击AddTail FrameDescription..." : "点击AddTail FrameDescription...(Optional)")}
                    </p>
                    {!isGeneratingAny && <Edit3 className="h-2.5 w-2.5 text-orange-500/50 shrink-0 mt-0.5" />}
                  </div>
                )}
              </div>

              {/* ━━ Video Prompt - Green border */}
              <div className="border-l-[3px] border-green-500 pl-3 py-1 space-y-1.5">
                <Label className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1 font-medium">
                  <Play className="h-3 w-3" />
                  Video Prompt (Dynamic Action)
                </Label>
                {/* Video Prompt Text */}
                {editingPrompt === 'video' ? (
                  <>
                    <Textarea
                      value={editPromptValue}
                      onChange={(e) => setEditPromptValue(e.target.value)}
                      className="min-h-[150px] text-xs resize-none border-green-500/30 focus-visible:ring-green-500/30"
                      placeholder="DescriptionVideo中的动作、运动、变化..."
                      autoFocus
                    />
                    <div className="flex gap-1 justify-end mt-1">
                      <Button variant="outline" size="sm" onClick={handleCancelEdit} className="h-5 px-2 text-[10px]">
                        <X className="h-2.5 w-2.5 mr-0.5" />Cancel
                      </Button>
                      <Button size="sm" onClick={handleSavePrompt} className="h-5 px-2 text-[10px]">
                        <Check className="h-2.5 w-2.5 mr-0.5" />Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <div 
                    className="flex items-start gap-2 cursor-pointer p-1.5 rounded bg-green-500/5 hover:bg-green-500/10 transition-colors border border-green-500/10"
                    onClick={() => !isGeneratingAny && startEditing('video')}
                  >
                    <p className="text-[11px] text-green-600 dark:text-green-400 flex-1 line-clamp-6 min-h-[4.5em]">
                      {getPromptByLanguage(scene.videoPromptZh, scene.videoPrompt) || "Click to add action description..."}
                    </p>
                    {!isGeneratingAny && <Edit3 className="h-2.5 w-2.5 text-green-500/50 shrink-0 mt-0.5" />}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Collapsed summary view */
            <div 
              className="space-y-1 p-2 rounded-md bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors border border-transparent hover:border-muted"
              onClick={() => setShowPromptDetails(true)}
            >
              <p className="text-[10px] truncate flex items-center gap-1.5">
                <span className="shrink-0 inline-flex items-center gap-0.5 text-violet-600 dark:text-violet-400 font-medium">
                  <Edit3 className="h-2.5 w-2.5" /> Script:
                </span>
                <span className="text-muted-foreground">{scene.actionSummary || 'Not set'}</span>
              </p>
              <p className="text-[10px] truncate flex items-center gap-1.5">
                <span className="shrink-0 inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-medium">
                  <ImageIcon className="h-2.5 w-2.5" /> First Frame:
                </span>
                <span className="text-muted-foreground">{getPromptByLanguage(scene.imagePromptZh, scene.imagePrompt) || 'Not set'}</span>
              </p>
              {(scene.needsEndFrame || getPromptByLanguage(scene.endFramePromptZh, scene.endFramePrompt)) && (
                <p className="text-[10px] truncate flex items-center gap-1.5">
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-orange-600 dark:text-orange-400 font-medium">
                    ◉ Tail Frame:
                  </span>
                  <span className="text-orange-600/70 dark:text-orange-400/70">{getPromptByLanguage(scene.endFramePromptZh, scene.endFramePrompt) || 'Not set'}</span>
                </p>
              )}
              <p className="text-[10px] truncate flex items-center gap-1.5">
                <span className="shrink-0 inline-flex items-center gap-0.5 text-green-600 dark:text-green-400 font-medium">
                  <Play className="h-2.5 w-2.5" /> Video:
                </span>
                <span className="text-muted-foreground">
                  {getPromptByLanguage(scene.videoPromptZh, scene.videoPrompt) || 'Not set'}
                {scene.cameraMovement && scene.cameraMovement !== 'none' && (
                    <span className="ml-1 text-green-500/50">[{CAMERA_MOVEMENT_PRESETS.find(p => p.id === scene.cameraMovement)?.label || scene.cameraMovement}]</span>
                  )}
                  {scene.specialTechnique && scene.specialTechnique !== 'none' && (
                    <span className="ml-1 text-purple-500/50">[{SPECIAL_TECHNIQUE_PRESETS.find(p => p.id === scene.specialTechnique)?.label || scene.specialTechnique}]</span>
                  )}
                  {scene.duration && <span className="ml-1 text-green-500/50">{scene.duration}s</span>}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Seconds + Shot + Mood (Always visible) */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* sec数 */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground">Secs:</span>
              <DurationSelector
                value={scene.duration || 5}
                onChange={(v) => onUpdateDuration(scene.id, v)}
                disabled={isGeneratingAny}
              />
            </div>
            {/* Camera Movement */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.cameraMovement || 'none'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'cameraMovement', v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMERA_MOVEMENT_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Special Technique */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.specialTechnique || 'none'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'specialTechnique', v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPECIAL_TECHNIQUE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Camera Angle */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.cameraAngle || 'eye-level'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'cameraAngle', v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMERA_ANGLE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.emoji} {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Focal Length */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.focalLength || '50mm'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'focalLength', v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOCAL_LENGTH_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Photography Technique */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.photographyTechnique || 'none'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'photographyTechnique', v === 'none' ? undefined : v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-[11px]">No Technique</SelectItem>
                  {PHOTOGRAPHY_TECHNIQUE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.emoji} {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 机位Description（AI Generate的自由文本） */}
          {scene.cameraPosition && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground shrink-0">Cam Pos:</span>
              <span className="text-[10px] text-muted-foreground/80 truncate">{scene.cameraPosition}</span>
            </div>
          )}
          {/* Mood */}
          <div>
            <EmotionTags
              value={scene.emotionTags || []}
              onChange={(tags) => onUpdateEmotions(scene.id, tags)}
              disabled={isGeneratingAny}
            />
          </div>
        </div>

        {/* Row 4: Audio Controls */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Audio Controls</Label>
          {/* Ambient Sound */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateField?.(scene.id, 'audioAmbientEnabled', scene.audioAmbientEnabled === false)}
              disabled={isGeneratingAny}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded shrink-0 w-12 text-center transition-colors",
                scene.audioAmbientEnabled !== false
                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground line-through"
              )}
            >
              Ambient Sound
            </button>
            <input
              type="text"
              value={scene.ambientSound || ''}
              onChange={(e) => onUpdateAmbientSound(scene.id, e.target.value)}
              placeholder="Wind, rain, birds..."
              disabled={isGeneratingAny || scene.audioAmbientEnabled === false}
              className="flex-1 h-6 px-1.5 text-[10px] rounded border bg-transparent disabled:opacity-40 placeholder:text-muted-foreground/30"
            />
          </div>
          {/* Sound Effect */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateField?.(scene.id, 'audioSfxEnabled', scene.audioSfxEnabled === false)}
              disabled={isGeneratingAny}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded shrink-0 w-12 text-center transition-colors",
                scene.audioSfxEnabled !== false
                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground line-through"
              )}
            >
              Sound Effect
            </button>
            <input
              type="text"
              value={scene.soundEffectText || ''}
              onChange={(e) => onUpdateField?.(scene.id, 'soundEffectText', e.target.value)}
              placeholder="Footsteps, door closing..."
              disabled={isGeneratingAny || scene.audioSfxEnabled === false}
              className="flex-1 h-6 px-1.5 text-[10px] rounded border bg-transparent disabled:opacity-40 placeholder:text-muted-foreground/30"
            />
          </div>
          {/* Dialogue */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateField?.(scene.id, 'audioDialogueEnabled', scene.audioDialogueEnabled === false)}
              disabled={isGeneratingAny}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded shrink-0 w-12 text-center transition-colors",
                scene.audioDialogueEnabled !== false
                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground line-through"
              )}
            >
              Dialogue
            </button>
            <input
              type="text"
              value={scene.dialogue || ''}
              onChange={(e) => onUpdateField?.(scene.id, 'dialogue', e.target.value)}
              placeholder="Character dialogue..."
              disabled={isGeneratingAny || scene.audioDialogueEnabled === false}
              className="flex-1 h-6 px-1.5 text-[10px] rounded border bg-transparent disabled:opacity-40 placeholder:text-muted-foreground/30"
            />
          </div>
          {/* Background Music */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateField?.(scene.id, 'audioBgmEnabled', !(scene.audioBgmEnabled === true))}
              disabled={isGeneratingAny}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded shrink-0 w-12 text-center transition-colors",
                scene.audioBgmEnabled === true
                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground line-through"
              )}
            >
              Music
            </button>
            <input
              type="text"
              value={scene.backgroundMusic || ''}
              onChange={(e) => onUpdateField?.(scene.id, 'backgroundMusic', e.target.value)}
              placeholder="Default禁止Background Music，如Required请ON启并填写..."
              disabled={isGeneratingAny || scene.audioBgmEnabled !== true}
              className="flex-1 h-6 px-1.5 text-[10px] rounded border bg-transparent disabled:opacity-40 placeholder:text-muted-foreground/30"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
