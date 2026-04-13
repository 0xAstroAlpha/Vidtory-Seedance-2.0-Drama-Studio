// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Quad Grid Dialog - 四宫格生成对话框
 * 基于锚点图生成2x2一致性变体
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Grid2X2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuadVariationType = "angle" | "composition" | "moment";

export interface QuadGridDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (variationType: QuadVariationType, useCharacterRef: boolean) => void | Promise<void>;
  frameType?: "start" | "end";
  previewUrl?: string;
  isGenerating?: boolean;
}

const VARIATION_OPTIONS: {
  type: QuadVariationType;
  label: string;
  description: string;
  variations: string[];
}[] = [
  {
    type: "angle",
    label: "Viewpoint Variant",
    description: "4 different viewpoints of the same scene",
    variations: ["Front Left", "Front Right", "Side Close-up", "Top-down Wide Shot"],
  },
  {
    type: "composition",
    label: "Composition Variant",
    description: "4 different compositions of the same scene",
    variations: ["Full Body Long Shot", "Half Body Medium Shot", "Face Close-up", "Environment Detail"],
  },
  {
    type: "moment",
    label: "Moment Variant",
    description: "4 time points of the action",
    variations: ["Action Start", "Action Process", "Action Climax", "Action End"],
  },
];

export function QuadGridDialog({
  open,
  onOpenChange,
  onGenerate,
  frameType = "start",
  previewUrl,
  isGenerating = false,
}: QuadGridDialogProps) {
  const [selectedType, setSelectedType] = useState<QuadVariationType>("angle");
  const [useCharacterRef, setUseCharacterRef] = useState(false);

  const selectedOption = VARIATION_OPTIONS.find((o) => o.type === selectedType);

  const handleGenerate = () => {
    onGenerate(selectedType, useCharacterRef);
  };

  // 生成期间禁止Close对话框
  const handleOpenChange = (newOpen: boolean) => {
    if (isGenerating && !newOpen) return; // Generating...不允许Close
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="max-w-md p-4 bg-zinc-900 border-zinc-800"
        onEscapeKeyDown={(e) => isGenerating && e.preventDefault()}
        onPointerDownOutside={(e) => isGenerating && e.preventDefault()}
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm text-white flex items-center gap-2">
            <Grid2X2 className="h-4 w-4 text-cyan-400" />
            Generate Quad Grid - {frameType === "start" ? "First Frame" : "Last Frame"}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Based on current Image Generation 4 consistent variants, inherit character/scene/lighting
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 预览图 */}
          {previewUrl && (
            <div className="flex justify-center">
              <div className="relative w-40 aspect-video rounded overflow-hidden border border-zinc-700">
                <img
                  src={previewUrl}
                  alt="Anchor Image"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1 left-1 text-[10px] bg-cyan-500/80 text-white px-1.5 py-0.5 rounded">
                  Anchor Image
                </span>
              </div>
            </div>
          )}

          {/* 变体类型Select */}
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Select Variant Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {VARIATION_OPTIONS.map((option) => (
                <button
                  key={option.type}
                  onClick={() => setSelectedType(option.type)}
                  disabled={isGenerating}
                  className={cn(
                    "p-2 rounded border text-left transition-all",
                    selectedType === option.type
                      ? "border-cyan-500 bg-cyan-500/10"
                      : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/50"
                  )}
                >
                  <div className="text-xs font-medium text-white">
                    {option.label}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 预览4格内容 */}
          {selectedOption && (
            <div className="p-3 rounded bg-zinc-800/50 border border-zinc-700">
              <div className="text-[10px] text-zinc-500 mb-2">
                Will generate a 2x2 quad grid:
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {selectedOption.variations.map((v, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-zinc-300 bg-zinc-700/50 px-2 py-1 rounded"
                  >
                    {i + 1}. {v}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 选项 */}
          <div className="flex items-center space-x-2 px-1">
            <Checkbox 
              id="use-char-ref" 
              checked={useCharacterRef}
              onCheckedChange={(checked) => setUseCharacterRef(checked === true)}
              className="border-zinc-600 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
            />
            <Label 
              htmlFor="use-char-ref" 
              className="text-xs text-zinc-400 font-normal cursor-pointer select-none leading-none"
            >
              Reference Character Library (Uncheck if character appearance is messy)
            </Label>
          </div>

          {/* 按钮 */}
          <div className="flex gap-2 pt-2">
            {isGenerating ? (
              <div className="flex-1 flex items-center justify-center gap-2 h-8 bg-cyan-500/20 rounded border border-cyan-500/50">
                <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
                <span className="text-sm text-cyan-400">Generating quad grid... Please wait...</span>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="flex-1 h-8 text-xs bg-transparent border-zinc-700 hover:bg-zinc-800 text-white"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  className="flex-1 h-8 text-xs bg-cyan-500 hover:bg-cyan-600 text-black"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Generate Quad Grid
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
