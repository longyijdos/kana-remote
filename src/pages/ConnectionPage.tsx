import { IonContent, IonPage } from "@ionic/react";
import { ConnectionForm } from "../components/ConnectionForm";
import { useClientStore } from "../state/store";

export function ConnectionPage() {
  const error = useClientStore((state) => state.connectionError);
  return (
    <IonPage>
      <IonContent>
        <main className="connect-page">
          <div className="connect-card">
            <div className="connection-brand">
              <span className="agent-mark">K</span>
              <span>KANA REMOTE</span>
            </div>
            <h1>
              你的 Agent，
              <br />
              随时连接。
            </h1>
            <p className="connect-description">
              Kana 在远程持续工作。
              <br />
              在这里发出指令、查看进度、处理审批。
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <ConnectionForm />
            <div className="connection-footnote">
              <span className="status-dot" />
              一个 server · 一个活跃会话
            </div>
          </div>
        </main>
      </IonContent>
    </IonPage>
  );
}
