import { IonApp, IonToast } from "@ionic/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Spinner } from "./components/ui";
import { ChatPage } from "./pages/ChatPage";
import { ConnectionPage } from "./pages/ConnectionPage";
import { installConnectionLifecycle, queryClient } from "./state/connection";
import { useClientStore } from "./state/store";

function App() {
  const hydrated = useClientStore((state) => state.hydrated);
  const status = useClientStore((state) => state.status);
  const settings = useClientStore((state) => state.settings);
  const notice = useClientStore((state) => state.notice);
  useEffect(installConnectionLifecycle, []);
  return (
    <QueryClientProvider client={queryClient}>
      <IonApp>
        {!hydrated ? (
          <div className="grid h-full place-items-center">
            <Spinner className="size-5" />
          </div>
        ) : !settings || status === "disconnected" ? (
          <ConnectionPage />
        ) : (
          <ChatPage />
        )}
        <IonToast
          isOpen={Boolean(notice)}
          message={notice ?? ""}
          duration={3_500}
          position="top"
          onDidDismiss={() => useClientStore.getState().notify(null)}
        />
      </IonApp>
    </QueryClientProvider>
  );
}

export default App;
