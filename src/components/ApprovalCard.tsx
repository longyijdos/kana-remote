import { IonButton, IonIcon, IonSpinner } from "@ionic/react";
import { useMutation } from "@tanstack/react-query";
import { shieldCheckmarkOutline } from "ionicons/icons";
import type { Approval } from "../api/types";
import { currentApi, handleActionError } from "../state/connection";
import { formatValue } from "./ToolCard";

export function ApprovalCard({ approval, disabled }: { approval: Approval; disabled: boolean }) {
  const decision = useMutation({
    mutationFn: (value: "allow" | "reject") => {
      if (!approval.session_id) throw new Error("审批缺少会话 ID，请重新同步。");
      return currentApi().decide(approval.session_id, approval.id, value);
    },
    onError: handleActionError,
  });
  return (
    <section className="approval-card" aria-label="待审批工具">
      <div className="approval-title">
        <IonIcon icon={shieldCheckmarkOutline} />
        <strong>需要你的允许</strong>
        <span>{approval.agent.label}</span>
      </div>
      <p className="approval-tool">{approval.tool_call.name}</p>
      <pre>{formatValue(approval.tool_call.arguments)}</pre>
      <div className="approval-buttons">
        <IonButton
          size="small"
          fill="outline"
          color="medium"
          disabled={disabled || decision.isPending}
          onClick={() => decision.mutate("reject")}
        >
          拒绝并停止
        </IonButton>
        <IonButton
          size="small"
          disabled={disabled || decision.isPending}
          onClick={() => decision.mutate("allow")}
        >
          {decision.isPending ? <IonSpinner name="crescent" /> : "允许这一次"}
        </IonButton>
      </div>
    </section>
  );
}
