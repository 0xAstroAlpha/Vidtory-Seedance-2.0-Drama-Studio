// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * ExtendEditDialog — VideoExtend / Video Edit对话框
 *
 * Extend模式：Select方向 + Duration + 补充Description → Create extend 子组
 * Edit模式：SelectEdit Type + 补充Description → Create edit 子组
 */

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Timer, Scissors, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSClassStore,
  type ShotGroup,
  type ExtendDirection,
  type EditType,
} from "@/stores/sclass-store";

// ==================== Types ====================

export type ExtendEditMode = "extend" | "edit";

export interface ExtendEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ExtendEditMode;
  /** Source Group (Completed video group) */
  sourceGroup: ShotGroup | null;
  /** On confirm callback: Create child group and generate */
  onConfirm: (childGroup: ShotGroup) => void;
  isGenerating?: boolean;
}

// ==================== Constants ====================

const EDIT_TYPE_OPTIONS: { value: EditType; label: string; desc: string }[] = [
  { value: "plot_change", label: "Plot subversion", desc: "Keep style, change story direction" },
  { value: "character_swap", label: "Character swap", desc: "将Video中的Character swap为Reference Image中的角色" },
  { value: "attribute_modify", label: "Attribute modify", desc: "Change clothing, hair color, lighting etc" },
  { value: "element_add", label: "Element add", desc: "Overlay new visual elements" },
];

// ==================== Component ====================

export function ExtendEditDialog({
  open,
  onOpenChange,
  mode,
  sourceGroup,
  onConfirm,
  isGenerating = false,
}: ExtendEditDialogProps) {
  // --- Extend参数 ---
  const [direction, setDirection] = useState<ExtendDirection>("backward");
  const [duration, setDuration] = useState(10);

  // --- Edit参数 ---
  const [editType, setEditType] = useState<EditType>("plot_change");

  // --- Total用 ---
  const [description, setDescription] = useState("");

  const { addShotGroup } = useSClassStore();

  const handleConfirm = useCallback(() => {
    if (!sourceGroup || !sourceGroup.videoUrl) return;

    const childId = `${mode}_${Date.now()}_${sourceGroup.id.substring(0, 8)}`;
    const childGroup: ShotGroup = {
      id: childId,
      name: `${sourceGroup.name} - ${mode === "extend" ? "Extend" : "Edit"}`,
      sceneIds: [...sourceGroup.sceneIds],
      sortIndex: sourceGroup.sortIndex + 0.5,
      totalDuration: (mode === "extend"
        ? Math.max(4, Math.min(15, duration))
        : (sourceGroup.totalDuration || 10)) as ShotGroup["totalDuration"],
      videoStatus: "idle",
      videoProgress: 0,
      videoUrl: null,
      videoMediaId: null,
      videoError: null,
      gridImageUrl: null,
      lastPrompt: null,
      mergedPrompt: description.trim() || sourceGroup.mergedPrompt || "",
      history: [],
      imageRefs: [],
      videoRefs: [],
      audioRefs: [],
      generationType: mode,
      extendDirection: mode === "extend" ? direction : undefined,
      editType: mode === "edit" ? editType : undefined,
      sourceGroupId: sourceGroup.id,
      sourceVideoUrl: sourceGroup.videoUrl || undefined,
    };

    addShotGroup(childGroup);
    onConfirm(childGroup);
    onOpenChange(false);

    // Reset form
    setDescription("");
    setDuration(10);
    setDirection("backward");
    setEditType("plot_change");
  }, [sourceGroup, mode, direction, duration, editType, description, addShotGroup, onConfirm, onOpenChange]);

  const isExtend = mode === "extend";
  const title = isExtend ? "VideoExtend" : "Video Edit";
  const Icon = isExtend ? Timer : Scissors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", isExtend ? "text-purple-500" : "text-orange-500")} />
            {title}
          </DialogTitle>
          <DialogDescription>
            {isExtend
              ? "基于GeneratedVideo继续Extend，支持向后或向前拓展"
              : "对GeneratedVideo进行PlotEdit、Character swap等Actions"
            }
          </DialogDescription>
        </DialogHeader>

        {/* Source Video Preview */}
        {sourceGroup?.videoUrl && (
          <div className="rounded-md overflow-hidden border">
            <video
              src={sourceGroup.videoUrl}
              className="w-full max-h-32 object-cover"
              preload="metadata"
              muted
            />
            <div className="px-2 py-1 bg-muted/30 text-xs text-muted-foreground">
              Source: {sourceGroup.name}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* ========== Extend模式参数 ========== */}
          {isExtend && (
            <>
              {/* Extend方向 */}
              <div className="space-y-1.5">
                <Label className="text-xs">Extend方向</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as ExtendDirection)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backward">向后Extend（Default）</SelectItem>
                    <SelectItem value="forward">向前Extend（前置内容）</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ExtendDuration */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs">ExtendDuration</Label>
                  <span className="text-xs text-muted-foreground">{duration}s</span>
                </div>
                <Slider
                  value={[duration]}
                  onValueChange={(v) => setDuration(v[0])}
                  min={4}
                  max={15}
                  step={1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>4s</span>
                  <span>15s</span>
                </div>
              </div>
            </>
          )}

          {/* ========== Edit mode params ========== */}
          {!isExtend && (
            <div className="space-y-1.5">
              <Label className="text-xs">Edit Type</Label>
              <Select value={editType} onValueChange={(v) => setEditType(v as EditType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDIT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ========== 补充Description ========== */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              补充Description
              <span className="text-muted-foreground ml-1">(Optional)</span>
            </Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              rows={3}
              placeholder={isExtend
                ? "DescriptionExtend部分的画面内容，如：Shot缓缓拉远，角色渐行渐远..."
                : "DescriptionEdit目标，如：将DaytimeScene改为Night，保持人物不变..."
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={cn(
              isExtend
                ? "bg-purple-600 hover:bg-purple-700 text-white"
                : "bg-orange-600 hover:bg-orange-700 text-white",
            )}
            disabled={isGenerating || !sourceGroup?.videoUrl}
            onClick={handleConfirm}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Processing
              </>
            ) : (
              <>
                <Icon className="h-3 w-3 mr-1" />
                Confirm{isExtend ? "Extend" : "Edit"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
