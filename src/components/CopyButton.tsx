import { checkmarkOutline, copyOutline } from "ionicons/icons";
import { useState } from "react";
import { useClientStore } from "../state/store";
import { IconButton } from "./ui";

export function CopyButton({
  value,
  label = "Copy",
  disabled = false,
}: {
  value: string;
  label?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      icon={copied ? checkmarkOutline : copyOutline}
      label={copied ? "Copied" : label}
      disabled={disabled}
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
