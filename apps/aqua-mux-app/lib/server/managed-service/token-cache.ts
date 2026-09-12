import type { Token } from "../../managed";

export class VerifiedTokenCache {
  private readonly entries = new Map<
    string,
    { token: Token; expiresAt: number }
  >();
  constructor(
    private readonly capacity = 256,
    private readonly ttlMs = 300_000,
    private readonly now = Date.now,
  ) {
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      !Number.isSafeInteger(ttlMs) ||
      ttlMs < 1
    )
      throw new Error("Invalid metadata cache bounds.");
  }
  private prune() {
    for (const [key, value] of this.entries)
      if (value.expiresAt <= this.now()) this.entries.delete(key);
  }
  get(key: string) {
    this.prune();
    return this.entries.get(key)?.token;
  }
  set(key: string, token: Token) {
    this.prune();
    this.entries.delete(key);
    while (this.entries.size >= this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { token, expiresAt: this.now() + this.ttlMs });
  }
  get size() {
    this.prune();
    return this.entries.size;
  }
}
