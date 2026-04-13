// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Add Provider Dialog
 * For adding new API providers with platform selection
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { IProvider } from "@/lib/api-key-manager";

/**
 * Platform presets:
 * 1. Google Gemini - Text/Image/Video via Google AI or OpenAI-compatible proxy
 * 2. Custom - Any OpenAI-compatible API
 */
const PLATFORM_PRESETS: Array<{
  platform: string;
  name: string;
  baseUrl: string;
  description: string;
  services: string[];
  models: string[];
  recommended?: boolean;
}> = [
  {
    platform: "gemini",
    name: "Google Gemini",
    baseUrl: "",
    description: "Google AI models — text, image, and video generation",
    services: ["Dialogue", "Image Gen", "Video Gen", "Vision"],
    models: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-3-pro-preview",
      "gemini-3-flash-preview",
      "imagen-4",
    ],
    recommended: true,
  },
  {
    platform: "custom",
    name: "Custom",
    baseUrl: "",
    description: "Custom OpenAI Compatible API Provider",
    services: [],
    models: [],
  },
];

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (provider: Omit<IProvider, "id">) => void;
  existingPlatforms?: string[];
}

export function AddProviderDialog({
  open,
  onOpenChange,
  onSubmit,
  existingPlatforms = [],
}: AddProviderDialogProps) {
  const [platform, setPlatform] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  // Get selected preset
  const selectedPreset = PLATFORM_PRESETS.find((p) => p.platform === platform);
  const isCustom = platform === "custom";

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setPlatform("");
      setName("");
      setBaseUrl("");
      setApiKey("");
      setModel("");
    }
  }, [open]);

  // Auto-fill when platform changes
  useEffect(() => {
    if (selectedPreset && !isCustom) {
      setName(selectedPreset.name);
      setBaseUrl(selectedPreset.baseUrl);
      // 自动填充DefaultModel
      if (selectedPreset.models && selectedPreset.models.length > 0) {
        setModel(selectedPreset.models[0]);
      }
    }
  }, [platform, selectedPreset, isCustom]);

  const handleSubmit = () => {
    if (!platform) {
      toast.error("Please selectPlatform");
      return;
    }
    if (!name.trim()) {
      toast.error("请输入Name");
      return;
    }
    if (isCustom && !baseUrl.trim()) {
      toast.error("Custom platform requires Base URL");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("Please enter API Key");
      return;
    }

    // Save该Platform的所Has 预设Model，确保 provider.model 不为空
    const presetModels = selectedPreset?.models || [];
    const modelArray = presetModels.length > 0 
      ? presetModels 
      : (model ? [model] : []);
    
    onSubmit({
      platform,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: modelArray,
    });

    onOpenChange(false);
    toast.success(isGeminiAppend ? `Key appended to ${name}` : `Added ${name}`);
  };

  // Filter out already existing platforms (except custom and gemini which allow repeat add)
  const availablePlatforms = PLATFORM_PRESETS.filter(
    (p) => p.platform === "custom" || p.platform === "gemini" || !existingPlatforms.includes(p.platform)
  );
  const isGeminiAppend = platform === "gemini" && existingPlatforms.includes("gemini");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add API Provider</DialogTitle>
          <DialogDescription className="hidden">Add a new API Provider</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Platform Selection */}
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue placeholder="SelectPlatform" />
              </SelectTrigger>
              <SelectContent>
              {availablePlatforms.map((preset) => (
                  <SelectItem key={preset.platform} value={preset.platform}>
                    <span className="flex items-center gap-2">
                      {preset.name}
                      {preset.recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded font-medium">
                          Recommended
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ProviderName"
            />
          </div>

          {/* Base URL (only for custom or editable) */}
          {(isCustom || platform) && (
            <div className="space-y-2">
              <Label>Base URL {!isCustom && "(Optional)"}</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={isCustom ? "https://api.example.com/v1" : ""}
              />
            </div>
          )}

          {/* API Key */}
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API Key"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Supports multiple keys, separated by comma
            </p>
          </div>

          {/* Model - optional input */}
          <div className="space-y-2">
            <Label>Model (Optional)</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Enter model name, e.g. gemini-2.5-flash"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{isGeminiAppend ? 'Append Key' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
