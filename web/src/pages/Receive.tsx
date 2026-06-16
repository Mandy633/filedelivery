import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { importKey, decrypt } from "../lib/crypto";
import { fetchMeta, downloadEncrypted, triggerDownload, type SessionMeta } from "../lib/transfer";
import { TransferStatus } from "../components/TransferStatus";

type Phase =
  | "loading"
  | "preview"
  | "downloading"
  | "decrypting"
  | "done"
  | "error"
  | "no-key";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function Receive() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const keyStr = location.hash.replace("#key=", "").trim();

  useEffect(() => {
    if (!sessionId) { setPhase("error"); setErrorMsg("Invalid link."); return; }
    if (!keyStr) { setPhase("no-key"); return; }

    fetchMeta(sessionId)
      .then((m) => { setMeta(m); setPhase("preview"); })
      .catch(() => { setPhase("error"); setErrorMsg("Session not found or already expired."); });
  }, [sessionId, keyStr]);

  async function startDownload() {
    if (!sessionId || !keyStr || !meta) return;
    try {
      setPhase("downloading");
      const key = await importKey(keyStr);
      const encrypted = await downloadEncrypted(sessionId, (pct) => setProgress(pct));
      setPhase("decrypting");
      const plaintext = await decrypt(key, encrypted);
      triggerDownload(plaintext, meta.fileName, meta.mimeType);
      setPhase("done");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Decryption failed.");
      setPhase("error");
    }
  }

  if (phase === "loading") {
    return <div className="page"><p className="status-msg">Loading…</p></div>;
  }

  if (phase === "no-key") {
    return (
      <div className="page">
        <p className="error">This link is missing the decryption key. Make sure you opened the full link including everything after the #.</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="page">
        <TransferStatus phase="error" error={errorMsg} />
        <a href="/" className="btn-primary">Go home</a>
      </div>
    );
  }

  if (phase === "preview" && meta) {
    return (
      <div className="page">
        <h2>You have a file</h2>
        <div className="file-card">
          <p className="file-name">{meta.fileName}</p>
          <p className="file-meta">{meta.mimeType} · {formatBytes(meta.fileSize)}</p>
          <p className="encryption-badge">🔒 End-to-end encrypted</p>
        </div>
        <button className="btn-primary" onClick={startDownload}>Download</button>
      </div>
    );
  }

  if (phase === "downloading" || phase === "decrypting") {
    return (
      <div className="page">
        <TransferStatus
          phase={phase}
          progress={phase === "downloading" ? progress : undefined}
        />
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="page">
        <TransferStatus phase="done" fileName={meta?.fileName} />
        <a href="/" className="btn-primary">Send another file</a>
      </div>
    );
  }

  return null;
}
