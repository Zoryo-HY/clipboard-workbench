import { useEffect, useRef } from "react";
import type { ClipboardItem } from "../types";

export interface MenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  x: number;
  y: number;
  item: ClipboardItem;
  actions: MenuAction[];
  onClose: () => void;
}

export function ContextMenu({ x, y, item, actions, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  const menuW = 160;
  const menuH = actions.length * 32 + 16;
  const adjX = Math.min(x, window.innerWidth - menuW - 8);
  const adjY = Math.min(y, window.innerHeight - menuH - 8);

  return (
    <div
      ref={ref}
      className="context-menu-enter fixed z-50 py-1.5 rounded border border-subtle"
      style={{
        left: adjX,
        top: adjY,
        background: "#2D2D2E",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        minWidth: menuW,
      }}
    >
      <div className="px-2 pb-1.5 mb-1 border-b border-[#3D3D3D]">
        <p className="text-xs text-zinc-400 truncate px-1">
          {item.content.slice(0, 40)}
        </p>
      </div>
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => { action.onClick(); onClose(); }}
          className={`w-full text-left px-3 py-1.5 text-[13px] transition-colors ${
            action.danger
              ? "text-red-400 hover:bg-red-500/10"
              : "text-zinc-300 hover:bg-white/[0.06]"
          }`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
