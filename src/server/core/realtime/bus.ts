import { EventEmitter } from "node:events";
import type { Envelope } from "./events.js";

/**
 * Simple in-process event bus. WS server (sprint 03+) subscribes; provider
 * adapters publish through the bus, never through the WS directly. Lets us
 * unit-test event flow without a network.
 */
export class RealtimeBus {
  private emitter = new EventEmitter();
  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish<P>(env: Envelope<P>): void {
    this.emitter.emit("event", env);
  }

  subscribe(handler: (env: Envelope<unknown>) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
