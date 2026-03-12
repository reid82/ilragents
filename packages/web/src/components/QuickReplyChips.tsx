"use client";

import { useState, useCallback } from "react";

interface QuickReplyChipsProps {
  options: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export default function QuickReplyChips({ options, onSelect, disabled }: QuickReplyChipsProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = useCallback((option: string) => {
    if (disabled || selected) return;
    setSelected(option);
    setTimeout(() => { onSelect(option); }, 200);
  }, [disabled, selected, onSelect]);

  return (
    <div className="flex flex-wrap gap-2 pl-[38px] mt-2">
      {options.map((option) => (
        <button
          key={option} onClick={() => handleSelect(option)}
          disabled={disabled || !!selected}
          className={`text-sm transition-all ${selected === option ? "animate-chip-select" : ""}`}
          style={{
            borderRadius: "20px", padding: "10px 16px",
            background: selected === option ? "var(--primary-subtle)" : "var(--surface-2)",
            border: `1px solid ${selected === option ? "var(--primary)" : "var(--border-default)"}`,
            color: selected === option ? "var(--primary-light)" : "var(--text-secondary)",
            opacity: selected && selected !== option ? 0.4 : 1,
            cursor: disabled || selected ? "default" : "pointer",
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
