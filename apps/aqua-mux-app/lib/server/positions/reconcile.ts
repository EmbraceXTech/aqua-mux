import type { Address, Hex } from "viem";
import type { PositionRef, PositionRpc } from "./types";

export type TokenBacking = {
  token: Address;
  virtualAllocation: string | null;
  tokensCount: number | null;
  walletBalance: string | null;
  allowance: string | null;
  inventoryUpperBound: string | null;
};
export type ReconciledPosition = {
  position: PositionRef;
  registration: "active" | "docked" | "unregistered" | "unknown";
  backing: TokenBacking[];
};
export type Reconciliation = {
  chainId: number | null;
  baselineBlock: { number: string; hash: Hex } | null;
  block: { number: string; hash: Hex } | null;
  checkedAt: string;
  health: "current" | "partial" | "unavailable";
  positions: ReconciledPosition[];
};
const unknown = (position: PositionRef): ReconciledPosition => ({
  position,
  registration: "unknown",
  backing: position.tokens.map((token) => ({
    token,
    virtualAllocation: null,
    tokensCount: null,
    walletBalance: null,
    allowance: null,
    inventoryUpperBound: null,
  })),
});

/** Defaults to fresh head reads. atBlock is only for accounting against a canonical observer cursor. */
export async function reconcilePositions(
  rpc: PositionRpc,
  positions: PositionRef[],
  aqua: Address,
  options: {
    atBlock?: { number: string; hash: Hex };
    baselineBlock?: { number: string; hash: Hex };
  } = {},
): Promise<Reconciliation> {
  const result: Reconciliation = {
    chainId: null,
    baselineBlock: null,
    block: null,
    checkedAt: new Date().toISOString(),
    health: "unavailable",
    positions: positions.map(unknown),
  };
  try {
    const chainId = await rpc.chainId();
    if (positions.some((position) => position.chainId !== chainId))
      throw new Error("Mixed or incorrect reconciliation chain.");
    const head = await rpc.head();
    const number = options.atBlock ? BigInt(options.atBlock.number) : head;
    if (number < 0n || number > head)
      throw new Error("Invalid reconciliation block.");
    const anchor = await rpc.block(number);
    if (options.atBlock && anchor.hash !== options.atBlock.hash)
      throw new Error("Requested reconciliation block is no longer canonical.");
    if (options.baselineBlock) {
      const baselineNumber = BigInt(options.baselineBlock.number);
      if (
        baselineNumber < 0n ||
        baselineNumber > number ||
        (await rpc.block(baselineNumber)).hash !== options.baselineBlock.hash
      )
        throw new Error("Invalid or noncanonical baseline block.");
    }
    const wallets = new Map<
      string,
      Promise<readonly [string | null, string | null]>
    >();
    let partial = false;
    result.positions = await Promise.all(
      positions.map(async (position) => {
        const backing = await Promise.all(
          position.tokens.map(async (token): Promise<TokenBacking> => {
            const key = `${position.maker.toLowerCase()}:${token.toLowerCase()}`;
            if (!wallets.has(key))
              wallets.set(
                key,
                Promise.allSettled([
                  rpc.balance(token, position.maker, number),
                  rpc.allowance(token, position.maker, aqua, number),
                ]).then(
                  ([balance, allowance]) =>
                    [
                      balance.status === "fulfilled"
                        ? balance.value.toString()
                        : null,
                      allowance.status === "fulfilled"
                        ? allowance.value.toString()
                        : null,
                    ] as const,
                ),
              );
            const [walletBalance, allowance] = await wallets.get(key)!;
            let virtualAllocation: string | null = null;
            let tokensCount: number | null = null;
            try {
              const raw = await rpc.virtual(aqua, position, token, number);
              virtualAllocation = raw[0].toString();
              tokensCount = raw[1];
            } catch {
              partial = true;
            }
            if (walletBalance === null || allowance === null) partial = true;
            const values = [virtualAllocation, walletBalance, allowance];
            const inventoryUpperBound = values.every((value) => value !== null)
              ? values
                  .map((value) => BigInt(value!))
                  .reduce((a, b) => (a < b ? a : b))
                  .toString()
              : null;
            return {
              token,
              virtualAllocation,
              tokensCount,
              walletBalance,
              allowance,
              inventoryUpperBound,
            };
          }),
        );
        const counts = backing.map((item) => item.tokensCount);
        const registration =
          counts.length === 0 || counts.some((count) => count === null)
            ? "unknown"
            : counts.every((count) => count === 255)
              ? "docked"
              : counts.every((count) => count === 0)
                ? "unregistered"
                : counts.every(
                      (count) =>
                        count === position.tokens.length && count !== 255,
                    )
                  ? "active"
                  : "unknown";
        return { position, backing, registration } as ReconciledPosition;
      }),
    );
    if ((await rpc.block(number)).hash !== anchor.hash)
      throw new Error("Reconciliation block changed.");
    if (
      options.baselineBlock &&
      (await rpc.block(BigInt(options.baselineBlock.number))).hash !==
        options.baselineBlock.hash
    )
      throw new Error("Baseline block changed during reconciliation.");
    result.baselineBlock = options.baselineBlock ?? null;
    result.chainId = chainId;
    result.block = { number: number.toString(), hash: anchor.hash };
    result.health = partial ? "partial" : "current";
  } catch {
    result.positions = positions.map(unknown);
  }
  return result;
}
