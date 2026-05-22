import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SearchBar } from "./SearchBar";
import { HistoryItem } from "./HistoryItem";
import { Trash2, Filter, Camera } from "lucide-react";
import type { ClipboardItem, CategoryId } from "../types";

interface Props {
  items: ClipboardItem[];
  category: CategoryId;
  selectedId: number | null;
  onSelect: (item: ClipboardItem) => void;
  onContextMenu: (e: React.MouseEvent, item: ClipboardItem) => void;
  onToggleFavorite: (item: ClipboardItem) => void;
  onDelete: (item: ClipboardItem) => void;
  onClearAll: () => void;
  onClearOld: (days: number) => void;
  onClearImages: () => void;
  onOpenImage: (path: string) => void;
  onDoubleClickText: (item: ClipboardItem) => void;
}

function classifyItem(item: ClipboardItem): CategoryId {
  const t = item.content_type;
  if (t === "link") return "link";
  if (t === "image") return "image";
  if (t === "file") return "file";
  if (t === "code") return "code";
  return "text";
}

const categoryLabels: Record<CategoryId, string> = {
  all: "全部", text: "文本", link: "链接", image: "图片",
  file: "文件", code: "代码", favorite: "收藏",
};

export function FloatingPanel({
  items, category, selectedId, onSelect, onContextMenu,
  onToggleFavorite, onDelete, onClearAll, onClearOld, onClearImages,
  onOpenImage, onDoubleClickText,
}: Props) {
  const [search, setSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const filtered = useMemo(() => {
    let list = items;
    if (category === "favorite") {
      list = list.filter((i) => i.is_favorite);
    } else if (category !== "all") {
      list = list.filter((i) => classifyItem(i) === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.content.toLowerCase().includes(q));
    }
    return list;
  }, [items, category, search]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[14px] font-semibold text-zinc-200">
            {categoryLabels[category]}
          </h2>
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-500 tabular-nums mr-1">{filtered.length} 条</span>
            {/* Screenshot */}
            <button
              onClick={async () => {
                try { await invoke("take_screenshot"); } catch (e) { console.error(e); }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium
                text-violet-400 hover:text-violet-300 hover:bg-violet-500/12
                border border-violet-500/20 transition-colors"
              title="截图"
            >
              <Camera className="w-4 h-4" />
              <span>截图</span>
            </button>
            {/* Clear all */}
            <button
              onClick={() => { if (window.confirm('确定要清空所有历史记录吗？此操作不可撤销。')) onClearAll(); }}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
                text-zinc-500 hover:text-red-400 hover:bg-red-500/8 transition-colors"
              title="清空所有历史"
            >
              <Trash2 className="w-3 h-3" />
              清空全部
            </button>
            {/* Bulk menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-surface-2 transition-colors"
                title="批量清理"
              >
                <Filter className="w-3.5 h-3.5" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-40 py-1 rounded
                    border border-subtle bg-surface-3 shadow-lg"
                  >
                    <button
                      onClick={() => { onClearOld(7); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                    >
                      清空 7 天前
                    </button>
                    <button
                      onClick={() => { onClearOld(30); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                    >
                      清空 30 天前
                    </button>
                    {category === "image" && (
                      <button
                        onClick={() => { onClearImages(); setShowMenu(false); }}
                        className="w-full text-left px-3 py-1.5 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                      >
                        清空图片
                      </button>
                    )}
                    <div className="mx-2 my-1 h-px bg-[#2D2D2D]" />
                    <button
                      onClick={() => { onClearAll(); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-[13px] text-red-400 hover:bg-red-500/8 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      清空全部
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-10 h-10 rounded bg-surface-2 border border-subtle
              flex items-center justify-center">
              <div className="text-zinc-600 text-sm">—</div>
            </div>
            <p className="text-[13px] text-zinc-500">
              {search ? "无匹配结果" : "剪贴板为空"}
            </p>
            <p className="text-xs text-zinc-600">
              {search ? "尝试其他关键词" : "复制内容后自动出现在这里"}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((item) => (
              <HistoryItem
                key={item.id}
                item={item}
                isSelected={item.id === selectedId}
                onClick={() => onSelect(item)}
                onContextMenu={(e) => onContextMenu(e, item)}
                onToggleFavorite={() => onToggleFavorite(item)}
                onDelete={() => onDelete(item)}
                onDoubleClickImage={() => {
                  if (item.content_type === "image" || item.content_type === "file") {
                    onOpenImage(item.content);
                  }
                }}
                onDoubleClickText={() => onDoubleClickText(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
