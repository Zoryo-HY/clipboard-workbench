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
      <div className="h-full flex items-center justify-center">
        <div className="text-center px-4">
          <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/[0.04]
            flex items-center justify-center mx-auto mb-2">
            <FileText className="w-4 h-4 text-zinc-600" />
          </div>
          <p className="text-[11px] text-zinc-600">选择一条内容查看详情</p>
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
        {/* Type badge */}
        <div className="shrink-0 px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.03]
            border border-white/[0.05] text-zinc-500">
            {typeLabels[item.content_type] || "文本"}
          </span>
          <span className="text-[10px] text-zinc-600">
            {item.size > 1024
              ? `${(item.size / 1024).toFixed(1)} KB`
              : `${item.size} B`}
          </span>
        </div>

        {/* Image preview */}
        {item.content_type === "image" && (
          <div className="shrink-0 px-3 pb-2">
            <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.01]">
              <img
                src={`https://asset.localhost/${item.content}`}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
                alt="clipboard"
                className="w-full h-32 object-cover"
                style={{ display: 'none' }} // Hidden until we implement asset serving
              />
              <div className="flex items-center justify-center h-20 text-[10px] text-zinc-600">
                📷 图片已保存
              </div>
            </div>
          </div>
        )}

        {/* Content preview */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-2">
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-words
              max-h-40 overflow-y-auto custom-scrollbar">
              {fullContent || item.content}
            </p>
          </div>

          {/* URLs */}
          {urls.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] text-zinc-600 mb-1">链接 ({urls.length})</p>
              <div className="space-y-0.5">
                {urls.slice(0, 3).map((url, i) => (
                  <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-md
                    bg-white/[0.02] border border-white/[0.03]">
                    <ExternalLink className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
                    <span className="text-[10px] text-violet-400/70 truncate">{url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 px-3 py-2 border-t border-white/[0.05]">
          <p className="text-[10px] text-zinc-600 mb-1.5">操作</p>
          <div className="grid grid-cols-2 gap-1">
            <ActionBtn icon={Copy} label="复制" onClick={onCopy} />
            <ActionBtn icon={Sparkles} label="清理格式" onClick={() => {}} />
            <ActionBtn icon={Link} label="提取链接" onClick={() => {
              const extracted = extractUrls(fullContent).join('\n');
              if (extracted) navigator.clipboard.writeText(extracted);
            }} />
            <ActionBtn icon={FileCode} label="转 Markdown" onClick={() => {
              navigator.clipboard.writeText('```\n' + fullContent + '\n```');
            }} />
            <ActionBtn icon={Trash2} label="删除空行" onClick={() => {
              navigator.clipboard.writeText(removeEmptyLines(fullContent));
            }} />
            <ActionBtn icon={Star} label={item.is_favorite ? "取消收藏" : "收藏"}
              onClick={onToggleFavorite} active={item.is_favorite} />
            <ActionBtn icon={Download} label="导出" onClick={() => {
              const blob = new Blob([fullContent], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `clipboard-${item.id}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }} />
            {item.content_type === "image" || item.content_type === "file" ? (
              <ActionBtn icon={FolderOpen} label="打开位置" onClick={() => {
                invoke("open_file_location", { path: item.content });
              }} />
            ) : (
              <ActionBtn icon={Trash2} label="删除" onClick={onDelete} danger />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ActionBtn({
  icon: Icon, label, onClick, active, danger,
}: {
  icon: typeof Copy; label: string; onClick: () => void; active?: boolean; danger?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] transition-colors ${
        danger ? "text-zinc-600 hover:text-red-400 hover:bg-red-500/8" :
        active ? "text-amber-400 bg-amber-500/8" :
        "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
      }`}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </motion.button>
  );
}
