// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * CinematographyProfilePicker — 摄影风格档案Select器
 *
 * Feature：
 * - 左侧：按分类显示Profile list（emoji + Name）
 * - 右侧：悬停/选中时显示详细Description、摄影参数、Reference Films
 * - 支持 Popover 弹出模式和内嵌模式
 */

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Camera } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CINEMATOGRAPHY_PROFILE_CATEGORIES,
  CINEMATOGRAPHY_PROFILES,
  getCinematographyProfile,
  type CinematographyProfile,
} from "@/lib/constants/cinematography-profiles";
import { getMediaType, MEDIA_TYPE_LABELS, type MediaType } from "@/lib/constants/visual-styles";
import { isFieldSkipped } from "@/lib/generation/media-type-tokens";

interface CinematographyProfilePickerProps {
  /** Currently selected profile ID */
  value: string;
  /** Selection change callback */
  onChange: (profileId: string) => void;
  /** Use dropdown popover mode (default true) */
  popover?: boolean;
  /** Custom trigger (popover mode only) */
  trigger?: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Placeholder text when unselected */
  placeholder?: string;
  /** Current visual style ID (for media adaptation notice) */
  styleId?: string;
}

/**
 * 摄影风格档案Select器
 */
export function CinematographyProfilePicker({
  value,
  onChange,
  popover = true,
  trigger,
  className,
  disabled = false,
  placeholder = "Select Cinematography Profile",
  styleId,
}: CinematographyProfilePickerProps) {
  const [hoveredProfile, setHoveredProfile] = useState<CinematographyProfile | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // 获取当前选中的档案
  const selectedProfile = useMemo(() => getCinematographyProfile(value), [value]);

  // Preview的档案（悬停优先，否则显示选中的，兆底第一）
  const previewProfile = hoveredProfile || selectedProfile || CINEMATOGRAPHY_PROFILES[0];

  // 媒介类型适配Notice
  const mediaType: MediaType | undefined = styleId ? getMediaType(styleId) : undefined;
  const showAdaptHint = mediaType && mediaType !== 'cinematic';

  // 处理Select
  const handleSelect = (profile: CinematographyProfile) => {
    onChange(profile.id);
    if (popover) {
      setIsOpen(false);
    }
  };

  // 内容面板
  const pickerContent = (
    <div className={cn("flex", popover ? "w-[560px] h-[420px]" : "w-full h-full", className)}>
      {/* Left: Profile list */}
      <ScrollArea className="w-[220px] border-r border-border">
        <div className="p-2">
          {CINEMATOGRAPHY_PROFILE_CATEGORIES.map((category) => (
            <div key={category.id} className="mb-4">
              {/* Category title */}
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-2">
                {category.emoji} {category.name}
              </div>
              {/* Profile list */}
              <div className="space-y-1">
                {category.profiles.map((profile) => (
                  <ProfileItem
                    key={profile.id}
                    profile={profile}
                    isSelected={value === profile.id}
                    onSelect={() => handleSelect(profile)}
                    onHover={() => setHoveredProfile(profile)}
                    onLeave={() => setHoveredProfile(null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Right: Preview */}
      <div className="flex-1 p-4 flex flex-col overflow-hidden">
        {/* Profile title */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">{previewProfile.emoji}</span>
          <div>
            <div className="font-medium text-sm">{previewProfile.name}</div>
            <div className="text-xs text-muted-foreground">{previewProfile.nameEn}</div>
          </div>
        </div>

        {/* Description */}
        <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {previewProfile.description}
        </div>

        {/* Media adaptation notice */}
        {showAdaptHint && (
          <div className="text-xs mb-3 px-2 py-1.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            ⓘ Current visual style is '{MEDIA_TYPE_LABELS[mediaType]}', camera parameters will adapt automatically
            {isFieldSkipped(mediaType, 'cameraRig') && '(Equipment/DOF/Focus transition will be skipped)'}
          </div>
        )}

        {/* Camera parameters quick view */}
        <ScrollArea className="flex-1 mb-3">
          <div className="space-y-2 text-xs">
            <ParamRow
              label="💡 Lighting"
              value={`${previewProfile.defaultLighting.style} · ${previewProfile.defaultLighting.direction} · ${previewProfile.defaultLighting.colorTemperature}`}
            />
            <ParamRow
              label="🔭 Focus"
              value={`${previewProfile.defaultFocus.depthOfField} · ${previewProfile.defaultFocus.focusTransition}`}
            />
            <ParamRow
              label="🎥 Equipment"
              value={`${previewProfile.defaultRig.cameraRig} · ${previewProfile.defaultRig.movementSpeed}`}
            />
            {previewProfile.defaultAtmosphere.effects.length > 0 && (
              <ParamRow
                label="🌫️ Atmosphere"
                value={`${previewProfile.defaultAtmosphere.effects.join(" + ")} (${previewProfile.defaultAtmosphere.intensity})`}
              />
            )}
            <ParamRow
              label="⏱️ Speed"
              value={previewProfile.defaultSpeed.playbackSpeed}
            />
          </div>
        </ScrollArea>

        {/* Reference Films */}
        <div className="border-t border-border/50 pt-2">
          <div className="text-xs text-muted-foreground mb-1">🎞️ Reference Films</div>
          <div className="flex flex-wrap gap-1">
            {previewProfile.referenceFilms.map((film) => (
              <span
                key={film}
                className="inline-block px-1.5 py-0.5 text-xs bg-muted rounded"
              >
                {film}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // 下拉模式
  if (popover) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          {trigger || (
            <button
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "text-sm w-full justify-between"
              )}
              disabled={disabled}
            >
              <div className="flex items-center gap-2">
                {selectedProfile ? (
                  <>
                    <span>{selectedProfile.emoji}</span>
                    <span>{selectedProfile.name}</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{placeholder}</span>
                  </>
                )}
              </div>
              <svg
                className="w-4 h-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-auto"
          align="start"
          sideOffset={4}
        >
          {pickerContent}
        </PopoverContent>
      </Popover>
    );
  }

  // 内嵌模式
  return pickerContent;
}

/**
 * 单档案项
 */
interface ProfileItemProps {
  profile: CinematographyProfile;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}

function ProfileItem({ profile, isSelected, onSelect, onHover, onLeave }: ProfileItemProps) {
  return (
    <button
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors",
        "hover:bg-accent",
        isSelected && "bg-accent"
      )}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Emoji */}
      <span className="text-base flex-shrink-0">{profile.emoji}</span>
      {/* Name */}
      <span className="flex-1 text-left text-sm truncate">{profile.name}</span>
      {/* Selected mark */}
      {isSelected && (
        <Check className="w-4 h-4 text-primary flex-shrink-0" />
      )}
    </button>
  );
}

/**
 * 参数行
 */
function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export default CinematographyProfilePicker;
