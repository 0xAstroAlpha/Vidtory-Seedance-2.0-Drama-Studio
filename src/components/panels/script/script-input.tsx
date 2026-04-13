// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Script Input Component
 * 左栏：Script Input（Import/Create两种模式）
 */

import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  FileText,
  Wand2,
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  Palette,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { StylePicker } from "@/components/ui/style-picker";
import type { VisualStyleId } from "@/lib/constants/visual-styles";
import type { PromptLanguage } from "@/types/script";
import { useScriptStore } from "@/stores/script-store";

const PROMPT_LANGUAGE_OPTIONS = [
  { value: "zh", label: "Chinese Only" },
  { value: "en", label: "English Only" },
  { value: "zh+en", label: "Chinese + English" },
];

const DURATION_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "10s", label: "10s" },
  { value: "15s", label: "15s" },
  { value: "20s", label: "20s" },
  { value: "30s", label: "30s" },
  { value: "60s", label: "1 min" },
  { value: "90s", label: "1 min 30s" },
  { value: "120s", label: "2 min" },
  { value: "180s", label: "3 min" },
];

const SCENE_COUNT_OPTIONS = [
  { value: "1", label: "1 Scenes" },
  { value: "2", label: "2 Scenes" },
  { value: "3", label: "3 Scenes" },
  { value: "4", label: "4 Scenes" },
  { value: "5", label: "5 Scenes" },
  { value: "6", label: "6 Scenes" },
  { value: "8", label: "8 Scenes" },
  { value: "10", label: "10 Scenes" },
];

const SHOT_COUNT_OPTIONS = [
  { value: "3", label: "3 Shots" },
  { value: "4", label: "4 Shots" },
  { value: "5", label: "5 Shots" },
  { value: "6", label: "6 Shots" },
  { value: "8", label: "8 Shots" },
  { value: "10", label: "10 Shots" },
  { value: "12", label: "12 Shots" },
  { value: "custom", label: "Custom..." },
];

interface ScriptInputProps {
  rawScript: string;
  language: string;
  targetDuration: string;
  styleId: string;
  sceneCount?: string;
  shotCount?: string;
  parseStatus: "idle" | "parsing" | "ready" | "error";
  parseError?: string;
  chatConfigured: boolean;
  onRawScriptChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onSceneCountChange?: (value: string) => void;
  onShotCountChange?: (value: string) => void;
  onParse: () => void;
  onGenerateFromIdea?: (idea: string) => void;
  // 完整剧本Import
  onImportFullScript?: (text: string) => Promise<void>;
  importStatus?: 'idle' | 'importing' | 'ready' | 'error';
  importError?: string;
  // AI校准
  onCalibrate?: () => Promise<void>;
  calibrationStatus?: 'idle' | 'calibrating' | 'completed' | 'error';
  missingTitleCount?: number;
  // 大纲生成
  onGenerateSynopses?: () => Promise<void>;
  synopsisStatus?: 'idle' | 'generating' | 'completed' | 'error';
  missingSynopsisCount?: number;
  // Shot生成状态
  viewpointAnalysisStatus?: 'idle' | 'analyzing' | 'completed' | 'error';
  // 角色校准状态
  characterCalibrationStatus?: 'idle' | 'calibrating' | 'completed' | 'error';
  // Scene校准状态
  sceneCalibrationStatus?: 'idle' | 'calibrating' | 'completed' | 'error';
  // Second pass校准追踪（中栏独立按钮触Hair）
  secondPassTypes?: Set<string>;
  // Prompt Language
  promptLanguage?: PromptLanguage;
  onPromptLanguageChange?: (value: PromptLanguage) => void;
}

export function ScriptInput({
  rawScript,
  language,
  targetDuration,
  styleId,
  sceneCount,
  shotCount,
  parseStatus,
  parseError,
  chatConfigured,
  onRawScriptChange,
  onLanguageChange,
  onDurationChange,
  onStyleChange,
  onSceneCountChange,
  onShotCountChange,
  onParse,
  onGenerateFromIdea,
  onImportFullScript,
  importStatus,
  importError,
  onCalibrate,
  calibrationStatus,
  missingTitleCount,
  onGenerateSynopses,
  synopsisStatus,
  missingSynopsisCount,
  viewpointAnalysisStatus,
  characterCalibrationStatus,
  sceneCalibrationStatus,
  secondPassTypes,
  promptLanguage,
  onPromptLanguageChange,
}: ScriptInputProps) {
  const scriptActiveProjectId = useScriptStore((state) => state.activeProjectId);
  const inputDraft = useScriptStore((state) => {
    if (!state.activeProjectId) return null;
    return state.projects[state.activeProjectId]?.inputDraft || null;
  });
  const setInputDraft = useScriptStore((state) => state.setInputDraft);

  const [mode, setMode] = useState<"import" | "create">(inputDraft?.mode || "import");
  const [idea, setIdea] = useState(inputDraft?.idea || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCustomShotInput, setShowCustomShotInput] = useState(false);
  const [customShotValue, setCustomShotValue] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isGeneratingSynopsis, setIsGeneratingSynopsis] = useState(false);

  // Reload persisted draft when project switches
  useEffect(() => {
    setMode(inputDraft?.mode || "import");
    setIdea(inputDraft?.idea || "");
  }, [scriptActiveProjectId, inputDraft?.mode, inputDraft?.idea]);

  // Persist mode/idea draft to survive panel switching
  useEffect(() => {
    if (!scriptActiveProjectId) return;
    const timer = window.setTimeout(() => {
      setInputDraft(scriptActiveProjectId, { mode, idea });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [scriptActiveProjectId, mode, idea, setInputDraft]);

  const handleGenerate = async () => {
    if (!idea.trim() || !onGenerateFromIdea) return;
    setIsGenerating(true);
    try {
      await onGenerateFromIdea(idea);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportFullScript = async () => {
    if (!rawScript.trim() || !onImportFullScript) return;
    setIsImporting(true);
    try {
      await onImportFullScript(rawScript);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCalibrate = async () => {
    if (!onCalibrate) return;
    setIsCalibrating(true);
    try {
      await onCalibrate();
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleGenerateSynopses = async () => {
    if (!onGenerateSynopses) return;
    setIsGeneratingSynopsis(true);
    try {
      await onGenerateSynopses();
    } finally {
      setIsGeneratingSynopsis(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-3 space-y-3">
      {/* 模式切换 */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as "import" | "create")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="import" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Import
          </TabsTrigger>
          <TabsTrigger value="create" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            Create
          </TabsTrigger>
        </TabsList>

        {/* Import模式 */}
        <TabsContent value="import" className="flex-1 mt-3 overflow-y-auto">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Paste full script (including synopsis, character bios, episodes)
            </Label>
            <Textarea
              placeholder="Supported formats:
• Episode X (Episode marker)
• **1-1 Day Int Location** (Scene header)
• Characters: Character A, Character B
• Name: (Action) Dialogue
• △ Action description
• [Subtitle][Flashback] etc."
              value={rawScript}
              onChange={(e) => onRawScriptChange(e.target.value)}
              className="min-h-[200px] max-h-[40vh] resize-none text-sm overflow-y-auto"
              disabled={parseStatus === "parsing" || isImporting}
            />
            {/* Import状态Notice */}
            {importStatus === "ready" && (
              <div className="space-y-1">
                <p className="text-xs text-green-600">✓ Import successful! Click episode name on the right to generate shots</p>
                {(missingTitleCount ?? 0) > 0 && (
                  <p className="text-xs text-amber-600">
                    ⚠ {missingTitleCount} episodes missing titles, use AI calibration to generate
                  </p>
                )}
              </div>
            )}
            {importStatus === "error" && importError && (
              <p className="text-xs text-destructive">Import Failed:{importError}</p>
            )}
            
            {/* 持久Progress状态显示 - 在执行过程中始终可见 */}
            {(importStatus === 'importing' || 
              calibrationStatus === 'calibrating' || 
              synopsisStatus === 'generating' || 
              viewpointAnalysisStatus === 'analyzing' || 
              characterCalibrationStatus === 'calibrating' ||
              sceneCalibrationStatus === 'calibrating') && (
              <div className="p-4 rounded-xl bg-primary/10 border-2 border-primary/30 space-y-3 shadow-lg">
                {/* 标题：根据是否Second pass校准显示不同文案 */}
                <div className="flex items-center gap-3 text-primary">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-lg font-bold">
                    {secondPassTypes && secondPassTypes.size > 0 ? '🔄 Second pass calibration...' : 'Processing...'}
                  </span>
                </div>
                <div className="space-y-2">
                  {/* === Second pass校准模式：只显示相关步骤 === */}
                  {secondPassTypes && secondPassTypes.size > 0 ? (
                    <>
                      {/* Shot校准（Second pass） */}
                      {secondPassTypes.has('shots') && (
                        <div className={`flex items-center gap-3 py-1 ${viewpointAnalysisStatus === 'analyzing' ? 'text-primary font-bold' : viewpointAnalysisStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                          {viewpointAnalysisStatus === 'analyzing' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : viewpointAnalysisStatus === 'completed' ? (
                            <span className="text-lg">✓</span>
                          ) : (
                            <span className="w-5 h-5 rounded-full border-2 border-current" />
                          )}
                          <span className="text-base">AI Calibrate Shots</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Second pass</span>
                        </div>
                      )}
                      
                      {/* 角色校准（Second pass） */}
                      {secondPassTypes.has('characters') && (
                        <div className={`flex items-center gap-3 py-1 ${characterCalibrationStatus === 'calibrating' ? 'text-primary font-bold' : characterCalibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                          {characterCalibrationStatus === 'calibrating' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : characterCalibrationStatus === 'completed' ? (
                            <span className="text-lg">✓</span>
                          ) : (
                            <span className="w-5 h-5 rounded-full border-2 border-current" />
                          )}
                          <span className="text-base">AI Character Calibration</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Second pass</span>
                        </div>
                      )}
                      
                      {/* Scene校准（Second pass） */}
                      {secondPassTypes.has('scenes') && (
                        <div className={`flex items-center gap-3 py-1 ${sceneCalibrationStatus === 'calibrating' ? 'text-primary font-bold' : sceneCalibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                          {sceneCalibrationStatus === 'calibrating' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : sceneCalibrationStatus === 'completed' ? (
                            <span className="text-lg">✓</span>
                          ) : (
                            <span className="w-5 h-5 rounded-full border-2 border-current" />
                          )}
                          <span className="text-base">AI Scene Calibration</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Second pass</span>
                        </div>
                      )}
                    </>
                  ) : (
                    /* === 首次 pipeline 模式：完整 6 步骤 === */
                    <>
                      {/* Import script */}
                      <div className={`flex items-center gap-3 py-1 ${importStatus === 'importing' ? 'text-primary font-bold' : importStatus === 'ready' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {importStatus === 'importing' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : importStatus === 'ready' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">Import script</span>
                      </div>
                      
                      {/* 标题校准 */}
                      <div className={`flex items-center gap-3 py-1 ${calibrationStatus === 'calibrating' ? 'text-primary font-bold' : calibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {calibrationStatus === 'calibrating' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : calibrationStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Title Calibration</span>
                      </div>
                      
                      {/* 大纲生成 */}
                      <div className={`flex items-center gap-3 py-1 ${synopsisStatus === 'generating' ? 'text-primary font-bold' : synopsisStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {synopsisStatus === 'generating' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : synopsisStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Synopsis Generation</span>
                      </div>
                      
                      {/* Shot校准 */}
                      <div className={`flex items-center gap-3 py-1 ${viewpointAnalysisStatus === 'analyzing' ? 'text-primary font-bold' : viewpointAnalysisStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {viewpointAnalysisStatus === 'analyzing' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : viewpointAnalysisStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Shot Calibration</span>
                      </div>
                      
                      {/* 角色校准 */}
                      <div className={`flex items-center gap-3 py-1 ${characterCalibrationStatus === 'calibrating' ? 'text-primary font-bold' : characterCalibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {characterCalibrationStatus === 'calibrating' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : characterCalibrationStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Character Calibration</span>
                      </div>
                      
                      {/* Scene校准 */}
                      <div className={`flex items-center gap-3 py-1 ${sceneCalibrationStatus === 'calibrating' ? 'text-primary font-bold' : sceneCalibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {sceneCalibrationStatus === 'calibrating' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : sceneCalibrationStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Scene Calibration</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Create模式 */}
        <TabsContent value="create" className="flex-1 mt-3">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Enter story idea, AI will help generate script
              </Label>
              <Textarea
                placeholder="Example: A heartwarming story of an introverted programmer meeting a cheerful girl in a coffee shop..."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                className="min-h-[100px] resize-none text-sm"
                disabled={isGenerating}
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={!idea.trim() || isGenerating || !chatConfigured}
              className="w-full"
              variant="outline"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Generate Script
                </>
              )}
            </Button>

            {/* 生成后的Script Preview */}
            {rawScript && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Generated script (editable)
                </Label>
                <Textarea
                  value={rawScript}
                  onChange={(e) => onRawScriptChange(e.target.value)}
                  className="min-h-[100px] resize-none text-sm"
                  disabled={parseStatus === "parsing"}
                />
              </div>
            )}

            {/* Create模式工作流引导 */}
            {parseStatus === "ready" && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                <div className="text-xs font-medium text-primary">✨ Script generated, next steps:</div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">1</span>
                    <span>Select scene in middle column → click 'Go to Scene Library' in right column</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">2</span>
                    <span>Select character → click 'Go to Character Library' in right column</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">3</span>
                    <span>Select shot → click 'Go to AI Director' in right column</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* 设置区域 - 根据模式显示不同选项 */}
      <div className="space-y-3 pt-2 border-t">
        {/* Import模式：显示Language、Scene数量、Shot数量 */}
        {mode === "import" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Script Language</Label>
              <Select
                value={language}
                onValueChange={onLanguageChange}
                disabled={parseStatus === "parsing"}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Chinese">Chinese</SelectItem>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Japanese">Japanese</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Prompt Language</Label>
              <Select
                value={promptLanguage || "zh"}
                onValueChange={(v) => onPromptLanguageChange?.(v as PromptLanguage)}
                disabled={parseStatus === "parsing"}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMPT_LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Controls AI generating English prompts, default to Chinese Only to reduce load
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Scene Count (Optional)</Label>
                <Select
                  value={sceneCount || ""}
                  onValueChange={(v) => onSceneCountChange?.(v)}
                  disabled={parseStatus === "parsing"}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    {SCENE_COUNT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Shot Count (Optional)</Label>
                {showCustomShotInput ? (
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="Enter amount"
                      value={customShotValue}
                      onChange={(e) => setCustomShotValue(e.target.value)}
                      onBlur={() => {
                        if (customShotValue && parseInt(customShotValue) > 0) {
                          onShotCountChange?.(customShotValue);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customShotValue && parseInt(customShotValue) > 0) {
                          onShotCountChange?.(customShotValue);
                        }
                      }}
                      className="h-8 text-xs flex-1"
                      disabled={parseStatus === "parsing"}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setShowCustomShotInput(false);
                        setCustomShotValue("");
                        onShotCountChange?.("auto");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={shotCount || ""}
                    onValueChange={(v) => {
                      if (v === "custom") {
                        setShowCustomShotInput(true);
                      } else {
                        onShotCountChange?.(v);
                      }
                    }}
                    disabled={parseStatus === "parsing"}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      {SHOT_COUNT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Visual Style - Import模式也可以Select */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Palette className="h-3 w-3" />
                Visual Style
              </Label>
              <StylePicker
                value={styleId}
                onChange={(id) => onStyleChange(id)}
                disabled={parseStatus === "parsing"}
              />
              <p className="text-[10px] text-muted-foreground">
                This style will be used to generate visual descriptions during AI shot calibration
              </p>
            </div>
          </div>
        )}

        {/* Create模式：显示Language、Duration、Style、Scene数量、Shot数量 */}
        {mode === "create" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Prompt Language</Label>
              <Select
                value={promptLanguage || "zh"}
                onValueChange={(v) => onPromptLanguageChange?.(v as PromptLanguage)}
                disabled={parseStatus === "parsing"}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMPT_LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Controls AI generating English prompts, default to Chinese Only to reduce load
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Language</Label>
                <Select
                  value={language}
                  onValueChange={onLanguageChange}
                  disabled={parseStatus === "parsing"}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Chinese">Chinese</SelectItem>
                    <SelectItem value="English">English</SelectItem>
                    <SelectItem value="Japanese">Japanese</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Duration</Label>
                <Select
                  value={targetDuration}
                  onValueChange={onDurationChange}
                  disabled={parseStatus === "parsing"}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Style</Label>
                <StylePicker
                  value={styleId}
                  onChange={(id) => onStyleChange(id)}
                  disabled={parseStatus === "parsing"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Scene Count (Optional)</Label>
                <Select
                  value={sceneCount || ""}
                  onValueChange={(v) => onSceneCountChange?.(v)}
                  disabled={parseStatus === "parsing"}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    {SCENE_COUNT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Shot Count (Optional)</Label>
                {showCustomShotInput ? (
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="Enter amount"
                      value={customShotValue}
                      onChange={(e) => setCustomShotValue(e.target.value)}
                      onBlur={() => {
                        if (customShotValue && parseInt(customShotValue) > 0) {
                          onShotCountChange?.(customShotValue);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customShotValue && parseInt(customShotValue) > 0) {
                          onShotCountChange?.(customShotValue);
                        }
                      }}
                      className="h-8 text-xs flex-1"
                      disabled={parseStatus === "parsing"}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setShowCustomShotInput(false);
                        setCustomShotValue("");
                        onShotCountChange?.("auto");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={shotCount || ""}
                    onValueChange={(v) => {
                      if (v === "custom") {
                        setShowCustomShotInput(true);
                      } else {
                        onShotCountChange?.(v);
                      }
                    }}
                    disabled={parseStatus === "parsing"}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      {SHOT_COUNT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        )}

        {/* API Warning */}
        {!chatConfigured && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
            <div className="text-xs text-yellow-600 dark:text-yellow-400">
              <p className="font-medium">API Not Configured</p>
              <p className="opacity-80">Please configure API key in settings</p>
            </div>
          </div>
        )}

        {/* Import/解析按钮 */}
        <div className="space-y-2">
          {/* 完整剧本Import按钮（不需要AI，用规则解析） */}
          {mode === "import" && onImportFullScript && (
            <Button
              onClick={handleImportFullScript}
              disabled={!rawScript.trim() || isImporting}
              className="w-full"
              variant="default"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Import Full Script
                </>
              )}
            </Button>
          )}
          
          {/* AI校准按钮 - ImportSuccess且有缺失标题时显示 */}
          {mode === "import" && importStatus === "ready" && (missingTitleCount ?? 0) > 0 && onCalibrate && (
            <Button
              onClick={handleCalibrate}
              disabled={isCalibrating || calibrationStatus === 'calibrating'}
              className="w-full"
              variant="outline"
            >
              {isCalibrating || calibrationStatus === 'calibrating' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  AI Calibrating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  AI Calibration (Generate {missingTitleCount} episode titles)
                </>
              )}
            </Button>
          )}
          
          {/* 生成大纲按钮 - ImportSuccess后显示 */}
          {mode === "import" && importStatus === "ready" && onGenerateSynopses && (
            <Button
              onClick={handleGenerateSynopses}
              disabled={isGeneratingSynopsis || synopsisStatus === 'generating'}
              className="w-full"
              variant="outline"
            >
              {isGeneratingSynopsis || synopsisStatus === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating synopsis...
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4 mr-2" />
                  {(missingSynopsisCount ?? 0) > 0 
                    ? `Generate Synopsis (${missingSynopsisCount} episodes missing)`
                    : 'Regenerate Synopsis'
                  }
                </>
              )}
            </Button>
          )}
          
          {/* AI解析按钮 - 仅在Import模式显示 */}
          {mode === "import" && (
            <Button
              onClick={onParse}
              disabled={!rawScript.trim() || parseStatus === "parsing" || !chatConfigured}
              className="w-full"
              variant={onImportFullScript ? "outline" : "default"}
            >
              {parseStatus === "parsing" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  AIParse Script
                </>
              )}
            </Button>
          )}
        </div>

        {/* 解析Error */}
        {parseStatus === "error" && parseError && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive">{parseError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
