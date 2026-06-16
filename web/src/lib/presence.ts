const WS_BASE = import.meta.env.VITE_WS_BASE ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

export type PresenceMsg =
  | { type: "peers"; peers: string[] }
  | { type: "pair-request"; from: string }
  | { type: "pair-response"; from: string; accepted: boolean }
  | { type: "transfer-invite"; from: string; url: string; fileName: string };

export class PresenceClient {
  private ws: WebSocket | null = null;
  private readonly name: string;

  onPeers?: (peers: string[]) => void;
  onPairRequest?: (from: string) => void;
  onPairResponse?: (from: string, accepted: boolean) => void;
  onTransferReceived?: (url: string, fileName: string) => void;

  constructor(name: string) {
    this.name = name;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_BASE}/ws/presence?name=${encodeURIComponent(this.name)}`);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("presence connection failed"));
      ws.onmessage = (e) => {
        const msg: PresenceMsg = JSON.parse(e.data);
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
    this.ws?.close();
    this.ws = null;
  }
}
