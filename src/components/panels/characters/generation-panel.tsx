// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Generation Panel - Left column
 * Character generation controls: style, views, description, reference images
 */

import { useState, useEffect } from "react";
import { useCharacterLibraryStore, type Character } from "@/stores/character-library-store";
import { useProjectStore } from "@/stores/project-store";
import type { CharacterIdentityAnchors, CharacterNegativePrompt, PromptLanguage } from "@/types/script";
import { useActiveScriptProject } from "@/stores/script-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { useMediaStore } from "@/stores/media-store";
import { generateCharacterImage as generateCharacterImageAPI } from "@/lib/ai/image-generator";
import { saveImageToLocal } from "@/lib/image-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { 
  Loader2,
  ImagePlus,
  X,
  Shuffle,
  FileImage,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StylePicker } from "@/components/ui/style-picker";
import { getStyleById, getStylePrompt, type VisualStyleId, DEFAULT_STYLE_ID } from "@/lib/constants/visual-styles";

// Gender presets
const GENDER_PRESETS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "other", label: "Other" },
] as const;

// Age presets
const AGE_PRESETS = [
  { id: "child", label: "Child", range: "5-12 years" },
  { id: "teen", label: "Teenager", range: "13-18 years" },
  { id: "young-adult", label: "Young Adult", range: "19-30 years" },
  { id: "adult", label: "Adult", range: "31-50 years" },
  { id: "senior", label: "Senior", range: "50+ years" },
] as const;

// Sheet elements
const SHEET_ELEMENTS = [
  { id: 'three-view', label: 'Three Views', prompt: 'front view, side view, back view, turnaround', default: true },
  { id: 'expressions', label: 'Expression Sheet', prompt: 'expression sheet, multiple facial expressions, happy, sad, angry, surprised', default: true },
  { id: 'proportions', label: 'Proportions', prompt: 'height chart, body proportions, head-to-body ratio reference', default: false },
  { id: 'poses', label: 'Action Poses', prompt: 'pose sheet, various action poses, standing, sitting, running', default: false },
] as const;

type SheetElementId = typeof SHEET_ELEMENTS[number]['id'];

interface GenerationPanelProps {
  selectedCharacter: Character | null;
  onCharacterCreated?: (id: string) => void;
}

export function GenerationPanel({ selectedCharacter, onCharacterCreated }: GenerationPanelProps) {
  const { 
    addCharacter, 
    updateCharacter,
    addCharacterView,
    selectCharacter,
    generationStatus,
    generatingCharacterId,
    setGenerationStatus,
    setGeneratingCharacter,
    currentFolderId,
  } = useCharacterLibraryStore();
  const { activeProjectId } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  
  const { pendingCharacterData, setPendingCharacterData } = useMediaPanelStore();
  const { addMediaFromUrl, getOrCreateCategoryFolder } = useMediaStore();
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gender, setGender] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [personality, setPersonality] = useState("");
  // Extended character fields (from script panel)
  const [role, setRole] = useState("");
  const [traits, setTraits] = useState("");
  const [skills, setSkills] = useState("");
  const [keyActions, setKeyActions] = useState("");
  const [appearance, setAppearance] = useState("");
  const [relationships, setRelationships] = useState(""); // Character Relationships
  const [tags, setTags] = useState<string[]>([]);  // Character Tags
  const [notes, setNotes] = useState("");           // Character Notes
  // === 专业角色设计字段（世界级大师生成）===
  const [visualPromptEn, setVisualPromptEn] = useState(""); // English Visual Prompt
  const [visualPromptZh, setVisualPromptZh] = useState(""); // Chinese Visual Prompt
  // === 6-Layer Identity Anchor ===
  const [identityAnchors, setIdentityAnchors] = useState<CharacterIdentityAnchors | undefined>();
  const [charNegativePrompt, setCharNegativePrompt] = useState<CharacterNegativePrompt | undefined>();
  // === Prompt语言偏好 ===
  const [promptLanguage, setPromptLanguage] = useState<PromptLanguage>('zh');
  // === Era Information（从剧本元数据传递）===
  const [storyYear, setStoryYear] = useState<number | undefined>();
  const [era, setEra] = useState<string | undefined>();
  // === Episode作用域（从 pending 数据透传）===
  const [sourceEpisodeId, setSourceEpisodeId] = useState<string | undefined>();
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [styleId, setStyleId] = useState<string>(DEFAULT_STYLE_ID);
  const [selectedElements, setSelectedElements] = useState<SheetElementId[]>(
    SHEET_ELEMENTS.filter(e => e.default).map(e => e.id)
  );
  
  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewCharacterId, setPreviewCharacterId] = useState<string | null>(null);
  
  // AI Calibration Info Collapsible Area状态：有数据时默认展开
  const [calibrationExpanded, setCalibrationExpanded] = useState(true);
  const [isManuallyModified, setIsManuallyModified] = useState(false);

  const isGenerating = generationStatus === 'generating';
  
  // 检查是否有 AI 校准数据
  const hasCalibrationData = !!(identityAnchors || charNegativePrompt || visualPromptEn || visualPromptZh);

  // 注意：左边栏始终用于New Character，不响应中间Character Library的Select
  // 右边栏用于查看/Edit已有角色的详情

  // Handle pending data from script panel
  useEffect(() => {
    if (pendingCharacterData) {
      setName(pendingCharacterData.name || "");
      
      // 映射Gender："Male" -> "male", "Female" -> "female"
      const genderMap: Record<string, string> = {
        'male': 'male', 'Male': 'male', 'man': 'male',
        'female': 'female', 'Female': 'female', 'woman': 'female',
      };
      const mappedGender = genderMap[pendingCharacterData.gender || ''] || '';
      setGender(mappedGender);
      
      // 映射Age：根据数字范围自动SelectAge Group
      const ageStr = pendingCharacterData.age || '';
      let mappedAge = '';
      if (ageStr.includes('5') && ageStr.includes('12') || ageStr.includes('child')) {
        mappedAge = 'child';
      } else if (ageStr.includes('13') || ageStr.includes('18') || ageStr.includes('teenager')) {
        mappedAge = 'teen';
      } else if (ageStr.includes('19') || ageStr.includes('20') || ageStr.includes('25') || ageStr.includes('30') || ageStr.includes('young adult')) {
        mappedAge = 'young-adult';
      } else if (ageStr.includes('35') || ageStr.includes('40') || ageStr.includes('45') || ageStr.includes('50') || ageStr.includes('middle-aged')) {
        mappedAge = 'adult';
      } else if (ageStr.includes('55') || ageStr.includes('60') || ageStr.includes('70') || ageStr.includes('elderly')) {
        mappedAge = 'senior';
      } else if (ageStr.match(/\d+.*\d+/)) {
        // 跨Age Group如 "25-50岁"，Selectmiddle-aged
        mappedAge = 'adult';
      }
      setAge(mappedAge);
      
      setPersonality(pendingCharacterData.personality || "");
      
      // Store extended fields independently
      setRole(pendingCharacterData.role || "");
      setTraits(pendingCharacterData.traits || "");
      setSkills(pendingCharacterData.skills || "");
      setKeyActions(pendingCharacterData.keyActions || "");
      setAppearance(pendingCharacterData.appearance || "");
      setRelationships(pendingCharacterData.relationships || "");
      
      // Also build description for display/generation prompt
      const descParts: string[] = [];
      if (pendingCharacterData.role) descParts.push(`[Identity/Background]\n${pendingCharacterData.role}`);
      if (pendingCharacterData.traits) descParts.push(`[Core Traits]\n${pendingCharacterData.traits}`);
      if (pendingCharacterData.skills) descParts.push(`[Skills/Abilities]\n${pendingCharacterData.skills}`);
      if (pendingCharacterData.keyActions) descParts.push(`[Key Deeds]\n${pendingCharacterData.keyActions}`);
      if (pendingCharacterData.appearance) descParts.push(`[Appearance Features]\n${pendingCharacterData.appearance}`);
      if (pendingCharacterData.relationships) descParts.push(`【Character Relationships】\n${pendingCharacterData.relationships}`);
      if (descParts.length > 0) {
        setDescription(descParts.join("\n\n"));
      }

      // 处理标签和备注
      if (pendingCharacterData.tags) {
        setTags(pendingCharacterData.tags);
      }
      if (pendingCharacterData.notes) {
        setNotes(pendingCharacterData.notes);
      }
      
      // === 处理Prompt语言偏好 ===
      if (pendingCharacterData.promptLanguage) {
        setPromptLanguage(pendingCharacterData.promptLanguage);
      }
      // === 处理Professional Visual Prompt（世界级大师生成）===
      if (pendingCharacterData.visualPromptEn) {
        setVisualPromptEn(pendingCharacterData.visualPromptEn);
      }
      if (pendingCharacterData.visualPromptZh) {
        setVisualPromptZh(pendingCharacterData.visualPromptZh);
      }
      
      // === 处理6-Layer Identity Anchor ===
      if (pendingCharacterData.identityAnchors) {
        setIdentityAnchors(pendingCharacterData.identityAnchors);
      }
      if (pendingCharacterData.negativePrompt) {
        setCharNegativePrompt(pendingCharacterData.negativePrompt);
      }
      
      // === 处理Era Information ===
      if (pendingCharacterData.storyYear) {
        setStoryYear(pendingCharacterData.storyYear);
      }
      if (pendingCharacterData.era) {
        setEra(pendingCharacterData.era);
      }
      // === Episode作用域透传 ===
      setSourceEpisodeId(pendingCharacterData.sourceEpisodeId);

      if (pendingCharacterData.styleId) {
        const validStyle = getStyleById(pendingCharacterData.styleId);
        if (validStyle) {
          setStyleId(validStyle.id);
        }
      }
      
      // TODO: 处理多阶段角色变体
      // 如果有 stageInfo 或 consistencyElements，应该：
      // 1. 在Character Description中Notice用户这是多阶段角色
      // 2. 生成角色后自动为其Add variations
      // 注：这部分逻辑应该在 handleCreateAndGenerate 后执行

      setPendingCharacterData(null);
    }
  }, [pendingCharacterData, setPendingCharacterData]);

  const toggleElement = (elementId: SheetElementId) => {
    setSelectedElements(prev => 
      prev.includes(elementId) 
        ? prev.filter(e => e !== elementId)
        : [...prev, elementId]
    );
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: string[] = [];
    for (const file of Array.from(files)) {
      if (referenceImages.length + newImages.length >= 3) break;
      try {
        const base64 = await fileToBase64(file);
        newImages.push(base64);
      } catch (err) {
        console.error("Failed to convert image:", err);
      }
    }

    if (newImages.length > 0) {
      setReferenceImages([...referenceImages, ...newImages].slice(0, 3));
    }
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setGender("");
    setAge("");
    setPersonality("");
    setRole("");
    setTraits("");
    setSkills("");
    setKeyActions("");
    setAppearance("");
    setRelationships("");
    setTags([]);
    setNotes("");
    // === ResetProfessional Visual Prompt ===
    setVisualPromptEn("");
    setVisualPromptZh("");
    // === Reset6-Layer Identity Anchor ===
    setIdentityAnchors(undefined);
    setCharNegativePrompt(undefined);
    // === ResetEra Information ===
    setStoryYear(undefined);
    setEra(undefined);
    // === ResetEpisode作用域 ===
    setSourceEpisodeId(undefined);
    setReferenceImages([]);
    setStyleId(DEFAULT_STYLE_ID);
    setSelectedElements(SHEET_ELEMENTS.filter(e => e.default).map(e => e.id));
    setPreviewUrl(null);
    setPreviewCharacterId(null);
    // === Reset AI 校准状态 ===
    setCalibrationExpanded(false);
    setIsManuallyModified(false);
  };

  // Create新角色并Generate Image（始终新建，不会Overwrite existing角色）
  const handleCreateAndGenerate = async () => {
    if (!name.trim()) {
      toast.error("Please enter a character name");
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a character description");
      return;
    }
    if (selectedElements.length === 0) {
      toast.error("Please select at least one element to generate");
      return;
    }

    // 始终Create新角色
    const targetId = addCharacter({
      name: name.trim(),
      description: description.trim(),
      visualTraits: "",
      gender: gender || undefined,
      age: age || undefined,
      personality: personality.trim() || undefined,
      role: role.trim() || undefined,
      traits: traits.trim() || undefined,
      skills: skills.trim() || undefined,
      keyActions: keyActions.trim() || undefined,
      appearance: appearance.trim() || undefined,
      relationships: relationships.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      notes: notes.trim() || undefined,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      styleId: styleId === "random" ? undefined : styleId,
      views: [],
      folderId: currentFolderId,
      projectId: activeProjectId || undefined,
      // === 6-Layer Identity Anchor（角色一致性）===
      identityAnchors: identityAnchors,
      negativePrompt: charNegativePrompt,
      // === Episode作用域 ===
      linkedEpisodeId: sourceEpisodeId,
    });
    selectCharacter(targetId);
    onCharacterCreated?.(targetId);

    // Start GenerationImage
    setGenerationStatus('generating');
    setGeneratingCharacter(targetId);

    try {
      // 构建Prompt：根据语言偏好SelectPrompt + 6-Layer Identity Anchor + Reference Image优先级逻辑 + Era Information
      // 获取实时的语言偏好（优先使用 pending 传来的，其次从 scriptProject 读取）
      const effectiveLang = promptLanguage || scriptProject?.promptLanguage || 'zh';
      const prompt = buildCharacterSheetPrompt(
        description, 
        name, 
        selectedElements, 
        styleId, 
        visualPromptEn,
        visualPromptZh,
        effectiveLang,
        identityAnchors,
        referenceImages.length > 0,  // Simplify description when reference image is present
        storyYear,
        era
      );
      const stylePreset = styleId && styleId !== 'random' 
        ? getStyleById(styleId) 
        : null;
      const isRealistic = stylePreset?.category === 'real';
      
      // 构建Negative Prompt：合并角色特定的Negative Prompt
      let negativePrompt = isRealistic
        ? 'blurry, low quality, watermark, text, cropped, anime, cartoon, illustration'
        : 'blurry, low quality, watermark, text, cropped';
      
      // 如果有角色特定的Negative Prompt，追加到后面
      if (charNegativePrompt) {
        const avoidList = charNegativePrompt.avoid || [];
        const styleExclusions = charNegativePrompt.styleExclusions || [];
        const charNegatives = [...avoidList, ...styleExclusions].join(', ');
        if (charNegatives) {
          negativePrompt = `${negativePrompt}, ${charNegatives}`;
        }
      }

      const result = await generateCharacterImageAPI({
        prompt,
        negativePrompt,
        aspectRatio: '1:1',
        referenceImages,
        styleId,
      });
      
      setPreviewUrl(result.imageUrl);
      setPreviewCharacterId(targetId);
      setGenerationStatus('completed');
      toast.success("Image generated — please review and confirm");
    } catch (error) {
      const err = error as Error;
      setGenerationStatus('error', err.message);
      toast.error(`Generation failed: ${err.message}`);
    } finally {
      setGeneratingCharacter(null);
    }
  };

  const handleSavePreview = async () => {
    if (!previewUrl || !previewCharacterId) return;

    toast.loading("Saving image to local storage...", { id: 'saving-preview' });
    
    try {
      // Save image to local storage
      const localPath = await saveImageToLocal(
        previewUrl, 
        'characters', 
        `${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.png`
      );

      // Save view with local path
      addCharacterView(previewCharacterId, {
        viewType: 'front',
        imageUrl: localPath,
      });

      const visualTraits = `${name} character, ${description.substring(0, 200)}`;
      updateCharacter(previewCharacterId, { visualTraits });

      // 同步归档到Media Library AIImage 文件夹
      const aiFolderId = getOrCreateCategoryFolder('ai-image');
      addMediaFromUrl({
        url: localPath,
        name: `Character-${name || 'Untitled'}`,
        type: 'image',
        source: 'ai-image',
        folderId: aiFolderId,
        projectId: activeProjectId || undefined,
      });

      setPreviewUrl(null);
      setPreviewCharacterId(null);
      toast.success("Character design saved locally!", { id: 'saving-preview' });
    } catch (error) {
      console.error('Failed to save preview:', error);
      toast.error("Save failed", { id: 'saving-preview' });
    }
  };

  const handleDiscardPreview = () => {
    setPreviewUrl(null);
    setPreviewCharacterId(null);
  };

  // If showing preview
  if (previewUrl) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-3 pb-2 border-b shrink-0">
          <h3 className="font-medium text-sm">Character Design Preview</h3>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4 pb-32">
            <div className="relative rounded-lg overflow-hidden border-2 border-amber-500/50 bg-muted">
              <img 
                src={previewUrl} 
                alt="Character design preview"
                className="w-full h-auto"
              />
              <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">
                Preview
              </div>
            </div>
          </div>
        </ScrollArea>
        <div className="p-3 border-t space-y-2 shrink-0">
          <Button onClick={handleSavePreview} className="w-full">
            Save Design
          </Button>
          <Button onClick={handleCreateAndGenerate} variant="outline" className="w-full" disabled={isGenerating}>
            Regenerate
          </Button>
          <Button onClick={handleDiscardPreview} variant="ghost" className="w-full text-muted-foreground" size="sm">
            Discard & Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-3 pb-2 border-b shrink-0">
        <h3 className="font-medium text-sm">Generation Console</h3>
      </div>
      
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-4">
          {/* Character name */}
          <div className="space-y-2">
            <Label className="text-xs">Character Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice, Bob"
              disabled={isGenerating}
            />
          </div>

          {/* Gender and Age */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Gender</Label>
              <Select value={gender} onValueChange={setGender} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_PRESETS.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Age Group</Label>
              <Select value={age} onValueChange={setAge} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {AGE_PRESETS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Personality */}
          <div className="space-y-2">
            <Label className="text-xs">Personality Traits</Label>
            <Input
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="e.g. cheerful, brave..."
              disabled={isGenerating}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-xs">Character Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the character in detail..."
              className="min-h-[80px] text-sm resize-none"
              disabled={isGenerating}
            />
          </div>

          {/* AI Calibration Info Collapsible Area */}
          {hasCalibrationData && (
            <div className="border rounded-lg overflow-hidden">
              {/* Collapsible Area Header */}
              <button
                type="button"
                className="w-full flex items-center justify-between p-2 hover:bg-muted/50 transition-colors"
                onClick={() => setCalibrationExpanded(!calibrationExpanded)}
                disabled={isGenerating}
              >
                <div className="flex items-center gap-2">
                  {calibrationExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium">AI Calibration Info</span>
                </div>
                <div className="flex items-center gap-1">
                  {isManuallyModified ? (
                    <>
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      <span className="text-[10px] text-amber-500">Modified</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span className="text-[10px] text-green-500">Calibrated</span>
                    </>
                  )}
                </div>
              </button>
              
              {/* Collapsible Area Content */}
              {calibrationExpanded && (
                <div className="border-t p-2 space-y-3 bg-muted/20">
                  {/* 6-Layer Identity Anchor */}
                  {identityAnchors && (
                    <div className="space-y-2">
                      <Label className="text-[10px] text-muted-foreground">① Face Structure</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <Input
                          value={identityAnchors.faceShape || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, faceShape: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="Face shape"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.jawline || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, jawline: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="Jawline"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.cheekbones || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, cheekbones: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="Cheekbones"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                      </div>
                      
                      <Label className="text-[10px] text-muted-foreground">② Facial Features</Label>
                      <div className="grid grid-cols-2 gap-1">
                        <Input
                          value={identityAnchors.eyeShape || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, eyeShape: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="Eye shape"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.noseShape || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, noseShape: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="Nose shape"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.lipShape || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, lipShape: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="Lip shape"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.eyeDetails || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, eyeDetails: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="Eye details"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                      </div>
                      
                      <Label className="text-[10px] text-muted-foreground">③ Unique Marks (strongest anchor)</Label>
                      <Input
                        value={identityAnchors.uniqueMarks?.join(', ') || ''}
                        onChange={(e) => {
                          const marks = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          setIdentityAnchors({ ...identityAnchors, uniqueMarks: marks.length > 0 ? marks : [] });
                          setIsManuallyModified(true);
                        }}
                        placeholder="Distinctive marks, comma-separated"
                        className="h-7 text-[10px]"
                        disabled={isGenerating}
                      />
                      
                      <Label className="text-[10px] text-muted-foreground">④ Color Anchors (hex values)</Label>
                      <div className="grid grid-cols-4 gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={identityAnchors.colorAnchors?.iris || '#000000'}
                            onChange={(e) => {
                              setIdentityAnchors({
                                ...identityAnchors,
                                colorAnchors: { ...identityAnchors.colorAnchors, iris: e.target.value }
                              });
                              setIsManuallyModified(true);
                            }}
                            className="w-6 h-6 rounded cursor-pointer"
                            disabled={isGenerating}
                          />
                          <span className="text-[9px] text-muted-foreground">Iris</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={identityAnchors.colorAnchors?.hair || '#000000'}
                            onChange={(e) => {
                              setIdentityAnchors({
                                ...identityAnchors,
                                colorAnchors: { ...identityAnchors.colorAnchors, hair: e.target.value }
                              });
                              setIsManuallyModified(true);
                            }}
                            className="w-6 h-6 rounded cursor-pointer"
                            disabled={isGenerating}
                          />
                          <span className="text-[9px] text-muted-foreground">Hair</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={identityAnchors.colorAnchors?.skin || '#000000'}
                            onChange={(e) => {
                              setIdentityAnchors({
                                ...identityAnchors,
                                colorAnchors: { ...identityAnchors.colorAnchors, skin: e.target.value }
                              });
                              setIsManuallyModified(true);
                            }}
                            className="w-6 h-6 rounded cursor-pointer"
                            disabled={isGenerating}
                          />
                          <span className="text-[9px] text-muted-foreground">Skin</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={identityAnchors.colorAnchors?.lips || '#000000'}
                            onChange={(e) => {
                              setIdentityAnchors({
                                ...identityAnchors,
                                colorAnchors: { ...identityAnchors.colorAnchors, lips: e.target.value }
                              });
                              setIsManuallyModified(true);
                            }}
                            className="w-6 h-6 rounded cursor-pointer"
                            disabled={isGenerating}
                          />
                          <span className="text-[9px] text-muted-foreground">Lips</span>
                        </div>
                      </div>
                      
                      <Label className="text-[10px] text-muted-foreground">⑤ Skin Texture</Label>
                      <Input
                        value={identityAnchors.skinTexture || ''}
                        onChange={(e) => {
                          setIdentityAnchors({ ...identityAnchors, skinTexture: e.target.value || undefined });
                          setIsManuallyModified(true);
                        }}
                        placeholder="Skin texture description"
                        className="h-7 text-[10px]"
                        disabled={isGenerating}
                      />
                      
                      <Label className="text-[10px] text-muted-foreground">⑥ Hair Style Anchors</Label>
                      <div className="grid grid-cols-2 gap-1">
                        <Input
                          value={identityAnchors.hairStyle || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, hairStyle: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="Hair Style"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.hairlineDetails || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, hairlineDetails: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="Hairline Details"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Negative Prompt */}
                  {charNegativePrompt && (
                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-[10px] text-muted-foreground">Negative Prompt</Label>
                      <Input
                        value={charNegativePrompt.avoid?.join(', ') || ''}
                        onChange={(e) => {
                          const avoidList = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          setCharNegativePrompt({ ...charNegativePrompt, avoid: avoidList });
                          setIsManuallyModified(true);
                        }}
                        placeholder="Avoid elements, comma-separated"
                        className="h-7 text-[10px]"
                        disabled={isGenerating}
                      />
                      <Input
                        value={charNegativePrompt.styleExclusions?.join(', ') || ''}
                        onChange={(e) => {
                          const exclusions = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          setCharNegativePrompt({ ...charNegativePrompt, styleExclusions: exclusions.length > 0 ? exclusions : undefined });
                          setIsManuallyModified(true);
                        }}
                        placeholder="Style exclusions, comma-separated"
                        className="h-7 text-[10px]"
                        disabled={isGenerating}
                      />
                    </div>
                  )}
                  
                  {/* Professional Visual Prompt: Show one based on language preference, edit directly for generation */}
                  {(() => {
                    const effectiveLang = promptLanguage || scriptProject?.promptLanguage || 'zh';
                    const showZh = effectiveLang === 'zh' || effectiveLang === 'zh+en';
                    const activePrompt = showZh ? visualPromptZh : visualPromptEn;
                    const setActivePrompt = showZh ? setVisualPromptZh : setVisualPromptEn;
                    const langLabel = showZh ? 'Chinese' : 'English';
                    if (!activePrompt) return null;
                    return (
                      <div className="space-y-2 pt-2 border-t">
                        <Label className="text-[10px] text-muted-foreground">
                          Visual Prompt ({langLabel}, directly used for generation)
                        </Label>
                        <Textarea
                          value={activePrompt}
                          onChange={(e) => {
                            setActivePrompt(e.target.value);
                            setIsManuallyModified(true);
                          }}
                          placeholder={`${langLabel} Prompt`}
                          className="min-h-[120px] text-xs resize-y"
                          disabled={isGenerating}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Style */}
          <div className="space-y-2">
            <Label className="text-xs">Visual Style</Label>
            <StylePicker
              value={styleId}
              onChange={(id) => setStyleId(id)}
              disabled={isGenerating}
            />
          </div>

          {/* Reference images */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Reference Images</Label>
              <span className="text-xs text-muted-foreground">{referenceImages.length}/3</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {referenceImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={img}
                    alt={`Reference Image ${i + 1}`}
                    className="w-14 h-14 object-cover rounded-md border"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {referenceImages.length < 3 && (
                <>
                  <input
                    id="gen-panel-ref-image"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  <div
                    className="w-14 h-14 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors gap-1 cursor-pointer"
                    onClick={() => document.getElementById('gen-panel-ref-image')?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    <span className="text-[10px]">Upload</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sheet elements */}
          <div className="space-y-2">
            <Label className="text-xs">Generation Content</Label>
            <div className="space-y-1.5">
              {SHEET_ELEMENTS.map((element) => (
                <div
                  key={element.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded border text-sm cursor-pointer transition-all",
                    "hover:border-foreground/20",
                    selectedElements.includes(element.id) && "border-primary bg-primary/5",
                    isGenerating && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => !isGenerating && toggleElement(element.id)}
                >
                  <Checkbox
                    checked={selectedElements.includes(element.id)}
                    disabled={isGenerating}
                  />
                  <span>{element.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action button - inside scroll area */}
          <div className="pt-2 pb-4 space-y-2">
            <Button 
              onClick={handleCreateAndGenerate} 
              className="w-full"
              disabled={isGenerating || !name.trim() || !description.trim() || selectedElements.length === 0}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating......
                </>
              ) : (
                <>
                  <FileImage className="h-4 w-4 mr-2" />
                  Generate Character Sheet
                </>
              )}
            </Button>
            
            {/* Copy Character Data Button */}
            <Button 
              variant="outline"
              onClick={() => {
                // 构建角色数据文本
                const lines: string[] = [];
                
                // 基本信息
                lines.push(`Character Name: ${name || '(Not filled)'}`);
                const genderLabel = GENDER_PRESETS.find(g => g.id === gender)?.label;
                if (genderLabel) lines.push(`Gender: ${genderLabel}`);
                const ageLabel = AGE_PRESETS.find(a => a.id === age)?.label;
                if (ageLabel) lines.push(`Age Group: ${ageLabel}`);
                if (personality) lines.push(`Personality Traits: ${personality}`);
                
                // Character Description
                if (description) {
                  lines.push('');
                  lines.push(`Character Description:`);
                  lines.push(description);
                }
                
                // AI Calibration Info
                if (hasCalibrationData) {
                  lines.push('');
                  lines.push(`AI Calibration Info: ${isManuallyModified ? 'Modified' : 'Calibrated'}`);
                  
                  // 6-Layer Identity Anchor
                  if (identityAnchors) {
                    lines.push('');
                    lines.push('--- 6-Layer Identity Anchor ---');
                    
                    // ① Face Structure
                    const boneFeatures = [identityAnchors.faceShape, identityAnchors.jawline, identityAnchors.cheekbones].filter(Boolean);
                    if (boneFeatures.length > 0) {
                      lines.push(`① Face Structure: ${boneFeatures.join(', ')}`);
                    }
                    
                    // ② Facial Features
                    const facialFeatures = [identityAnchors.eyeShape, identityAnchors.eyeDetails, identityAnchors.noseShape, identityAnchors.lipShape].filter(Boolean);
                    if (facialFeatures.length > 0) {
                      lines.push(`② Facial Features: ${facialFeatures.join(', ')}`);
                    }
                    
                    // ③ Distinguishing Marks Layer
                    if (identityAnchors.uniqueMarks && identityAnchors.uniqueMarks.length > 0) {
                      lines.push(`③ Distinguishing Marks Layer: ${identityAnchors.uniqueMarks.join(', ')}`);
                    }
                    
                    // ④ Color Anchor Layer
                    if (identityAnchors.colorAnchors) {
                      const colors: string[] = [];
                      if (identityAnchors.colorAnchors.iris) colors.push(`Iris Color:${identityAnchors.colorAnchors.iris}`);
                      if (identityAnchors.colorAnchors.hair) colors.push(`Hair Color:${identityAnchors.colorAnchors.hair}`);
                      if (identityAnchors.colorAnchors.skin) colors.push(`Skin Tone:${identityAnchors.colorAnchors.skin}`);
                      if (identityAnchors.colorAnchors.lips) colors.push(`Lips Color:${identityAnchors.colorAnchors.lips}`);
                      if (colors.length > 0) {
                        lines.push(`④ Color Anchor Layer: ${colors.join(', ')}`);
                      }
                    }
                    
                    // ⑤ Skin Texture
                    if (identityAnchors.skinTexture) {
                      lines.push(`⑤ Skin Texture: ${identityAnchors.skinTexture}`);
                    }
                    
                    // ⑥ Hairstyle Anchor Layer
                    const hairFeatures = [identityAnchors.hairStyle, identityAnchors.hairlineDetails].filter(Boolean);
                    if (hairFeatures.length > 0) {
                      lines.push(`⑥ Hairstyle Anchor Layer: ${hairFeatures.join(', ')}`);
                    }
                  }
                  
                  // Negative Prompt
                  if (charNegativePrompt) {
                    lines.push('');
                    lines.push('--- Negative Prompt ---');
                    if (charNegativePrompt.avoid && charNegativePrompt.avoid.length > 0) {
                      lines.push(`Avoid:  ${charNegativePrompt.avoid.join(', ')}`);
                    }
                    if (charNegativePrompt.styleExclusions && charNegativePrompt.styleExclusions.length > 0) {
                      lines.push(`Style Exclusions:  ${charNegativePrompt.styleExclusions.join(', ')}`);
                    }
                  }
                  
                  // Professional Visual Prompt
                  if (visualPromptEn || visualPromptZh) {
                    lines.push('');
                    lines.push('--- Professional Visual Prompt ---');
                    if (visualPromptEn) lines.push(`EN: ${visualPromptEn}`);
                    if (visualPromptZh) lines.push(`ZH: ${visualPromptZh}`);
                  }
                }
                
                // Era Information
                if (storyYear || era) {
                  lines.push('');
                  lines.push('--- Era Information ---');
                  if (storyYear) lines.push(`Story Year:  ${storyYear} Year`);
                  if (era) lines.push(`Historical Era:  ${era}`);
                }
                
                // Visual Style
                const stylePreset = getStyleById(styleId);
                const styleLabel = stylePreset?.name || styleId;
                lines.push('');
                lines.push(`Visual Style: ${styleLabel}`);
                if (stylePreset?.prompt) {
                  lines.push(`Style Prompt:  ${stylePreset.prompt.substring(0, 100)}...`);
                }
                
                // Reference Images
                if (referenceImages.length > 0) {
                  lines.push(`Reference Images:  ${referenceImages.length} images`);
                }
                
                // Generation Content
                const selectedSheetElements = selectedElements.map(id => SHEET_ELEMENTS.find(e => e.id === id)).filter(Boolean);
                if (selectedSheetElements.length > 0) {
                  const labels = selectedSheetElements.map(e => e?.label).join(', ');
                  const prompts = selectedSheetElements.map(e => e?.prompt).join(', ');
                  lines.push(`Generation Content: ${labels}`);
                  lines.push(`Content Prompt:  ${prompts}`);
                }
                
                const text = lines.join('\n');
                navigator.clipboard.writeText(text);
                toast.success('Character data copied to clipboard');
              }}
              className="w-full"
              disabled={isGenerating}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Character Data
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * 从6-Layer Identity Anchor构建Prompt
 * 
 * @param anchors - 6-Layer Identity Anchor
 * @param hasReferenceImages - 是否有Reference Image
 * @returns 构建的Prompt字符串
 * 
 * Reference Image优先级逻辑：
 * - 有Reference Image时：只使用最强锚点（uniqueMarks + colorAnchors），其他特征由Reference Image引导
 * - NoneReference Image时：使用完整的6层特征锁定
 */
function buildPromptFromAnchors(
  anchors: CharacterIdentityAnchors | undefined,
  hasReferenceImages: boolean,
  promptLanguage?: PromptLanguage
): string {
  if (!anchors) return '';

  // 根据锚点值内容自动检测语言（Chinese锚点值 → Chinese连接词）
  const isZh = promptLanguage === 'zh' || /[\u4e00-\u9fff]/.test(anchors.faceShape || anchors.eyeShape || '');

  const parts: string[] = [];

  if (hasReferenceImages) {
    // === 有Reference Image：只使用最强锚点 ===
    if (anchors.uniqueMarks && anchors.uniqueMarks.length > 0) {
      parts.push(isZh ? `Distinguishing Marks: ${anchors.uniqueMarks.join(', ')}` : `distinctive marks: ${anchors.uniqueMarks.join(', ')}`);
    }

    if (anchors.colorAnchors) {
      const colors: string[] = [];
      if (anchors.colorAnchors.iris) colors.push(isZh ? `Iris Color${anchors.colorAnchors.iris}` : `iris color ${anchors.colorAnchors.iris}`);
      if (anchors.colorAnchors.hair) colors.push(isZh ? `Hair Color${anchors.colorAnchors.hair}` : `hair color ${anchors.colorAnchors.hair}`);
      if (anchors.colorAnchors.skin) colors.push(isZh ? `Skin Tone${anchors.colorAnchors.skin}` : `skin tone ${anchors.colorAnchors.skin}`);
      if (colors.length > 0) {
        parts.push(colors.join(isZh ? '，' : ', '));
      }
    }
  } else {
    // === NoneReference Image：完整6层特征锁定 ===

    // ① Face Structure
    const boneFeatures: string[] = [];
    if (anchors.faceShape) boneFeatures.push(isZh ? `${anchors.faceShape} face` : `${anchors.faceShape} face`);
    if (anchors.jawline) boneFeatures.push(isZh ? `${anchors.jawline} jawline` : `${anchors.jawline} jawline`);
    if (anchors.cheekbones) boneFeatures.push(isZh ? `${anchors.cheekbones} cheekbones` : `${anchors.cheekbones} cheekbones`);
    if (boneFeatures.length > 0) {
      parts.push(boneFeatures.join(isZh ? '，' : ', '));
    }

    // ② Facial Features
    const facialFeatures: string[] = [];
    if (anchors.eyeShape) facialFeatures.push(isZh ? `${anchors.eyeShape} eyes` : `${anchors.eyeShape} eyes`);
    if (anchors.eyeDetails) facialFeatures.push(anchors.eyeDetails);
    if (anchors.noseShape) facialFeatures.push(anchors.noseShape);
    if (anchors.lipShape) facialFeatures.push(anchors.lipShape);
    if (facialFeatures.length > 0) {
      parts.push(facialFeatures.join(isZh ? '，' : ', '));
    }

    // ③ Distinguishing Marks Layer
    if (anchors.uniqueMarks && anchors.uniqueMarks.length > 0) {
      parts.push(isZh ? `Distinguishing Marks: ${anchors.uniqueMarks.join(', ')}` : `distinctive marks: ${anchors.uniqueMarks.join(', ')}`);
    }

    // ④ Color Anchor Layer
    if (anchors.colorAnchors) {
      const colors: string[] = [];
      if (anchors.colorAnchors.iris) colors.push(isZh ? `Iris Color${anchors.colorAnchors.iris}` : `iris ${anchors.colorAnchors.iris}`);
      if (anchors.colorAnchors.hair) colors.push(isZh ? `Hair Color${anchors.colorAnchors.hair}` : `hair ${anchors.colorAnchors.hair}`);
      if (anchors.colorAnchors.skin) colors.push(isZh ? `Skin Tone${anchors.colorAnchors.skin}` : `skin ${anchors.colorAnchors.skin}`);
      if (anchors.colorAnchors.lips) colors.push(isZh ? `Lips Color${anchors.colorAnchors.lips}` : `lips ${anchors.colorAnchors.lips}`);
      if (colors.length > 0) {
        parts.push(isZh ? `Color Anchors: ${colors.join('，')}` : `color anchors: ${colors.join(', ')}`);
      }
    }

    // ⑤ Skin Texture
    if (anchors.skinTexture) {
      parts.push(isZh ? `Skin Texture: ${anchors.skinTexture}` : `skin texture: ${anchors.skinTexture}`);
    }

    // ⑥ Hairstyle Anchor Layer
    const hairFeatures: string[] = [];
    if (anchors.hairStyle) hairFeatures.push(anchors.hairStyle);
    if (anchors.hairlineDetails) hairFeatures.push(anchors.hairlineDetails);
    if (hairFeatures.length > 0) {
      parts.push(isZh ? `Hairstyle: ${hairFeatures.join('，')}` : `hair: ${hairFeatures.join(', ')}`);
    }
  }

  return parts.join(isZh ? '，' : ', ');
}

/**
 * 构建角色设定图Prompt
 * 
 * 优先级：
 * 1. 根据 promptLanguage Select主Prompt：zh→visualPromptZh, en→visualPromptEn, zh+en→两者合并
 * 2. 有Reference Image + 有锚点：简化描述 + 最强锚点
 * 3. NoneReference Image + 有锚点：完整6层锁定
 * 4. 有视觉Prompt：使用AI大师生成的Prompt
 * 5. 只有description：使用基础描述
 * 6. Era Information：加入Costume风格锚点
 */
function buildCharacterSheetPrompt(
  description: string, 
  name: string, 
  selectedElements: SheetElementId[],
  styleId?: string,
  visualPromptEn?: string,
  visualPromptZh?: string,
  promptLanguage?: PromptLanguage,
  identityAnchors?: CharacterIdentityAnchors,
  hasReferenceImages?: boolean,
  storyYear?: number,
  era?: string
): string {
  const stylePreset = styleId && styleId !== 'random' 
    ? getStyleById(styleId) 
    : null;
  // 修复：Custom风格 prompt 为空时用风格名称兜底，而不是回退到 anime
  const styleTokens = stylePreset
    ? (stylePreset.prompt || `${stylePreset.name} style, professional quality`)
    : 'anime style, professional quality';
  const isRealistic = stylePreset?.category === 'real';
  
  // 根据语言偏好Select主视觉Prompt
  const lang = promptLanguage || 'zh';

  // 构建 Year代CostumePrompt（根据语言偏好）
  let eraPrompt = '';
  if (storyYear) {
    if (lang === 'zh') {
      if (storyYear >= 2020) eraPrompt = `${storyYear}s contemporary Chinese fashion, modern casual style`;
      else if (storyYear >= 2010) eraPrompt = `${storyYear}s Chinese fashion, Korean style influence`;
      else if (storyYear >= 2000) eraPrompt = `2000s early Chinese fashion, Y2K clothing`;
      else if (storyYear >= 1990) eraPrompt = `1990s Chinese fashion, transitional period clothing`;
      else if (storyYear >= 1980) eraPrompt = `1980s Chinese fashion, reform and opening up period clothing`;
      else eraPrompt = `${storyYear}s Chinese clothing style`;
    } else {
      if (storyYear >= 2020) eraPrompt = `${storyYear}s contemporary Chinese fashion, modern casual style`;
      else if (storyYear >= 2010) eraPrompt = `${storyYear}s Chinese fashion, Korean-influenced style`;
      else if (storyYear >= 2000) eraPrompt = `early 2000s Chinese fashion, millennium era clothing style`;
      else if (storyYear >= 1990) eraPrompt = `1990s Chinese fashion, transitional era clothing`;
      else if (storyYear >= 1980) eraPrompt = `1980s Chinese fashion, reform era clothing style`;
      else eraPrompt = `${storyYear}s era-appropriate Chinese clothing`;
    }
  } else if (era) {
    eraPrompt = lang === 'zh' ? `${era} period clothing style` : `${era} era clothing style`;
  }
  let primaryVisualPrompt: string | undefined;
  if (lang === 'zh' || lang === 'zh+en') {
    // Chinese优先（zh+en 只是让用户同时看到两种，生成时用Chinese）
    primaryVisualPrompt = visualPromptZh || visualPromptEn;
  } else {
    // en：English优先
    primaryVisualPrompt = visualPromptEn || visualPromptZh;
  }
  
  // 构建Character Description：根据有NoneReference Image决定使用完整锚点还是简化锚点
  let characterDescription = '';
  
  // 构建身份锚点Prompt
  const anchorPrompt = buildPromptFromAnchors(identityAnchors, hasReferenceImages || false, promptLanguage);
  
  if (hasReferenceImages) {
    // 有Reference Image：简化描述，让Reference Image引导主要特征
    const basicDesc = primaryVisualPrompt ? primaryVisualPrompt.split(/[,，]/).slice(0, 3).join(',') : description.substring(0, 100);
    characterDescription = anchorPrompt 
      ? `${basicDesc}, ${anchorPrompt}` 
      : basicDesc;
  } else if (anchorPrompt) {
    // NoneReference Image + 有锚点：完整6层锁定
    const baseDesc = primaryVisualPrompt || description;
    characterDescription = `${baseDesc}, ${anchorPrompt}`;
  } else if (primaryVisualPrompt) {
    // 使用AI大师Prompt（已根据语言偏好Select）
    characterDescription = primaryVisualPrompt;
  } else {
    // 只有基础描述
    characterDescription = description;
  }
  
  // 加入 Year代CostumePrompt
  if (eraPrompt) {
    characterDescription = `${characterDescription}, ${eraPrompt}`;
  }

  const isZh = lang === 'zh';

  const basePrompt = isRealistic
    ? (isZh
        ? `Professional character reference image, "${name}"，${characterDescription}，photorealistic`
        : `professional character reference for "${name}", ${characterDescription}, real person`)
    : (isZh
        ? `Professional character design reference image, "${name}"，${characterDescription}`
        : `professional character design sheet for "${name}", ${characterDescription}`);
  
  // 使用 SHEET_ELEMENTS 定义的 prompt，如果是真人风格则转换成写实/摄影表述
  const contentParts = selectedElements
    .map(id => {
      const element = SHEET_ELEMENTS.find(e => e.id === id);
      if (!element) return null;
      if (isRealistic) {
        switch (id) {
          case 'three-view': return 'multiple photographic angles: front portrait, side profile, full body shot';
          case 'expressions': return 'collage of different facial expressions: smiling, frowning, angry, surprised';
          case 'proportions': return 'full body photography, standing straight';
          case 'poses': return 'various action poses, action photography collage';
          default: return element.prompt;
        }
      }
      return element.prompt;
    })
    .filter(Boolean);
  
  const contentPrompt = contentParts.join(', ');
  
  // 统一强化纯白背景，避免背景颜色被风格词带偏
  const whiteBackgroundPrompt = "pure solid white background, isolated character on white background, absolutely no background scenery";
  
  if (isRealistic) {
    return isZh
      ? `${basePrompt}, ${contentPrompt}, photography character reference layout, collage format, ${whiteBackgroundPrompt}, ${styleTokens}, cinematic lighting, high detail skin texture, photorealistic`
      : `${basePrompt}, ${contentPrompt}, photographic character reference layout, collage format, ${whiteBackgroundPrompt}, ${styleTokens}, cinematic lighting, highly detailed skin texture, photorealistic`;
  } else {
    return isZh
      ? `${basePrompt}, ${contentPrompt}, character reference layout, ${whiteBackgroundPrompt}, ${styleTokens}, detailed illustration`
      : `${basePrompt}, ${contentPrompt}, character reference sheet layout, ${whiteBackgroundPrompt}, ${styleTokens}, detailed illustration`;
  }
}

// Note: generateCharacterImage and imageUrlToBase64 are now imported from @/lib/ai/image-generator
