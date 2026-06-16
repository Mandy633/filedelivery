import { useState, useEffect, useRef } from "react";
import { FilePicker } from "../components/FilePicker";
import { QRDisplay } from "../components/QRDisplay";
import { DevicePairing, type PairingStatus } from "../components/DevicePairing";
import { TransferStatus } from "../components/TransferStatus";
import { generateKey, exportKey, encrypt } from "../lib/crypto";
import { createSession, uploadEncrypted, pollUntilGone } from "../lib/transfer";
import { getOrCreateDeviceName } from "../lib/devicename";
import { PresenceClient } from "../lib/presence";

type Mode = "pick" | "method" | "qr-sending" | "pairing" | "error";
type UploadPhase = "encrypting" | "uploading" | "waiting" | "done";

export function Send() {
  const [mode, setMode] = useState<Mode>("pick");
  const [myName] = useState(() => getOrCreateDeviceName());

  // File — kept in both state (for rendering) and a ref (for stable closure access).
  const [file, _setFile] = useState<File | null>(null);
  const fileRef = useRef<File | null>(null);
  function setFile(f: File | null) {
    fileRef.current = f;
    _setFile(f);
  }

  // QR / upload flow
  const [qrUrl, setQrUrl] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("encrypting");
  const pollAbortRef = useRef<AbortController | null>(null);

  // Pairing flow — PresenceClient lives here so it survives mode transitions.
  const presenceRef = useRef<PresenceClient | null>(null);
  const pairedTargetRef = useRef<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus>("connecting");
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState("");

  // Connect presence WebSocket once when pairing mode is entered.
  // The client is intentionally kept alive across subsequent mode changes so
  // that a transfer-invite sent after upload can still be delivered.
  useEffect(() => {
    if (mode !== "pairing" || presenceRef.current) return;

    const client = new PresenceClient(myName);
    presenceRef.current = client;

    client.onDisconnected = () => setPairingStatus("connecting");
    client.onReconnected = () => setPairingStatus("ready");

    client.onPeers = (list) => {
      setPeers(list);
      setPairingStatus((s) => (s === "connecting" ? "ready" : s));
    };
    client.onPairRequest = (from) => setIncomingFrom(from);
    client.onPairResponse = (_from, accepted) => {
      if (!accepted) { setPairingStatus("ready"); return; }
      // Sender side: start the upload immediately.
      const f = fileRef.current;
      if (f) startQR(f);
    };
    client.onTransferReceived = (url) => {
      // Receiver side: navigate directly to the receive URL.
      // The URL fragment carries the decryption key and is never sent to the server.
      window.location.href = url;
    };

    client.connect()
      .then(() => setPairingStatus("ready"))
      .catch(() => setPairingStatus("error"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Disconnect and abort polling when the component unmounts.
  useEffect(() => {
    return () => {
      presenceRef.current?.disconnect();
      pollAbortRef.current?.abort();
    };
  }, []);

  async function startQR(selectedFile: File) {
    setMode("qr-sending");
    try {
      setUploadPhase("encrypting");
      setProgress(0);

      const key = await generateKey();
      const keyStr = await exportKey(key);
      const buf = await selectedFile.arrayBuffer();
      const encrypted = await encrypt(key, buf);

      const sessionId = await createSession(
        selectedFile.name,
        selectedFile.type || "application/octet-stream",
        encrypted.byteLength
      );
      setShortCode(sessionId.slice(0, 6).toUpperCase());

      // Show QR code immediately — receiver can scan while upload is in progress.
      const receiveUrl = `${location.origin}/r/${sessionId}#key=${keyStr}`;
      setQrUrl(receiveUrl);

      setUploadPhase("uploading");
      await uploadEncrypted(sessionId, encrypted, setProgress);
      setUploadPhase("waiting");

      // If we arrived here from device pairing, push the URL to the paired device.
      if (pairedTargetRef.current && presenceRef.current) {
        presenceRef.current.sendTransferInvite(
          pairedTargetRef.current,
          receiveUrl,
          selectedFile.name
        );
      }

      // Poll until the session disappears (receiver downloaded → server deleted it).
      const abort = new AbortController();
      pollAbortRef.current = abort;
      await pollUntilGone(sessionId, 2000, abort.signal);
      if (!abort.signal.aborted) setUploadPhase("done");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setMode("error");
    }
  }

  function onFileSelected(f: File) {
    setFile(f);
    setMode("method");
  }

  function onRequestPair(target: string) {
    setPairingStatus("requesting");
    pairedTargetRef.current = target;
    presenceRef.current?.requestPair(target);
  }

  function onAcceptPair() {
    if (!incomingFrom) return;
    presenceRef.current?.respondPair(incomingFrom, true);
    setIncomingFrom(null);
    setPairingStatus("waiting-for-file");
  }

  function onRejectPair() {
    if (!incomingFrom) return;
    presenceRef.current?.respondPair(incomingFrom, false);
    setIncomingFrom(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (mode === "pick") {
    return (
      <div className="page">
        <h1>Send a file</h1>
        <FilePicker onFile={onFileSelected} />
      </div>
    );
  }

  if (mode === "method" && file) {
    return (
      <div className="page">
        <h2>How do you want to share?</h2>
        <p className="file-preview">
          📄 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
        </p>
        <div className="method-choices">
          <button className="method-card" onClick={() => startQR(file)}>
            <span className="method-icon">📷</span>
            <span className="method-title">QR Code / Link</span>
            <span className="method-desc">Works across different networks</span>
          </button>
          <button className="method-card" onClick={() => setMode("pairing")}>
            <span className="method-icon">📡</span>
            <span className="method-title">Nearby Devices</span>
            <span className="method-desc">Same Wi-Fi — automatic delivery</span>
          </button>
        </div>
        <button className="btn-secondary back-btn" onClick={() => setMode("pick")}>
          ← Back
        </button>
      </div>
    );
  }

  if (mode === "qr-sending") {
    return (
      <div className="page">
        <h2>Sending: {file?.name}</h2>
        {/* QR is shown as soon as the session URL is ready, even during upload */}
        {qrUrl && <QRDisplay url={qrUrl} shortCode={shortCode} />}
        {uploadPhase !== "done" ? (
          <TransferStatus
            phase={uploadPhase}
            progress={uploadPhase === "uploading" ? progress : undefined}
          />
        ) : (
          <div className="transfer-status done">
            <p className="phase-label">File delivered ✓</p>
            <button className="btn-primary send-another-btn" onClick={() => {
              setMode("pick");
              setFile(null);
              setQrUrl("");
              setUploadPhase("encrypting");
            }}>
              Send another
            </button>
          </div>
        )}
      </div>
    );
  }

  if (mode === "pairing") {
    return (
      <div className="page">
        <h2>Nearby Devices</h2>
        <DevicePairing
          myName={myName}
          peers={peers}
          status={pairingStatus}
          incomingFrom={incomingFrom}
          onRequestPair={onRequestPair}
          onAcceptPair={onAcceptPair}
          onRejectPair={onRejectPair}
        />
        {file && (
          <p className="file-preview file-preview-pairing">
            📄 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
          </p>
        )}
        <button
          className="btn-secondary back-btn"
          onClick={() => {
            presenceRef.current?.disconnect();
            presenceRef.current = null;
            setMode(file ? "method" : "pick");
            setPeers([]);
            setPairingStatus("connecting");
            setIncomingFrom(null);
            pairedTargetRef.current = null;
          }}
        >
          ← Back
        </button>
      </div>
    );
  }

  if (mode === "error") {
    return (
      <div className="page">
        <TransferStatus phase="error" error={errorMsg} />
        <button className="btn-primary" onClick={() => { setMode("pick"); setFile(null); }}>
          Try again
        </button>
      </div>
    );
  }

  return null;
}
