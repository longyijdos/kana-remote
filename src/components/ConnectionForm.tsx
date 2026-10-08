import { Capacitor } from "@capacitor/core";
import { useState } from "react";
import { errorMessage, normalizeSettings } from "../api/client";
import { connect, disconnect } from "../state/connection";
import { useClientStore } from "../state/store";
import { Button, Spinner } from "./ui";

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
      className="flex flex-col gap-5"
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
      <label className="flex flex-col gap-2 text-sm font-medium">
        Server URL
        <input
          className="field-input"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://agent.example.com"
          value={address}
          disabled={busy}
          onChange={(event) => setAddress(event.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Token
        <input
          className="field-input"
          type="password"
          autoComplete="off"
          placeholder="KANA_SERVER_TOKEN"
          value={token}
          disabled={busy}
          onChange={(event) => setToken(event.target.value)}
          required
        />
      </label>
      {error && (
        <p className="form-error m-0" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy || !address.trim() || !token.trim()}>
        {busy ? <Spinner /> : "Connect"}
      </Button>
      {onDisconnected && status !== "disconnected" && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={() => {
            disconnect();
            onDisconnected();
          }}
        >
          Disconnect
        </Button>
      )}
    </form>
  );
}
