import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  open: boolean;
  currentMod: string;
  currentKey: string;
  onSave: (modifiers: string, key: string) => void;
  onClose: () => void;
}

const modLabels: Record<string, string> = {
  Control: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
  Super: "Win",
};

export function ShortcutCapture({ open, currentMod, currentKey, onSave, onClose }: Props) {
  const [capturedMods, setCapturedMods] = useState<string[]>([]);
  const [capturedKey, setCapturedKey] = useState("");
  const [phase, setPhase] = useState<"waiting" | "done">("waiting");

  const codeToName = (code: string): string => {
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code === "Space") return "Space";
    if (code.startsWith("F") && code.length <= 4) return code;
    return code;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (phase === "done") return;

    const mods: string[] = [];
    if (e.ctrlKey) mods.push("Control");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    if (e.metaKey) mods.push("Super");

    if (e.code.startsWith("Control") || e.code.startsWith("Alt") ||
        e.code.startsWith("Shift") || e.code.startsWith("Meta")) {
      setCapturedMods(mods);
      return;
    }

    setCapturedMods(mods);
    setCapturedKey(codeToName(e.code));
    setPhase("done");

    const modifiers = mods.length > 0 ? mods.join("+") : "Control";
    const key = codeToName(e.code);
    setTimeout(() => {
      onSave(modifiers, key);
    }, 600);
  };

  useEffect(() => {
    if (!open) return;
    setCapturedMods([]);
    setCapturedKey("");
    setPhase("waiting");
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open]);

  if (!open) return null;

  const displayMods = capturedMods.length > 0
    ? capturedMods.map((m) => modLabels[m] || m).join(" + ")
    : currentMod;

  const displayKey = capturedKey || currentKey;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[320px] p-6 rounded bg-surface-2 border border-subtle shadow-2xl"
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">设置快捷键</h3>
        <p className="text-xs text-zinc-500 mb-4">
          {phase === "waiting" ? "按下组合键…" : "快捷键已捕获，自动保存中…"}
        </p>

        <div className="mb-4 p-3 rounded bg-surface-0 border border-violet-500/10">
          <p className="text-xs text-zinc-500 mb-1">
            {phase === "waiting" ? "按下快捷键" : "已捕获"}
          </p>
          <div className="flex items-center justify-center gap-2">
            {phase === "done" && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2"
              >
                {capturedMods.map((m) => (
                  <kbd key={m} className="px-2.5 py-1.5 rounded bg-violet-500/15 border border-violet-500/20
                    text-lg text-violet-300 font-mono font-semibold">
                    {modLabels[m] || m}
                  </kbd>
                ))}
                {capturedKey && (
                  <>
                    {capturedMods.length > 0 && <span className="text-zinc-500 text-sm">+</span>}
                    <kbd className="px-2.5 py-1.5 rounded bg-violet-500/15 border border-violet-500/20
                      text-lg text-violet-300 font-mono font-semibold">
                      {capturedKey}
                    </kbd>
                  </>
                )}
              </motion.div>
            )}
            {phase === "waiting" && (
              <div className="flex items-center gap-2">
                {currentMod.split("+").map((m) => (
                  <kbd key={m} className="px-2.5 py-1.5 rounded bg-surface-0 border border-subtle
                    text-lg text-zinc-300 font-mono font-semibold">
                    {modLabels[m] || m}
                  </kbd>
                ))}
                <span className="text-zinc-500 text-sm">+</span>
                <kbd className="px-2.5 py-1.5 rounded bg-surface-0 border border-subtle
                  text-lg text-zinc-300 font-mono font-semibold">
                  {currentKey}
                </kbd>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">
            {phase === "waiting" ? "按 Esc 或点击外部取消" : "已保存"}
          </span>
          <motion.div
            animate={{ opacity: phase === "done" ? 1 : 0 }}
            className="w-2 h-2 rounded-full bg-emerald-400"
          />
        </div>
      </motion.div>
    </div>
  );
}
