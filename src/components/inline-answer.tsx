import { useState, type ReactNode } from "react";
import { ArrowUp } from "lucide-react";

/**
 * A typed answer inside Travo's bubble: the question is asked here, so the traveler answers here
 * (no need to find the message box). Used by every chat topic and by the planning wizard.
 */
export function InlineAnswer({
  placeholder,
  onSubmit,
  type = "text",
  inputMode,
  min,
  max,
  maxLength = 600,
  submitLabel = "Kirim",
  prefix,
  autoFocus = false,
  format,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  type?: "text" | "date" | "number";
  inputMode?: "numeric" | "decimal" | "text";
  min?: string | number;
  max?: string | number;
  maxLength?: number;
  submitLabel?: string;
  prefix?: ReactNode;
  autoFocus?: boolean;
  /** Shapes what is typed (digits only, thousands dots, ...). */
  format?: (raw: string) => string;
}) {
  const [value, setValue] = useState("");
  const ready = value.trim().length > 0;
  return (
    <form
      className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2"
      data-testid="inline-answer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSubmit(value.trim());
        setValue("");
      }}
    >
      {prefix}
      <input
        value={value}
        onChange={(event) => setValue(format ? format(event.target.value) : event.target.value)}
        type={type}
        inputMode={inputMode}
        min={min}
        max={max}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="send"
        autoFocus={autoFocus}
        className="min-h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-3 text-[13px] outline-none focus:border-brand-red"
      />
      <button
        type="submit"
        disabled={!ready}
        aria-label={submitLabel}
        className="tap inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-red text-white disabled:opacity-40"
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}
