interface Props {
  phase: "encrypting" | "uploading" | "waiting" | "downloading" | "decrypting" | "done" | "error";
  progress?: number;
  error?: string;
  fileName?: string;
}

const LABELS: Record<Props["phase"], string> = {
  encrypting: "Encrypting…",
  uploading: "Uploading…",
  waiting: "Waiting for receiver…",
  downloading: "Downloading…",
  decrypting: "Decrypting…",
  done: "Transfer complete",
  error: "Transfer failed",
};

export function TransferStatus({ phase, progress, error, fileName }: Props) {
  return (
    <div className={`transfer-status ${phase}`}>
      <p className="phase-label">{LABELS[phase]}</p>
      {fileName && phase === "done" && <p className="file-name">{fileName}</p>}
      {progress !== undefined && phase !== "done" && phase !== "error" && phase !== "waiting" && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${Math.round(progress)}%` }} />
          <span>{Math.round(progress)}%</span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
