import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./components/Sidebar";
import { FloatingPanel } from "./components/FloatingPanel";
import { DetailPanel } from "./components/DetailPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import type { ClipboardItem, Settings, CategoryId, View } from "./types";

export default function App() {
  const [view, setView] = useState<View>("history");
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [category, setCategory] = useState<CategoryId>("all");
  const [selectedItem, setSelectedItem] = useState<ClipboardItem | null>(null);
  const [settings, setSettings] = useState<Settings>({
    max_text_length: 10000,
    max_image_size_mb: 10,
    max_file_size_mb: 50,
    total_storage_limit_mb: 500,
    auto_clean_days: 30,
  });

  const loadHistory = useCallback(async () => {
    try {
      const data = await invoke<ClipboardItem[]>("get_history", {
        limit: 500,
        offset: 0,
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

  useEffect(() => {
    let unlistenClipboard: UnlistenFn | undefined;
    listen<ClipboardItem>("clipboard-changed", (event) => {
      setItems((prev) => [event.payload, ...prev]);
    }).then((fn) => { unlistenClipboard = fn; });

    let unlistenNav: UnlistenFn | undefined;
    listen<string>("navigate", (event) => {
      if (event.payload === "settings") {
        setView("settings");
      }
    }).then((fn) => { unlistenNav = fn; });

    return () => {
      unlistenClipboard?.();
      unlistenNav?.();
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!selectedItem) return;
    await invoke("copy_to_clipboard", { id: selectedItem.id });
  }, [selectedItem]);

  const handleToggleFavorite = useCallback(async () => {
    if (!selectedItem) return;
    await invoke("toggle_favorite", { id: selectedItem.id });
    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedItem.id
          ? { ...item, is_favorite: !item.is_favorite }
          : item
      )
    );
    setSelectedItem((prev) =>
      prev ? { ...prev, is_favorite: !prev.is_favorite } : null
    );
  }, [selectedItem]);

  const handleDelete = useCallback(async () => {
    if (!selectedItem) return;
    await invoke("delete_item", { id: selectedItem.id });
    setItems((prev) => prev.filter((item) => item.id !== selectedItem.id));
    setSelectedItem(null);
  }, [selectedItem]);

  const handleSaveSettings = async (s: Settings) => {
    await invoke("update_settings", { settings: s });
    setSettings(s);
  };

  const favoriteCount = items.filter((i) => i.is_favorite).length;

  if (view === "settings") {
    return (
      <div className="h-full w-full rounded-2xl overflow-hidden glass-shell">
        <SettingsPanel
          settings={settings}
          onSave={handleSaveSettings}
          onBack={() => setView("history")}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden glass-shell flex">
      {/* Left Sidebar */}
      <div className="w-[170px] shrink-0 border-r border-white/[0.05]">
        <Sidebar
          active={category}
          onChange={(id) => {
            setCategory(id);
            setSelectedItem(null);
          }}
          favoriteCount={favoriteCount}
          onOpenSettings={() => {
            loadSettings();
            setView("settings");
          }}
        />
      </div>

      {/* Center - History List */}
      <div className="flex-1 min-w-0 border-r border-white/[0.05]">
        <AnimatePresence mode="wait">
          <motion.div
            key={category}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="h-full"
          >
            <FloatingPanel
              items={items}
              category={category}
              selectedId={selectedItem?.id ?? null}
              onSelect={setSelectedItem}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Right - Detail Panel */}
      <div className="w-[260px] shrink-0">
        <DetailPanel
          item={selectedItem}
          onCopy={handleCopy}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
