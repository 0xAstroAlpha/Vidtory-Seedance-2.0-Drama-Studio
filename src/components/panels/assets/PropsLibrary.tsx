// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * PropsLibrary - 道具库主视图
 * 左侧目录树 + 右侧道具网格，支持Custom目录管理
 */

import { useState, useRef } from 'react';
import { usePropsLibraryStore, PropItem, PropFolder } from '@/stores/props-library-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Package,
  MoveRight,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { useResolvedImageUrl } from '@/hooks/use-resolved-image-url';

// ── PropCard 子组件 ──────────────────────────────────────────────────────────

function PropCard({ item }: { item: PropItem }) {
  const { deleteProp, renameProp, moveProp, folders } = usePropsLibraryStore();
  const resolvedUrl = useResolvedImageUrl(item.imageUrl);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(item.name);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  const handleRenameConfirm = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    renameProp(item.id, trimmed);
    setRenaming(false);
  };

  return (
    <>
      <div className="group relative flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors">
        {/* Image区 */}
        <div className="aspect-square bg-muted relative overflow-hidden">
          {resolvedUrl ? (
            <img
              src={resolvedUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-8 h-8 text-muted-foreground/40" />
            </div>
          )}
          {/* 悬浮操作菜单 */}
          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 rounded-md shadow-md"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => { setNameInput(item.name); setRenaming(true); }}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Rename
                </DropdownMenuItem>
                {/* 移动到目录 */}
                {folders.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground py-1">
                      Move to folder
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => moveProp(item.id, null)}
                      className={cn(item.folderId === null && 'text-primary')}
                    >
                      <Layers className="mr-2 h-3.5 w-3.5" />
                      Root
                    </DropdownMenuItem>
                    {folders.map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        onClick={() => moveProp(item.id, f.id)}
                        className={cn(item.folderId === f.id && 'text-primary')}
                      >
                        <MoveRight className="mr-2 h-3.5 w-3.5" />
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteAlert(true)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 名称区 */}
        <div className="px-2 py-1.5">
          {renaming ? (
            <Input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleRenameConfirm}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameConfirm();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="h-6 text-xs px-1 py-0"
            />
          ) : (
            <p
              className="text-xs text-foreground truncate cursor-default"
              onDoubleClick={() => { setNameInput(item.name); setRenaming(true); }}
              title={item.name}
            >
              {item.name}
            </p>
          )}
        </div>
      </div>

      {/* DeleteConfirm */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prop</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm delete "{item.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteProp(item.id);
                toast.success(`Deleted "${item.name}"`);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── FolderItem 子组件 ────────────────────────────────────────────────────────

function FolderItem({
  folder,
  isActive,
  onClick,
}: {
  folder: PropFolder;
  isActive: boolean;
  onClick: () => void;
}) {
  const { renameFolder, deleteFolder, setSelectedFolderId } = usePropsLibraryStore();
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(folder.name);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  const handleRenameConfirm = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    renameFolder(folder.id, trimmed);
    setRenaming(false);
  };

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs cursor-pointer transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
        onClick={onClick}
      >
        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
        {renaming ? (
          <Input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleRenameConfirm}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm();
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="h-5 text-xs px-1 py-0 flex-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{folder.name}</span>
        )}

        {/* 目录操作按钮（悬浮显示） */}
        {!renaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setNameInput(folder.name);
                  setRenaming(true);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteAlert(true);
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Delete目录Confirm */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm delete folder "{folder.name}"? Props in the folder will be moved to the root folder, and will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteFolder(folder.id);
                setSelectedFolderId('all');
                toast.success(`Folder "${folder.name}" deleted`);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── 新建目录弹窗 ──────────────────────────────────────────────────────────────

function NewFolderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addFolder, setSelectedFolderId } = usePropsLibraryStore();
  const [name, setName] = useState('');

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const folder = addFolder(trimmed);
    setSelectedFolderId(folder.id);
    setName('');
    onOpenChange(false);
    toast.success(`Folder "${trimmed}" created`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            autoFocus
            placeholder="Enter folder name, e.g., Cars, Weapons..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onOpenChange(false);
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PropsLibrary 主组件 ───────────────────────────────────────────────────────

export function PropsLibrary() {
  const {
    items,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    getPropsByFolder,
  } = usePropsLibraryStore();

  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const visibleItems = getPropsByFolder(selectedFolderId);
  const currentFolderName =
    selectedFolderId === 'all'
      ? 'All Props'
      : folders.find((f) => f.id === selectedFolderId)?.name ?? 'All Props';

  return (
    <div className="h-full flex">
      {/* ── 左侧目录树 ── */}
      <div className="w-[160px] shrink-0 border-r border-border flex flex-col bg-panel">
        {/* 目录树标题 */}
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">Folders</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => setNewFolderOpen(true)}
            title="New Folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 目录列表 */}
        <ScrollArea className="flex-1 py-1.5 px-1.5">
          {/* 全部道具 */}
          <button
            className={cn(
              'flex items-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs transition-colors',
              selectedFolderId === 'all'
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            onClick={() => setSelectedFolderId('all')}
          >
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">All Props</span>
            <span className="ml-auto text-[10px] opacity-60">{items.length}</span>
          </button>

          {/* 用户Custom目录 */}
          {folders.map((folder) => {
            const count = items.filter((i) => i.folderId === folder.id).length;
            return (
              <div key={folder.id} className="relative">
                <FolderItem
                  folder={folder}
                  isActive={selectedFolderId === folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                />
                <span className="absolute right-7 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                  {count}
                </span>
              </div>
            );
          })}

          {/* None目录Notice */}
          {folders.length === 0 && (
            <p className="text-[10px] text-muted-foreground px-3 py-2 leading-relaxed">
              Click + to create a new folder
            </p>
          )}
        </ScrollArea>

        {/* 底部新建按钮 */}
        <div className="p-2 border-t border-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-7"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
            New Folder
          </Button>
        </div>
      </div>

      {/* ── 右侧道具网格 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 面包屑/标题栏 */}
        <div className="px-4 py-2.5 border-b border-border shrink-0 flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{currentFolderName}</span>
          <span className="text-xs text-muted-foreground">({visibleItems.length} items)</span>
        </div>

        {/* 道具网格 */}
        <ScrollArea className="flex-1">
          {visibleItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground py-24">
              <Package className="h-16 w-16 opacity-20" />
              <div className="text-center">
                <p className="text-base font-medium">Props library is empty</p>
                <p className="text-sm mt-1">
                  After generating an image in the Image Studio of the "Freedom" section,<br />
                  click "Save to Props Library" to add a prop
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
              {visibleItems.map((item) => (
                <PropCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 新建目录弹窗 */}
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} />
    </div>
  );
}
