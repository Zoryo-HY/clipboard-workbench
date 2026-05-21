import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Trash2, Copy, ClipboardList, Check, Maximize2 } from "lucide-react";
import { TextViewer } from "./TextViewer";
import type { ClipboardItem } from "../types";

type Toast = { id: number; msg: string };

export function MiniWindow() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingText, setViewingText] = useState<ClipboardItem | null>(null);
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
      console.log("[mini] loaded", data.length, "items");
      setItems(data);
    } catch (e) {
      console.error("[mini] load failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    let mounted = true;
    const pClip = listen<ClipboardItem>("clipboard-changed", (event) => {
      if (!mounted) return;
      const item = event.payload;
      console.log("[mini] clipboard-changed id=", item.id, "type=", item.content_type);
      setItems((prev) => {
        const list = prev.filter((i) => i.id !== item.id);
        return [item, ...list].slice(0, 30);
      });
    });

    const pCleared = listen<ClipboardItem>("item-cleared", (event) => {
      if (!mounted) return;
      console.log("[mini] item-cleared id=", event.payload.id);
      setItems((prev) => prev.map((i) => i.id === event.payload.id ? event.payload : i));
    });

    return () => {
      mounted = false;
      pClip.then((fn) => fn());
      pCleared.then((fn) => fn());
    };
  }, []);

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
      default: return "Aa";
    }
  };

  // ── Render ──

  return (
    <div className="flex flex-col h-full w-full bg-[#111318]">
      {/* ═══ TITLEBAR — EXACT copy of working Titlebar.tsx pattern ═══ */}
      <div
        style={{
          height: '32px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          background: 'transparent',
          position: 'relative',
          zIndex: 100,
        }}
      >
        {/* Drag region: data-tauri-drag-region + vendor prefixes + startDragging fallback */}
        <div
          data-tauri-drag-region
          onMouseDown={(e) => {
            // Only start drag on left button direct hit (not on children)
            if (e.button === 0 && e.target === e.currentTarget) {
              appWindow.startDragging().catch(() => {});
            }
          }}
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            WebkitAppRegion: 'drag',
            msAppRegion: 'drag',
            cursor: 'default',
          } as React.CSSProperties}
        >
          <span style={{ color: '#888', fontSize: '12px', userSelect: 'none', pointerEvents: 'none' }}>
            Clipboard Mini
          </span>
        </div>

        {/* Buttons: siblings OUTSIDE drag region (exactly like Titlebar) */}
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingRight: 4 }}>
          <button
            onClick={handleScreenshot}
            style={{
              width: 36, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', color: '#888', cursor: 'pointer',
              borderRadius: 4, transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; e.currentTarget.style.color = '#a78bfa'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
            title="截图"
          >
            <Camera size={14} />
          </button>
          <button
            onClick={() => invoke("switch_to_main")}
            style={{
              width: 36, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', color: '#888', cursor: 'pointer',
              borderRadius: 4, transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; e.currentTarget.style.color = '#a78bfa'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
            title="切换到主窗口"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* ═══ LIST ═══ */}
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
                    hover:bg-white/[0.04] transition-colors border-b border-white/[0.02]"
                >
                  {/* Thumbnail */}
                  <div
                    className="w-9 h-9 shrink-0 rounded-lg bg-white/[0.03] border border-white/[0.05]
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

                  {/* Hover actions — copy + clear */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopy(item); }}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-violet-400 hover:bg-white/[0.06]
                        cursor-pointer"
                      title="复制"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleClear(item, e)}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10
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

      {/* ═══ FOOTER ═══ */}
      <div className="shrink-0 px-4 py-1.5 border-t border-white/[0.04] flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">双击查看 · 悬停操作</span>
        <span className="text-[11px] text-zinc-600">{items.length} 条记录</span>
      </div>

      {/* ═══ Text viewer modal ═══ */}
      <AnimatePresence>
        {viewingText && (
          <TextViewer item={viewingText} onClose={() => setViewingText(null)} />
        )}
      </AnimatePresence>

      {/* ═══ Toasts ═══ */}
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
