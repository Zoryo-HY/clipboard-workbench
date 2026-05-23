import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Trash2, Copy, ClipboardList, Check, Maximize2, Minus, X } from "lucide-react";
import { TextViewer } from "./TextViewer";
import type { ClipboardItem, Settings } from "../types";

type Toast = { id: number; msg: string };

export function MiniWindow() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingText, setViewingText] = useState<ClipboardItem | null>(null);
  const [theme, setTheme] = useState("dark");
  const toastIdRef = useRef(0);
  const appWindow = getCurrentWindow();

  const showToast = (msg: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2000);
  };

  const loadItems = useCallback(async () => {
    try {
      const data = await invoke<ClipboardItem[]>("get_history", { limit: 30, offset: 0 });
      setItems(data);
    } catch (e) {
      console.error("[mini] load failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const syncTheme = useCallback(() => {
    invoke<Settings>("get_settings").then(s => setTheme(s.theme || "dark")).catch(() => {});
  }, []);

  useEffect(() => { syncTheme(); }, [syncTheme]);

  useEffect(() => {
    let mounted = true;
    const pClip = listen<ClipboardItem>("clipboard-changed", (event) => {
      if (!mounted) return;
      const item = event.payload;
      setItems((prev) => {
        const list = prev.filter((i) => i.id !== item.id);
        return [item, ...list].slice(0, 30);
      });
    });

    const pCleared = listen<ClipboardItem>("item-cleared", (event) => {
      if (!mounted) return;
      setItems((prev) => prev.map((i) => i.id === event.payload.id ? event.payload : i));
    });

    const pSettings = listen<Settings>("settings-changed", (event) => {
      if (!mounted) return;
      setTheme(event.payload.theme || "dark");
    });

    // Sync theme + data whenever window gains focus (belt-and-suspenders)
    const onFocus = () => { syncTheme(); loadItems(); };
    window.addEventListener('focus', onFocus);

    return () => {
      mounted = false;
      pClip.then((fn) => fn());
      pCleared.then((fn) => fn());
      pSettings.then((fn) => fn());
      window.removeEventListener('focus', onFocus);
    };
  }, [syncTheme]);

  const handleCopy = async (item: ClipboardItem) => {
    try { await invoke("copy_to_clipboard", { id: item.id }); showToast("已复制"); }
    catch (e) { console.error("[mini] copy:", e); }
  };

  const handleClear = async (item: ClipboardItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await invoke("clear_item", { id: item.id }); showToast("已清除"); }
    catch (err) { console.error("[mini] clear:", err); }
  };

  const handleScreenshot = async () => {
    try {
      await invoke("take_screenshot");
      showToast("截图完成将自动加入历史");
    } catch (e) {
      console.error("[mini] screenshot:", e);
      showToast("截图启动失败");
    }
  };

  const handleItemDoubleClick = (item: ClipboardItem) => {
    if (item.is_cleared) return;
    if (item.content_type === "compound") {
      invoke("switch_to_main");
      return;
    }
    if (item.content_type === "image") {
      invoke("open_image", { path: item.content }).catch(console.error);
    } else {
      setViewingText(item);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  const getPreview = (item: ClipboardItem): string => {
    if (item.is_cleared) return "(已清除)";
    if (item.content_type === "compound") return item.content;
    if (item.content_type === "image") return "图片";
    if (item.content_type === "file") {
      const name = item.content.split("\\").pop()?.split("/").pop() || item.content;
      return name.length > 28 ? name.slice(0, 28) + "…" : name;
    }
    return item.content.length > 36 ? item.content.slice(0, 36) + "…" : item.content;
  };

  const itemTypeLabel = (ct: string) => {
    switch (ct) {
      case "image": return "IMG";
      case "file": return "FILE";
      case "link": return "URL";
      case "code": return "< >";
      case "compound": return "++";
      default: return "Aa";
    }
  };

  return (
    <div className={`flex flex-col h-full w-full bg-surface-0 ${theme === "light" ? "light" : ""}`}>
      {/* Titlebar */}
      <div className="flex items-center w-full bg-surface-0 relative z-[100]" style={{ height: 32 }}>
        {/* Left: screenshot */}
        <div className="flex items-center h-full pl-1">
          <button onClick={handleScreenshot} className="titlebar-btn titlebar-btn-accent" title="截图">
            <Camera size={14} />
          </button>
        </div>

        {/* Center: title (draggable) */}
        <div
          data-tauri-drag-region
          className="flex-1 h-full flex items-center justify-center"
          style={{ cursor: 'default', WebkitAppRegion: 'drag', msAppRegion: 'drag' } as React.CSSProperties}
        >
          <span
            className="text-[12px] select-none pointer-events-none"
            style={{ color: 'var(--titlebar-text)' }}
          >
            CopyBox Mini
          </span>
        </div>

        {/* Right: minimize / switch / close */}
        <div className="flex items-center h-full pr-1">
          <button onClick={() => appWindow.minimize()} className="titlebar-btn" title="最小化">
            <Minus size={14} />
          </button>
          <button onClick={() => invoke("switch_to_main")} className="titlebar-btn" title="切换到主窗口">
            <Maximize2 size={14} />
          </button>
          <button onClick={() => appWindow.close()} className="titlebar-btn hover:bg-red-500/20 hover:text-red-400" title="关闭">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[13px] text-zinc-500">加载中…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
            <ClipboardList className="w-10 h-10 opacity-20" />
            <p className="text-[14px]">剪贴板为空</p>
            <p className="text-[12px] text-zinc-600">复制内容后自动出现在这里</p>
          </div>
        ) : (
          <div className="py-1">
            <AnimatePresence>
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.12 }}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  className="group flex items-center gap-3 px-4 py-2.5
                    hover:bg-white/[0.03] transition-colors border-b border-[#2D2D2D]"
                >
                  {/* Thumbnail */}
                  <div
                    className="w-9 h-9 shrink-0 rounded bg-surface-2 border border-subtle
                      flex items-center justify-center overflow-hidden"
                  >
                    {item.content_type === "image" && item.thumbnail && !item.is_cleared ? (
                      <img
                        src={`data:image/png;base64,${item.thumbnail}`}
                        className="w-full h-full object-cover" alt=""
                      />
                    ) : (
                      <span className="text-[12px] text-zinc-500 font-medium">
                        {itemTypeLabel(item.content_type)}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] truncate leading-snug ${
                      item.is_cleared ? "text-zinc-600 italic" : "text-zinc-200"
                    }`}>
                      {getPreview(item)}
                    </p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">
                      {formatTime(item.created_at)}
                      {item.is_cleared && " · 已清除"}
                    </p>
                  </div>

                  {/* Hover actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopy(item); }}
                      className="p-1.5 rounded text-zinc-500 hover:text-violet-400 hover:bg-surface-3
                        cursor-pointer"
                      title="复制"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleClear(item, e)}
                      className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10
                        cursor-pointer"
                      title="清除缓存"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-1.5 border-t border-[#2D2D2D] flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">双击查看 · 悬停操作</span>
        <span className="text-[11px] text-zinc-600">{items.length} 条记录</span>
      </div>

      {/* Text viewer modal */}
      <AnimatePresence>
        {viewingText && (
          <TextViewer item={viewingText} onClose={() => setViewingText(null)} />
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-50">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-3 py-1.5 rounded-full bg-violet-500/90 text-white text-[13px] font-medium
              shadow-lg flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            {t.msg}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
