import { motion } from "framer-motion";
import { FileText, Link, Image, File, Code2, Star, Settings, Clipboard } from "lucide-react";
import type { CategoryId } from "../types";

interface Props {
  active: CategoryId;
  onChange: (id: CategoryId) => void;
  favoriteCount: number;
  onOpenSettings: () => void;
}

const categories: { id: CategoryId; label: string; icon: typeof Clipboard }[] = [
  { id: "all", label: "全部", icon: Clipboard },
  { id: "text", label: "文本", icon: FileText },
  { id: "link", label: "链接", icon: Link },
  { id: "image", label: "图片", icon: Image },
  { id: "file", label: "文件", icon: File },
  { id: "code", label: "代码", icon: Code2 },
];

export function Sidebar({ active, onChange, favoriteCount, onOpenSettings }: Props) {
  return (
    <div className="flex flex-col h-full py-3">
      {/* Logo */}
      <div data-tauri-drag-region className="px-3 pb-3 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-violet-500/15 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-violet-400" />
          </div>
          <span className="text-sm font-semibold text-zinc-300 tracking-wide">工作台</span>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-0.5 flex-1 px-2 overflow-y-auto custom-scrollbar">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = active === cat.id;
          return (
            <motion.button
              key={cat.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(cat.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm
                font-medium transition-colors ${
                  isActive
                    ? "bg-violet-500/10 text-violet-300 border border-violet-500/15"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent"
                }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-violet-400" : "text-zinc-500"}`} />
              <span>{cat.label}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Bottom */}
      <div className="mt-auto px-2 pt-2 space-y-0.5">
        <div className="mx-2 mb-1.5 h-px bg-white/[0.04]" />

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onChange("favorite")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm
            font-medium transition-colors ${
              active === "favorite"
                ? "bg-amber-500/10 text-amber-300 border border-amber-500/15"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent"
            }`}
        >
          <Star className={`w-4 h-4 ${active === "favorite" ? "text-amber-400" : "text-zinc-500"}`} />
          <span>收藏</span>
          {favoriteCount > 0 && (
            <span className="ml-auto text-xs text-zinc-500 tabular-nums font-normal">
              {favoriteCount}
            </span>
          )}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm
            font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]
            transition-colors border border-transparent"
        >
          <Settings className="w-4 h-4 text-zinc-500" />
          <span>设置</span>
        </motion.button>
      </div>
    </div>
  );
}
