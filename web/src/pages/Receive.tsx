import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { importKey, decrypt } from "../lib/crypto";
import { fetchMeta, downloadEncrypted, triggerDownload, HttpError, type SessionMeta } from "../lib/transfer";
import { TransferStatus } from "../components/TransferStatus";

type Phase =
  | "loading"
  | "preparing"   // session found but upload not yet complete
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
  const readyPollAbortRef = useRef<AbortController | null>(null);

  // Read the key once from the URL fragment. The fragment is never sent to the
  // server, so it only exists in the browser.
  const keyStr = location.hash.replace("#key=", "").trim();

  useEffect(() => {
    if (!sessionId) { setPhase("error"); setErrorMsg("Invalid link."); return; }
    if (!keyStr) { setPhase("no-key"); return; }

    fetchMeta(sessionId)
      .then((m) => {
        setMeta(m);
        if (!m.ready) {
          setPhase("preparing");
          pollUntilReady(sessionId);
        } else {
          setPhase("preview");
        }
      })
      .catch(() => {
        setPhase("error");
        setErrorMsg("Session not found or already expired.");
      });

    return () => readyPollAbortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function pollUntilReady(sid: string) {
    const abort = new AbortController();
    readyPollAbortRef.current = abort;

    while (!abort.signal.aborted) {
      await new Promise((r) => setTimeout(r, 1500));
      if (abort.signal.aborted) return;
      try {
        const m = await fetchMeta(sid);
        setMeta(m);
        if (m.ready) {
          setPhase("preview");
          return;
        }
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) {
          setPhase("error");
          setErrorMsg("Session expired while waiting for upload.");
        } else {
          // Transient network error — keep polling.
        }
        return;
      }
    }
  }

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
        <p className="error">
          This link is missing the decryption key. Make sure you opened the
          full link including everything after the <code>#</code>.
        </p>
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

  if (phase === "preparing") {
    return (
      <div className="page">
        <h2>File incoming…</h2>
        <div className="file-card">
          {meta && <p className="file-name">{meta.fileName}</p>}
          <p className="status-msg">Waiting for sender to finish uploading…</p>
        </div>
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
        <button className="btn-primary" onClick={startDownload}>
          Download
        </button>
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
