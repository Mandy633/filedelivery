# FileDelivery

Send files to any device, any brand. No account required. End-to-end encrypted.

## Features

- **Cross-brand**: Works on iOS, Android, Windows, Linux, macOS
- **No account**: Sender and receiver need no login
- **E2E encrypted**: Files are encrypted client-side with AES-GCM-256 before upload — the server never sees plaintext
- **Two delivery modes**:
  - **QR Code / Link**: Sender gets a QR code and 6-character code; receiver scans or opens the link
  - **Nearby Device Pairing**: Both devices on the same network see each other by name and pair directly
- **Auto-purge**: Files deleted from relay server on download or after 1 hour
- **File size**: Up to 100 MB; documents and media

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Go (net/http, gorilla/websocket) |
| Frontend | React + TypeScript (Vite) |
| Encryption | WebCrypto API (browser-side, AES-GCM-256) |
| Realtime | WebSocket (presence + WebRTC signaling) |

## Security model

- Encryption key is generated in the browser and **never sent to the server**
- For QR/link sharing: the key lives in the URL fragment (`#key=...`) which browsers never include in HTTP requests or server logs
- For device pairing: key is exchanged via ECDH over the WebSocket signaling channel
- Server stores only: session ID, file name, MIME type, size, and the encrypted blob

## Running locally

**Backend:**
```bash
cd backend
go run .
# Listens on :8080
```

**Frontend (dev with proxy to backend):**
```bash
cd web
npm install
npm run dev
# Opens on http://localhost:5173
```

**With Docker Compose:**
```bash
docker compose up --build
# Web: http://localhost:5173
# API: http://localhost:8080
```

## API reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/sessions` | Create a new session |
| `PUT` | `/api/sessions/:id/file` | Upload encrypted blob |
| `GET` | `/api/sessions/:id/meta` | Get file metadata (name, type, size, ready) |
| `GET` | `/api/sessions/:id/file` | Download encrypted blob (auto-deletes after) |
| `DELETE` | `/api/sessions/:id` | Manually delete session |
| `WS` | `/ws/presence?name=...` | Device name registration + LAN peer discovery |
| `WS` | `/ws/signal?session=...` | WebRTC signaling relay |
