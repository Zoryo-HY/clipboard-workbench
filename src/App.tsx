import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence } from "framer-motion";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { FloatingPanel } from "./components/FloatingPanel";
import { DetailPanel } from "./components/DetailPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ContextMenu, MenuAction } from "./components/ContextMenu";
import { TextViewer } from "./components/TextViewer";
import type { ClipboardItem, ClipboardEventPayload, Settings, CategoryId, View } from "./types";

export default function App() {
  const [view, setView] = useState<View>("history");
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [category, setCategory] = useState<CategoryId>("all");
  const [selectedItem, setSelectedItem] = useState<ClipboardItem | null>(null);
  const [fullContent, setFullContent] = useState<string>("");
  const [viewingText, setViewingText] = useState<ClipboardItem | null>(null);
  const [settings, setSettings] = useState<Settings>({
    max_text_length: 10000,
    max_image_size_mb: 10,
    max_file_size_mb: 50,
    total_storage_limit_mb: 500,
    auto_clean_days: 30,
    start_minimized: false,
    storage_path: "",
    theme: "dark",
    auto_start: false,
  });

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; item: ClipboardItem;
  } | null>(null);

  // ── Data loading ──────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const data = await invoke<ClipboardItem[]>("get_history", {
        limit: 500, offset: 0,
      });
      setItems(data);
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await invoke<Settings>("get_settings");
      setSettings(s);
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadSettings();
  }, [loadHistory, loadSettings]);

  // ── Event listeners ───────────────────────────

  useEffect(() => {
    // Hold onto the promises so cleanup can unsubscribe even when the
    // component unmounts before listen() resolves (React StrictMode).
    const pClip = listen<ClipboardEventPayload>("clipboard-changed", (event) => {
      const { old_id, ...item } = event.payload;
      setItems((prev) => {
        const list = old_id ? prev.filter((i) => i.id !== old_id) : prev;
        return [item as ClipboardItem, ...list];
      });
      setSelectedItem((prev) => prev?.id === old_id ? null : prev);
    });

    const pNav = listen<string>("navigate", (event) => {
      if (event.payload === "settings") setView("settings");
    });

    return () => {
      pClip.then((fn) => fn());
      pNav.then((fn) => fn());
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedItem && view === "history") {
        handleDelete(selectedItem);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedItem, view]);

  // ── Item actions ──────────────────────────────

  const handleSelect = useCallback(async (item: ClipboardItem) => {
    setSelectedItem(item);
    if (item.content_type === "compound") {
      try {
        const children = await invoke<ClipboardItem[]>("get_children", { parentId: item.id });
        console.log("[handleSelect] compound children:", children.length, children.map(c => c.content_type));
        setSelectedItem({ ...item, children });
      } catch (e) {
        console.error("[handleSelect] get_children failed:", e);
        setSelectedItem(item);
      }
    } else {
      try {
        const content = await invoke<string>("get_full_content", { id: item.id });
        setFullContent(content);
      } catch {
        setFullContent(item.content);
      }
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!selectedItem) return;
    await invoke("copy_to_clipboard", { id: selectedItem.id });
  }, [selectedItem]);

  const handleToggleFavorite = useCallback(async (item: ClipboardItem) => {
    await invoke("toggle_favorite", { id: item.id });
    setItems((prev) =>
      prev.map((i) => i.id === item.id ? { ...i, is_favorite: !i.is_favorite } : i)
    );
    setSelectedItem((prev) =>
      prev?.id === item.id ? { ...prev, is_favorite: !prev.is_favorite } : prev
    );
  }, []);

  const handleDelete = useCallback(async (item: ClipboardItem) => {
    await invoke("delete_item", { id: item.id });
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if (selectedItem?.id === item.id) {
      setSelectedItem(null);
      setFullContent("");
    }
  }, [selectedItem]);

  // ── Bulk actions ──────────────────────────────

  const handleClearAll = async () => {
    await invoke("clear_history");
    setItems((prev) => prev.filter((i) => i.is_favorite));
    setSelectedItem(null);
    setFullContent("");
  };

  const handleClearOld = async (days: number) => {
    // Delete non-favorite items older than N days
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const toDelete = items.filter(
      (i) => !i.is_favorite && i.created_at < cutoff
    );
    for (const item of toDelete) {
      await invoke("delete_item", { id: item.id });
    }
    setItems((prev) => prev.filter((i) => !toDelete.find((d) => d.id === i.id)));
    if (selectedItem && toDelete.find((d) => d.id === selectedItem.id)) {
      setSelectedItem(null);
      setFullContent("");
    }
  };

  const handleClearImages = async () => {
    const toDelete = items.filter((i) => i.content_type === "image" && !i.is_favorite);
    for (const item of toDelete) {
      await invoke("delete_item", { id: item.id });
    }
    setItems((prev) => prev.filter((i) => !toDelete.find((d) => d.id === i.id)));
    if (selectedItem && toDelete.find((d) => d.id === selectedItem.id)) {
      setSelectedItem(null);
      setFullContent("");
    }
  };

  // ── Context menu ──────────────────────────────

  const handleContextMenu = (e: React.MouseEvent, item: ClipboardItem) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, item });
  };

  const ctxActions: MenuAction[] = ctxMenu
    ? [
        { label: "复制", onClick: () => {
          setSelectedItem(ctxMenu.item);
          invoke("copy_to_clipboard", { id: ctxMenu.item.id });
        }},
        { label: ctxMenu.item.is_favorite ? "取消收藏" : "收藏",
          onClick: () => handleToggleFavorite(ctxMenu.item) },
        { label: "导出", onClick: () => {
          const content = ctxMenu.item.content;
          const blob = new Blob([content], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `clipboard-${ctxMenu.item.id}.txt`;
          a.click();
          URL.revokeObjectURL(url);
        }},
        { label: "删除", onClick: () => handleDelete(ctxMenu.item), danger: true },
      ]
    : [];

  // ── Settings ──────────────────────────────────

  const handleSaveSettings = async (s: Settings) => {
    await invoke("update_settings", { settings: s });
    setSettings(s);
  };

  const themeClass = settings.theme === "light" ? "light" : "";

  // ── View: Settings ────────────────────────────

  if (view === "settings") {
    return (
      <div className={`h-full w-full shell flex flex-col ${themeClass}`}>
        <Titlebar />
        <SettingsPanel
          settings={settings}
          onSave={handleSaveSettings}
          onBack={() => setView("history")}
        />
      </div>
    );
  }

  // ── View: Main ────────────────────────────────

  const favoriteCount = items.filter((i) => i.is_favorite).length;

  return (
    <div className={`h-full w-full shell flex flex-col ${themeClass}`}>
      <Titlebar />

      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar — navigation */}
        <div className="w-[135px] shrink-0 bg-surface-0 border-r border-subtle">
          <Sidebar
            active={category}
            onChange={(id) => {
              setCategory(id);
              setSelectedItem(null);
              setFullContent("");
            }}
            favoriteCount={favoriteCount}
            onOpenSettings={() => {
              loadSettings();
              setView("settings");
            }}
          />
        </div>

        {/* Center — content stream */}
        <div className="flex-1 min-w-0 bg-surface-1 border-r border-subtle">
          <FloatingPanel
            key={category}
            items={items}
            category={category}
            selectedId={selectedItem?.id ?? null}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
            onToggleFavorite={handleToggleFavorite}
            onDelete={handleDelete}
            onClearAll={handleClearAll}
            onClearOld={handleClearOld}
            onClearImages={handleClearImages}
            onOpenImage={(path) => invoke("open_image", { path })}
            onDoubleClickText={(item) => setViewingText(item)}
            onRefresh={loadHistory}
          />
        </div>

        {/* Right — workspace */}
        <div className="w-[380px] shrink-0 bg-surface-1">
          <DetailPanel
            item={selectedItem}
            fullContent={fullContent}
            onCopy={handleCopy}
            onToggleFavorite={() => {
              if (selectedItem) handleToggleFavorite(selectedItem);
            }}
            onDelete={() => {
              if (selectedItem) handleDelete(selectedItem);
            }}
          />
        </div>
      </div>

      {/* Text viewer modal */}
      <AnimatePresence>
        {viewingText && (
          <TextViewer item={viewingText} onClose={() => setViewingText(null)} />
        )}
      </AnimatePresence>

      {/* Context menu overlay */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          item={ctxMenu.item}
          actions={ctxActions}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
