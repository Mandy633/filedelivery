const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface SessionMeta {
  sessionId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  ready: boolean;
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
  if (!res.ok) throw new Error(await res.text());
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
    xhr.onload = () => (xhr.status === 204 ? resolve() : reject(new Error(xhr.responseText)));
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(data);
  });
}

export async function fetchMeta(sessionId: string): Promise<SessionMeta> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/meta`);
  if (!res.ok) throw new Error("session not found");
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
      xhr.status === 200 ? resolve(xhr.response) : reject(new Error("download failed"));
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
  URL.revokeObjectURL(url);
}

export async function pollUntilReady(sessionId: string, intervalMs = 1500): Promise<SessionMeta> {
  while (true) {
    const meta = await fetchMeta(sessionId);
    if (meta.ready) return meta;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
