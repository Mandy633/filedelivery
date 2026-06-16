export type PairingStatus =
  | "connecting"
  | "ready"
  | "requesting"
  | "waiting-for-file"
  | "error";

interface Props {
  myName: string;
  peers: string[];
  status: PairingStatus;
  incomingFrom: string | null;
  onRequestPair: (target: string) => void;
  onAcceptPair: () => void;
  onRejectPair: () => void;
}

export function DevicePairing({
  myName,
  peers,
  status,
  incomingFrom,
  onRequestPair,
  onAcceptPair,
  onRejectPair,
}: Props) {
  if (incomingFrom) {
    return (
      <div className="pairing-incoming">
        <p>
          <strong>{incomingFrom}</strong> wants to send you a file.
        </p>
        <div className="pair-actions">
          <button className="btn-primary" onClick={onAcceptPair}>
            Accept
          </button>
          <button className="btn-secondary" onClick={onRejectPair}>
            Decline
          </button>
        </div>
      </div>
    );
  }

  if (status === "waiting-for-file") {
    return (
      <div className="pairing-empty">
        <p>Your device name: <strong>{myName}</strong></p>
        <p className="status-msg">Waiting for sender to finish uploading…</p>
      </div>
    );
  }

  if (status === "connecting") return <p className="status-msg">Connecting to network…</p>;
  if (status === "error") return <p className="error">Could not connect to pairing service — this may be a name conflict. Try reloading the page.</p>;
  if (status === "requesting") return <p className="status-msg">Waiting for the other device to accept…</p>;

  // status === "ready"
  if (peers.length === 0) {
    return (
      <div className="pairing-empty">
        <p>
          Your device name: <strong>{myName}</strong>
        </p>
        <p className="hint">
          No nearby devices found. Open this app on another device on the same
          Wi-Fi and navigate to <em>Send → Nearby Devices</em>.
        </p>
      </div>
    );
  }

  return (
    <div className="pairing-list">
      <p>
        Your device name: <strong>{myName}</strong>
      </p>
      <p className="hint">Nearby devices:</p>
      <ul>
        {peers.map((name) => (
          <li key={name}>
            <button className="peer-item" onClick={() => onRequestPair(name)}>
              {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
