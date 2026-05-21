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
    <div className="flex flex-col h-full px-2.5 py-3">
      <div className="px-2.5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-violet-400" />
          </div>
          <span className="text-[11px] font-semibold text-zinc-400 tracking-wide">
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
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[11px]
                transition-all duration-150 ${
                  isActive
                    ? "bg-violet-500/15 text-violet-300 shadow-[0_0_8px_rgba(124,58,237,0.06)]"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-violet-400" : ""}`} />
              <span className="font-medium">{cat.label}</span>
            </motion.button>
          );
        })}
      </div>

      <div className="mx-2.5 my-2 h-px bg-white/[0.05]" />

      <div className="space-y-0.5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onChange("favorite")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[11px]
            transition-all duration-150 ${
              active === "favorite"
                ? "bg-amber-500/15 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.06)]"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
            }`}
        >
          <Star className={`w-3.5 h-3.5 ${active === "favorite" ? "text-amber-400" : ""}`} />
          <span className="font-medium">收藏</span>
          {favoriteCount > 0 && (
            <span className="ml-auto text-[10px] text-zinc-600 tabular-nums">{favoriteCount}</span>
          )}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[11px]
            text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="font-medium">设置</span>
        </motion.button>
      </div>
    </div>
  );
}
