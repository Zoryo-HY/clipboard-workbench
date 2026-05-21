import { motion } from "framer-motion";
import { FileText, Link, Image, File, Code2, Star } from "lucide-react";
import type { ClipboardItem } from "../types";

interface Props {
  item: ClipboardItem;
  isSelected: boolean;
  onClick: () => void;
}

const typeConfig: Record<string, { icon: typeof FileText; color: string; bgColor: string }> = {
  text: { icon: FileText, color: "text-zinc-400", bgColor: "bg-zinc-500/10" },
  link: { icon: Link, color: "text-blue-400", bgColor: "bg-blue-500/10" },
  image: { icon: Image, color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  file: { icon: File, color: "text-amber-400", bgColor: "bg-amber-500/10" },
  code: { icon: Code2, color: "text-violet-400", bgColor: "bg-violet-500/10" },
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

export function HistoryItem({ item, isSelected, onClick }: Props) {
  const config = typeConfig[item.content_type] || typeConfig.text;
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className={`group px-3 py-2 rounded-xl cursor-pointer transition-all duration-200
        border ${
          isSelected
            ? "bg-violet-500/10 border-violet-500/25 shadow-[0_0_12px_rgba(124,58,237,0.08)]"
            : "border-transparent hover:bg-white/[0.03] hover:border-white/[0.05]"
        }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Type icon */}
        <div className={`shrink-0 mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center
          ${isSelected ? "bg-violet-500/15" : config.bgColor}`}>
          <Icon className={`w-3 h-3 ${config.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-zinc-300 leading-[1.5] line-clamp-2 break-words">
            {item.content.slice(0, 140)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-zinc-600">{timeAgo(item.created_at)}</span>
            <span className="text-[10px] text-zinc-700">
              {item.size > 1024
                ? `${(item.size / 1024).toFixed(1)} KB`
                : `${item.size} B`}
            </span>
          </div>
        </div>

        {/* Favorite star */}
        {item.is_favorite && (
          <Star className="w-3 h-3 text-amber-500/70 shrink-0 mt-0.5" fill="currentColor" />
        )}
      </div>
    </motion.div>
  );
}
