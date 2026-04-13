// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * SaveToPropsDialog - SaveImage到道具库弹窗
 * 在Image StudioGenerate Image后，用户可以Select Directory并Save
 */

import { useState } from 'react';
import { usePropsLibraryStore } from '@/stores/props-library-store';
import { saveImageToLocal } from '@/lib/image-storage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FolderOpen, FolderPlus, Package, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SaveToPropsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Image URL to save (might be remote) */
  imageUrl: string;
  /** Generate时的Prompt，Optional */
  prompt?: string;
}

export function SaveToPropsDialog({
  open,
  onOpenChange,
  imageUrl,
  prompt = '',
}: SaveToPropsDialogProps) {
  const { folders, addProp, addFolder, setSelectedFolderId } =
    usePropsLibraryStore();

  const [propName, setPropName] = useState('');
  const [selectedFolderId, setLocalFolderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const folder = addFolder(trimmed);
    setLocalFolderId(folder.id);
    setNewFolderName('');
    setNewFolderMode(false);
    toast.success(`Directory '${trimmed}' created`);
  };

  const handleSave = async () => {
    const name = propName.trim() || `Prop_${Date.now()}`;
    setSaving(true);
    try {
      // 尝试持久化到Local Storage（Electron），浏览器端回退为原始URL
      const localPath = await saveImageToLocal(
        imageUrl,
        'props',
        `prop_${Date.now()}.png`
      );
      addProp({
        name,
        imageUrl: localPath,
        prompt,
        folderId: selectedFolderId,
      });
      // 同步道具库侧边栏选中状态（跳转到目标目录）
      setSelectedFolderId(selectedFolderId ?? 'all');
      toast.success(`「${name}」Saved到道具库`);
      onOpenChange(false);
      // Reset表单
      setPropName('');
      setLocalFolderId(null);
    } catch (err: any) {
      toast.error(`Save failed：${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return;
    onOpenChange(false);
    setPropName('');
    setLocalFolderId(null);
    setNewFolderMode(false);
    setNewFolderName('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Save to Props Library
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Image Preview */}
          <div className="flex justify-center">
            <div className="w-32 h-32 rounded-lg border border-border bg-muted overflow-hidden">
              <img
                src={imageUrl}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* 道具Name */}
          <div className="space-y-1.5">
            <Label htmlFor="prop-name" className="text-xs">
              道具Name
            </Label>
            <Input
              id="prop-name"
              placeholder="输入道具Name（可留空自动命名）"
              value={propName}
              onChange={(e) => setPropName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saving) handleSave();
              }}
            />
          </div>

          {/* Select Directory */}
          <div className="space-y-1.5">
            <Label className="text-xs">Save to Directory</Label>
            <ScrollArea className="max-h-40 rounded-md border border-border">
              <div className="p-1.5 space-y-0.5">
                {/* Root Directory */}
                <button
                  className={cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs transition-colors',
                    selectedFolderId === null
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setLocalFolderId(null)}
                >
                  <Package className="h-3.5 w-3.5 shrink-0" />
                  Root Directory（不分类）
                </button>

                {/* User Directory */}
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    className={cn(
                      'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs transition-colors',
                      selectedFolderId === folder.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                    onClick={() => setLocalFolderId(folder.id)}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    {folder.name}
                  </button>
                ))}

                {/* New目录行内输入 */}
                {newFolderMode ? (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <FolderPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                      autoFocus
                      placeholder="目录Name..."
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder();
                        if (e.key === 'Escape') {
                          setNewFolderMode(false);
                          setNewFolderName('');
                        }
                      }}
                      className="h-6 text-xs px-1.5 flex-1"
                    />
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setNewFolderMode(false);
                        setNewFolderName('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-t border-border mt-1 pt-2"
                    onClick={() => setNewFolderMode(true)}
                  >
                    <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                    + New目录
                  </button>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Package className="mr-2 h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
