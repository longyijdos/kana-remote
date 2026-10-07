import { IonIcon } from "@ionic/react";
import { checkmarkOutline, copyOutline } from "ionicons/icons";
import { useState } from "react";
import { useClientStore } from "../state/store";

export function CopyButton({ value, label = "复制" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_500);
        } catch {
          useClientStore.getState().notify("复制失败，请长按选择文本复制。");
        }
      }}
    >
      <IonIcon icon={copied ? checkmarkOutline : copyOutline} />
      <span>{copied ? "已复制" : label}</span>
    </button>
  );
}
