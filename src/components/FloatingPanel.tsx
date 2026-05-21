import { useState, useMemo } from "react";
import { SearchBar } from "./SearchBar";
import { HistoryItem } from "./HistoryItem";
import type { ClipboardItem, CategoryId } from "../types";

interface Props {
  items: ClipboardItem[];
  category: CategoryId;
  selectedId: number | null;
  onSelect: (item: ClipboardItem) => void;
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
  all: "全部",
  text: "文本",
  link: "链接",
  image: "图片",
  file: "文件",
  code: "代码",
  favorite: "收藏",
};

export function FloatingPanel({ items, category, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");

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
      <div className="shrink-0 px-3 pt-2 pb-1.5">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-[11px] font-medium text-zinc-400">
            {categoryLabels[category]}
          </h2>
          <span className="text-[10px] text-zinc-600 tabular-nums">
            {filtered.length} 条
          </span>
        </div>
        <SearchBar value={search} onChange={setSearch} />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1.5">
            <div className="w-8 h-8 rounded-lg bg-white/[0.02] border border-white/[0.04]
              flex items-center justify-center">
              <div className="w-3 h-3 text-zinc-700">—</div>
            </div>
            <p className="text-[11px] text-zinc-600">
              {search ? "无匹配结果" : "剪贴板为空"}
            </p>
            <p className="text-[10px] text-zinc-700">
              {search ? "尝试其他关键词" : "复制内容后自动出现在这里"}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((item) => (
              <HistoryItem
                key={item.id}
                item={item}
                isSelected={item.id === selectedId}
                onClick={() => onSelect(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
