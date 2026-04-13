// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Settings Panel - Unified API Manager v2
 * Provider-based API configuration with multi-key support
 * Based on AionUi's ModelModalContent pattern
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  isVisibleImageHostProvider,
  useAPIConfigStore,
  type IProvider,
  type ImageHostProvider,
  type AIFeature,
} from "@/stores/api-config-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { useProjectStore } from "@/stores/project-store";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { useSceneStore } from "@/stores/scene-store";
import { useMediaStore } from "@/stores/media-store";
import { getApiKeyCount, parseApiKeys, maskApiKey } from "@/lib/api-key-manager";
import { AddProviderDialog, EditProviderDialog, FeatureBindingPanel } from "@/components/api-manager";
import { AddImageHostDialog } from "@/components/image-host-manager/AddImageHostDialog";
import { EditImageHostDialog } from "@/components/image-host-manager/EditImageHostDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  Settings,
  Key,
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Shield,
  Check,
  X,
  Loader2,
  MessageSquare,
  Zap,
  ScanEye,
  Info,
  Image,
  RotateCcw,
  Link2,
  Play,
  ShieldAlert,
  Layers,
  Folder,
  HardDrive,
  Download,
  RefreshCw,
  Upload,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { uploadToImageHost } from "@/lib/image-host";
import { UpdateDialog } from "@/components/UpdateDialog";
import type { AvailableUpdateInfo } from "@/types/update";
import packageJson from "../../../package.json";

// Platform icon mapping
const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  memefast: <Zap className="h-5 w-5" />,
  runninghub: <Image className="h-5 w-5" />,
  custom: <Settings className="h-5 w-5" />,
};

export function SettingsPanel() {
  const {
    providers,
    concurrency,
    advancedOptions,
    imageHostProviders,
    addProvider,
    updateProvider,
    removeProvider,
    addImageHostProvider,
    updateImageHostProvider,
    removeImageHostProvider,
    setConcurrency,
    setAdvancedOption,
    resetAdvancedOptions,
    isImageHostConfigured,
    syncProviderModels,
    setFeatureBindings,
    getFeatureBindings,
  } = useAPIConfigStore();
  const {
    resourceSharing,
    storagePaths,
    cacheSettings,
    updateSettings,
    setResourceSharing,
    setStoragePaths,
    setCacheSettings,
    setUpdateSettings,
  } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();
  const { assignProjectToUnscoped: assignCharactersToProject } = useCharacterLibraryStore();
  const { assignProjectToUnscoped: assignScenesToProject } = useSceneStore();
  const { assignProjectToUnscoped: assignMediaToProject } = useMediaStore();

  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<IProvider | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [imageHostAddOpen, setImageHostAddOpen] = useState(false);
  const [imageHostEditOpen, setImageHostEditOpen] = useState(false);
  const [editingImageHost, setEditingImageHost] = useState<ImageHostProvider | null>(null);
  const [testingImageHostId, setTestingImageHostId] = useState<string | null>(null);
  const [cacheSize, setCacheSize] = useState(0);
  const [isCacheLoading, setIsCacheLoading] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdateInfo | null>(null);
  const [appVersion, setAppVersion] = useState(packageJson.version);
  const visibleImageHostProviders = useMemo(
    () => imageHostProviders.filter(isVisibleImageHostProvider),
    [imageHostProviders],
  );

  // ====== Memefast 默认Binding自动补全 ======
  // 覆盖Scene：
  //  1. 旧版本升级后已有 key 但 featureBindings 为空
  //  2. 旧版本留下None效Binding（Model名错、provider ID 变更等）
  //  3. 用户Edit填 key 后页面Refresh
  useEffect(() => {
    const mf = providers.find(p => p.platform === 'gemini');
    if (!mf || parseApiKeys(mf.apiKey).length === 0) return;

    const pid = mf.id;
    const models = mf.model || [];
    const defaults: Record<string, string> = {
      script_analysis: `${pid}:deepseek-v3.2`,
      character_generation: `${pid}:gemini-3-pro-image-preview`,
      video_generation: `${pid}:doubao-seedance-1-5-pro-251215`,
      image_understanding: `${pid}:gemini-2.5-flash`,
    };

    // 检查Binding是否有效
    const isBindingValid = (b: string): boolean => {
      const idx = b.indexOf(':');
      if (idx <= 0) return false;
      const ref = b.slice(0, idx);
      const model = b.slice(idx + 1);
      const p = providers.find(pv => pv.id === ref || pv.platform === ref);
      if (!p || parseApiKeys(p.apiKey).length === 0) return false;
      // Model列表为空时（尚未同步）暂时信任Binding
      if (p.model.length === 0) return true;
      return p.model.includes(model);
    };

    let changed = false;
    for (const [feature, binding] of Object.entries(defaults)) {
      const cur = getFeatureBindings(feature as AIFeature);

      // 自愈：deepseek-v3 → deepseek-v3.2（在校验之前先迁移）
      if (feature === 'script_analysis' && cur && cur.some(b => b.endsWith(':deepseek-v3'))) {
        const migrated = cur.map(b => {
          if (!b.endsWith(':deepseek-v3')) return b;
          const i = b.indexOf(':');
          return i > 0 ? `${b.slice(0, i)}:deepseek-v3.2` : binding;
        });
        setFeatureBindings(feature as AIFeature, [...new Set(migrated)]);
        changed = true;
        continue;
      }

      // 为空 或 全部None效 → 重新设置默认值
      const needsDefault = !cur || cur.length === 0 || !cur.some(isBindingValid);
      if (needsDefault) {
        setFeatureBindings(feature as AIFeature, [binding]);
        changed = true;
      }
    }
    if (changed) {
      console.log('[SettingsPanel] Auto-applied memefast default bindings');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const version = await window.appUpdater?.getCurrentVersion?.();
        if (!cancelled && version) {
          setAppVersion(version);
        }
      } catch (error) {
        console.warn("[SettingsPanel] Failed to load app version:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Toggle provider expansion
  const toggleExpanded = (id: string) => {
    setExpandedProviders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Open edit dialog
  const handleEdit = (provider: IProvider) => {
    setEditingProvider(provider);
    setEditDialogOpen(true);
  };

  // Delete provider
  const handleDelete = (id: string) => {
    removeProvider(id);
    toast.success("Provider deleted");
  };

  const handleEditImageHost = (provider: ImageHostProvider) => {
    setEditingImageHost(provider);
    setImageHostEditOpen(true);
  };

  const handleDeleteImageHost = (id: string) => {
    removeImageHostProvider(id);
    toast.success("Image host deleted");
  };

  const handleTestImageHost = async (provider: ImageHostProvider) => {
    setTestingImageHostId(provider.id);
    try {
      const testImage = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const result = await uploadToImageHost(testImage, {
        expiration: 60,
        providerId: provider.id,
      });
      if (result.success) {
        toast.success(`Image host ${provider.name} connection test successful`);
      } else {
        toast.error(`Test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error('Connection test failed, please check your network');
    } finally {
      setTestingImageHostId(null);
    }
  };

  // Test connection - directly call external APIs
  const testConnection = async (provider: IProvider) => {
    const keys = parseApiKeys(provider.apiKey);
    if (keys.length === 0) {
      toast.error("Please configure an API Key first");
      return;
    }

    setTestingProvider(provider.id);
    setTestResults((prev) => ({ ...prev, [provider.id]: null }));

    try {
      let response: Response;
      const apiKey = keys[0]; // Use first key for test
      const normalizedBaseUrl = provider.baseUrl?.replace(/\/+$/, "");
      const buildEndpoint = (root: string, path: string) => {
        const normalized = root.replace(/\/+$/, "");
        return /\/v\d+$/.test(normalized) ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
      };

      if (provider.platform === "runninghub") {
        if (!normalizedBaseUrl) {
          toast.error("Please configure the Base URL first");
          setTestingProvider(null);
          return;
        }
        response = await fetch(`${normalizedBaseUrl}/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            taskId: "test-connection-check",
          }),
        });
        
        // For RunningHub, 400/404 means auth is OK (task doesn't exist)
        if (response.status === 400 || response.status === 404) {
          setTestResults((prev) => ({ ...prev, [provider.id]: true }));
          toast.success("Connection test successful");
          setTestingProvider(null);
          return;
        }
      } else if (normalizedBaseUrl && provider.model?.length) {
        const endpoint = buildEndpoint(normalizedBaseUrl, "chat/completions");
        const model = provider.model[0];
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
          }),
        });
      } else {
        // For providers without chat endpoint info, just mark as configured
        setTestResults((prev) => ({ ...prev, [provider.id]: true }));
        toast.success(`${provider.name} is configured`);
        setTestingProvider(null);
        return;
      }

      const success = response.ok;
      setTestResults((prev) => ({ ...prev, [provider.id]: success }));

      if (success) {
        toast.success("Connection test successful");
      } else {
        const errorData = await response.text();
        console.error("API test error:", response.status, errorData);
        toast.error(`Connection test failed (${response.status})`);
      }
    } catch (error) {
      console.error("Connection test error:", error);
      setTestResults((prev) => ({ ...prev, [provider.id]: false }));
      toast.error("Connection test failed, please check your network");
    } finally {
      setTestingProvider(null);
    }
  };

  // Get existing platforms
  const existingPlatforms = useMemo(
    () => providers.map((p) => p.platform),
    [providers]
  );

  const configuredCount = providers.filter(
    (p) => parseApiKeys(p.apiKey).length > 0
  ).length;

  const [activeTab, setActiveTab] = useState<string>("api");
  const hasStorageManager = typeof window !== "undefined" && !!window.storageManager;
  const hasAppUpdater = typeof window !== "undefined" && !!window.appUpdater;

  const formatBytes = useCallback((bytes: number) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(
      units.length - 1,
      Math.floor(Math.log(bytes) / Math.log(1024))
    );
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
  }, []);

  const refreshCacheSize = useCallback(async () => {
    if (!window.storageManager) return;
    setIsCacheLoading(true);
    try {
      const result = await window.storageManager.getCacheSize();
      setCacheSize(result.total || 0);
    } catch (error) {
      console.error("Failed to get cache size:", error);
    } finally {
      setIsCacheLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasStorageManager) return;
    window.storageManager
      ?.getPaths()
      .then((paths) => {
        if (paths.basePath) {
          setStoragePaths({ basePath: paths.basePath });
        }
      })
      .catch(() => {});
    refreshCacheSize();
  }, [hasStorageManager, refreshCacheSize, setStoragePaths]);

  useEffect(() => {
    if (!hasStorageManager || !window.storageManager) return;
    window.storageManager.updateConfig({
      autoCleanEnabled: cacheSettings.autoCleanEnabled,
      autoCleanDays: cacheSettings.autoCleanDays,
    });
  }, [cacheSettings.autoCleanEnabled, cacheSettings.autoCleanDays, hasStorageManager]);

  const handleToggleShareCharacters = async (checked: boolean) => {
    setResourceSharing({ shareCharacters: checked });
    if (!checked && activeProjectId) {
      assignCharactersToProject(activeProjectId);
    }
    // Rehydrate to load/unload other projects' data
    try { await useCharacterLibraryStore.persist.rehydrate(); } catch {}
  };

  const handleToggleShareScenes = async (checked: boolean) => {
    setResourceSharing({ shareScenes: checked });
    if (!checked && activeProjectId) {
      assignScenesToProject(activeProjectId);
    }
    try { await useSceneStore.persist.rehydrate(); } catch {}
  };

  const handleToggleShareMedia = async (checked: boolean) => {
    setResourceSharing({ shareMedia: checked });
    if (!checked && activeProjectId) {
      assignMediaToProject(activeProjectId);
    }
    try { await useMediaStore.persist.rehydrate(); } catch {}
  };

  // Unified storage handlers
  const handleSelectStoragePath = async () => {
    if (!window.storageManager) {
      toast.error("Please use this feature in the desktop app");
      return;
    }
    const dir = await window.storageManager.selectDirectory();
    if (!dir) return;
    const result = await window.storageManager.moveData(dir);
    if (result.success) {
      setStoragePaths({ basePath: result.path || dir });
      
      // 清除 localStorage 中的缓存，确保从新路径加载数据
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.startsWith('moyin-') || key.includes('store')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 清除 IndexedDB 缓存
      try {
        const dbRequest = indexedDB.open('moyin-creator-db', 1);
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          if (db.objectStoreNames.contains('zustand-storage')) {
            const tx = db.transaction('zustand-storage', 'readwrite');
            tx.objectStore('zustand-storage').clear();
          }
        };
      } catch (e) {
        console.warn('Failed to clear IndexedDB:', e);
      }
      
      toast.success("Storage location updated, reloading...");
      setTimeout(() => window.location.reload(), 500);
    } else {
      toast.error(`Move failed: ${result.error || "Unknown error"}`);
    }
  };

  const handleExportData = async () => {
    if (!window.storageManager) return;
    const dir = await window.storageManager.selectDirectory();
    if (!dir) return;
    const result = await window.storageManager.exportData(dir);
    if (result.success) {
      toast.success("Data exported");
    } else {
      toast.error(`Export failed: ${result.error || "Unknown error"}`);
    }
  };

  const handleImportData = async () => {
    if (!window.storageManager) return;
    const dir = await window.storageManager.selectDirectory();
    if (!dir) return;
    if (!confirm("Importing will overwrite current data, continue?")) return;
    const result = await window.storageManager.importData(dir);
    if (result.success) {
      // 清除 localStorage 中的缓存，防止旧数据覆盖Import的数据
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.startsWith('moyin-') || key.includes('store')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 清除 IndexedDB 缓存
      try {
        const dbRequest = indexedDB.open('moyin-creator-db', 1);
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          if (db.objectStoreNames.contains('zustand-storage')) {
            const tx = db.transaction('zustand-storage', 'readwrite');
            tx.objectStore('zustand-storage').clear();
          }
        };
      } catch (e) {
        console.warn('Failed to clear IndexedDB:', e);
      }
      
      toast.success("Data imported, reloading...");
      // 延迟Refresh页面以确保缓存清理Done
      setTimeout(() => window.location.reload(), 500);
    } else {
      toast.error(`Import failed: ${result.error || "Unknown error"}`);
    }
  };

  const handleLinkData = async () => {
    if (!window.storageManager) {
      toast.error("Please use this feature in the desktop app");
      return;
    }
    const dir = await window.storageManager.selectDirectory();
    if (!dir) return;
    
    // Validate the directory first
    const validation = await window.storageManager.validateDataDir(dir);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid data directory");
      return;
    }
    
    // Confirm with user
    const confirmMsg = `Detected ${validation.projectCount || 0} project files and ${validation.mediaCount || 0} media files.\n\nPoint to this directory? It is recommended to restart the app after this operation.`;
    if (!confirm(confirmMsg)) return;
    
    const result = await window.storageManager.linkData(dir);
    if (result.success) {
      setStoragePaths({ basePath: result.path || dir });
      
      // 清除 localStorage 中的缓存，确保从新路径加载数据
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.startsWith('moyin-') || key.includes('store')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 清除 IndexedDB 缓存
      try {
        const dbRequest = indexedDB.open('moyin-creator-db', 1);
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          if (db.objectStoreNames.contains('zustand-storage')) {
            const tx = db.transaction('zustand-storage', 'readwrite');
            tx.objectStore('zustand-storage').clear();
          }
        };
      } catch (e) {
        console.warn('Failed to clear IndexedDB:', e);
      }
      
      toast.success("Linked to data directory, reloading...");
      setTimeout(() => window.location.reload(), 500);
    } else {
      toast.error(`Operation failed: ${result.error || "Unknown error"}`);
    }
  };

  const handleClearCache = async () => {
    if (!window.storageManager) return;
    setIsClearingCache(true);
    try {
      const result = await window.storageManager.clearCache();
      if (result.success) {
        toast.success("Cache cleared");
        refreshCacheSize();
      } else {
        toast.error(`Clear failed: ${result.error || "Unknown error"}`);
      }
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleCheckForUpdates = async () => {
    if (!window.appUpdater) {
      toast.error("Please use this feature in the desktop app");
      return;
    }

    setIsCheckingForUpdates(true);
    try {
      const result = await window.appUpdater.checkForUpdates();
      if (!result.success) {
        toast.error(`Failed to check for updates: ${result.error || "Unknown error"}`);
        return;
      }

      if (result.hasUpdate && result.update) {
        setAvailableUpdate(result.update);
        setUpdateDialogOpen(true);
        return;
      }

      setAvailableUpdate(null);
      toast.success(`You are already on the latest version v${result.currentVersion}`);
    } catch (error) {
      console.error("[SettingsPanel] Failed to check updates:", error);
      toast.error("Failed to check for updates, please try again later");
    } finally {
      setIsCheckingForUpdates(false);
    }
  };

  const handleClearIgnoredVersion = () => {
    setUpdateSettings({ ignoredVersion: "" });
    toast.success("Update notifications restored");
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-border bg-panel px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-3">
            <Settings className="w-5 h-5 text-primary" />
            Settings
          </h2>
        </div>
        {activeTab === "api" && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono bg-muted border border-border px-2 py-1 rounded">
              Configured: {configuredCount}/{providers.length}
            </span>
            <Button onClick={() => setAddDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Provider
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border px-6">
          <TabsList className="h-12 bg-transparent p-0 gap-4">
            <TabsTrigger 
              value="api" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 h-12"
            >
              <Key className="h-4 w-4 mr-2" />
              API Management
            </TabsTrigger>
            <TabsTrigger 
              value="advanced" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 h-12"
            >
              <Layers className="h-4 w-4 mr-2" />
              Advanced Options
            </TabsTrigger>
            <TabsTrigger 
              value="imagehost" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 h-12"
            >
              <Upload className="h-4 w-4 mr-2" />
              Image Host Config
              {isImageHostConfigured() && (
                <span className="ml-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="storage" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 h-12"
            >
              <HardDrive className="h-4 w-4 mr-2" />
              Storage
            </TabsTrigger>
          </TabsList>
        </div>

        {/* API Management Tab */}
        <TabsContent value="api" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-5xl mx-auto space-y-8">
          {/* Security Notice */}
          <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-lg">
            <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="font-medium text-foreground text-sm">Security Notice</h3>
              <p className="text-xs text-muted-foreground mt-1">
                All API Keys are stored only in your browser's local storage and will not be uploaded to any server. Supports multi-key rotation, automatically switching on failure.
              </p>
            </div>
          </div>

          {/* Gemini 购买引导 */}
          <a
            href="https://ai.google.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-gradient-to-r from-orange-500/5 to-primary/5 border border-orange-500/20 rounded-lg hover:border-orange-500/40 transition-colors group"
          >
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground text-sm flex items-center gap-2">
                Google Gemini
                <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded">
                  Recommended
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Google AI models — text, image, and video generation via Gemini
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-primary group-hover:underline">
              Get API Key
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </a>

          {/* Feature Binding */}
          <FeatureBindingPanel />

          {/* Provider List */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Provider
            </h3>

            {providers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-xl">
                <Info className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No providers configured yet
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Set up Google Gemini to start generating with AI
                </p>
                <a
                  href="https://ai.google.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-4"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Go to Google Gemini to get a Key
                </a>
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Provider
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => {
                  const isExpanded = expandedProviders[provider.id] ?? false;
                  const keyCount = getApiKeyCount(provider.apiKey);
                  const configured = keyCount > 0;
                  const testResult = testResults[provider.id];
                  const isTesting = testingProvider === provider.id;

                  return (
                    <Collapsible
                      key={provider.id}
                      open={isExpanded}
                      onOpenChange={() => toggleExpanded(provider.id)}
                    >
                      <div
                        className={cn(
                          "border rounded-xl transition-all",
                          configured
                            ? "bg-card border-primary/30"
                            : "bg-card border-border"
                        )}
                      >
                        {/* Header */}
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-4 hover:bg-muted/30 rounded-t-xl transition-colors">
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "p-2 rounded-lg",
                                  configured
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {PLATFORM_ICONS[provider.platform] || (
                                  <Settings className="h-5 w-5" />
                                )}
                              </div>
                              <div className="text-left">
                                <h4 className="font-medium text-foreground flex items-center gap-2">
                                  {provider.name}
                                  {provider.platform === 'gemini' && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded font-normal">
                                      Recommended
                                    </span>
                                  )}
                                  {configured && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-normal">
                                      Configured
                                    </span>
                                  )}
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  {provider.platform}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span
                                  className="cursor-pointer hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpanded(provider.id);
                                  }}
                                >
                                  Models ({provider.model.length})
                                </span>
                                <span>|</span>
                                <span
                                  className="cursor-pointer hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(provider);
                                  }}
                                >
                                  Key ({keyCount})
                                </span>
                              </div>

                              <div
                                className="flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Sync model list"
                                  onClick={async () => {
                                    setSyncingProvider(provider.id);
                                    const result = await syncProviderModels(provider.id);
                                    setSyncingProvider(null);
                                    if (result.success) {
                                      toast.success(`Synced ${result.count} models`);
                                    } else {
                                      toast.error(result.error || 'Sync failed');
                                    }
                                  }}
                                  disabled={!configured || syncingProvider === provider.id}
                                >
                                  {syncingProvider === provider.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Test connection"
                                  onClick={() => testConnection(provider)}
                                  disabled={!configured || isTesting}
                                >
                                  {isTesting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : testResult === true ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : testResult === false ? (
                                    <X className="h-4 w-4 text-red-500" />
                                  ) : (
                                    <Shield className="h-4 w-4" />
                                  )}
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Edit"
                                  onClick={() => handleEdit(provider)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        ConfirmDelete
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete {provider.name}? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDelete(provider.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>

                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        {/* Gemini 购买引导 */}
                        {provider.platform === 'gemini' && !configured && (
                          <div className="px-4 pb-2">
                            <a
                              href="https://ai.google.dev"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Go to Google Gemini to get a Key →
                            </a>
                          </div>
                        )}

                        {/* Expandable Content */}
                        <CollapsibleContent>
                          <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                            {/* Base URL */}
                            {provider.baseUrl && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  Base URL:{" "}
                                </span>
                                <span className="font-mono text-foreground">
                                  {provider.baseUrl}
                                </span>
                              </div>
                            )}

                            {/* Models */}
                            {provider.model.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {provider.model.map((m) => (
                                  <span
                                    key={m}
                                    className="text-xs px-2 py-1 bg-muted rounded font-mono"
                                  >
                                    {m}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* API Key Preview */}
                            {configured && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  API Key:{" "}
                                </span>
                                <span className="font-mono text-foreground">
                                  {maskApiKey(parseApiKeys(provider.apiKey)[0])}
                                  {keyCount > 1 && (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      (+{keyCount - 1} )
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>

          {/* Global Settings */}
          <div className="p-6 border border-border rounded-xl bg-card space-y-6">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Global Settings
            </h3>

            {/* Concurrency */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Concurrent Generations</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  value={concurrency}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (val >= 1) setConcurrency(val);
                  }}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">
                  Number of tasks to generate simultaneously (can be set higher with multiple keys; recommended not to exceed key count)
                </span>
              </div>
            </div>
          </div>

              {/* About */}
              <div className="text-center py-8 text-muted-foreground border-t border-border">
                <p className="text-sm font-medium">Vidtory Drama Studio</p>
                <p className="text-xs mt-1">v{appVersion} · AI-powered anime/film creation tool</p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Advanced Options Tab */}
        <TabsContent value="advanced" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-3xl mx-auto space-y-8">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Advanced Generation Options
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    These options affect video generation behavior in the AI Director panel
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    resetAdvancedOptions();
                    toast.success("Default settings restored");
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset to Default
                </Button>
              </div>

              {/* Options List */}
              <div className="space-y-4">
                {/* Visual Continuity */}
                <div className="p-4 border border-border rounded-xl bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                        <Link2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">Visual Continuity</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically passes the last frame of the previous shot to the next as a reference image, maintaining visual style and character appearance consistency
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Recommended · Suitable for continuous narrative and long video creation
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={advancedOptions.enableVisualContinuity}
                      onCheckedChange={(checked) => setAdvancedOption('enableVisualContinuity', checked)}
                    />
                  </div>
                </div>

                {/* Resume Generation */}
                <div className="p-4 border border-border rounded-xl bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                        <Play className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">Resume Generation</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Can resume from where it left off after batch generation is interrupted, without starting over
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Recommended · Prevents progress loss due to network interruption or API timeout
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={advancedOptions.enableResumeGeneration}
                      onCheckedChange={(checked) => setAdvancedOption('enableResumeGeneration', checked)}
                    />
                  </div>
                </div>

                {/* Content Moderation */}
                <div className="p-4 border border-border rounded-xl bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                        <ShieldAlert className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">Content Moderation Tolerance</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically skips the current shot when sensitive content is encountered, continuing with other shots
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Recommended · Prevents a single shot failure from interrupting the entire process
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={advancedOptions.enableContentModeration}
                      onCheckedChange={(checked) => setAdvancedOption('enableContentModeration', checked)}
                    />
                  </div>
                </div>

                {/* Auto Model Switch */}
                <div className="p-4 border border-border rounded-xl bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted text-muted-foreground mt-0.5">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">Multi-Model Auto Switch</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Uses text-to-video (t2v) for the first shot, and image-to-video (i2v) for subsequent shots
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Off by default · Requires multiple models to be configured
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={advancedOptions.enableAutoModelSwitch}
                      onCheckedChange={(checked) => setAdvancedOption('enableAutoModelSwitch', checked)}
                    />
                  </div>
                </div>
              </div>

              {/* Info Notice */}
              <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-lg">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    These options affect video generation behavior in the AI Director panel. If unsure about an option, keeping the default settings is recommended.
                  </p>
                </div>
              </div>

              {/* About */}
              <div className="text-center py-8 text-muted-foreground border-t border-border">
                <p className="text-sm font-medium">Vidtory Drama Studio</p>
                <p className="text-xs mt-1">v{appVersion} · AI-powered anime/film creation tool</p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Image Host Config Tab */}
        <TabsContent value="imagehost" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-3xl mx-auto space-y-8">
              {/* Header */}
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Image Host Configuration
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Image hosts store temporary images during video generation (e.g., tail frame extraction, frame passing, etc.)
                </p>
              </div>

              {/* Image Host Providers */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Image Host Providers</Label>
                  <Button size="sm" variant="outline" onClick={() => setImageHostAddOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>

                {visibleImageHostProviders.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No image hosts configured</div>
                ) : (
                  <div className="space-y-3">
                    {visibleImageHostProviders.map((provider) => {
                      const keyCount = getApiKeyCount(provider.apiKey);
                      const endpoint = provider.uploadPath || provider.baseUrl;
                      const configured = provider.enabled && !!endpoint && (provider.apiKeyOptional || keyCount > 0);
                      return (
                        <div key={provider.id} className="p-4 border border-border rounded-xl bg-card space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{provider.name}</span>
                                {configured ? (
                                  <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-500 rounded">
                                    Configured
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded">
                                    Not Configured
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {provider.platform} · {endpoint || 'No address set'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {provider.apiKeyOptional && keyCount === 0
                                  ? "Guest upload (no key required)"
                                  : `${keyCount}  Key`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={provider.enabled}
                                onCheckedChange={(checked) =>
                                  updateImageHostProvider({ ...provider, enabled: checked })
                                }
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!provider.enabled || testingImageHostId === provider.id}
                              onClick={() => handleTestImageHost(provider)}
                            >
                              {testingImageHostId === provider.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Test Connection"
                              )}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleEditImageHost(provider)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteImageHost(provider.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Info Notice */}
              <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-lg">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Image hosts store temporary images during video generation, mainly for the "Visual Continuity" feature.
                    If no image host is configured, cross-shot frame passing will be limited.
                    Enabling multiple image hosts will use them in rotation, automatically switching on failure.
                  </p>
                  <p className="text-sm">
                    SCDN image host is enabled by default and requires no KEY;
                    ImgBB is off by default. Enable and test it manually if needed.
                  </p>
                </div>
              </div>

              {/* About */}
              <div className="text-center py-8 text-muted-foreground border-t border-border">
                <p className="text-sm font-medium">Vidtory Drama Studio</p>
                <p className="text-xs mt-1">v{appVersion} · AI-powered anime/film creation tool</p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Storage Tab */}
        <TabsContent value="storage" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-3xl mx-auto space-y-8">
              {/* Header */}
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Storage Settings
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure resource sharing strategy, storage location and cache management
                </p>
              </div>

              {!hasStorageManager && (
                <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-lg">
                  <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Storage settings are only available in the desktop version.
                    </p>
                  </div>
                </div>
              )}

              {/* Resource Sharing */}
              <div className="p-6 border border-border rounded-xl bg-card space-y-4">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <Folder className="h-4 w-4" />
                  Resource Sharing
                </h4>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Character Library Cross-Project Sharing</p>
                    <p className="text-xs text-muted-foreground">When disabled, only visible in the current project</p>
                  </div>
                  <Switch
                    checked={resourceSharing.shareCharacters}
                    onCheckedChange={handleToggleShareCharacters}
                    disabled={!hasStorageManager}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Scene Library Cross-Project Sharing</p>
                    <p className="text-xs text-muted-foreground">When disabled, only visible in the current project</p>
                  </div>
                  <Switch
                    checked={resourceSharing.shareScenes}
                    onCheckedChange={handleToggleShareScenes}
                    disabled={!hasStorageManager}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Media Library Cross-Project Sharing</p>
                    <p className="text-xs text-muted-foreground">When disabled, only visible in the current project</p>
                  </div>
                  <Switch
                    checked={resourceSharing.shareMedia}
                    onCheckedChange={handleToggleShareMedia}
                    disabled={!hasStorageManager}
                  />
                </div>
              </div>

              {/* Storage Path - Single unified location */}
              <div className="p-6 border border-border rounded-xl bg-card space-y-5">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Storage Location
                </h4>

                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Data storage location (includes projects and media)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={storagePaths.basePath || 'Default location'}
                      placeholder="Default location"
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button size="sm" onClick={handleSelectStoragePath} disabled={!hasStorageManager}>
                      Select
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportData} disabled={!hasStorageManager}>
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Export
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleImportData} disabled={!hasStorageManager}>
                      Import
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  ⚠️ Changing the location will move existing data to the new directory (automatically creates projects/ and media/ subdirectories)
                </p>
              </div>

              {/* Data Recovery - Link to existing data */}
              <div className="p-6 border border-border rounded-xl bg-card space-y-4">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Data Recovery
                </h4>
                <p className="text-sm text-muted-foreground">
                  After changing devices or reinstalling the system, simply point to the existing data directory to restore all configurations and projects
                </p>

                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleLinkData} 
                    disabled={!hasStorageManager}
                    className="w-full"
                  >
                    <Folder className="h-3.5 w-3.5 mr-1" />
                    Point to Existing Data Directory
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    💡 Select the data directory containing projects/ and media/ subdirectories, then restart the app.
                  </p>
                </div>
              </div>

              {/* Cache Management */}
              <div className="p-6 border border-border rounded-xl bg-card space-y-4">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Cache Management
                </h4>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Cache Size</p>
                    <p className="text-xs text-muted-foreground">
                      {isCacheLoading ? "Calculating..." : formatBytes(cacheSize)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={refreshCacheSize}
                      disabled={!hasStorageManager || isCacheLoading}
                    >
                      <RefreshCw className={`h-4 w-4 ${isCacheLoading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearCache}
                      disabled={!hasStorageManager || isClearingCache}
                    >
                      {isClearingCache ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Clear"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto Clean</p>
                    <p className="text-xs text-muted-foreground">Off by default</p>
                  </div>
                  <Switch
                    checked={cacheSettings.autoCleanEnabled}
                    onCheckedChange={(checked) => setCacheSettings({ autoCleanEnabled: checked })}
                    disabled={!hasStorageManager}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Clean files older than</Label>
                  <Input
                    type="number"
                    min={1}
                    value={cacheSettings.autoCleanDays}
                    onChange={(e) =>
                      setCacheSettings({ autoCleanDays: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                    className="w-20"
                    disabled={!cacheSettings.autoCleanEnabled}
                  />
                  <span className="text-xs text-muted-foreground">days old cache files</span>
                </div>
              </div>

              <div className="p-6 border border-border rounded-xl bg-card space-y-5">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  App Updates
                </h4>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Current Version</p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">v{appVersion}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckForUpdates}
                    disabled={!hasAppUpdater || isCheckingForUpdates}
                  >
                    {isCheckingForUpdates ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Check for Updates
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Auto-check for updates on startup</p>
                    <p className="text-xs text-muted-foreground">
                      When enabled, the desktop app will automatically check the remote version list on startup and notify you of new versions
                    </p>
                  </div>
                  <Switch
                    checked={updateSettings.autoCheckEnabled}
                    onCheckedChange={(checked) => setUpdateSettings({ autoCheckEnabled: checked })}
                    disabled={!hasAppUpdater}
                  />
                </div>

                {updateSettings.ignoredVersion && (
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Ignored Version</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        v{updateSettings.ignoredVersion}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleClearIgnoredVersion}>
                      Restore Notifications
                    </Button>
                  </div>
                )}

                {!hasAppUpdater && (
                  <p className="text-xs text-muted-foreground">
                    This feature is only available in the desktop packaged version.
                  </p>
                )}
              </div>

              {/* About */}
              <div className="text-center py-8 text-muted-foreground border-t border-border">
                <p className="text-sm font-medium">Vidtory Drama Studio</p>
                <p className="text-xs mt-1">v{appVersion} · AI-powered anime/film creation tool</p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddProviderDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={(providerData) => {
          // Google Gemini：已存在时合并 Key，不重复Create
          const existingGemini = providerData.platform === 'gemini'
            ? providers.find((p) => p.platform === 'gemini')
            : null;
          let provider: IProvider;
          if (existingGemini) {
            const oldKeys = parseApiKeys(existingGemini.apiKey);
            const newKeys = parseApiKeys(providerData.apiKey);
            const merged = Array.from(new Set([...oldKeys, ...newKeys]));
            updateProvider({ ...existingGemini, apiKey: merged.join(',') });
            provider = existingGemini;
          } else {
            provider = addProvider(providerData);
          }
          // 如果Add的是 memefast Provider，自动设置默认服务映射（仅在对应服务尚Not Configured时）
          if (providerData.platform === 'gemini') {
            // 使用 provider.id（而非 platform 字符串）避免多Provider时的歧义解析
            const pid = provider.id;
            const GEMINI_DEFAULT_BINDINGS: Record<string, string> = {
              // NOTE: Gemini 端点已升级，旧的 deepseek-v3 已不在列表中，改用 deepseek-v3.2
              script_analysis: `${pid}:deepseek-v3.2`,
              character_generation: `${pid}:gemini-3-pro-image-preview`,
              video_generation: `${pid}:doubao-seedance-1-5-pro-251215`,
              image_understanding: `${pid}:gemini-2.5-flash`,
            };
            for (const [feature, binding] of Object.entries(GEMINI_DEFAULT_BINDINGS)) {
              const current = getFeatureBindings(feature as AIFeature);
              // 仅在Not Configured时设置默认值，避免覆盖用户手动Select
              if (!current || current.length === 0) {
                setFeatureBindings(feature as AIFeature, [binding]);
                continue;
              }
              // 自愈：旧默认 deepseek-v3 -> deepseek-v3.2（尽量不破坏多选配置）
              if (feature === 'script_analysis') {
                const hasOld = current.some((b) => b.endsWith(':deepseek-v3'));
                if (hasOld) {
                  const migrated = current.map((b) => {
                    if (!b.endsWith(':deepseek-v3')) return b;
                    const idx = b.indexOf(':');
                    if (idx <= 0) return binding;
                    const prefix = b.slice(0, idx);
                    return `${prefix}:deepseek-v3.2`;
                  });
                  const deduped = Array.from(new Set(migrated));
                  setFeatureBindings(feature as AIFeature, deduped);
                }
              }
            }
          }
          // Add后自动同步Model列表和端点元数据
          const finalProviderId = existingGemini ? existingGemini.id : provider.id;
          if (parseApiKeys(providerData.apiKey).length > 0) {
            setSyncingProvider(finalProviderId);
            syncProviderModels(finalProviderId).then(result => {
              setSyncingProvider(null);
              if (result.success) {
                toast.success(`Auto-synced ${result.count} models`);
              } else if (result.error) {
                toast.error(`Model sync failed: ${result.error}`);
              }
            });
          }
        }}
        existingPlatforms={existingPlatforms}
      />

      <EditProviderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        provider={editingProvider}
        onSave={(provider) => {
          updateProvider(provider);

          // Edit memefast 时也自动设置默认服务映射：初始状态会预置一空 key 的 memefast，
          // 用户通常是“Edit填 key”，如果不在这里补默认映射，会导致服务映射一直是 0/6。
          if (provider.platform === 'gemini' && parseApiKeys(provider.apiKey).length > 0) {
            const pid = provider.id;
            const GEMINI_DEFAULT_BINDINGS: Record<string, string> = {
              // NOTE: Gemini 端点已升级，旧的 deepseek-v3 已不在列表中，改用 deepseek-v3.2
              script_analysis: `${pid}:deepseek-v3.2`,
              character_generation: `${pid}:gemini-3-pro-image-preview`,
              video_generation: `${pid}:doubao-seedance-1-5-pro-251215`,
              image_understanding: `${pid}:gemini-2.5-flash`,
            };
            for (const [feature, binding] of Object.entries(GEMINI_DEFAULT_BINDINGS)) {
              const current = getFeatureBindings(feature as AIFeature);
              if (!current || current.length === 0) {
                setFeatureBindings(feature as AIFeature, [binding]);
                continue;
              }
              // 自愈：旧默认 deepseek-v3 -> deepseek-v3.2
              if (feature === 'script_analysis') {
                const hasOld = current.some((b) => b.endsWith(':deepseek-v3'));
                if (hasOld) {
                  const migrated = current.map((b) => {
                    if (!b.endsWith(':deepseek-v3')) return b;
                    const idx = b.indexOf(':');
                    if (idx <= 0) return binding;
                    const prefix = b.slice(0, idx);
                    return `${prefix}:deepseek-v3.2`;
                  });
                  const deduped = Array.from(new Set(migrated));
                  setFeatureBindings(feature as AIFeature, deduped);
                }
              }
            }
          }
          // EditSave后自动同步Model列表和端点元数据
          if (parseApiKeys(provider.apiKey).length > 0) {
            setSyncingProvider(provider.id);
            syncProviderModels(provider.id).then(result => {
              setSyncingProvider(null);
              if (result.success) {
                toast.success(`Auto-synced ${result.count} models`);
              } else if (result.error) {
                toast.error(`Model sync failed: ${result.error}`);
              }
            });
          }
        }}
      />

      <AddImageHostDialog
        open={imageHostAddOpen}
        onOpenChange={setImageHostAddOpen}
        onSubmit={addImageHostProvider}
      />

      <EditImageHostDialog
        open={imageHostEditOpen}
        onOpenChange={setImageHostEditOpen}
        provider={editingImageHost}
        onSave={updateImageHostProvider}
      />
      <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        updateInfo={availableUpdate}
        onIgnoreVersion={(version) => {
          setUpdateSettings({ ignoredVersion: version });
          setAvailableUpdate(null);
        }}
      />
    </div>
  );
}
