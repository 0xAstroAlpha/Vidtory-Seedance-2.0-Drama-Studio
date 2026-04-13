// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Director View
 * AI-powered screenplay generation and video creation panel
 * 
 * New workflow: Story Input -> Storyboard Generation -> Smart Split -> Scene Editing -> Video Generation
 */

import { useEffect } from "react";
import { useDirectorStore, useOverallProgress, useIsGenerating, useActiveDirectorProject } from "@/stores/director-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { ScreenplayInput } from "./screenplay-input";
import { StoryboardPreview } from "./storyboard-preview";
import { SplitScenes } from "./split-scenes";
import { SceneCard } from "./scene-card";
import { GenerationProgress } from "./generation-progress";
// ContextPanel moved to global RightPanel
import { Button } from "@/components/ui/button";
import { Play, Square, RotateCcw, Settings, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
// ResizablePanelGroup not needed here - using global layout
import { useState, useCallback } from "react";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { useMediaStore } from "@/stores/media-store";
import { generateStoryboardImage, generateSceneVideos } from "@/lib/storyboard";
import { getFeatureConfig } from "@/lib/ai/feature-router";
import { toast } from "sonner";

export function DirectorView() {
  // Sync active project ID from project-store
  const { activeProjectId } = useProjectStore();
  const { setActiveProjectId, ensureProject } = useDirectorStore();
  
  useEffect(() => {
    if (activeProjectId) {
      setActiveProjectId(activeProjectId);
      ensureProject(activeProjectId);
    }
  }, [activeProjectId, setActiveProjectId, ensureProject]);
  
  // Get current project data
  const projectData = useActiveDirectorProject();
  
  const {
    sceneProgress,
    startImageGeneration,
    startVideoGeneration,
    retrySceneImage,
    deleteScene,
    deleteAllScenes,
    cancelAll,
    reset,
    // Storyboard actions
    setStoryboardImage,
    setStoryboardStatus,
    setStoryboardError,
    setStoryboardConfig,
    resetStoryboard,
    setProjectFolderId,
  } = useDirectorStore();
  
  // Read from project data (with defaults for when project is not yet loaded)
  const storyboardStatus = projectData?.storyboardStatus || 'editing';
  const storyboardImage = projectData?.storyboardImage || null;
  const storyboardError = projectData?.storyboardError || null;
  const storyboardConfig = projectData?.storyboardConfig || {
    aspectRatio: '9:16' as const,
    resolution: '2K' as const,
    sceneCount: 5,
    storyPrompt: '',
  };
  const splitScenes = projectData?.splitScenes || [];
  const projectFolderId = projectData?.projectFolderId || null;
  const screenplay = projectData?.screenplay || null;
  const screenplayStatus = projectData?.screenplayStatus || 'idle';
  const screenplayError = projectData?.screenplayError || null;

  const { getApiKey, isConfigured } = useAPIConfigStore();
  const { addMediaFromUrl, getOrCreateCategoryFolder } = useMediaStore();
  const { setActiveTab } = useMediaPanelStore();
  const overallProgress = useOverallProgress();
  const isGenerating = useIsGenerating();
  const [storyboardProgress, setStoryboardProgress] = useState(0);

  // Check if required APIs are configured (check image generation feature)
  const imageGenConfig = getFeatureConfig('character_generation');
  const hasRequiredApis = !!imageGenConfig?.apiKey;

  // Step definitions for navigation
  const STEPS = [
    { id: 'idle', name: 'Input Story', storyboardStatus: 'idle' as const },
    { id: 'preview', name: 'Preview Storyboard', storyboardStatus: 'preview' as const },
    { id: 'editing', name: 'Edit Scenes', storyboardStatus: 'editing' as const },
  ];

  // Get current step index
  const getCurrentStepIndex = () => {
    if (storyboardStatus === 'idle') return 0;
    if (storyboardStatus === 'preview') return 1;
    if (storyboardStatus === 'editing') return 2;
    return 0;
  };

  const currentStepIndex = getCurrentStepIndex();

  // Navigation handlers
  const goToPrevStep = () => {
    if (currentStepIndex === 0) return;
    const prevStep = STEPS[currentStepIndex - 1];
    if (prevStep.storyboardStatus === 'idle') {
      resetStoryboard();
    } else {
      setStoryboardStatus(prevStep.storyboardStatus);
    }
  };

  const goToNextStep = () => {
    if (currentStepIndex >= STEPS.length - 1) return;
    // Can only go forward if conditions are met
    if (currentStepIndex === 0 && !storyboardImage) {
      toast.error('Please generate the storyboard first');
      return;
    }
    if (currentStepIndex === 1 && splitScenes.length === 0) {
      toast.error('Please split scenes first');
      return;
    }
    const nextStep = STEPS[currentStepIndex + 1];
    setStoryboardStatus(nextStep.storyboardStatus);
  };

  const canGoPrev = currentStepIndex > 0 && !['generating', 'splitting'].includes(storyboardStatus);
  const canGoNext = currentStepIndex < STEPS.length - 1 && 
    !['generating', 'splitting'].includes(storyboardStatus) &&
    ((currentStepIndex === 0 && storyboardImage) || 
     (currentStepIndex === 1 && splitScenes.length > 0));


  // Handle storyboard generation from ScreenplayInput
  const handleGenerateStoryboard = useCallback(async (config: {
    storyPrompt: string;
    sceneCount: number;
    aspectRatio: '16:9' | '9:16';
    resolution: '2K' | '4K';
    styleTokens: string[];
    visualStyleId?: string;
    characterDescriptions?: string[];
    characterReferenceImages?: string[];
  }) => {
    setStoryboardStatus('generating');
    setStoryboardConfig({
      aspectRatio: config.aspectRatio,
      resolution: config.resolution,
      sceneCount: config.sceneCount,
      storyPrompt: config.storyPrompt,
      visualStyleId: config.visualStyleId,
      styleTokens: config.styleTokens,
      characterDescriptions: config.characterDescriptions,
      characterReferenceImages: config.characterReferenceImages,
    });
    setStoryboardProgress(0);

    try {
      // 从服务映射获取Image Generation配置
      const featureConfig = getFeatureConfig('character_generation');
      if (!featureConfig) {
        throw new Error('Please configure the Image Generation API in Settings first');
      }
      const apiKey = featureConfig.apiKey;
      const provider = featureConfig.platform as string;
      const model = featureConfig.models[0]; // 获取第一Model
      const baseUrl = featureConfig.baseUrl;
      
      console.log('[DirectorView] Using image generation config:', { provider, model, baseUrl });

      const result = await generateStoryboardImage(
        {
          storyPrompt: config.storyPrompt,
          sceneCount: config.sceneCount,
          aspectRatio: config.aspectRatio,
          resolution: config.resolution,
          styleTokens: config.styleTokens,
          characterDescriptions: config.characterDescriptions,
          characterReferenceImages: config.characterReferenceImages,
          apiKey,
          provider,
          model,
          baseUrl,
        },
        (progress) => setStoryboardProgress(progress)
      );

      // Save to media library in AIImage system folder
      const folderId = getOrCreateCategoryFolder('ai-image');
      const mediaId = addMediaFromUrl({
        url: result.imageUrl,
        name: `Storyboard-${config.sceneCount}Scenes`,
        type: 'image',
        source: 'ai-image',
        folderId,
        projectId: activeProjectId || undefined,
      });
      console.log('[DirectorView] Saved storyboard image to AIImage folder:', mediaId);

      setStoryboardImage(result.imageUrl, mediaId);
      setStoryboardStatus('preview');
      toast.success('Storyboard generated successfully and saved to Media Library!');
    } catch (error) {
      const err = error as Error;
      console.error('[DirectorView] Storyboard generation failed:', err);
      setStoryboardError(err.message);
      setStoryboardStatus('error');
      toast.error(`Storyboard generation failed: ${err.message}`);
    }
  }, [getApiKey, setStoryboardImage, setStoryboardStatus, setStoryboardError, setStoryboardConfig, getOrCreateCategoryFolder, addMediaFromUrl, activeProjectId]);

  // Handle video generation from split scenes
  const handleGenerateVideos = useCallback(async () => {
    if (splitScenes.length === 0) {
      toast.error('No scenes available to generate');
      return;
    }

    // 从服务映射获取Video Generation配置
    const videoConfig = getFeatureConfig('video_generation');
    if (!videoConfig) {
      toast.error('Please configure the Video Generation API in Settings first');
      return;
    }
    const apiKey = videoConfig.apiKey;
    const provider = videoConfig.platform as string;
    const model = videoConfig.models[0]; // 获取第一Model
    const baseUrl = videoConfig.baseUrl;
    
    console.log('[DirectorView] Using video generation config:', { provider, model, baseUrl });

    toast.info(`Starting video generation for ${splitScenes.length} scenes... (using ${provider} ${model || ''})`);

    await generateSceneVideos(
      splitScenes.map(s => ({
        id: s.id,
        imageDataUrl: s.imageDataUrl,
        videoPrompt: s.videoPrompt,
      })),
      {
        aspectRatio: storyboardConfig.aspectRatio,
        apiKey,
        provider, // 直接传递服务映射Select的 provider
        model,
        baseUrl,
      },
      (sceneId, progress) => {
        console.log(`[DirectorView] Scene ${sceneId} progress: ${progress}%`);
      },
      (sceneId, videoUrl) => {
        toast.success(`Scene ${sceneId} video generation complete`);
        // TODO: Add video to media library
      },
      (sceneId, error) => {
        toast.error(`Scene ${sceneId} generation failed: ${error}`);
      }
    );

    toast.success('All videos generated successfully!');
  }, [splitScenes, storyboardConfig]);

  // Render based on current status (prioritize storyboard workflow)
  const renderContent = () => {
    // New storyboard workflow takes priority
    if (storyboardStatus !== 'idle') {
      switch (storyboardStatus) {
        case 'generating':
          return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-sm text-muted-foreground">Generating storyboard... {storyboardProgress}%</p>
              <p className="text-xs text-muted-foreground/60">
                {storyboardConfig.sceneCount} Scenes · {storyboardConfig.aspectRatio} · {storyboardConfig.resolution}
              </p>
            </div>
          );

        case 'preview':
          return (
            <StoryboardPreview
              onBack={() => resetStoryboard()}
              onSplitComplete={() => {}}
            />
          );

        case 'splitting':
          return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-sm text-muted-foreground">Smart splitting...</p>
            </div>
          );

        case 'editing':
          return (
            <SplitScenes
              onBack={() => resetStoryboard()}
              onGenerateVideos={handleGenerateVideos}
            />
          );

        case 'error':
          return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="text-4xl">😕</div>
              <p className="text-sm text-destructive">{storyboardError}</p>
              <Button onClick={() => resetStoryboard()} variant="outline">
                Retry
              </Button>
            </div>
          );
      }
    }

    // Legacy screenplay workflow
    switch (screenplayStatus) {
      case "idle":
        // Default: show split-scenes editing view (same as storyboardStatus === 'editing')
        return (
          <SplitScenes
            onBack={() => resetStoryboard()}
            onGenerateVideos={handleGenerateVideos}
          />
        );

      case "generating":
        return (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-sm text-muted-foreground">Generating screenplay...</p>
          </div>
        );

      case "ready":
        return (
          <div className="flex flex-col gap-4">
            {/* Screenplay preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{screenplay?.title || "Script Preview"}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {screenplay?.scenes.length || 0} Scene
                  </span>
                  {(screenplay?.scenes.length || 0) > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={deleteAllScenes}
                      title="Delete all scenes"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {screenplay?.scenes.map((scene) => (
                  <SceneCard
                    key={scene.sceneId}
                    scene={scene}
                    progress={sceneProgress.get(scene.sceneId)}
                    isPreview
                    canDelete={(screenplay?.scenes.length || 0) > 1}
                    onDelete={() => deleteScene(scene.sceneId)}
                  />
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                onClick={startImageGeneration}
                className="flex-1"
                size="lg"
                disabled={(screenplay?.scenes.length || 0) === 0}
              >
                <Play className="h-4 w-4 mr-2" />
                Generate Scene Images
              </Button>
              <Button
                variant="outline"
                onClick={reset}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case "generating_images":
        return (
          <div className="flex flex-col gap-4">
            {/* Overall progress */}
            <GenerationProgress />

            <Separator />

            {/* Scene progress list */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {screenplay?.scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneId}
                  scene={scene}
                  progress={sceneProgress.get(scene.sceneId)}
                  showImage
                />
              ))}
            </div>

            {/* Cancel button */}
            <Button
              variant="destructive"
              onClick={cancelAll}
              className="w-full"
            >
              <Square className="h-4 w-4 mr-2" />
              Cancel Generation
            </Button>
          </div>
        );

      case "images_ready":
        return (
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between py-2">
              <div>
                <h3 className="font-medium">Scene Image Preview</h3>
                <p className="text-xs text-muted-foreground">
                  Review generated images. Regenerate or delete if unsatisfied.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {screenplay?.scenes.length || 0} Scene
                </span>
                {(screenplay?.scenes.length || 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={deleteAllScenes}
                    title="Delete all scenes"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Scene images for review */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {screenplay?.scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneId}
                  scene={scene}
                  progress={sceneProgress.get(scene.sceneId)}
                  showImage
                  onRetryImage={() => retrySceneImage(scene.sceneId)}
                  canDelete={(screenplay?.scenes.length || 0) > 1}
                  onDelete={() => deleteScene(scene.sceneId)}
                />
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                onClick={startVideoGeneration}
                className="flex-1"
                size="lg"
                disabled={(screenplay?.scenes.length || 0) === 0}
              >
                <Play className="h-4 w-4 mr-2" />
                Confirm & Generate Videos
              </Button>
              <Button
                variant="outline"
                onClick={reset}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case "generating_videos":
        return (
          <div className="flex flex-col gap-4">
            {/* Overall progress */}
            <GenerationProgress />

            <Separator />

            {/* Scene progress list */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {screenplay?.scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneId}
                  scene={scene}
                  progress={sceneProgress.get(scene.sceneId)}
                  showImage
                />
              ))}
            </div>

            {/* Cancel button */}
            <Button
              variant="destructive"
              onClick={cancelAll}
              className="w-full"
            >
              <Square className="h-4 w-4 mr-2" />
              Cancel Generation
            </Button>
          </div>
        );


      case "completed":
        return (
          <div className="flex flex-col gap-4">
            <div className="text-center py-4">
              <div className="text-2xl mb-2">🎉</div>
              <h3 className="font-medium">Generation Complete!</h3>
              <p className="text-sm text-muted-foreground">
                All scenes have been generated and assets added to the media library
              </p>
            </div>

            <Separator />

            {/* Completed scenes */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {screenplay?.scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneId}
                  scene={scene}
                  progress={sceneProgress.get(scene.sceneId)}
                />
              ))}
            </div>

            {/* New screenplay button */}
            <Button onClick={reset} className="w-full">
              Create New Screenplay
            </Button>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-4xl">😕</div>
            <p className="text-sm text-destructive">{screenplayError}</p>
            <Button onClick={reset} variant="outline">
              Retry
            </Button>
          </div>
        );

      default:
        return <ScreenplayInput onGenerateStoryboard={handleGenerateStoryboard} />;
    }
  };

  const showHeaderStatus = screenplayStatus !== "idle" || storyboardStatus !== "idle";

  return (
    <div className="h-full min-w-0 flex flex-col">
      {/* Header */}
      <div className="p-3 pb-2 bg-panel">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">AI Director</h2>
          <div className="flex items-center gap-2">
            {showHeaderStatus && (
              <span className={storyboardStatus === "editing" ? "hidden" : "text-xs text-muted-foreground capitalize"}>
                {storyboardStatus === "generating" && `Storyboard ${storyboardProgress}%`}
                {storyboardStatus === "preview" && "Preview"}
                {storyboardStatus === "splitting" && "Splitting..."}
                {storyboardStatus === "editing" && "Editing Scenes"}
                {storyboardStatus === "error" && "Error"}
                {storyboardStatus === "idle" && screenplayStatus === "generating" && "Generating screenplay..."}
                {storyboardStatus === "idle" && screenplayStatus === "ready" && "Ready"}
                {storyboardStatus === "idle" && screenplayStatus === "generating_images" && `Images ${overallProgress}%`}
                {storyboardStatus === "idle" && screenplayStatus === "images_ready" && "Images Ready"}
                {storyboardStatus === "idle" && screenplayStatus === "generating_videos" && `Videos ${overallProgress}%`}
                {storyboardStatus === "idle" && screenplayStatus === "completed" && "Complete"}
                {storyboardStatus === "idle" && screenplayStatus === "error" && "Error"}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-6 px-2 text-xs"
              onClick={() => setActiveTab('settings')}
            >
              <Settings className="h-3 w-3 mr-1" />
              {hasRequiredApis ? 'API' : 'Configure API'}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto p-3 pt-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {renderContent()}
      </div>

      {/* Step Navigation Footer - hidden: storyboard generation workflow no longer used */}
      {storyboardStatus !== 'editing' && storyboardStatus !== 'idle' && (
      <div className="p-3 pt-2 border-t bg-panel">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-2">
          {STEPS.map((step, idx) => (
            <div
              key={step.id}
              className={`flex items-center gap-1 text-xs ${
                idx === currentStepIndex
                  ? 'text-primary font-medium'
                  : idx < currentStepIndex
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/50'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                idx === currentStepIndex
                  ? 'bg-primary text-primary-foreground'
                  : idx < currentStepIndex
                  ? 'bg-muted-foreground/30 text-muted-foreground'
                  : 'bg-muted text-muted-foreground/50'
              }`}>
                {idx + 1}
              </span>
              <span className="hidden sm:inline">{step.name}</span>
              {idx < STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/30 mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevStep}
            disabled={!canGoPrev}
            className="flex-1"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextStep}
            disabled={!canGoNext}
            className="flex-1"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
