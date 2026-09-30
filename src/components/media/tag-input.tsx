"use client";

import { PlusIcon, TagIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { normalizeSearchText } from "@/lib/search";
import { cn } from "@/lib/utils";

type TagOption = { id: number; name: string; count?: number };

/**
 * Text input with autocomplete over existing tags. Enter picks the highlighted
 * suggestion or creates a new tag from the typed text.
 */
export function TagInput({
  suggestions,
  exclude = [],
  onPick,
  autoFocus,
  placeholder = "Add a tag…",
}: {
  suggestions: TagOption[];
  exclude?: string[];
  onPick: (name: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const excluded = useMemo(() => new Set(exclude.map((name) => name.toLowerCase())), [exclude]);

  const trimmed = value.trim();
  const matches = useMemo(() => {
    const needle = normalizeSearchText(trimmed);
    return suggestions
      .filter((tag) => !excluded.has(tag.name.toLowerCase()))
      .filter((tag) => !needle || normalizeSearchText(tag.name).includes(needle))
      .sort((a, b) => {
        const aStarts = normalizeSearchText(a.name).startsWith(needle) ? 0 : 1;
        const bStarts = normalizeSearchText(b.name).startsWith(needle) ? 0 : 1;
        return aStarts - bStarts || (b.count ?? 0) - (a.count ?? 0);
      })
      .slice(0, 8);
  }, [suggestions, excluded, trimmed]);

  const exactMatch = matches.some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
  const options: Array<{ key: string; name: string; create: boolean; count?: number }> = [
    ...matches.map((tag) => ({ key: `t${tag.id}`, name: tag.name, create: false, count: tag.count })),
    ...(trimmed && !exactMatch && !excluded.has(trimmed.toLowerCase()) ? [{ key: "create", name: trimmed, create: true }] : []),
  ];

  const pick = (name: string) => {
    onPick(name);
    setValue("");
    setHighlight(0);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        maxLength={40}
        onChange={(event) => {
          setValue(event.target.value);
          setHighlight(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((h) => Math.min(h + 1, options.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const option = options[highlight] ?? (trimmed ? { name: trimmed } : null);
            if (option) pick(option.name);
          }
        }}
      />
      {options.length > 0 && (
        <ul id={listId} role="listbox" className="max-h-56 overflow-y-auto rounded-md border border-border bg-black/20 p-1">
          {options.map((option, index) => (
            <li key={option.key} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(option.name)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-foreground/90",
                  index === highlight && "bg-white/[0.07] text-foreground",
                )}
              >
                {option.create ? <PlusIcon className="size-3.5 text-muted-foreground" /> : <TagIcon className="size-3.5 text-muted-foreground" />}
                <span className="truncate">{option.create ? `Create “${option.name}”` : option.name}</span>
                {option.count != null && <span className="ml-auto text-[11px] text-subtle-foreground">{option.count}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
