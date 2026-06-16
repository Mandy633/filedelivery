import { useRef, useState, type DragEvent } from "react";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
]);

const MAX_BYTES = 100 * 1024 * 1024;

interface Props {
  onFile: (file: File) => void;
}

export function FilePicker({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function validate(file: File): string {
    if (!ALLOWED_MIME.has(file.type)) return "Unsupported file type.";
    if (file.size > MAX_BYTES) return "File too large. Maximum is 100 MB.";
    return "";
  }

  function handleFile(file: File) {
    const err = validate(file);
    if (err) { setError(err); return; }
    setError("");
    onFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="file-picker-wrapper">
      <div
        className={`file-drop-zone ${dragging ? "dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="drop-icon">📂</span>
        <p>Drop a file here or <strong>click to browse</strong></p>
        <p className="hint">Documents & media · Max 100 MB</p>
        <input
          ref={inputRef}
          type="file"
          style={{ display: "none" }}
          onChange={onInputChange}
        />
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
