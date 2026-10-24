import { IonPopover } from "@ionic/react";
import { useMutation } from "@tanstack/react-query";
import { Check, Ellipsis, FastForward, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useIsPresent } from "motion/react";
import { useState } from "react";
import type { Approval, ApprovalDecision } from "../api/types";
import { currentApi, handleActionError } from "../state/connection";
import { approvalTitle, inputBlocks } from "../tools/describe";
import { ToolBlocks } from "./ToolBlocks";
import { MenuItem } from "./Toolbar";
import { Button, IconButton, Spinner } from "./ui";

export function ApprovalCard({ approval, disabled }: { approval: Approval; disabled: boolean }) {
  const present = useIsPresent();
  const [menuEvent, setMenuEvent] = useState<Event>();
  const decision = useMutation({
    mutationFn: (value: ApprovalDecision) => {
      if (!approval.session_id) throw new Error("Missing approval session ID. Reconnect to sync.");
      return currentApi().decide(approval.session_id, approval.id, value);
    },
    onError: handleActionError,
  });
  const unavailable = !present || disabled || decision.isPending;
  function choose(value: ApprovalDecision) {
    setMenuEvent(undefined);
    decision.mutate(value);
  }
  const call = { name: approval.tool_call.name, args: approval.tool_call.arguments };
  const requester = approval.agent.kind === "main" ? "Kana" : approval.agent.label;
  const blocks = inputBlocks(call);
  return (
    <section className="approval-card p-4" aria-label="Tool approval">
      <div className="flex items-start gap-2.5">
        <ShieldAlert
          className="mt-[3px] size-[18px] shrink-0 text-amber-500"
          strokeWidth={2}
          aria-hidden="true"
        />
        <h3 className="m-0 text-[15px] font-semibold leading-6">
          {approvalTitle(call, requester)}
        </h3>
      </div>
      <div className="mt-3 space-y-1 rounded-xl bg-muted/60 px-3.5 pb-2.5 pt-1">
        {blocks.length ? (
          <ToolBlocks blocks={blocks} maxHeight="max-h-40" />
        ) : (
          <p className="m-0 py-1.5 font-mono text-[13px]">{call.name}</p>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <IconButton
          className="mr-auto -ml-2"
          icon={Ellipsis}
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
          <X className="size-4" strokeWidth={2} aria-hidden="true" />
          Reject
        </Button>
        <Button disabled={unavailable} onClick={() => choose("allow")}>
          {decision.isPending ? (
            <Spinner />
          ) : (
            <Check className="size-4" strokeWidth={2} aria-hidden="true" />
          )}
          Allow
        </Button>
      </div>
      <IonPopover
        isOpen={Boolean(menuEvent)}
        event={menuEvent}
        onDidDismiss={() => setMenuEvent(undefined)}
        className="app-menu"
      >
        <div className="flex flex-col p-1.5">
          {approval.allow_always && (
            <MenuItem icon={ShieldCheck} disabled={unavailable} onClick={() => choose("always")}>
              Always trust this command
            </MenuItem>
          )}
          <MenuItem icon={FastForward} disabled={unavailable} onClick={() => choose("never")}>
            Auto-approve this session
          </MenuItem>
        </div>
      </IonPopover>
    </section>
  );
}
