const WS_BASE =
  import.meta.env.VITE_WS_BASE ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

export type PresenceMsg =
  | { type: "peers"; peers: string[] }
  | { type: "pair-request"; from: string }
  | { type: "pair-response"; from: string; accepted: boolean }
  | { type: "transfer-invite"; from: string; url: string; fileName: string };

export class PresenceClient {
  private ws: WebSocket | null = null;
  private readonly name: string;
  private shouldReconnect = false;
  private reconnectDelay = 1000;

  onPeers?: (peers: string[]) => void;
  onPairRequest?: (from: string) => void;
  onPairResponse?: (from: string, accepted: boolean) => void;
  onTransferReceived?: (url: string, fileName: string) => void;
  onDisconnected?: () => void;
  onReconnected?: () => void;

  constructor(name: string) {
    this.name = name;
  }

  connect(): Promise<void> {
    this.shouldReconnect = true;
    this.reconnectDelay = 1000;
    return this._open(true);
  }

  /**
   * Opens a WebSocket connection.
   * `initial` — when true, a connection failure rejects the returned Promise.
   * On reconnect attempts the failure is swallowed (onclose schedules the next retry).
   */
  private _open(initial = false): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${WS_BASE}/ws/presence?name=${encodeURIComponent(this.name)}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        this.reconnectDelay = 1000;
        resolve();
      };

      ws.onerror = () => {
        if (initial && !opened) reject(new Error("presence connection failed"));
      };

      ws.onclose = () => {
        this.ws = null;
        if (!this.shouldReconnect) return;
        if (!opened) {
          // Connection closed before it opened (e.g. 409 name conflict or network error).
          // On an initial connect attempt the promise is already rejected; don't schedule
          // further retries or we'd loop forever. Only retry on subsequent reconnect calls.
          if (!initial) this._scheduleReconnect();
          return;
        }
        this.onDisconnected?.();
        this._scheduleReconnect();
      };

      ws.onmessage = (e) => {
        let msg: PresenceMsg;
        try {
          msg = JSON.parse(e.data as string);
        } catch {
          return;
        }
        switch (msg.type) {
          case "peers":
            this.onPeers?.(msg.peers.filter((p) => p !== this.name));
            break;
          case "pair-request":
            this.onPairRequest?.(msg.from);
            break;
          case "pair-response":
            this.onPairResponse?.(msg.from, msg.accepted);
            break;
          case "transfer-invite":
            this.onTransferReceived?.(msg.url, msg.fileName);
            break;
        }
      };
    });
  }

  private _scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, 30_000);
    setTimeout(() => {
      if (!this.shouldReconnect) return;
      this._open().then(() => this.onReconnected?.()).catch(() => {});
    }, delay);
  }

  requestPair(targetName: string): void {
    this.ws?.send(JSON.stringify({ type: "pair-request", target: targetName }));
  }

  respondPair(initiatorName: string, accepted: boolean): void {
    this.ws?.send(JSON.stringify({ type: "pair-response", target: initiatorName, accepted }));
  }

  sendTransferInvite(targetName: string, url: string, fileName: string): void {
    this.ws?.send(JSON.stringify({ type: "transfer-invite", target: targetName, url, fileName }));
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }
}
