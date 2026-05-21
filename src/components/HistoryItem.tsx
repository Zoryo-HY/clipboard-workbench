import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, Link, Image, File, Code2, Star, Trash2, MoreHorizontal } from "lucide-react";
import type { ClipboardItem } from "../types";

interface Props {
  item: ClipboardItem;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

const typeConfig: Record<string, { icon: typeof FileText; label: string }> = {
  text: { icon: FileText, label: "文本" },
  link: { icon: Link, label: "链接" },
  image: { icon: Image, label: "图片" },
  file: { icon: File, label: "文件" },
  code: { icon: Code2, label: "代码" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.floor(hr / 24)} 天前`;
}

export function HistoryItem({ item, isSelected, onClick, onContextMenu, onToggleFavorite, onDelete }: Props) {
  const [hovered, setHovered] = useState(false);
  const config = typeConfig[item.content_type] || typeConfig.text;
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.12 }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group px-3 py-3 rounded-lg cursor-pointer transition-colors border ${
        isSelected
          ? "card-active"
          : "border-transparent hover:bg-[#171a20] hover:border-white/[0.04]"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`shrink-0 mt-0.5 w-7 h-7 rounded-md flex items-center justify-center ${
          isSelected ? "bg-violet-500/12" : "bg-white/[0.03]"
        }`}>
          <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-violet-400" : "text-zinc-500"}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 leading-[1.5] line-clamp-2 break-words font-medium">
            {item.content.slice(0, 160)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-500">{timeAgo(item.created_at)}</span>
            <span className="text-[11px] text-zinc-600">{config.label}</span>
            {item.size > 1024 && (
              <span className="text-[11px] text-zinc-600">
                {(item.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
        </div>

        {/* Actions on hover */}
        <div className={`shrink-0 flex items-center gap-0.5 transition-opacity ${
          hovered || item.is_favorite ? "opacity-100" : "opacity-0"
        }`}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={`p-1 rounded transition-colors ${
              item.is_favorite
                ? "text-amber-400 hover:bg-amber-500/10"
                : "text-zinc-500 hover:text-amber-400 hover:bg-white/[0.04]"
            }`}
            title={item.is_favorite ? "取消收藏" : "收藏"}
          >
            <Star className="w-4 h-4" fill={item.is_favorite ? "currentColor" : "none"} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/8 transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
