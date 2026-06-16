const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface SessionMeta {
  sessionId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  ready: boolean;
}

/** Carries an HTTP status code so callers can distinguish 404 from 5xx/network errors. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export async function createSession(
  fileName: string,
  mimeType: string,
  fileSize: number
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, mimeType, fileSize }),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());
  const { sessionId } = await res.json();
  return sessionId;
}

export async function uploadEncrypted(
  sessionId: string,
  data: ArrayBuffer,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${API_BASE}/api/sessions/${sessionId}/file`);
    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
      });
    }
    xhr.onload = () => (xhr.status === 204 ? resolve() : reject(new HttpError(xhr.status, xhr.responseText)));
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(data);
  });
}

export async function fetchMeta(sessionId: string): Promise<SessionMeta> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/meta`);
  if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`);
  const data = await res.json();
  return { sessionId, ...data };
}

export async function downloadEncrypted(
  sessionId: string,
  onProgress?: (pct: number) => void
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `${API_BASE}/api/sessions/${sessionId}/file`);
    xhr.responseType = "arraybuffer";
    if (onProgress) {
      xhr.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
      });
    }
    xhr.onload = () =>
      xhr.status === 200
        ? resolve(xhr.response)
        : reject(new HttpError(xhr.status, "download failed"));
    xhr.onerror = () => reject(new Error("download failed"));
    xhr.send();
  });
}

export function triggerDownload(data: ArrayBuffer, fileName: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  // Delay revocation so the browser has time to initiate the download before
  // the object URL becomes invalid (important on mobile browsers).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Polls the meta endpoint every `intervalMs` ms until the session disappears
 * (server deletes it after the receiver downloads the file).
 * Only a 404 response is treated as "done" — network errors and 5xx keep polling.
 */
export async function pollUntilGone(
  sessionId: string,
  intervalMs = 2000,
  signal?: AbortSignal
): Promise<void> {
  while (!signal?.aborted) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (signal?.aborted) break;
    try {
      await fetchMeta(sessionId);
      // Session still alive — keep polling.
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return;
      // Transient error (network blip, 5xx) — keep polling rather than falsely
      // declaring delivery complete.
    }
  }
}
