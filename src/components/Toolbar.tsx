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
import { AnimatePresence, motion } from "motion/react";
import { IconButton } from "./ui";

const statusIcons: Record<string, string> = {
  Disconnected: cloudOfflineOutline,
  Connecting: syncOutline,
  Connected: checkmarkOutline,
  Reconnecting: syncOutline,
  Unauthorized: lockClosedOutline,
  Offline: alertCircleOutline,
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

const statusColors: Record<string, string> = {
  Disconnected: "text-muted-foreground",
  Connecting: "text-sky-600 dark:text-sky-400",
  Connected: "text-emerald-600 dark:text-emerald-400",
  Reconnecting: "text-sky-600 dark:text-sky-400",
  Unauthorized: "text-rose-600 dark:text-rose-400",
  Offline: "text-rose-600 dark:text-rose-400",
  Compacting: "text-sky-600 dark:text-sky-400",
  Preparing: "text-sky-600 dark:text-sky-400",
  Prepared: "text-sky-600 dark:text-sky-400",
  Running: "text-sky-600 dark:text-sky-400",
  Searching: "text-sky-600 dark:text-sky-400",
  Responding: "text-sky-600 dark:text-sky-400",
  Working: "text-sky-600 dark:text-sky-400",
  Failed: "text-rose-600 dark:text-rose-400",
  Stopped: "text-muted-foreground",
  Idle: "text-emerald-600 dark:text-emerald-400",
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
        className="grid max-w-32 items-center text-base font-bold leading-6"
        role="status"
        title={status}
      >
        <AnimatePresence initial={false}>
          <motion.span
            key={status}
            className={`col-start-1 row-start-1 flex min-w-0 items-center justify-center gap-2 ${statusColors[status]}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <IonIcon
              icon={statusIcons[status]}
              className="size-[18px] shrink-0"
              aria-hidden="true"
            />
            <span className="truncate">{status}</span>
          </motion.span>
        </AnimatePresence>
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
