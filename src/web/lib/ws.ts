export interface RealtimeEvent {
  type: string;
  projectId?: string;
  sessionId?: string;
  version: number;
  payload: unknown;
}

type Handler = (e: RealtimeEvent) => void;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private closed = false;
  private reconnectDelay = 1000;

  constructor(private url: string = "/api/realtime") {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    this.ws?.close();
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private connect(): void {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}${this.url}`;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (ev) => {
      try {
        const env = JSON.parse(ev.data) as RealtimeEvent;
        if (typeof env.type === "string") {
          for (const h of this.handlers) h(env);
        }
      } catch {
        /* ignore non-JSON frames */
      }
    };
    this.ws.onclose = () => {
      if (this.closed) return;
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    };
    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
    };
  }
}
