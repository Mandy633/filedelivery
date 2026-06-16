import { useEffect, useState } from "react";
import { PresenceClient } from "../lib/presence";

interface Props {
  onPaired: (sessionId: string) => void;
  myName: string;
}

export function DevicePairing({ onPaired, myName }: Props) {
  const [peers, setPeers] = useState<string[]>([]);
  const [status, setStatus] = useState<"connecting" | "ready" | "requesting" | "error">("connecting");
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const clientRef = { current: null as PresenceClient | null };

  useEffect(() => {
    const client = new PresenceClient(myName);
    clientRef.current = client;

    client.onPeers = (list) => {
      setPeers(list);
      setStatus("ready");
    };

    client.onPairRequest = (from) => {
      setIncomingFrom(from);
    };

    client.onPairResponse = (from, accepted) => {
      if (accepted) {
        onPaired(`pair-${myName}-${from}`);
      } else {
        setStatus("ready");
      }
    };

    client.connect().catch(() => setStatus("error"));

    return () => client.disconnect();
  }, [myName]);

  function requestPair(targetName: string) {
    setStatus("requesting");
    clientRef.current?.requestPair(targetName);
  }

  function acceptPair() {
    if (!incomingFrom) return;
    clientRef.current?.respondPair(incomingFrom, true);
    onPaired(`pair-${incomingFrom}-${myName}`);
  }

  function rejectPair() {
    if (!incomingFrom) return;
    clientRef.current?.respondPair(incomingFrom, false);
    setIncomingFrom(null);
  }

  if (incomingFrom) {
    return (
      <div className="pairing-incoming">
        <p><strong>{incomingFrom}</strong> wants to send you a file.</p>
        <div className="pair-actions">
          <button className="btn-primary" onClick={acceptPair}>Accept</button>
          <button className="btn-secondary" onClick={rejectPair}>Decline</button>
        </div>
      </div>
    );
  }

  if (status === "connecting") return <p className="status-msg">Connecting to network…</p>;
  if (status === "error") return <p className="error">Could not connect to pairing service.</p>;
  if (status === "requesting") return <p className="status-msg">Waiting for the other device to accept…</p>;

  if (peers.length === 0) {
    return (
      <div className="pairing-empty">
        <p>Your device name: <strong>{myName}</strong></p>
        <p className="hint">No other devices found on this network yet. Both devices must have the app open.</p>
      </div>
    );
  }

  return (
    <div className="pairing-list">
      <p>Your device name: <strong>{myName}</strong></p>
      <p className="hint">Nearby devices:</p>
      <ul>
        {peers.map((name) => (
          <li key={name}>
            <button className="peer-item" onClick={() => requestPair(name)}>{name}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
