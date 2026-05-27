import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  pickAlgorithm,
} from "../src/server/core/auth.js";

describe("auth.hashPassword/verifyPassword", () => {
  it("hashes and verifies with the auto-picked algorithm", async () => {
    const { hash, algorithm } = await hashPassword("hunter2hunter2");
    expect(["argon2id", "bcrypt", "pbkdf2"]).toContain(algorithm);
    expect(hash).not.toBe("hunter2hunter2");
    expect(await verifyPassword("hunter2hunter2", hash, algorithm)).toBe(true);
    expect(await verifyPassword("wrong-wrong-1", hash, algorithm)).toBe(false);
  });

  it("env override forces pbkdf2", async () => {
    const prev = process.env["AGENT_REMOTE_CONTROL_HASH"];
    process.env["AGENT_REMOTE_CONTROL_HASH"] = "pbkdf2";
    try {
      const { algorithm, hash } = await hashPassword("hunter2hunter2");
      expect(algorithm).toBe("pbkdf2");
      expect(await verifyPassword("hunter2hunter2", hash, "pbkdf2")).toBe(true);
      expect(await verifyPassword("nope-nope-nope", hash, "pbkdf2")).toBe(false);
    } finally {
      if (prev === undefined) delete process.env["AGENT_REMOTE_CONTROL_HASH"];
      else process.env["AGENT_REMOTE_CONTROL_HASH"] = prev;
    }
  });

  it("pickAlgorithm honors explicit override", async () => {
    expect(await pickAlgorithm("pbkdf2")).toBe("pbkdf2");
    expect(await pickAlgorithm("bcrypt")).toBe("bcrypt");
  });

  it("verifyPassword rejects garbage hash without throwing", async () => {
    expect(await verifyPassword("anything", "not-a-real-hash", "argon2id")).toBe(false);
    expect(await verifyPassword("anything", "not-a-real-hash", "bcrypt")).toBe(false);
    expect(await verifyPassword("anything", "not-a-real-hash", "pbkdf2")).toBe(false);
  });
});
