const WS_BASE = import.meta.env.VITE_WS_BASE ?? `ws://${location.host}`;

export type PresenceMsg =
  | { type: "peers"; peers: string[] }
  | { type: "pair-request"; from: string }
  | { type: "pair-response"; from: string; accepted: boolean };

export class PresenceClient {
  private ws: WebSocket | null = null;
  private name: string;
  onPeers?: (peers: string[]) => void;
  onPairRequest?: (from: string) => void;
  onPairResponse?: (from: string, accepted: boolean) => void;

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
        if (msg.type === "peers") this.onPeers?.(msg.peers.filter((p) => p !== this.name));
        if (msg.type === "pair-request") this.onPairRequest?.(msg.from);
        if (msg.type === "pair-response") this.onPairResponse?.(msg.from, msg.accepted);
      };
    });
  }

  requestPair(targetName: string): void {
    this.ws?.send(JSON.stringify({ type: "pair-request", target: targetName }));
  }

  respondPair(initiatorName: string, accepted: boolean): void {
    this.ws?.send(JSON.stringify({ type: "pair-response", target: initiatorName, accepted }));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
