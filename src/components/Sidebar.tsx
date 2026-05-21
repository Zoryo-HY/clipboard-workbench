import { motion } from "framer-motion";
import {
  Layers, FileText, Link, Image, File, Code2, Star, Settings,
} from "lucide-react";
import type { CategoryId } from "../types";

interface Props {
  active: CategoryId;
  onChange: (id: CategoryId) => void;
  favoriteCount: number;
  onOpenSettings: () => void;
}

const mainCategories: { id: CategoryId; label: string; icon: typeof Layers }[] = [
  { id: "all", label: "全部", icon: Layers },
  { id: "text", label: "文本", icon: FileText },
  { id: "link", label: "链接", icon: Link },
  { id: "image", label: "图片", icon: Image },
  { id: "file", label: "文件", icon: File },
  { id: "code", label: "代码", icon: Code2 },
];

export function Sidebar({ active, onChange, favoriteCount, onOpenSettings }: Props) {
  return (
    <div className="flex flex-col h-full px-2 py-3">
      {/* Logo */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Layers className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="text-xs font-semibold text-zinc-300 tracking-wide">
            剪贴板
          </span>
        </div>
      </div>

      {/* Main categories */}
      <div className="space-y-0.5 flex-1">
        {mainCategories.map((cat) => {
          const Icon = cat.icon;
          const isActive = active === cat.id;
          return (
            <motion.button
              key={cat.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => onChange(cat.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs
                transition-colors ${
                  isActive
                    ? "bg-violet-500/15 text-violet-300"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-violet-400" : ""}`} />
              <span className="font-medium">{cat.label}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 h-px bg-white/[0.06]" />

      {/* Bottom items */}
      <div className="space-y-0.5">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onChange("favorite")}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs
            transition-colors ${
              active === "favorite"
                ? "bg-amber-500/15 text-amber-300"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
            }`}
        >
          <Star
            className={`w-3.5 h-3.5 ${active === "favorite" ? "text-amber-400" : ""}`}
          />
          <span className="font-medium">收藏</span>
          {favoriteCount > 0 && (
            <span className="ml-auto text-[10px] text-zinc-600 tabular-nums">
              {favoriteCount}
            </span>
          )}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs
            transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="font-medium">设置</span>
        </motion.button>
      </div>
    </div>
  );
}
