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
            <div className="connection-brand" role="img" aria-label="Kana">
              <span className="agent-mark">K</span>
              <span className="brand-name">ana</span>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <ConnectionForm />
          </div>
        </main>
      </IonContent>
    </IonPage>
  );
}
