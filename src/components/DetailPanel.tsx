import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  Copy, Sparkles, Link, FileCode, Trash2, Star, Download,
  FileText, ExternalLink, FolderOpen,
} from "lucide-react";
import type { ClipboardItem } from "../types";

interface Props {
  item: ClipboardItem | null;
  fullContent: string;
  onCopy: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  return text.match(urlRegex) || [];
}

function removeEmptyLines(text: string): string {
  return text.split('\n').filter(line => line.trim() !== '').join('\n');
}

const typeLabels: Record<string, string> = {
  text: "文本", link: "链接", image: "图片", file: "文件", code: "代码",
};

export function DetailPanel({ item, fullContent, onCopy, onToggleFavorite, onDelete }: Props) {
  if (!item) {
    return (
      <div
        className="h-full flex items-center justify-center"
      >
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-white/[0.04]
            flex items-center justify-center mx-auto mb-3">
            <FileText className="w-5 h-5 text-zinc-500" />
          </div>
          <p className="text-sm text-zinc-500">选择内容查看详情</p>
        </div>
      </div>
    );
  }

  const urls = extractUrls(fullContent);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={item.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full"
      >
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-md bg-white/[0.03]
              border border-white/[0.04] text-zinc-400">
              {typeLabels[item.content_type] || "文本"}
            </span>
            <span className="text-xs text-zinc-600">
              {item.size > 1024
                ? `${(item.size / 1024).toFixed(1)} KB`
                : `${item.size} B`}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onToggleFavorite}
              className={`p-1 rounded transition-colors ${
                item.is_favorite
                  ? "text-amber-400 hover:bg-amber-500/10"
                  : "text-zinc-500 hover:text-amber-400 hover:bg-white/[0.04]"
              }`}
            >
              <Star className="w-4 h-4" fill={item.is_favorite ? "currentColor" : "none"} />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/8 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image preview */}
        {item.content_type === "image" && (
          <div className="shrink-0 px-4 pb-2">
            {item.thumbnail ? (
              <div className="rounded-lg overflow-hidden border border-white/[0.04] bg-[#0d0f13] relative group">
                <img
                  src={`data:image/png;base64,${item.thumbnail}`}
                  alt="clipboard"
                  className="w-full max-h-64 object-contain cursor-pointer"
                  onDoubleClick={() => invoke("open_image", { path: fullContent || item.content })}
                />
                <div className="absolute bottom-2 right-2 text-[10px] text-zinc-500 bg-black/60 px-1.5 py-0.5 rounded
                  opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  双击打开原图
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-white/[0.04] bg-[#0d0f13]
                flex items-center justify-center h-20 text-sm text-zinc-500">
                缩略图不可用 · 双击文件路径打开
              </div>
            )}
          </div>
        )}

        {/* Content preview */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-3">
          {item.content_type === "file" ? (
            <div className="p-3 rounded-lg bg-[#0d0f13] border border-white/[0.04]">
              <p className="text-sm text-zinc-300 font-medium break-words">
                {(fullContent || item.content).split("\\").pop()?.split("/").pop() || fullContent || item.content}
              </p>
              <p className="text-xs text-zinc-500 mt-1 break-all">
                {fullContent || item.content}
              </p>
            </div>
          ) : item.content_type === "image" ? (
            <div className="p-3 rounded-lg bg-[#0d0f13] border border-white/[0.04]">
              <p className="text-xs text-zinc-500 break-all">
                {fullContent || item.content}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-[#0d0f13] border border-white/[0.04]">
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words
                flex-1 overflow-y-auto custom-scrollbar font-medium">
                {fullContent || item.content}
              </p>
            </div>
          )}

          {/* URLs */}
          {urls.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-zinc-500 mb-1.5 font-medium">链接 ({urls.length})</p>
              <div className="space-y-1">
                {urls.slice(0, 5).map((url, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md
                    bg-white/[0.01] border border-white/[0.03]">
                    <ExternalLink className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="text-xs text-violet-400/60 truncate">{url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tools */}
        <div className="shrink-0 px-4 py-3 border-t border-white/[0.04]">
          <p className="text-xs text-zinc-500 mb-2 font-medium">工具</p>
          <div className="space-y-1">
            <div className="grid grid-cols-3 gap-1">
              <ToolBtn icon={Copy} label="复制" onClick={onCopy} />
              <ToolBtn icon={Link} label="提取链接" onClick={() => {
                const extracted = extractUrls(fullContent).join('\n');
                if (extracted) invoke("write_to_clipboard", { text: extracted });
              }} />
              <ToolBtn icon={FileCode} label="代码块" onClick={() => {
                invoke("write_to_clipboard", { text: '```\n' + fullContent + '\n```' });
              }} />
              <ToolBtn icon={Sparkles} label="去空行" onClick={() => {
                invoke("write_to_clipboard", { text: removeEmptyLines(fullContent) });
              }} />
              <ToolBtn icon={Download} label="导出" onClick={() => {
                const blob = new Blob([fullContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `clipboard-${item.id}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }} />
              {item.content_type === "image" || item.content_type === "file" ? (
                <ToolBtn icon={FolderOpen} label="打开位置" onClick={() => {
                  invoke("open_file_location", { path: item.content });
                }} />
              ) : (
                <ToolBtn icon={Trash2} label="删除" onClick={onDelete} danger />
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ToolBtn({
  icon: Icon, label, onClick, danger,
}: {
  icon: typeof Copy; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs
        font-medium transition-colors ${
          danger
            ? "text-zinc-500 hover:text-red-400 hover:bg-red-500/6"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
        }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </motion.button>
  );
}
