import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Copy, Check, X } from "lucide-react";
import type { ClipboardItem } from "../types";
import { useState } from "react";

interface Props {
  item: ClipboardItem;
  onClose: () => void;
}

export function TextViewer({ item, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const timeStr = new Date(item.created_at).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  const typeLabel: Record<string, string> = {
    text: "文本", link: "链接", code: "代码", file: "文件路径",
  };

  return (
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="w-[560px] max-h-[80vh] bg-[#171a20] border border-white/[0.06] rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-zinc-300">
              {typeLabel[item.content_type] || "文本"}
            </span>
            <span className="text-[12px] text-zinc-500">{timeStr}</span>
            <span className="text-[12px] text-zinc-600">
              {item.content.length} 字符
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[13px] text-zinc-300
                hover:text-violet-400 hover:bg-violet-500/10 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "已复制" : "复制"}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]
                transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <pre className="text-[14px] text-zinc-200 leading-relaxed whitespace-pre-wrap break-words font-sans
            select-text"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          >
            {item.content}
          </pre>
        </div>
      </motion.div>
    </motion.div>
  );
}
