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

interface AddImageHostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (provider: Omit<ImageHostProvider, "id">) => void;
}

export function AddImageHostDialog({
  open,
  onOpenChange,
  onSubmit,
}: AddImageHostDialogProps) {
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

  const selectedPreset = IMAGE_HOST_PRESETS.find((p) => p.platform === platform);
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
    if (open) {
      const defaultPreset = IMAGE_HOST_PRESETS.find((preset) => preset.platform === "scdn") || IMAGE_HOST_PRESETS[0];
      setPlatform(defaultPreset.platform as ImageHostPlatform);
      setName(defaultPreset.name || "");
      setBaseUrl(defaultPreset.baseUrl || "");
      setUploadPath(defaultPreset.uploadPath || "");
      setApiKey("");
      setEnabled(defaultPreset.enabled ?? true);
      setApiKeyParam(defaultPreset.apiKeyParam || "");
      setApiKeyHeader(defaultPreset.apiKeyHeader || "");
      setApiKeyFormField(defaultPreset.apiKeyFormField || "");
      setApiKeyOptional(defaultPreset.apiKeyOptional ?? false);
      setExpirationParam(defaultPreset.expirationParam || "");
      setImageField(defaultPreset.imageField || "");
      setImagePayloadType(defaultPreset.imagePayloadType || "base64");
      setNameField(defaultPreset.nameField || "");
      setStaticFormFields(defaultPreset.staticFormFields);
      setResponseUrlField(defaultPreset.responseUrlField || "");
      setResponseDeleteUrlField(defaultPreset.responseDeleteUrlField || "");
    }
  }, [open]);

  useEffect(() => {
    if (selectedPreset) {
      setName(selectedPreset.name || "");
      setBaseUrl(selectedPreset.baseUrl || "");
      setUploadPath(selectedPreset.uploadPath || "");
      setEnabled(selectedPreset.enabled ?? true);
      setApiKeyParam(selectedPreset.apiKeyParam || "");
      setApiKeyHeader(selectedPreset.apiKeyHeader || "");
      setApiKeyFormField(selectedPreset.apiKeyFormField || "");
      setApiKeyOptional(selectedPreset.apiKeyOptional ?? false);
      setExpirationParam(selectedPreset.expirationParam || "");
      setImageField(selectedPreset.imageField || "");
      setImagePayloadType(selectedPreset.imagePayloadType || "base64");
      setNameField(selectedPreset.nameField || "");
      setStaticFormFields(selectedPreset.staticFormFields);
      setResponseUrlField(selectedPreset.responseUrlField || "");
      setResponseDeleteUrlField(selectedPreset.responseDeleteUrlField || "");
    }
  }, [selectedPreset]);

  const handleSubmit = () => {
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

    onSubmit({
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
    toast.success(`Added ${name}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Image Host Provider</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as ImageHostPlatform)}>
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
            <div className="flex items-center justify-between">
              <Label>{apiKeyLabel}</Label>
            </div>
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
          <Button onClick={handleSubmit}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
