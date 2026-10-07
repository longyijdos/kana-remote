import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import { arrowUpOutline, layersOutline, settingsOutline, stopOutline } from "ionicons/icons";
import { useState } from "react";
import { ApprovalCard } from "../components/ApprovalCard";
import { ConnectionForm } from "../components/ConnectionForm";
import { MessageList } from "../components/MessageList";
import { SessionsModal } from "../components/SessionsModal";
import { currentApi, currentSessionId, handleActionError, reconnect } from "../state/connection";
import { useClientStore } from "../state/store";

const connectionLabels = {
  disconnected: "已断开",
  connecting: "连接中",
  connected: "已连接",
  reconnecting: "重新同步中",
  unauthorized: "认证失败",
  error: "连接失败",
};

export function ChatPage() {
  const snapshot = useClientStore((state) => state.snapshot);
  const status = useClientStore((state) => state.status);
  const settings = useClientStore((state) => state.settings);
  const connectionError = useClientStore((state) => state.connectionError);
  const compacting = useClientStore((state) => state.compacting);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const busy = useIsMutating() > 0;
  const online = status === "connected";
  const running = snapshot?.running ?? false;
  const approvals = snapshot?.approvals ?? [];
  const pending = snapshot?.input_queue.pending ?? [];
  const activity = approvals.length
    ? "等待你的审批"
    : compacting
      ? "正在整理上下文"
      : running
        ? "正在工作"
        : snapshot?.run?.status === "failed" || snapshot?.run?.outcome === "error"
          ? "运行失败"
          : snapshot?.run?.outcome === "aborted"
            ? "已停止"
            : "空闲，等待指令";
  const send = useMutation({
    mutationFn: ({ message, delivery }: { message: string; delivery: "auto" | "queue" }) =>
      currentApi().send(currentSessionId(), message, delivery),
    onSuccess(receipt, variables) {
      setDraft((value) => (value === variables.message ? "" : value));
      useClientStore
        .getState()
        .notify(
          receipt.delivery === "queued"
            ? "已加入队列"
            : receipt.delivery === "steering"
              ? "已发送，Agent 将在下一步接收"
              : "已发送",
        );
    },
    onError: handleActionError,
  });
  const stop = useMutation({
    mutationFn: () => currentApi().abort(currentSessionId()),
    onSuccess: () => useClientStore.getState().notify("已请求停止；队列里的指令仍会继续执行。"),
    onError: handleActionError,
  });
  const canSend = online && Boolean(snapshot?.session) && !busy && Boolean(draft.trim());

  return (
    <IonPage>
      <IonHeader className="app-header">
        <IonToolbar>
          <div className="header-brand" slot="start">
            <span className="agent-mark small">K</span>
            <div>
              <strong>Kana Remote</strong>
              <span className={`connection-status ${online ? "online" : ""}`}>
                <i />
                {connectionLabels[status]}
              </span>
            </div>
          </div>
          <IonButtons slot="end">
            <IonButton aria-label="会话" disabled={busy} onClick={() => setSessionsOpen(true)}>
              <IonIcon slot="icon-only" icon={layersOutline} />
            </IonButton>
            <IonButton aria-label="连接设置" disabled={busy} onClick={() => setSettingsOpen(true)}>
              <IonIcon slot="icon-only" icon={settingsOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollY={false}>
        <div className="chat-layout">
          {!online && (
            <div className="connection-banner" role="status">
              <div>
                {connectionError ??
                  (status === "connecting" ? "正在连接 server…" : "连接暂时中断，正在重新同步…")}
              </div>
              <button
                type="button"
                onClick={() =>
                  status === "unauthorized" || status === "error"
                    ? setSettingsOpen(true)
                    : reconnect()
                }
              >
                {status === "unauthorized" || status === "error" ? "连接设置" : "重试"}
              </button>
            </div>
          )}
          {snapshot ? (
            <MessageList key={snapshot.session?.id ?? "none"} snapshot={snapshot} />
          ) : (
            <div className="loading-chat">
              <IonSpinner name="crescent" />
              <p>
                {status === "error" || status === "unauthorized"
                  ? "请在连接设置中检查地址与 token。"
                  : "正在同步当前会话"}
              </p>
            </div>
          )}
        </div>
      </IonContent>
      <IonFooter className="chat-footer">
        <div className="footer-body">
          {approvals.length > 0 && (
            <div className="approvals-panel">
              {approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} disabled={!online || busy} />
              ))}
            </div>
          )}
          {pending.length > 0 && (
            <details className="queue-panel">
              <summary>
                <span>待处理指令</span>
                <span>{pending.length}</span>
              </summary>
              <ol>
                {pending.map((input) => (
                  <li key={input.id}>
                    {input.content}
                    {input.imageCount ? `（${input.imageCount} 张图片）` : ""}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {snapshot?.run?.error && (
            <p className="run-error" role="alert">
              {snapshot.run.error.message}
            </p>
          )}
          <div className="agent-status">
            <span>
              {running && online ? <span className="working-dot" /> : <span className="idle-dot" />}
              {online ? activity : connectionLabels[status]}
            </span>
            {running && (
              <IonButton
                size="small"
                fill="clear"
                color="danger"
                disabled={!online || busy}
                onClick={() => stop.mutate()}
              >
                <IonIcon slot="start" icon={stopOutline} />
                {stop.isPending ? "请求中" : "停止"}
              </IonButton>
            )}
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSend) send.mutate({ message: draft, delivery: "auto" });
            }}
          >
            <IonTextarea
              aria-label="发送指令"
              placeholder={running ? "补充指令，或加入队列…" : "让 Kana 做点什么…"}
              autoGrow
              rows={1}
              value={draft}
              onIonInput={(event) => setDraft(event.detail.value ?? "")}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && canSend) {
                  event.preventDefault();
                  send.mutate({ message: draft, delivery: "auto" });
                }
              }}
            />
            <div className="composer-actions">
              <span className="composer-hint">
                {running ? "发送可引导当前任务" : "远程 Agent 连接器"}
              </span>
              <IonButton
                className="queue-button"
                size="small"
                fill="clear"
                disabled={!canSend}
                onClick={() => send.mutate({ message: draft, delivery: "queue" })}
              >
                排队
              </IonButton>
              <IonButton
                className="send-button"
                size="small"
                type="submit"
                aria-label="发送"
                disabled={!canSend}
              >
                {send.isPending ? (
                  <IonSpinner name="crescent" />
                ) : (
                  <IonIcon slot="icon-only" icon={arrowUpOutline} />
                )}
              </IonButton>
            </div>
          </form>
          <div className="server-label">
            {settings ? new URL(settings.address).host : ""}
            {snapshot?.session?.id ? ` · ${snapshot.session.id.slice(0, 8)}` : ""}
          </div>
        </div>
      </IonFooter>
      <IonModal
        isOpen={settingsOpen}
        onDidDismiss={() => setSettingsOpen(false)}
        className="sheet-modal"
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>连接设置</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setSettingsOpen(false)}>关闭</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <div className="sheet-body">
            <p className="muted">连接运行在远程的 Kana server。</p>
            <ConnectionForm
              onConnected={() => setSettingsOpen(false)}
              onDisconnected={() => setSettingsOpen(false)}
            />
          </div>
        </IonContent>
      </IonModal>
      <SessionsModal
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        disabled={running || busy || approvals.length > 0}
      />
    </IonPage>
  );
}
