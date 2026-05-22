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
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-sm bg-violet-500/80 flex items-center justify-center">
            <div className="w-2 h-2 rounded-sm bg-white" />
          </div>
          <span className="text-[13px] font-semibold text-zinc-300">工作台</span>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-0.5 flex-1 px-2 overflow-y-auto custom-scrollbar">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = active === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onChange(cat.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-[13px]
                font-medium transition-colors ${
                  isActive
                    ? "bg-surface-2 text-zinc-200 border-l-[2px] border-l-violet-500"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border-l-[2px] border-l-transparent"
                }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-violet-400" : "text-zinc-500"}`} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom */}
      <div className="mt-auto px-2 pt-2 pb-3">
        <div className="mx-2 mb-1.5 h-px bg-[#2D2D2D]" />

        <button
          onClick={() => onChange("favorite")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-[13px]
            font-medium transition-colors ${
              active === "favorite"
                ? "bg-surface-2 text-zinc-200 border-l-[2px] border-l-amber-500"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border-l-[2px] border-l-transparent"
            }`}
        >
          <Star className={`w-4 h-4 ${active === "favorite" ? "text-amber-400" : "text-zinc-500"}`} />
          <span>收藏</span>
          {favoriteCount > 0 && (
            <span className="ml-auto text-xs text-zinc-500 tabular-nums font-normal">
              {favoriteCount}
            </span>
          )}
        </button>

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-[13px]
            font-medium text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]
            transition-colors border-l-[2px] border-l-transparent"
        >
          <Settings className="w-4 h-4 text-zinc-500" />
          <span>设置</span>
        </button>
      </div>
    </div>
  );
}
