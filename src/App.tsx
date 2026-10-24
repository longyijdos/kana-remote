import { IonApp, IonToast } from "@ionic/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { Spinner } from "./components/ui";
import { ChatPage } from "./pages/ChatPage";
import { ConnectionPage } from "./pages/ConnectionPage";
import { installConnectionLifecycle, queryClient } from "./state/connection";
import { useClientStore } from "./state/store";

type BackButtonEvent = CustomEvent<{
  register: (priority: number, handler: (next: () => void) => void) => void;
}>;

// Streamdown's fullscreen diagram viewer is not an Ionic overlay, so Android's back button
// would otherwise skip it and leave the page.
function closeFullscreenOnBack(event: Event) {
  (event as BackButtonEvent).detail.register(110, (next) => {
    const exit = document.querySelector<HTMLButtonElement>(
      '[role="dialog"][aria-modal="true"] button[title="Exit fullscreen"]',
    );
    if (exit) exit.click();
    else next();
  });
}

function App() {
  const hydrated = useClientStore((state) => state.hydrated);
  const status = useClientStore((state) => state.status);
  const settings = useClientStore((state) => state.settings);
  const notice = useClientStore((state) => state.notice);
  const reducedMotion = useReducedMotion();
  useEffect(installConnectionLifecycle, []);
  useEffect(() => {
    document.addEventListener("ionBackButton", closeFullscreenOnBack);
    return () => document.removeEventListener("ionBackButton", closeFullscreenOnBack);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig
        transition={{ type: "tween", duration: reducedMotion ? 0 : 0.18, ease: "easeOut" }}
        reducedMotion="user"
      >
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
      </MotionConfig>
    </QueryClientProvider>
  );
}

export default App;
