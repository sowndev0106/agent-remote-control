import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeClient, type RealtimeEvent } from "../../src/web/lib/ws.js";

class FakeWS {
  static instances: FakeWS[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 0;
  closed = false;

  constructor(public url: string) {
    FakeWS.instances.push(this);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  emit(data: string) {
    this.onmessage?.({ data });
  }
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  vi.stubGlobal("location", { protocol: "http:", host: "127.0.0.1:4096" });
});

describe("RealtimeClient", () => {
  it("connects to the ws:// URL derived from location", () => {
    new RealtimeClient().start();
    expect(FakeWS.instances).toHaveLength(1);
    expect(FakeWS.instances[0]!.url).toBe("ws://127.0.0.1:4096/api/realtime");
  });

  it("uses wss:// when the page is https", () => {
    vi.stubGlobal("location", { protocol: "https:", host: "host:9" });
    new RealtimeClient("/api/realtime").start();
    expect(FakeWS.instances[0]!.url).toBe("wss://host:9/api/realtime");
  });

  it("dispatches parsed events with a string type to handlers", () => {
    const client = new RealtimeClient();
    const seen: RealtimeEvent[] = [];
    client.on((e) => seen.push(e));
    client.start();
    FakeWS.instances[0]!.emit(
      JSON.stringify({
        type: "provider.snapshot.changed",
        version: 1,
        payload: { hash: "a" },
      }),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]!.type).toBe("provider.snapshot.changed");
  });

  it("ignores non-JSON frames without throwing", () => {
    const client = new RealtimeClient();
    const seen: RealtimeEvent[] = [];
    client.on((e) => seen.push(e));
    client.start();
    expect(() => FakeWS.instances[0]!.emit("not json {{{")).not.toThrow();
    expect(seen).toHaveLength(0);
  });

  it("the unsubscribe function stops further delivery", () => {
    const client = new RealtimeClient();
    const seen: RealtimeEvent[] = [];
    const off = client.on((e) => seen.push(e));
    client.start();
    off();
    FakeWS.instances[0]!.emit(JSON.stringify({ type: "x", version: 1, payload: null }));
    expect(seen).toHaveLength(0);
  });

  it("stop() prevents reconnect on close", () => {
    vi.useFakeTimers();
    const client = new RealtimeClient();
    client.start();
    client.stop();
    vi.advanceTimersByTime(5000);
    expect(FakeWS.instances).toHaveLength(1);
  });

  it("reconnects after an unexpected close", () => {
    vi.useFakeTimers();
    const client = new RealtimeClient();
    client.start();
    FakeWS.instances[0]!.onclose?.();
    vi.advanceTimersByTime(1000);
    expect(FakeWS.instances.length).toBeGreaterThanOrEqual(2);
    client.stop();
  });
});
