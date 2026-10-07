import {
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPopover,
  IonSpinner,
} from "@ionic/react";
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
    <section className="approval-card" aria-label="Tool approval">
      <div className="approval-title">
        <IonIcon icon={shieldCheckmarkOutline} />
        <strong>Approval</strong>
        <span>{approval.agent.label}</span>
      </div>
      <p className="approval-tool">{approval.tool_call.name}</p>
      <pre>{formatValue(approval.tool_call.arguments)}</pre>
      <div className="approval-buttons">
        <IonButton
          className="approval-more"
          size="small"
          fill="clear"
          color="medium"
          aria-label="More approval options"
          title="More approval options"
          disabled={unavailable}
          onClick={(event) => setMenuEvent(event.nativeEvent)}
        >
          <IonIcon slot="icon-only" icon={ellipsisHorizontal} />
        </IonButton>
        <IonButton
          size="small"
          fill="clear"
          color="medium"
          aria-label="Reject and stop"
          disabled={unavailable}
          onClick={() => choose("reject")}
        >
          <IonIcon slot="start" icon={closeOutline} />
          Reject
        </IonButton>
        <IonButton size="small" disabled={unavailable} onClick={() => choose("allow")}>
          {decision.isPending ? (
            <IonSpinner name="crescent" />
          ) : (
            <>
              <IonIcon slot="start" icon={checkmarkOutline} />
              Allow once
            </>
          )}
        </IonButton>
      </div>
      <IonPopover
        isOpen={Boolean(menuEvent)}
        event={menuEvent}
        onDidDismiss={() => setMenuEvent(undefined)}
        className="approval-menu"
      >
        <IonList lines="none">
          {approval.allow_always && (
            <IonItem button detail={false} disabled={unavailable} onClick={() => choose("always")}>
              <IonLabel>Always trust this command</IonLabel>
            </IonItem>
          )}
          <IonItem button detail={false} disabled={unavailable} onClick={() => choose("never")}>
            <IonLabel>Auto-approve this session</IonLabel>
          </IonItem>
        </IonList>
      </IonPopover>
    </section>
  );
}
