import { IonIcon } from "@ionic/react";
import {
  alertCircleOutline,
  chatbubbleEllipsesOutline,
  checkmarkCircleOutline,
  checkmarkOutline,
  closeOutline,
  cloudOfflineOutline,
  constructOutline,
  ellipsisHorizontalOutline,
  layersOutline,
  lockClosedOutline,
  searchOutline,
  settingsOutline,
  stopOutline,
  syncOutline,
  terminalOutline,
} from "ionicons/icons";
import { IconButton } from "./ui";

const statusIcons: Record<string, string> = {
  Disconnected: cloudOfflineOutline,
  Connecting: syncOutline,
  Connected: checkmarkOutline,
  Reconnecting: syncOutline,
  Unauthorized: lockClosedOutline,
  "Connection failed": alertCircleOutline,
  Compacting: layersOutline,
  Preparing: constructOutline,
  Prepared: checkmarkOutline,
  Running: terminalOutline,
  Searching: searchOutline,
  Responding: chatbubbleEllipsesOutline,
  Working: ellipsisHorizontalOutline,
  Failed: alertCircleOutline,
  Stopped: stopOutline,
  Idle: checkmarkCircleOutline,
};

export function Toolbar({
  status,
  disabled,
  onSessions,
  onSettings,
}: {
  status: string;
  disabled: boolean;
  onSessions: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4">
      <div className="flex items-center gap-0.5 justify-self-start" role="img" aria-label="Kana">
        <span className="agent-mark small">K</span>
        <span className="brand-name">ana</span>
      </div>
      <div
        className="flex max-w-32 items-center gap-2 text-[15px] font-medium leading-6 text-foreground"
        role="status"
        title={status}
      >
        <IonIcon
          icon={statusIcons[status]}
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="truncate">{status}</span>
      </div>
      <div className="flex justify-self-end">
        <IconButton
          icon={layersOutline}
          label="Sessions"
          disabled={disabled}
          onClick={onSessions}
        />
        <IconButton
          icon={settingsOutline}
          label="Connection settings"
          disabled={disabled}
          onClick={onSettings}
        />
      </div>
    </div>
  );
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex min-h-16 items-center justify-between px-5">
      <h2 className="m-0 text-lg font-semibold tracking-tight">{title}</h2>
      <IconButton icon={closeOutline} label="Close" onClick={onClose} />
    </div>
  );
}
