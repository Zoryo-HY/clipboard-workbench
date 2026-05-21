import { invoke } from "@tauri-apps/api/core";
import { Minus, X } from "lucide-react";

export function Titlebar() {
  return (
    <div
      data-tauri-drag-region
      className="h-7 shrink-0 flex items-center justify-between px-3
        border-b border-white/[0.04] select-none cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-violet-500/50" />
        <span className="text-[10px] font-medium text-zinc-500 tracking-wide">
          剪贴板工作台
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => invoke("hide_window")}
          className="w-6 h-6 flex items-center justify-center rounded-md
            text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          onClick={() => invoke("hide_window")}
          className="w-6 h-6 flex items-center justify-center rounded-md
            text-zinc-600 hover:text-red-400 hover:bg-red-500/8 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
