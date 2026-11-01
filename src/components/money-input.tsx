import type { InputHTMLAttributes } from "react";

/** Digits only ("1000000"). Anything else typed is dropped. */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, "");
}

/** "1000000" → "1.000.000" (Indonesian grouping). Empty stays empty. */
export function formatRupiahDigits(digits: string): string {
  const clean = digitsOnly(digits).replace(/^0+(?=\d)/, "");
  return clean ? Number(clean).toLocaleString("id-ID") : "";
}

/**
 * Rupiah field: shows "1.000.000" while the stored value stays digits. Parent code keeps the
 * digit string (or converts it with Number) so calculations and the server never see dots.
 * The "Rp" unit is shown by the surrounding label, as the rest of the app does.
 */
export function MoneyInput({
  value,
  onValueChange,
  placeholder = "Rp 1.000.000",
  ...rest
}: {
  value: string;
  onValueChange: (digits: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatRupiahDigits(value)}
      placeholder={placeholder}
      onChange={(event) => onValueChange(digitsOnly(event.target.value))}
    />
  );
}
