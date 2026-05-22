import { useState } from "react";
import { FileText, Link, Image, File, Code2, Star, Trash2 } from "lucide-react";
import type { ClipboardItem } from "../types";

interface Props {
  item: ClipboardItem;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onDoubleClickImage?: () => void;
  onDoubleClickText?: () => void;
}

const typeConfig: Record<string, { icon: typeof FileText; label: string; accent: string }> = {
  text:   { icon: FileText, label: "文本", accent: "text-zinc-400" },
  link:   { icon: Link, label: "链接", accent: "text-violet-400" },
  image:  { icon: Image, label: "图片", accent: "text-emerald-400" },
  file:   { icon: File, label: "文件", accent: "text-amber-400" },
  code:   { icon: Code2, label: "代码", accent: "text-sky-400" },
};

const fileExtIcons: Record<string, string> = {
  pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊",
  ppt: "📽", pptx: "📽", zip: "📦", rar: "📦", "7z": "📦",
  exe: "⚙", dll: "🔧", png: "🖼", jpg: "🖼", jpeg: "🖼",
  gif: "🖼", svg: "🖼", webp: "🖼", mp3: "🎵", wav: "🎵",
  mp4: "🎬", avi: "🎬", mov: "🎬", py: "🐍", rs: "🦀",
  js: "📜", ts: "📜", html: "🌐", css: "🎨", json: "📋",
};

function getFileExtIcon(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return fileExtIcons[ext] || "📁";
}

function fileName(path: string): string {
  const name = path.split("\\").pop() || path.split("/").pop() || path;
  return name;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.floor(hr / 24)} 天前`;
}

export function HistoryItem({ item, isSelected, onClick, onContextMenu, onToggleFavorite, onDelete, onDoubleClickImage, onDoubleClickText }: Props) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const config = typeConfig[item.content_type] || typeConfig.text;
  const Icon = config.icon;

  const renderContent = () => {
    if (item.content_type === "image" && item.thumbnail) {
      return (
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-14 h-14 rounded overflow-hidden bg-surface-0 border border-subtle relative">
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
              </div>
            )}
            <img
              src={`data:image/png;base64,${item.thumbnail}`}
              alt="clipboard"
              className={`w-full h-full object-cover ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgLoaded(true)}
              onDoubleClick={(e) => { e.stopPropagation(); onDoubleClickImage?.(); }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Image className={`w-3.5 h-3.5 ${config.accent}`} />
              <span className={`text-xs font-medium ${config.accent}`}>{config.label}</span>
              {item.size > 0 && (
                <span className="text-[11px] text-zinc-600">
                  {(item.size / 1024).toFixed(0)} KB
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1">{timeAgo(item.created_at)}</p>
          </div>
        </div>
      );
    }

    if (item.content_type === "file") {
      const name = fileName(item.content);
      const extIcon = getFileExtIcon(item.content);
      return (
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded bg-surface-2 border border-subtle flex items-center justify-center text-lg">
            {extIcon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-200 truncate font-medium">{name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{timeAgo(item.created_at)} · {config.label}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-3">
        <div className={`shrink-0 mt-0.5 w-7 h-7 rounded flex items-center justify-center ${
          isSelected ? "bg-violet-500/12" : "bg-surface-2"
        }`}>
          <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-violet-400" : config.accent}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 leading-[1.5] line-clamp-2 break-words font-medium">
            {item.content.slice(0, 160)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-500">{timeAgo(item.created_at)}</span>
            <span className="text-[11px] text-zinc-600">{config.label}</span>
            {item.size > 1024 && (
              <span className="text-[11px] text-zinc-600">
                {(item.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      onClick={onClick}
      onDoubleClick={() => {
        if (item.content_type !== "image") {
          onDoubleClickText?.();
        }
      }}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group px-3 py-3 cursor-pointer transition-colors ${
        isSelected ? "card-selected" : "card border-transparent"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>

        {/* Hover actions */}
        <div className={`shrink-0 flex items-center gap-0.5 transition-opacity duration-100 ${
          hovered || item.is_favorite ? "opacity-100" : "opacity-0"
        }`}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={`p-1 rounded transition-colors ${
              item.is_favorite
                ? "text-amber-400 hover:bg-amber-500/10"
                : "text-zinc-500 hover:text-amber-400 hover:bg-surface-3"
            }`}
            title={item.is_favorite ? "取消收藏" : "收藏"}
          >
            <Star className="w-4 h-4" fill={item.is_favorite ? "currentColor" : "none"} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/8 transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
