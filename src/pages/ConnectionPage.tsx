import { IonContent, IonPage } from "@ionic/react";
import { ConnectionForm } from "../components/ConnectionForm";
import { useClientStore } from "../state/store";

export function ConnectionPage() {
  const error = useClientStore((state) => state.connectionError);
  return (
    <IonPage>
      <IonContent>
        <main className="grid min-h-full place-items-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div
              className="connection-brand mb-10 flex items-center gap-1"
              role="img"
              aria-label="Kana"
            >
              <span className="agent-mark">K</span>
              <span className="brand-name">ana</span>
            </div>
            {error && (
              <p className="form-error mb-5" role="alert">
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
