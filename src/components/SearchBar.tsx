import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索剪贴板..."
        className="w-full h-7 pl-7 pr-7 bg-white/[0.02] border border-white/[0.04]
          rounded-md text-[11px] text-zinc-300 placeholder:text-zinc-600
          outline-none ring-0 focus:border-violet-500/20 focus:bg-white/[0.03]
          transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded
            hover:bg-white/10 text-zinc-600 hover:text-zinc-400"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
