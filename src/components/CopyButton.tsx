import { IonIcon } from "@ionic/react";
import { checkmarkOutline, copyOutline } from "ionicons/icons";
import { useState } from "react";
import { useClientStore } from "../state/store";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_500);
        } catch {
          useClientStore.getState().notify("Copy failed. Select the text to copy it manually.");
        }
      }}
    >
      <IonIcon icon={copied ? checkmarkOutline : copyOutline} />
    </button>
  );
}
