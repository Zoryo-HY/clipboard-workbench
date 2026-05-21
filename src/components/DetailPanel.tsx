import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, Sparkles, Link, FileCode, Trash2, Star, Download,
  FileText, ExternalLink,
} from "lucide-react";
import type { ClipboardItem } from "../types";

interface Props {
  item: ClipboardItem | null;
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

export function DetailPanel({ item, onCopy, onToggleFavorite, onDelete }: Props) {
  if (!item) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.04]
            flex items-center justify-center mx-auto mb-3">
            <FileText className="w-5 h-5 text-zinc-600" />
          </div>
          <p className="text-xs text-zinc-600">选择一条内容查看详情</p>
        </div>
      </div>
    );
  }

  const urls = extractUrls(item.content);
  const typeLabel =
    item.content_type === "text" ? "文本" :
    item.content_type === "link" ? "链接" :
    item.content_type === "image" ? "图片" :
    item.content_type === "file" ? "文件" :
    item.content_type === "code" ? "代码" : "文本";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={item.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full"
      >
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">{typeLabel}</span>
          <span className="text-[10px] text-zinc-600">
            {item.size > 1024
              ? `${(item.size / 1024).toFixed(1)} KB`
              : `${item.size} B`}
          </span>
        </div>

        {/* Content preview */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-3">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
              {item.content}
            </p>
          </div>

          {/* Extracted URLs */}
          {urls.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-zinc-600 mb-1.5">
                提取链接 ({urls.length})
              </p>
              <div className="space-y-1">
                {urls.slice(0, 5).map((url, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md
                      bg-white/[0.02] border border-white/[0.03]"
                  >
                    <ExternalLink className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="text-[11px] text-violet-400/80 truncate">
                      {url}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 px-4 py-3 border-t border-white/[0.05]">
          <p className="text-[10px] text-zinc-600 mb-2">操作</p>
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn icon={Copy} label="复制" onClick={onCopy} />
            <ActionBtn
              icon={Sparkles}
              label="清理格式"
              onClick={() => {}}
            />
            <ActionBtn
              icon={Link}
              label="提取链接"
              onClick={() => {
                const extracted = extractUrls(item.content).join('\n');
                if (extracted) navigator.clipboard.writeText(extracted);
              }}
            />
            <ActionBtn
              icon={FileCode}
              label="转 Markdown"
              onClick={() => {
                navigator.clipboard.writeText('```\n' + item.content + '\n```');
              }}
            />
            <ActionBtn
              icon={Trash2}
              label="删除空行"
              onClick={() => {
                navigator.clipboard.writeText(removeEmptyLines(item.content));
              }}
            />
            <ActionBtn
              icon={Star}
              label={item.is_favorite ? "取消收藏" : "收藏"}
              onClick={onToggleFavorite}
              active={item.is_favorite}
            />
            <ActionBtn icon={Download} label="导出" onClick={() => {
              const blob = new Blob([item.content], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `clipboard-${item.id}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }} />
            <ActionBtn
              icon={Trash2}
              label="删除"
              onClick={onDelete}
              danger
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px]
        transition-colors ${
          danger
            ? "text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
            : active
              ? "text-amber-400 bg-amber-500/10"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
        }`}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </motion.button>
  );
}
