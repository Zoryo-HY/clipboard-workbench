import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Copy, Sparkles, Link, FileCode, Trash2, Star, Download,
  FileText, ExternalLink, FolderOpen, Image, ChevronDown, Check, Layers,
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
  text: "文本", link: "链接", image: "图片", file: "文件", code: "代码", compound: "混合内容",
};

export function DetailPanel({ item, fullContent, onCopy, onToggleFavorite, onDelete }: Props) {
  const [copyLabel, setCopyLabel] = useState("复制");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside closes dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  // Compound that hasn't loaded children yet (undefined, not empty array)
  if (item && item.content_type === "compound" && item.children === undefined) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded bg-surface-2 border border-subtle
            flex items-center justify-center mx-auto mb-3 animate-pulse">
            <Layers className="w-5 h-5 text-zinc-500" />
          </div>
          <p className="text-[13px] text-zinc-500">加载中...</p>
        </div>
      </div>
    );
  }

  // Compound loaded but has no children — error state
  if (item && item.content_type === "compound" && item.children && item.children.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded bg-rose-500/10 border border-rose-500/20
            flex items-center justify-center mx-auto mb-3">
            <Layers className="w-5 h-5 text-rose-400" />
          </div>
          <p className="text-[13px] text-rose-400">子项加载失败</p>
          <p className="text-xs text-zinc-500 mt-1">请刷新后重试</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded bg-surface-2 border border-subtle
            flex items-center justify-center mx-auto mb-3">
            <FileText className="w-5 h-5 text-zinc-500" />
          </div>
          <p className="text-[13px] text-zinc-500">选择内容查看详情</p>
        </div>
      </div>
    );
  }

  // ── Compound view ──
  if (item.content_type === "compound" && item.children && item.children.length > 0) {
    const handleCopyType = async (type: string) => {
      try {
        const label = await invoke<string>("copy_compound_item", { recordId: item.id, itemType: type });
        setCopyLabel(`已复制${label}`);
        setDropdownOpen(false);
        setTimeout(() => setCopyLabel("复制"), 1500);
      } catch (e) {
        console.error("[compound copy]:", e);
      }
    };

    return (
      <div key={item.id} className="flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400">
              混合内容
            </span>
            <span className="text-xs text-zinc-500">{item.children.length} 项</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={onToggleFavorite} className={`p-1 rounded transition-colors ${
              item.is_favorite ? "text-amber-400 hover:bg-amber-500/10" : "text-zinc-500 hover:text-amber-400 hover:bg-surface-2"
            }`}>
              <Star className="w-4 h-4" fill={item.is_favorite ? "currentColor" : "none"} />
            </button>
            <button onClick={onDelete} className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/8 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Children list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-3 space-y-2">
          {item.children.map((child, i) => (
            <ChildItem key={child.id} child={child} index={i} />
          ))}
        </div>

        {/* Tools */}
        <div className="shrink-0 px-4 py-3 border-t border-subtle">
          <p className="text-xs text-zinc-500 mb-2 font-medium">工具</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Smart copy dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded text-xs font-medium
                  transition-colors ${
                    copyLabel !== "复制"
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20"
                  }`}
              >
                {copyLabel !== "复制" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copyLabel}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {dropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-40 rounded-md bg-surface-1 border border-subtle
                  shadow-lg py-0.5 z-50">
                  {item.children?.some(c => c.content_type === "text") && (
                    <button
                      onClick={() => handleCopyType("text")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300
                        hover:bg-surface-2 transition-colors text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      仅复制文本
                    </button>
                  )}
                  {item.children?.some(c => c.content_type === "link") && (
                    <button
                      onClick={() => handleCopyType("link")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300
                        hover:bg-surface-2 transition-colors text-left"
                    >
                      <Link className="w-3.5 h-3.5 text-blue-400" />
                      仅复制链接
                    </button>
                  )}
                  {item.children?.some(c => c.content_type === "code") && (
                    <button
                      onClick={() => handleCopyType("code")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300
                        hover:bg-surface-2 transition-colors text-left"
                    >
                      <FileCode className="w-3.5 h-3.5 text-amber-400" />
                      仅复制代码
                    </button>
                  )}
                  {item.children?.some(c => c.content_type === "image") && (
                    <button
                      onClick={() => handleCopyType("image")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300
                        hover:bg-surface-2 transition-colors text-left"
                    >
                      <Image className="w-3.5 h-3.5 text-emerald-400" />
                      仅复制图片
                    </button>
                  )}
                  {item.children?.some(c => c.content_type === "file") && (
                    <button
                      onClick={() => handleCopyType("file")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300
                        hover:bg-surface-2 transition-colors text-left"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      仅复制文件
                    </button>
                  )}
                  <div className="h-px bg-subtle my-0.5" />
                  <button
                    onClick={() => handleCopyType("all")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300
                      hover:bg-surface-2 transition-colors text-left"
                  >
                    <Layers className="w-3.5 h-3.5 text-rose-400" />
                    复制全部内容
                  </button>
                </div>
              )}
            </div>

            {/* Export text */}
            {item.children?.some(c => c.content_type === "text" || c.content_type === "link" || c.content_type === "code") && (
              <ToolBtn icon={Download} label="导出文本" onClick={() => {
                const textChild = item.children?.find(c => c.content_type === "text" || c.content_type === "link" || c.content_type === "code");
                if (textChild) {
                  const blob = new Blob([textChild.content], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `clipboard-${item.id}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }} />
            )}

            {/* Delete */}
            <ToolBtn icon={Trash2} label="删除" onClick={onDelete} danger />
          </div>
        </div>
      </div>
    );
  }

  const urls = extractUrls(fullContent);

  return (
    <div key={item.id} className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-surface-2 border border-subtle text-zinc-400">
            {typeLabels[item.content_type] || "文本"}
          </span>
          <span className="text-xs text-zinc-500">
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
                : "text-zinc-500 hover:text-amber-400 hover:bg-surface-2"
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
            <div className="rounded overflow-hidden border border-subtle bg-surface-0 relative group">
              <img
                src={`data:image/png;base64,${item.thumbnail}`}
                alt="clipboard"
                className="w-full max-h-64 object-contain cursor-pointer"
                onDoubleClick={() => invoke("open_image", { path: fullContent || item.content })}
              />
              <div className="absolute bottom-2 right-2 text-[10px] text-zinc-400 bg-black/60 px-1.5 py-0.5 rounded
                opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                双击打开原图
              </div>
            </div>
          ) : (
            <div className="rounded border border-subtle bg-surface-0
              flex items-center justify-center h-20 text-sm text-zinc-500">
              缩略图不可用 · 双击文件路径打开
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-3">
        {item.content_type === "file" ? (
          <div className="p-3 rounded bg-surface-0 border border-subtle">
            <p className="text-sm text-zinc-300 font-medium break-words">
              {(fullContent || item.content).split("\\").pop()?.split("/").pop() || fullContent || item.content}
            </p>
            <p className="text-xs text-zinc-500 mt-1 break-all">
              {fullContent || item.content}
            </p>
          </div>
        ) : item.content_type === "image" ? (
          <div className="p-3 rounded bg-surface-0 border border-subtle">
            <p className="text-xs text-zinc-500 break-all">
              {fullContent || item.content}
            </p>
          </div>
        ) : (
          <div className="p-3 rounded bg-surface-0 border border-subtle">
            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap break-words
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
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded
                  bg-surface-2 border border-subtle">
                  <ExternalLink className="w-3 h-3 text-zinc-500 shrink-0" />
                  <span className="text-xs text-violet-400/60 truncate">{url}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tools */}
      <div className="shrink-0 px-4 py-3 border-t border-subtle">
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
    </div>
  );
}

// ── Child item for compound detail ──

function ChildItem({ child, index }: { child: ClipboardItem; index: number }) {
  const imgBase64 = child.content_type === "image" && child.thumbnail
    ? `data:image/png;base64,${child.thumbnail}`
    : null;

  return (
    <div className="p-3 rounded bg-surface-0 border border-subtle">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-2 text-zinc-500">
          {typeLabels[child.content_type] || "文本"}
          <span className="ml-1 text-zinc-600">#{index + 1}</span>
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => invoke("copy_to_clipboard", { id: child.id })}
            className="p-1 rounded text-zinc-500 hover:text-violet-400 hover:bg-surface-2 transition-colors"
            title="复制此项"
          >
            <Copy className="w-3 h-3" />
          </button>
          {child.content_type === "image" && (
            <>
              <button
                onClick={() => invoke("open_image", { path: child.content })}
                className="p-1 rounded text-zinc-500 hover:text-emerald-400 hover:bg-surface-2 transition-colors"
                title="打开原图"
              >
                <Image className="w-3 h-3" />
              </button>
              <button
                onClick={() => invoke("open_file_location", { path: child.content })}
                className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-surface-2 transition-colors"
                title="打开文件位置"
              >
                <FolderOpen className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {child.content_type === "image" && imgBase64 ? (
        <img
          src={imgBase64}
          alt="child"
          className="w-full max-h-48 object-contain rounded cursor-pointer"
          onDoubleClick={() => invoke("open_image", { path: child.content })}
        />
      ) : child.content_type === "file" ? (
        <div className="text-sm text-zinc-300 break-all">
          <p className="font-medium">
            {(child.content).split("\\").pop()?.split("/").pop() || child.content}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{child.content}</p>
        </div>
      ) : (
        <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
          {child.content}
        </p>
      )}
    </div>
  );
}

function ToolBtn({
  icon: Icon, label, onClick, danger,
}: {
  icon: typeof Copy; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded text-xs
        font-medium transition-colors ${
          danger
            ? "text-zinc-500 hover:text-red-400 hover:bg-red-500/6"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-surface-2"
        }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );
}
