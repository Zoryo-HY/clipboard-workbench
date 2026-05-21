import { useState, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SearchBar } from "./SearchBar";
import { HistoryItem } from "./HistoryItem";
import { Trash2, Filter } from "lucide-react";
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
      <div
        data-tauri-drag-region
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest('button, input, a, [role="button"]')) return;
          getCurrentWindow().startDragging();
        }}
        className="shrink-0 px-4 pt-3 pb-2 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-zinc-200">
            {categoryLabels[category]}
          </h2>
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-500 tabular-nums mr-1">{filtered.length} 条</span>
            {/* Bulk cleanup menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                title="批量清理"
              >
                <Filter className="w-3.5 h-3.5" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-40 py-1 rounded-lg
                    border border-white/[0.06] bg-[#1d2128] shadow-xl"
                  >
                    <button
                      onClick={() => { onClearOld(7); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.04]"
                    >
                      清空 7 天前
                    </button>
                    <button
                      onClick={() => { onClearOld(30); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.04]"
                    >
                      清空 30 天前
                    </button>
                    {category === "image" && (
                      <button
                        onClick={() => { onClearImages(); setShowMenu(false); }}
                        className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.04]"
                      >
                        清空图片
                      </button>
                    )}
                    <div className="mx-2 my-1 h-px bg-white/[0.04]" />
                    <button
                      onClick={() => { onClearAll(); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/8 flex items-center gap-2"
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
            <div className="w-10 h-10 rounded-lg bg-white/[0.02] border border-white/[0.04]
              flex items-center justify-center">
              <div className="text-zinc-600 text-lg">—</div>
            </div>
            <p className="text-sm text-zinc-500">
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
