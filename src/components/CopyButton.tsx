import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useClientStore } from "../state/store";
import { IconButton } from "./ui";

export function CopyButton({
  value,
  label = "Copy",
  disabled = false,
  className,
  small,
}: {
  value: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  small?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      icon={copied ? Check : Copy}
      label={copied ? "Copied" : label}
      disabled={disabled}
      className={className}
      small={small}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_500);
        } catch {
          useClientStore.getState().notify("Copy failed. Select the text to copy it manually.");
        }
      }}
    />
  );
}
