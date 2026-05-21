import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索..."
        className="w-full h-8 pl-8 pr-7 bg-white/[0.03] border border-white/[0.04]
          rounded-md text-sm text-zinc-300 placeholder:text-zinc-600
          outline-none ring-0 focus:border-violet-500/20 focus:bg-white/[0.04]
          transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded
            hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
