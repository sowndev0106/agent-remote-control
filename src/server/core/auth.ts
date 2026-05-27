import { randomBytes, pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { HashAlgo } from "./config.js";

const pbkdf2Async = promisify(pbkdf2);
const PBKDF2_ITER = 210_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";

export interface HashResult {
  hash: string;
  algorithm: HashAlgo;
}

export async function pickAlgorithm(force?: HashAlgo): Promise<HashAlgo> {
  if (force) return force;
  const env = process.env["AGENT_REMOTE_CONTROL_HASH"] as HashAlgo | undefined;
  if (env === "pbkdf2" || env === "bcrypt" || env === "argon2id") return env;
  try {
    await import("argon2");
    return "argon2id";
  } catch {
    /* try bcrypt */
  }
  try {
    await import("bcrypt");
    return "bcrypt";
  } catch {
    /* fall through */
  }
  return "pbkdf2";
}

export async function hashPassword(
  password: string,
  force?: HashAlgo,
): Promise<HashResult> {
  const algorithm = await pickAlgorithm(force);
  switch (algorithm) {
    case "argon2id": {
      const argon2 = await import("argon2");
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      return { hash, algorithm };
    }
    case "bcrypt": {
      const bcrypt = await import("bcrypt");
      const hash = await bcrypt.hash(password, 12);
      return { hash, algorithm };
    }
    case "pbkdf2": {
      const salt = randomBytes(16);
      const derived = await pbkdf2Async(
        password,
        salt,
        PBKDF2_ITER,
        PBKDF2_KEYLEN,
        PBKDF2_DIGEST,
      );
      const hash = `pbkdf2$${PBKDF2_DIGEST}$${PBKDF2_ITER}$${salt.toString(
        "base64",
      )}$${derived.toString("base64")}`;
      return { hash, algorithm };
    }
  }
}

export async function verifyPassword(
  password: string,
  hash: string,
  algorithm: HashAlgo,
): Promise<boolean> {
  switch (algorithm) {
    case "argon2id": {
      const argon2 = await import("argon2");
      try {
        return await argon2.verify(hash, password);
      } catch {
        return false;
      }
    }
    case "bcrypt": {
      const bcrypt = await import("bcrypt");
      try {
        return await bcrypt.compare(password, hash);
      } catch {
        return false;
      }
    }
    case "pbkdf2": {
      const parts = hash.split("$");
      if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
      const digest = parts[1]!;
      const iterStr = parts[2]!;
      const saltB64 = parts[3]!;
      const hashB64 = parts[4]!;
      const salt = Buffer.from(saltB64, "base64");
      const expected = Buffer.from(hashB64, "base64");
      const derived = await pbkdf2Async(
        password,
        salt,
        Number(iterStr),
        expected.length,
        digest,
      );
      if (derived.length !== expected.length) return false;
      return timingSafeEqual(derived, expected);
    }
  }
}
