import { IonIcon, IonPopover } from "@ionic/react";
import { useMutation } from "@tanstack/react-query";
import {
  checkmarkOutline,
  closeOutline,
  ellipsisHorizontal,
  shieldCheckmarkOutline,
} from "ionicons/icons";
import { useState } from "react";
import type { Approval, ApprovalDecision } from "../api/types";
import { currentApi, handleActionError } from "../state/connection";
import { formatValue } from "./ToolCard";
import { Button, IconButton, Spinner } from "./ui";

export function ApprovalCard({ approval, disabled }: { approval: Approval; disabled: boolean }) {
  const [menuEvent, setMenuEvent] = useState<Event>();
  const decision = useMutation({
    mutationFn: (value: ApprovalDecision) => {
      if (!approval.session_id) throw new Error("Missing approval session ID. Reconnect to sync.");
      return currentApi().decide(approval.session_id, approval.id, value);
    },
    onError: handleActionError,
  });
  const unavailable = disabled || decision.isPending;
  function choose(value: ApprovalDecision) {
    setMenuEvent(undefined);
    decision.mutate(value);
  }
  return (
    <section className="surface-card p-4" aria-label="Tool approval">
      <div className="flex items-center gap-2.5">
        <IonIcon className="size-5" icon={shieldCheckmarkOutline} aria-hidden="true" />
        <strong className="text-base font-medium">Approval</strong>
        <span className="ml-auto text-sm text-muted-foreground">{approval.agent.label}</span>
      </div>
      <p className="mb-2 mt-4 font-mono text-sm">{approval.tool_call.name}</p>
      <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6 select-text">
        {formatValue(approval.tool_call.arguments)}
      </pre>
      <div className="mt-4 flex items-center gap-2">
        <IconButton
          className="mr-auto"
          icon={ellipsisHorizontal}
          label="More approval options"
          disabled={unavailable}
          onClick={(event) => setMenuEvent(event.nativeEvent)}
        />
        <Button
          variant="secondary"
          aria-label="Reject and stop"
          disabled={unavailable}
          onClick={() => choose("reject")}
        >
          <IonIcon className="size-4" icon={closeOutline} aria-hidden="true" />
          Reject
        </Button>
        <Button disabled={unavailable} onClick={() => choose("allow")}>
          {decision.isPending ? (
            <Spinner />
          ) : (
            <IonIcon className="size-4" icon={checkmarkOutline} aria-hidden="true" />
          )}
          Allow once
        </Button>
      </div>
      <IonPopover
        isOpen={Boolean(menuEvent)}
        event={menuEvent}
        onDidDismiss={() => setMenuEvent(undefined)}
        className="approval-menu"
      >
        <div className="flex flex-col p-2">
          {approval.allow_always && (
            <button
              type="button"
              className="rounded-xl bg-transparent px-3 py-3 text-left text-sm text-foreground hover:bg-muted/50"
              disabled={unavailable}
              onClick={() => choose("always")}
            >
              Always trust this command
            </button>
          )}
          <button
            type="button"
            className="rounded-xl bg-transparent px-3 py-3 text-left text-sm text-foreground hover:bg-muted/50"
            disabled={unavailable}
            onClick={() => choose("never")}
          >
            Auto-approve this session
          </button>
        </div>
      </IonPopover>
    </section>
  );
}
