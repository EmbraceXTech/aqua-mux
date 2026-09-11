import { createHash, randomBytes, randomUUID } from "node:crypto";
import { verifyMessage, type Hex } from "viem";
import {
  addressSchema,
  chainIdSchema,
  hexSchema,
  idSchema,
} from "../../managed";
import type { ManagedStore } from "../store";

export type OwnerSession = {
  owner: `0x${string}`;
  sessionId: string;
  expiresAt: number;
};
export type VerifiedSession = OwnerSession & { token: string };
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403 | 429,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
type ChallengeRow = {
  owner: string;
  origin: string;
  message: string;
  expires_at: number;
  used: number;
};

export class WalletAuth {
  readonly origin: string;
  constructor(
    private readonly store: ManagedStore,
    origin: string,
    private readonly now: () => number = Date.now,
  ) {
    const parsed = new URL(origin);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin
    )
      throw new Error(
        "Auth origin must be an exact HTTP origin without a path.",
      );
    if (
      parsed.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    )
      throw new Error("Nonlocal auth requires HTTPS.");
    this.origin = origin;
  }
  assertOrigin(origin: string | null) {
    if (origin !== this.origin)
      throw new AuthError(403, "Request origin is not allowed.");
  }
  challenge(ownerInput: string, origin: string, chainId: number) {
    this.assertOrigin(origin);
    chainIdSchema.parse(chainId);
    const owner = addressSchema.parse(ownerInput);
    const now = this.now();
    const expiresAt = now + 5 * 60_000;
    const id = randomUUID();
    const nonce = randomBytes(24).toString("hex");
    const message = `${new URL(origin).host} wants you to sign in to AquaMux with your Ethereum account:\n${owner}\n\nAuthenticate access to your managed strategies. This signature does not authorize transactions.\n\nURI: ${origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${new Date(expiresAt).toISOString()}\nRequest ID: ${id}`;
    this.store.transaction(() => {
      this.store.db
        .prepare("DELETE FROM challenges WHERE expires_at<=?")
        .run(now);
      this.store.db
        .prepare("DELETE FROM sessions WHERE expires_at<=?")
        .run(now);
      const count = this.store.db
        .prepare(
          "SELECT count(*) AS count FROM challenges WHERE owner=? AND used=0",
        )
        .get(owner) as { count: number };
      if (count.count >= 10)
        throw new AuthError(429, "Too many active wallet challenges.");
      this.store.db
        .prepare(
          "INSERT INTO challenges(id,owner,origin,message,expires_at) VALUES(?,?,?,?,?)",
        )
        .run(id, owner, origin, message, expiresAt);
    });
    return { id, message, expiresAt };
  }
  async verify(
    id: string,
    signature: string,
    origin: string,
  ): Promise<VerifiedSession> {
    this.assertOrigin(origin);
    idSchema.parse(id);
    hexSchema.parse(signature);
    // EOA proof only. Contract-wallet ownership needs a separately verified ERC-1271 path.
    if (signature.length !== 132 && signature.length !== 130)
      throw new AuthError(401, "Invalid wallet proof.");
    const row = this.store.db
      .prepare("SELECT * FROM challenges WHERE id=?")
      .get(id) as ChallengeRow | undefined;
    if (
      !row ||
      row.used ||
      row.expires_at <= this.now() ||
      row.origin !== origin
    )
      throw new AuthError(401, "Wallet challenge expired or was already used.");
    let valid = false;
    try {
      valid = await verifyMessage({
        address: addressSchema.parse(row.owner),
        message: row.message,
        signature: signature as Hex,
      });
    } catch {
      /* Invalid signatures are an authentication failure. */
    }
    if (!valid) throw new AuthError(401, "Invalid wallet proof.");
    const token = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    const expiresAt = this.now() + 8 * 60 * 60_000;
    return this.store.transaction(() => {
      const consumed = this.store.db
        .prepare(
          "UPDATE challenges SET used=1 WHERE id=? AND used=0 AND expires_at>?",
        )
        .run(id, this.now());
      if (consumed.changes !== 1)
        throw new AuthError(
          401,
          "Wallet challenge expired or was already used.",
        );
      this.store.db
        .prepare(
          "INSERT INTO sessions(token_hash,id,owner,origin,expires_at) VALUES(?,?,?,?,?)",
        )
        .run(hashToken(token), sessionId, row.owner, origin, expiresAt);
      return {
        token,
        owner: addressSchema.parse(row.owner),
        sessionId,
        expiresAt,
      };
    });
  }
  authenticate(token: string, origin: string): OwnerSession {
    this.assertOrigin(origin);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new AuthError(401, "Authentication required.");
    const row = this.store.db
      .prepare(
        "SELECT id,owner,origin,expires_at FROM sessions WHERE token_hash=?",
      )
      .get(hashToken(token)) as
      | { id: string; owner: string; origin: string; expires_at: number }
      | undefined;
    if (!row || row.origin !== origin || row.expires_at <= this.now())
      throw new AuthError(401, "Session expired or unavailable.");
    return {
      owner: addressSchema.parse(row.owner),
      sessionId: row.id,
      expiresAt: row.expires_at,
    };
  }
  revoke(token: string) {
    this.store.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(hashToken(token));
  }
}
