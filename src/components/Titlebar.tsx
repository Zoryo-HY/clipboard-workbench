import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X } from "lucide-react";

export function Titlebar() {
  return (
    <div className="h-9 shrink-0 flex items-center border-b border-white/[0.04] select-none">
      <div
        data-tauri-drag-region
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest('button, input, a, [role="button"]')) return;
          getCurrentWindow().startDragging();
        }}
        className="flex-1 h-full flex items-center pl-3 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-violet-500/40" />
          <span className="text-xs font-medium text-zinc-500 tracking-wide">
            剪贴板工作台
          </span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 pr-2">
        <button
          onClick={() => invoke("hide_window")}
          className="w-7 h-7 flex items-center justify-center rounded-md
            text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => invoke("hide_window")}
          className="w-7 h-7 flex items-center justify-center rounded-md
            text-zinc-500 hover:text-red-400 hover:bg-red-500/8 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
