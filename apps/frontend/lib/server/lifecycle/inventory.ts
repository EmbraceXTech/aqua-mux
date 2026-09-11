import type { Address } from "viem";
import {
  tokenAmountSchema,
  type Token,
  type TokenAmount,
} from "../../managed/primitives";
import { uint } from "../../managed-compiler/arithmetic";

/** One balance per real token, independent of the number of virtual claims. */
export class Inventory {
  private readonly entries = new Map<
    Address,
    { token: Token; amount: bigint }
  >();
  constructor(amounts: TokenAmount[]) {
    for (const input of amounts) {
      const item = tokenAmountSchema.parse(input);
      if (this.entries.has(item.token.address))
        throw new Error("Duplicate real inventory token; select it once.");
      this.entries.set(item.token.address, {
        token: item.token,
        amount: uint(item.amount),
      });
    }
  }
  amount(token: Token): bigint {
    return this.entries.get(token.address)?.amount ?? 0n;
  }
  credit(token: Token, amount: bigint) {
    if (amount < 0n) throw new Error("Cannot credit negative inventory.");
    const current = this.entries.get(token.address);
    if (current && current.token.decimals !== token.decimals)
      throw new Error("Inconsistent token decimals.");
    const next = this.amount(token) + amount;
    uint(String(next));
    this.entries.set(token.address, {
      token: {
        address: token.address,
        decimals: token.decimals,
        symbol: token.symbol,
      },
      amount: next,
    });
  }
  debit(token: Token, amount: bigint) {
    if (amount < 0n || this.amount(token) < amount)
      throw new Error(`Insufficient selected ${token.symbol} inventory.`);
    this.entries.set(token.address, {
      token: {
        address: token.address,
        decimals: token.decimals,
        symbol: token.symbol,
      },
      amount: this.amount(token) - amount,
    });
  }
  values(): TokenAmount[] {
    return [...this.entries.values()]
      .sort((a, b) => a.token.address.localeCompare(b.token.address))
      .map(({ token, amount }) => ({ token, amount: String(amount) }));
  }
}

export function reconcileResiduals(
  conservative: TokenAmount[],
  before: TokenAmount[],
  after: TokenAmount[],
) {
  const expected = new Inventory(conservative),
    previous = new Inventory(before),
    actual = new Inventory(after);
  return expected.values().map(({ token, amount }) => {
    if (!after.some((item) => item.token.address === token.address))
      throw new Error(
        `Missing observed balance for ${token.symbol}; residual is unknown.`,
      );
    const observed = actual.amount(token),
      minimum = BigInt(amount);
    return {
      token,
      expectedMinimum: amount,
      observed: String(observed),
      delta: String(observed - previous.amount(token)),
      residual: String(observed > minimum ? observed - minimum : 0n),
      shortfall: String(observed < minimum ? minimum - observed : 0n),
    };
  });
}
