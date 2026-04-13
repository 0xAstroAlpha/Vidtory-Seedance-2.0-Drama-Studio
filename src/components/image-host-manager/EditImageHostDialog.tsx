// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  IMAGE_HOST_PRESETS,
  type ImageHostProvider,
  type ImageHostPlatform,
} from "@/stores/api-config-store";

interface EditImageHostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ImageHostProvider | null;
  onSave: (provider: ImageHostProvider) => void;
}

export function EditImageHostDialog({
  open,
  onOpenChange,
  provider,
  onSave,
}: EditImageHostDialogProps) {
  const [platform, setPlatform] = useState<ImageHostPlatform>("scdn");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [uploadPath, setUploadPath] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [apiKeyParam, setApiKeyParam] = useState("");
  const [apiKeyHeader, setApiKeyHeader] = useState("");
  const [apiKeyFormField, setApiKeyFormField] = useState("");
  const [apiKeyOptional, setApiKeyOptional] = useState(false);
  const [expirationParam, setExpirationParam] = useState("");
  const [imageField, setImageField] = useState("");
  const [imagePayloadType, setImagePayloadType] = useState<ImageHostProvider["imagePayloadType"]>("base64");
  const [nameField, setNameField] = useState("");
  const [staticFormFields, setStaticFormFields] = useState<Record<string, string> | undefined>(undefined);
  const [responseUrlField, setResponseUrlField] = useState("");
  const [responseDeleteUrlField, setResponseDeleteUrlField] = useState("");
  const apiKeyLabel = platform === "imgurl"
    ? "Upload Tokens"
    : platform === "scdn"
      ? "API Key (Optional)"
    : platform === "catbox"
      ? "Userhash (Optional)"
      : "API Keys";
  const apiKeyRequiredMessage = platform === "imgurl" ? "Please enter Upload Token" : "Please enter API Key";
  const apiKeyPlaceholder = platform === "imgurl"
    ? "Enter Upload Token / Authorization value (one per line; if Bearer is needed, manually enter the full value)"
    : platform === "scdn"
      ? "Leave blank, SCDN supports direct upload"
    : platform === "catbox"
      ? "Can be empty for anonymous upload; if binding to a Catbox account, enter userhash"
    : "Enter API Keys (one per line, or comma-separated)";

  useEffect(() => {
    if (provider) {
      setPlatform(provider.platform);
      setName(provider.name || "");
      setBaseUrl(provider.baseUrl || "");
      setUploadPath(provider.uploadPath || "");
      setApiKey(provider.apiKey || "");
      setEnabled(provider.enabled ?? true);
      setApiKeyParam(provider.apiKeyParam || "");
      setApiKeyHeader(provider.apiKeyHeader || "");
      setApiKeyFormField(provider.apiKeyFormField || "");
      setApiKeyOptional(provider.apiKeyOptional ?? false);
      setExpirationParam(provider.expirationParam || "");
      setImageField(provider.imageField || "");
      setImagePayloadType(provider.imagePayloadType || "base64");
      setNameField(provider.nameField || "");
      setStaticFormFields(provider.staticFormFields);
      setResponseUrlField(provider.responseUrlField || "");
      setResponseDeleteUrlField(provider.responseDeleteUrlField || "");
    }
  }, [provider]);

  const handlePlatformChange = (value: string) => {
    const nextPlatform = value as ImageHostPlatform;
    const preset = IMAGE_HOST_PRESETS.find((item) => item.platform === nextPlatform);
    setPlatform(nextPlatform);
    if (!preset) return;
    setName(preset.name || "");
    setBaseUrl(preset.baseUrl || "");
    setUploadPath(preset.uploadPath || "");
    setEnabled(preset.enabled ?? true);
    setApiKeyParam(preset.apiKeyParam || "");
    setApiKeyHeader(preset.apiKeyHeader || "");
    setApiKeyFormField(preset.apiKeyFormField || "");
    setApiKeyOptional(preset.apiKeyOptional ?? false);
    setExpirationParam(preset.expirationParam || "");
    setImageField(preset.imageField || "");
    setImagePayloadType(preset.imagePayloadType || "base64");
    setNameField(preset.nameField || "");
    setStaticFormFields(preset.staticFormFields);
    setResponseUrlField(preset.responseUrlField || "");
    setResponseDeleteUrlField(preset.responseDeleteUrlField || "");
  };

  const handleSave = () => {
    if (!provider) return;
    if (!name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    if (!baseUrl.trim() && !uploadPath.trim()) {
      toast.error("Please configure Base URL or Upload Path");
      return;
    }
    if (!apiKey.trim() && !apiKeyOptional) {
      toast.error(apiKeyRequiredMessage);
      return;
    }

    onSave({
      ...provider,
      platform,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      uploadPath: uploadPath.trim(),
      apiKey: apiKey.trim(),
      enabled,
      apiKeyParam: apiKeyParam.trim() || undefined,
      apiKeyHeader: apiKeyHeader.trim() || undefined,
      apiKeyFormField: apiKeyFormField.trim() || undefined,
      apiKeyOptional,
      expirationParam: expirationParam.trim() || undefined,
      imageField: imageField.trim() || undefined,
      imagePayloadType,
      nameField: nameField.trim() || undefined,
      staticFormFields,
      responseUrlField: responseUrlField.trim() || undefined,
      responseDeleteUrlField: responseDeleteUrlField.trim() || undefined,
    });

    onOpenChange(false);
    toast.success("Changes saved");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Image Host Provider</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={handlePlatformChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select Platform" />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_HOST_PRESETS.map((preset) => (
                  <SelectItem key={preset.platform} value={preset.platform}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Image host name" />
          </div>

          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
          </div>

          <div className="space-y-2">
            <Label>Upload Path / URL</Label>
            <Input value={uploadPath} onChange={(e) => setUploadPath(e.target.value)} placeholder="/upload or full URL" />
          </div>

          <div className="space-y-2">
            <Label>{apiKeyLabel}</Label>
            <Textarea
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyPlaceholder}
              className="font-mono text-sm min-h-[80px]"
            />
            {platform === "imgbb" && (
              <p className="text-xs text-red-500">
                ImgBB currently has availability issues, disabled by default; Catbox is recommended.
              </p>
            )}
            {platform === "imgurl" && (
              <p className="text-xs text-muted-foreground">
                Use Upload Token (V3) from ImgURL / Zpic open API, supports multiple token rotation.
              </p>
            )}
            {platform === "scdn" && (
              <p className="text-xs text-muted-foreground">
                SCDN image host supports direct upload, currently more suitable as the default image host.
              </p>
            )}
            {platform === "catbox" && (
              <p className="text-xs text-muted-foreground">
                Catbox is an overseas image host; if the network cannot connect, it is recommended to use SCDN or a custom image host.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label>Enabled</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Advanced Configuration (Optional)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">API Key Query Parameter</Label>
                <Input value={apiKeyParam} onChange={(e) => setApiKeyParam(e.target.value)} placeholder="key" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">API Key Header</Label>
                <Input value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} placeholder="Authorization" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiration Parameter</Label>
                <Input value={expirationParam} onChange={(e) => setExpirationParam(e.target.value)} placeholder="expiration" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Image Field Name</Label>
                <Input value={imageField} onChange={(e) => setImageField(e.target.value)} placeholder="image" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Name Field Name</Label>
                <Input value={nameField} onChange={(e) => setNameField(e.target.value)} placeholder="name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Return URL Field</Label>
                <Input value={responseUrlField} onChange={(e) => setResponseUrlField(e.target.value)} placeholder="data.url" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Delete URL Field</Label>
                <Input value={responseDeleteUrlField} onChange={(e) => setResponseDeleteUrlField(e.target.value)} placeholder="data.delete_url" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
