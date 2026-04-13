// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * GroupRefManager — S级组级 @引用管理器
 *
 * Feature：
 * - 自动收Episode：角色Reference Image、SceneReference Image、First FrameImage → 只读展示
 * - 手动Upload：Video引用（运镜/动作复刻）、Audio引用（节奏/BGM）
 * - 配额条：≤9 Image + ≤3 Video + ≤3 Audio，总 ≤12
 * - DeleteUploaded Videos/Audio引用
 *
 * Seedance 2.0 限制:
 * - images: ≤9, videos: ≤3 (≤15s each), audios: ≤3 (MP3, ≤15s), total: ≤12
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ImageIcon,
  Film,
  Music,
  X,
  AlertCircle,
  User,
  MapPin,
  Clapperboard,
  Plus,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { SplitScene } from "@/stores/director-store";
import type { Character } from "@/stores/character-library-store";
import type { Scene } from "@/stores/scene-store";
import type { ShotGroup, AssetRef } from "@/stores/sclass-store";
import { useSClassStore } from "@/stores/sclass-store";
import {
  collectCharacterRefs,
  collectSceneRefs,
  collectFirstFrameRefs,
  SEEDANCE_LIMITS,
} from "./sclass-prompt-builder";
import { useResolvedImageUrl } from "@/hooks/use-resolved-image-url";

// ==================== Props ====================

export interface GroupRefManagerProps {
  group: ShotGroup;
  scenes: SplitScene[];
  characters: Character[];
  sceneLibrary: Scene[];
  /** 是否只读 */
  readOnly?: boolean;
}

// ==================== Sub-components ====================

/** 缩略图：支持 base64/http/local-image:// */
function RefThumbnail({
  src,
  alt,
  type,
}: {
  src: string;
  alt: string;
  type: "image" | "video" | "audio";
}) {
  const resolved = useResolvedImageUrl(src);

  if (type === "audio") {
    return (
      <div className="w-10 h-10 rounded bg-green-500/10 flex items-center justify-center">
        <Music className="h-4 w-4 text-green-500" />
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className="w-10 h-10 rounded bg-purple-500/10 flex items-center justify-center">
        <Film className="h-4 w-4 text-purple-500" />
      </div>
    );
  }

  return resolved ? (
    <img
      src={resolved}
      alt={alt}
      className="w-10 h-10 rounded object-cover border"
    />
  ) : (
    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
      <ImageIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

/** 配额Progress条 */
function QuotaBar({
  label,
  icon,
  current,
  max,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  current: number;
  max: number;
  color: string;
}) {
  const over = current > max;
  const pct = Math.min((current / max) * 100, 100);
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {icon}
      <span className={cn(over && "text-red-500 font-medium")}>
        {current}/{max}
      </span>
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", over ? "bg-red-500" : color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export function GroupRefManager({
  group,
  scenes,
  characters,
  sceneLibrary,
  readOnly = false,
}: GroupRefManagerProps) {
  const { addAssetRef, removeAssetRef } = useSClassStore();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState<"video" | "audio" | null>(null);

  // ========== 自动收Episode的Image引用 ==========
  const autoImages = useMemo(() => {
    const allCharIds = Array.from(
      new Set(scenes.flatMap((s) => s.characterIds || []))
    );
    const charRefs = collectCharacterRefs(allCharIds, characters);
    const sceneRefs = collectSceneRefs(scenes, sceneLibrary);
    const frameRefs = collectFirstFrameRefs(scenes);

    return {
      charRefs,
      sceneRefs,
      frameRefs,
      total: charRefs.length + sceneRefs.length + frameRefs.length,
      truncated: charRefs.length + sceneRefs.length + frameRefs.length > SEEDANCE_LIMITS.maxImages,
    };
  }, [scenes, characters, sceneLibrary]);

  const imageCount = Math.min(autoImages.total, SEEDANCE_LIMITS.maxImages);
  const videoRefs = group.videoRefs || [];
  const audioRefs = group.audioRefs || [];
  const totalFiles = imageCount + videoRefs.length + audioRefs.length;

  // ========== 文件Upload处理 ==========
  const handleFileUpload = useCallback(
    async (files: FileList | null, type: "video" | "audio") => {
      if (!files || files.length === 0) return;

      const limits = type === "video"
        ? { max: SEEDANCE_LIMITS.maxVideos, current: videoRefs.length, accept: ["video/mp4", "video/webm", "video/quicktime"] }
        : { max: SEEDANCE_LIMITS.maxAudios, current: audioRefs.length, accept: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"] };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 配额检查（单类型）
        if (limits.current + i >= limits.max) {
          toast.error(`${type === "video" ? "Video" : "Audio"} references reached limit ${limits.max} `);
          break;
        }

        // 配额检查（总文件数）
        if (totalFiles + i >= SEEDANCE_LIMITS.maxTotalFiles) {
          toast.error(`Total files reached limit ${SEEDANCE_LIMITS.maxTotalFiles}`);
          break;
        }

        // 文件类型检查
        if (!limits.accept.some((t) => file.type.startsWith(t.split("/")[0]))) {
          toast.error(`Unsupported file type: ${file.name}`);
          continue;
        }

        // 读取为 data URL
        const dataUrl = await readFileAsDataUrl(file);

        // 检查Duration（Video/Audio都需 ≤15s）
        const duration = await getMediaDuration(dataUrl, type);
        if (duration > SEEDANCE_LIMITS.maxDuration) {
          toast.error(`${file.name} Duration ${Math.round(duration)}s exceeds ${SEEDANCE_LIMITS.maxDuration}s limit`);
          continue;
        }

        const asset: AssetRef = {
          id: `${type}_upload_${Date.now()}_${i}`,
          type,
          tag: type === "video" ? `@Video${videoRefs.length + i + 1}` : `@Audio${audioRefs.length + i + 1}`,
          localUrl: dataUrl,
          httpUrl: null,
          fileName: file.name,
          fileSize: file.size,
          duration: Math.round(duration * 10) / 10,
          purpose: type === "video" ? 'camera_replicate' : 'bgm',
        };

        addAssetRef(group.id, asset);
        toast.success(`Added ${type === "video" ? "Video" : "Audio"} reference: ${file.name}`);
      }
    },
    [group.id, videoRefs.length, audioRefs.length, addAssetRef]
  );

  // Delete引用
  const handleRemoveRef = useCallback(
    (assetId: string, fileName: string) => {
      removeAssetRef(group.id, assetId);
      toast.info(`Removed: ${fileName}`);
    },
    [group.id, removeAssetRef]
  );

  // 拖放处理
  const handleDrop = useCallback(
    (e: React.DragEvent, type: "video" | "audio") => {
      e.preventDefault();
      setIsDragOver(null);
      handleFileUpload(e.dataTransfer.files, type);
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, type: "video" | "audio") => {
      e.preventDefault();
      setIsDragOver(type);
    },
    []
  );

  return (
    <div className="px-3 py-2 border-t bg-muted/5 space-y-2">
      {/* ========== Quota Overview ========== */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">@Reference Materials</span>
        <QuotaBar
          label="Image"
          icon={<ImageIcon className="h-3 w-3 text-blue-500" />}
          current={imageCount}
          max={SEEDANCE_LIMITS.maxImages}
          color="bg-blue-500"
        />
        <QuotaBar
          label="Video"
          icon={<Film className="h-3 w-3 text-purple-500" />}
          current={videoRefs.length}
          max={SEEDANCE_LIMITS.maxVideos}
          color="bg-purple-500"
        />
        <QuotaBar
          label="Audio"
          icon={<Music className="h-3 w-3 text-green-500" />}
          current={audioRefs.length}
          max={SEEDANCE_LIMITS.maxAudios}
          color="bg-green-500"
        />
        <div className={cn(
          "text-xs px-1.5 py-0.5 rounded",
          totalFiles > SEEDANCE_LIMITS.maxTotalFiles
            ? "bg-red-500/10 text-red-500 font-medium"
            : "bg-muted text-muted-foreground"
        )}>
          Total {totalFiles}/{SEEDANCE_LIMITS.maxTotalFiles}
        </div>
      </div>

      {/* ========== Auto-collected image references (collapsed) ========== */}
      <AutoImageSection
        charRefs={autoImages.charRefs}
        sceneRefs={autoImages.sceneRefs}
        frameRefs={autoImages.frameRefs}
        truncated={autoImages.truncated}
      />

      {/* ========== Video Reference Upload Area ========== */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Film className="h-3 w-3 text-purple-500" />
          <span>Video Reference — Camera/Action Replication</span>
        </div>

        {/* Uploaded Videos */}
        {videoRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {videoRefs.map((ref) => (
              <RefChip
                key={ref.id}
                ref_={ref}
                onRemove={readOnly ? undefined : () => handleRemoveRef(ref.id, ref.fileName)}
              />
            ))}
          </div>
        )}

        {/* Upload Area */}
        {!readOnly && videoRefs.length < SEEDANCE_LIMITS.maxVideos && (
          <UploadZone
            type="video"
            isDragOver={isDragOver === "video"}
            onDrop={(e) => handleDrop(e, "video")}
            onDragOver={(e) => handleDragOver(e, "video")}
            onDragLeave={() => setIsDragOver(null)}
            onClick={() => videoInputRef.current?.click()}
          />
        )}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFileUpload(e.target.files, "video");
            e.target.value = "";
          }}
        />
      </div>

      {/* ========== Audio引用Upload Area ========== */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Music className="h-3 w-3 text-green-500" />
          <span>Audio Reference — Rhythm/BGM</span>
        </div>

        {/* Uploaded Audios */}
        {audioRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {audioRefs.map((ref) => (
              <RefChip
                key={ref.id}
                ref_={ref}
                onRemove={readOnly ? undefined : () => handleRemoveRef(ref.id, ref.fileName)}
              />
            ))}
          </div>
        )}

        {/* Upload Area */}
        {!readOnly && audioRefs.length < SEEDANCE_LIMITS.maxAudios && (
          <UploadZone
            type="audio"
            isDragOver={isDragOver === "audio"}
            onDrop={(e) => handleDrop(e, "audio")}
            onDragOver={(e) => handleDragOver(e, "audio")}
            onDragLeave={() => setIsDragOver(null)}
            onClick={() => audioInputRef.current?.click()}
          />
        )}
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFileUpload(e.target.files, "audio");
            e.target.value = "";
          }}
        />
      </div>

      {/* ========== Exceed Limit Warning ========== */}
      {totalFiles > SEEDANCE_LIMITS.maxTotalFiles && (
        <div className="flex items-start gap-1.5 text-xs text-red-500 bg-red-500/5 rounded p-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>Total files {totalFiles} exceeds Seedance 2.0 limit ({SEEDANCE_LIMITS.maxTotalFiles}), please remove some references</span>
        </div>
      )}
    </div>
  );
}

// ==================== Auto-collected Images Section ====================

function AutoImageSection({
  charRefs,
  sceneRefs,
  frameRefs,
  truncated,
}: {
  charRefs: AssetRef[];
  sceneRefs: AssetRef[];
  frameRefs: AssetRef[];
  truncated: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = charRefs.length + sceneRefs.length + frameRefs.length;

  if (totalCount === 0) {
    return (
      <div className="text-xs text-muted-foreground/60 py-1">
        No auto-collected image references (Please generate first frame image, link characters or scenes first)
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ImageIcon className="h-3 w-3 text-blue-500" />
        <span>
          Auto-collected {totalCount} images
          {truncated && <span className="text-amber-500 ml-1">(Exceeded limit, truncated to {SEEDANCE_LIMITS.maxImages})</span>}
        </span>
        <span className="text-[10px]">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="space-y-1.5 pl-1">
          {/* First Frame Image */}
          {frameRefs.length > 0 && (
            <RefGroup
              label="First Frame"
              icon={<Clapperboard className="h-3 w-3 text-blue-400" />}
              refs={frameRefs}
            />
          )}
          {/* Character Image */}
          {charRefs.length > 0 && (
            <RefGroup
              label="character"
              icon={<User className="h-3 w-3 text-amber-400" />}
              refs={charRefs}
            />
          )}
          {/* Scene Image */}
          {sceneRefs.length > 0 && (
            <RefGroup
              label="Scene"
              icon={<MapPin className="h-3 w-3 text-teal-400" />}
              refs={sceneRefs}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Reference Group Display */
function RefGroup({
  label,
  icon,
  refs,
}: {
  label: string;
  icon: React.ReactNode;
  refs: AssetRef[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-[10px] text-muted-foreground w-8">{label}</span>
      <div className="flex gap-1 overflow-x-auto">
        {refs.map((ref) => (
          <TooltipProvider key={ref.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="shrink-0">
                  <RefThumbnail src={ref.localUrl} alt={ref.fileName} type="image" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{ref.fileName}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    </div>
  );
}

// ==================== Upload Zone ====================

function UploadZone({
  type,
  isDragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onClick,
}: {
  type: "video" | "audio";
  isDragOver: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onClick: () => void;
}) {
  const isVideo = type === "video";
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded border border-dashed cursor-pointer transition-colors",
        isDragOver
          ? isVideo
            ? "border-purple-500 bg-purple-500/10"
            : "border-green-500 bg-green-500/10"
          : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30"
      )}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onClick}
    >
      <Plus className={cn("h-3 w-3", isVideo ? "text-purple-400" : "text-green-400")} />
      <span className="text-xs text-muted-foreground">
        {isVideo
          ? "Drag & drop or click to upload video (MP4/WebM, ≤15s)"
          : "Drag & drop or click to upload audio (MP3/WAV, ≤15s)"}
      </span>
    </div>
  );
}

// ==================== RefChip ====================

/** Uploaded Reference Labels */
function RefChip({
  ref_,
  onRemove,
}: {
  ref_: AssetRef;
  onRemove?: () => void;
}) {
  const isVideo = ref_.type === "video";
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border",
        isVideo
          ? "bg-purple-500/5 border-purple-500/20 text-purple-600 dark:text-purple-400"
          : "bg-green-500/5 border-green-500/20 text-green-600 dark:text-green-400"
      )}
    >
      {isVideo ? <Film className="h-3 w-3" /> : <Music className="h-3 w-3" />}
      <span className="max-w-[120px] truncate">{ref_.fileName}</span>
      {ref_.duration != null && (
        <span className="text-[10px] text-muted-foreground">{ref_.duration}s</span>
      )}
      {onRemove && (
        <button
          className="ml-0.5 hover:text-red-500 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ==================== Helpers ====================

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getMediaDuration(dataUrl: string, type: "video" | "audio"): Promise<number> {
  return new Promise((resolve) => {
    if (type === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve(video.duration || 0);
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => resolve(0);
      video.src = dataUrl;
    } else {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        resolve(audio.duration || 0);
        URL.revokeObjectURL(audio.src);
      };
      audio.onerror = () => resolve(0);
      audio.src = dataUrl;
    }
  });
}
