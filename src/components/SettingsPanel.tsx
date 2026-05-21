import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, HardDrive, Trash2, Keyboard, Monitor, Play } from "lucide-react";
import type { Settings } from "../types";

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onBack: () => void;
}

export function SettingsPanel({ settings, onSave, onBack }: Props) {
  const [maxText, setMaxText] = useState(settings.max_text_length);
  const [maxImg, setMaxImg] = useState(settings.max_image_size_mb);
  const [maxFile, setMaxFile] = useState(settings.max_file_size_mb);
  const [storage, setStorage] = useState(settings.total_storage_limit_mb);
  const [autoClean, setAutoClean] = useState(settings.auto_clean_days > 0);
  const [cleanDays, setCleanDays] = useState(
    settings.auto_clean_days > 0 ? settings.auto_clean_days : 30
  );
  const [startMinimized, setStartMinimized] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave({
      max_text_length: maxText,
      max_image_size_mb: maxImg,
      max_file_size_mb: maxFile,
      total_storage_limit_mb: storage,
      auto_clean_days: autoClean ? cleanDays : 0,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="flex flex-col flex-1 min-h-0"
    >
      <div className="shrink-0 px-3.5 pt-2 pb-1.5 flex items-center gap-2.5">
        <button
          onClick={onBack}
          className="p-0.5 -ml-0.5 rounded-md text-zinc-500 hover:text-zinc-300
            hover:bg-white/[0.04] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-[11px] font-semibold text-zinc-300">设置</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-3.5 space-y-3 pb-3">
        {/* Storage */}
        <Section icon={HardDrive} title="存储限制">
          <SliderRow label="文本长度限制" value={maxText} min={500} max={50000} step={500} unit="字" onChange={setMaxText} />
          <SliderRow label="图片大小限制" value={maxImg} min={1} max={50} step={1} unit="MB" onChange={setMaxImg} />
          <SliderRow label="文件大小限制" value={maxFile} min={1} max={200} step={5} unit="MB" onChange={setMaxFile} />
          <div className="mt-1 pt-2.5 border-t border-white/[0.04]">
            <SliderRow label="总存储空间" value={storage} min={50} max={2000} step={50} unit="MB" onChange={setStorage} />
          </div>
        </Section>

        {/* Auto clean */}
        <Section icon={Trash2} title="自动清理">
          <ToggleRow
            label="自动删除过期内容"
            description="超过设定天数的非收藏内容将被自动删除"
            checked={autoClean}
            onChange={setAutoClean}
          />
          {autoClean && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2.5">
              <SliderRow label="保留天数" value={cleanDays} min={1} max={90} step={1} unit="天" onChange={setCleanDays} />
            </motion.div>
          )}
        </Section>

        {/* Shortcut */}
        <Section icon={Keyboard} title="快捷键">
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500">呼出窗口</label>
            <div className="flex items-center gap-1.5">
              <kbd className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]
                text-[10px] text-zinc-400 font-mono">Ctrl</kbd>
              <span className="text-zinc-600 text-[10px]">+</span>
              <kbd className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]
                text-[10px] text-zinc-400 font-mono">Space</kbd>
            </div>
            <p className="text-[10px] text-zinc-700">自定义快捷键功能即将推出</p>
          </div>
        </Section>

        {/* Startup */}
        <Section icon={Play} title="启动行为">
          <ToggleRow
            label="启动时最小化到托盘"
            description="开启后软件启动时不会弹出窗口"
            checked={startMinimized}
            onChange={setStartMinimized}
          />
        </Section>

        {/* Theme placeholder */}
        <Section icon={Monitor} title="外观">
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500">主题</label>
            <div className="flex gap-1.5">
              <div className="px-2.5 py-1 rounded-md bg-violet-500/10 border border-violet-500/15
                text-[10px] text-violet-300">深色</div>
              <div className="px-2.5 py-1 rounded-md bg-white/[0.02] border border-white/[0.04]
                text-[10px] text-zinc-600 cursor-not-allowed">浅色 (即将推出)</div>
            </div>
          </div>
        </Section>

        {/* Save */}
        <button
          onClick={handleSave}
          className={`w-full h-8 rounded-lg text-[11px] font-medium transition-colors ${
            saved
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
              : "bg-violet-500/10 text-violet-300 border border-violet-500/15 hover:bg-violet-500/15"
          }`}
        >
          {saved ? "已保存" : "保存设置"}
        </button>

        <p className="text-center text-[10px] text-zinc-700 pb-1.5">
          Clipboard Workbench v0.1.0
        </p>
      </div>
    </motion.div>
  );
}

function Section({ icon: Icon, title, children }: {
  icon: typeof HardDrive; title: string; children: React.ReactNode;
}) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="w-3 h-3 text-zinc-500" />
        <h3 className="text-[10px] font-medium text-zinc-400">{title}</h3>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-[10px] text-zinc-500">{label}</label>
        <span className="text-[10px] text-zinc-400 tabular-nums font-medium">
          {value.toLocaleString()} {unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
      />
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[10px] text-zinc-400">{label}</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">{description}</p>
      </div>
      <div className={`toggle-track ${checked ? "active" : ""}`} onClick={() => onChange(!checked)}>
        <div className="toggle-thumb" />
      </div>
    </div>
  );
}
