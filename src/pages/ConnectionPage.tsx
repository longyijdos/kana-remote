import { IonContent, IonPage } from "@ionic/react";
import { ConnectionForm } from "../components/ConnectionForm";
import { KanaMark } from "../components/Toolbar";
import { useClientStore } from "../state/store";

export function ConnectionPage() {
  const error = useClientStore((state) => state.connectionError);
  return (
    <IonPage>
      <IonContent>
        <main className="grid min-h-full place-items-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-10 flex flex-col gap-4">
              <KanaMark height={56} />
              <div>
                <h1 className="m-0 text-2xl font-semibold tracking-tight">Kana</h1>
                <p className="mb-0 mt-1 text-sm text-muted-foreground">
                  Connect to your Kana server.
                </p>
              </div>
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
