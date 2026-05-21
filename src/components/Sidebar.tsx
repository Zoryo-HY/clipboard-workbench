import { motion } from "framer-motion";
import { Layers, FileText, Link, Image, File, Code2, Star, Settings } from "lucide-react";
import type { CategoryId } from "../types";

interface Props {
  active: CategoryId;
  onChange: (id: CategoryId) => void;
  favoriteCount: number;
  onOpenSettings: () => void;
}

const categories: { id: CategoryId; label: string; icon: typeof Layers }[] = [
  { id: "all", label: "全部", icon: Layers },
  { id: "text", label: "文本", icon: FileText },
  { id: "link", label: "链接", icon: Link },
  { id: "image", label: "图片", icon: Image },
  { id: "file", label: "文件", icon: File },
  { id: "code", label: "代码", icon: Code2 },
];

export function Sidebar({ active, onChange, favoriteCount, onOpenSettings }: Props) {
  return (
    <div data-tauri-drag-region className="flex flex-col h-full px-2 py-2.5">
      <div className="px-2 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-violet-500/20 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          </div>
          <span className="text-[10px] font-semibold text-zinc-400 tracking-wide">
            工作台
          </span>
        </div>
      </div>

      <div className="space-y-0.5 flex-1">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = active === cat.id;
          return (
            <motion.button
              key={cat.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(cat.id)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-[10px]
                transition-colors duration-150 ${
                  isActive
                    ? "bg-violet-500/10 text-violet-300 border border-violet-500/15"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02] border border-transparent"
                }`}
            >
              <Icon className={`w-3 h-3 ${isActive ? "text-violet-400" : ""}`} />
              <span className="font-medium">{cat.label}</span>
            </motion.button>
          );
        })}
      </div>

      <div className="mx-2 my-1.5 h-px bg-white/[0.04]" />

      <div className="space-y-0.5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onChange("favorite")}
          className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-[10px]
            transition-colors duration-150 ${
              active === "favorite"
                ? "bg-amber-500/10 text-amber-300 border border-amber-500/15"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02] border border-transparent"
            }`}
        >
          <Star className={`w-3 h-3 ${active === "favorite" ? "text-amber-400" : ""}`} />
          <span className="font-medium">收藏</span>
          {favoriteCount > 0 && (
            <span className="ml-auto text-[10px] text-zinc-600 tabular-nums">{favoriteCount}</span>
          )}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-[10px]
            text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02] transition-colors border border-transparent"
        >
          <Settings className="w-3 h-3" />
          <span className="font-medium">设置</span>
        </motion.button>
      </div>
    </div>
  );
}
