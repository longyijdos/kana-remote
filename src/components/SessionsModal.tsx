import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { errorMessage } from "../api/client";
import { currentApi, handleActionError, reconnect } from "../state/connection";
import { useClientStore } from "../state/store";

export function SessionsModal({
  open,
  onClose,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  disabled: boolean;
}) {
  const status = useClientStore((state) => state.status);
  const active = useClientStore((state) => state.snapshot?.session?.id);
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => currentApi().sessions(),
    enabled: open && status === "connected",
    refetchOnWindowFocus: false,
  });
  const change = useMutation({
    mutationFn: (id: string | null) =>
      id ? currentApi().resumeSession(id) : currentApi().newSession(),
    onSuccess() {
      reconnect();
      onClose();
    },
    onError: handleActionError,
  });
  const unavailable = disabled || change.isPending || status !== "connected";
  const saved =
    sessions.data?.sessions
      .filter((session) => session.id !== active)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} className="sheet-modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>会话</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>关闭</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="sheet-body">
          <p className="muted">server 只有一个活跃会话。空闲时可以新建或恢复历史会话。</p>
          <div className="active-session">
            <span className="status-dot" />
            <div>
              <strong>当前会话</strong>
              <code>{active ?? "等待同步"}</code>
            </div>
          </div>
          <IonButton expand="block" disabled={unavailable} onClick={() => change.mutate(null)}>
            {change.isPending && change.variables === null ? (
              <IonSpinner name="crescent" />
            ) : (
              "新建会话"
            )}
          </IonButton>
          <h2 className="section-label">恢复历史会话</h2>
          {sessions.isPending && (
            <div className="loading-inline">
              <IonSpinner name="crescent" />
              <span>正在读取会话</span>
            </div>
          )}
          {sessions.isError && (
            <div className="form-error">
              <p>{errorMessage(sessions.error)}</p>
              <IonButton size="small" fill="outline" onClick={() => void sessions.refetch()}>
                重新读取
              </IonButton>
            </div>
          )}
          {!sessions.isPending && !sessions.isError && !saved.length && (
            <p className="muted">暂无历史会话。</p>
          )}
          <div className="session-list">
            {saved.map((session) => (
              <button
                type="button"
                key={session.id}
                className="session-item"
                disabled={unavailable}
                onClick={() => change.mutate(session.id)}
              >
                <strong>{session.title || "未命名会话"}</strong>
                <span>{session.cwd}</span>
                <small>
                  {new Date(session.updatedAt).toLocaleString("zh-CN")}{" "}
                  {change.isPending && change.variables === session.id ? " · 恢复中…" : ""}
                </small>
              </button>
            ))}
          </div>
        </div>
      </IonContent>
    </IonModal>
  );
}
