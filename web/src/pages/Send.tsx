import { useState } from "react";
import { FilePicker } from "../components/FilePicker";
import { QRDisplay } from "../components/QRDisplay";
import { DevicePairing } from "../components/DevicePairing";
import { TransferStatus } from "../components/TransferStatus";
import { generateKey, exportKey, encrypt } from "../lib/crypto";
import { createSession, uploadEncrypted } from "../lib/transfer";
import { getOrCreateDeviceName } from "../lib/devicename";

type Mode = "pick" | "method" | "qr-sending" | "qr-done" | "pairing" | "error";

export function Send() {
  const [mode, setMode] = useState<Mode>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"encrypting" | "uploading" | "waiting">("encrypting");
  const [errorMsg, setErrorMsg] = useState("");
  const myName = getOrCreateDeviceName();

  async function startQR(selectedFile: File) {
    setFile(selectedFile);
    setMode("qr-sending");
    try {
      setPhase("encrypting");
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

      const receiveUrl = `${location.origin}/r/${sessionId}#key=${keyStr}`;
      setQrUrl(receiveUrl);

      setPhase("uploading");
      await uploadEncrypted(sessionId, encrypted, (pct) => setProgress(pct));
      setPhase("waiting");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setMode("error");
    }
  }

  function onFileSelected(f: File) {
    setFile(f);
    setMode("method");
  }

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
        <p className="file-preview">📄 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>
        <div className="method-choices">
          <button className="method-card" onClick={() => startQR(file)}>
            <span className="method-icon">📷</span>
            <span className="method-title">QR Code / Link</span>
            <span className="method-desc">Works across different networks</span>
          </button>
          <button className="method-card" onClick={() => setMode("pairing")}>
            <span className="method-icon">📡</span>
            <span className="method-title">Nearby Devices</span>
            <span className="method-desc">Same Wi-Fi — direct pairing</span>
          </button>
        </div>
        <button className="btn-secondary back-btn" onClick={() => setMode("pick")}>← Back</button>
      </div>
    );
  }

  if (mode === "qr-sending") {
    return (
      <div className="page">
        <h2>Sending: {file?.name}</h2>
        <TransferStatus phase={phase} progress={phase === "uploading" ? progress : undefined} />
        {qrUrl && phase === "waiting" && (
          <QRDisplay url={qrUrl} shortCode={shortCode} />
        )}
      </div>
    );
  }

  if (mode === "pairing") {
    return (
      <div className="page">
        <h2>Pair with a nearby device</h2>
        <DevicePairing
          myName={myName}
          onPaired={() => {
            if (file) startQR(file);
          }}
        />
        <button className="btn-secondary back-btn" onClick={() => setMode("method")}>← Back</button>
      </div>
    );
  }

  if (mode === "error") {
    return (
      <div className="page">
        <TransferStatus phase="error" error={errorMsg} />
        <button className="btn-primary" onClick={() => setMode("pick")}>Try again</button>
      </div>
    );
  }

  return null;
}
