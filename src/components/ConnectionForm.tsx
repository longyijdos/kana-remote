import { Capacitor } from "@capacitor/core";
import { IonButton, IonInput, IonSpinner } from "@ionic/react";
import { useState } from "react";
import { errorMessage, normalizeSettings } from "../api/client";
import { connect, disconnect } from "../state/connection";
import { useClientStore } from "../state/store";

export function ConnectionForm({
  onConnected,
  onDisconnected,
}: {
  onConnected?: () => void;
  onDisconnected?: () => void;
}) {
  const settings = useClientStore((state) => state.settings);
  const status = useClientStore((state) => state.status);
  const [address, setAddress] = useState(settings?.address ?? "");
  const [token, setToken] = useState(settings?.token ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="connection-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setBusy(true);
        try {
          const value = normalizeSettings({ address, token });
          if (Capacitor.isNativePlatform() && new URL(value.address).protocol !== "https:")
            throw new Error("Use an HTTPS server URL on Android.");
          await connect(value);
          onConnected?.();
        } catch (failure) {
          setError(errorMessage(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <IonInput
        label="Server URL"
        labelPlacement="stacked"
        fill="outline"
        type="url"
        inputmode="url"
        autocomplete="url"
        placeholder="https://agent.example.com"
        value={address}
        disabled={busy}
        onIonInput={(event) => setAddress(event.detail.value ?? "")}
        required
      />
      <IonInput
        label="Token"
        labelPlacement="stacked"
        fill="outline"
        type="password"
        autocomplete="off"
        placeholder="KANA_SERVER_TOKEN"
        value={token}
        disabled={busy}
        onIonInput={(event) => setToken(event.detail.value ?? "")}
        required
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <IonButton expand="block" type="submit" disabled={busy || !address.trim() || !token.trim()}>
        {busy ? <IonSpinner name="crescent" /> : "Connect"}
      </IonButton>
      {onDisconnected && status !== "disconnected" && (
        <IonButton
          expand="block"
          fill="clear"
          color="medium"
          disabled={busy}
          onClick={() => {
            disconnect();
            onDisconnected();
          }}
        >
          Disconnect
        </IonButton>
      )}
    </form>
  );
}
