import { randomBytes } from "node:crypto";
import {
  encodeFunctionData,
  formatUnits,
  erc20Abi,
  parseAbi,
  toHex,
  type Address,
} from "viem";
import { AQUA, SWAP_VM, NATIVE, classicRouter, wrapped } from "../config";
import { units, type Call, type Plan } from "../model";
import { makeStrategy } from "../strategy";
import { resolveLegacyBasket } from "./legacy-token-resolution";
import { client } from "./rpc";
import { quoteBasket } from "./swap";
export async function buildPlan(
  input: unknown,
  account: Address,
): Promise<Plan> {
  const resolved = await resolveLegacyBasket(input),
    b = resolved.basket,
    verifiedTokens = resolved.tokens,
    resolveToken = resolved.resolveToken,
    c = client(b.chainId),
    source = resolveToken(b.chainId, b.source),
    total = units(b.amount, source.decimals);
  if ((await c.getChainId()) !== b.chainId)
    throw new Error("Configured RPC returned the wrong chain.");
  const router = classicRouter(b.chainId);
  const targets = b.mode === "liquidity" ? [AQUA, SWAP_VM] : [router];
  for (const address of targets)
    if (!(await c.getCode({ address }))?.match(/^0x[0-9a-fA-F]{2,}$/))
      throw new Error("Required contract is unavailable on this chain.");
  let expiresAt = Date.now() + 120000;
  const calls: Call[] = [],
    strategies: Plan["strategies"] = [],
    summary: string[] = [];
  async function requireBalance(address: Address, amount: bigint) {
    const available =
      address === NATIVE
        ? await c.getBalance({ address: account })
        : await c.readContract({
            address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          });
    if (available < amount)
      throw new Error(
        `Insufficient ${resolveToken(b.chainId, address).symbol} balance.`,
      );
  }
  async function approve(address: Address, spender: Address, amount: bigint) {
    const current = await c.readContract({
      address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, spender],
    });
    if (current >= amount) return;
    const push = (n: bigint) =>
      calls.push({
        to: address,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, n],
        }),
        value: "0x0",
        label: `Approve ${resolveToken(b.chainId, address).symbol} for ${spender === AQUA ? "Aqua" : "1inch"}`,
      });
    if (current > 0n) push(0n);
    push(amount);
  }
  await requireBalance(b.source, total);
  if (b.mode === "swap") {
    const quote = await quoteBasket(b, account, resolveToken);
    expiresAt = quote.expiresAt;
    summary.push(`Pay ${b.amount} ${source.symbol}.`);
    if (b.source !== NATIVE) await approve(b.source, router, total);
    for (const l of quote.legs) {
      const output = resolveToken(b.chainId, l.address);
      summary.push(
        `Receive at least ${formatUnits(BigInt(l.minAmountOut), output.decimals)} ${output.symbol}.`,
      );
      const value = BigInt(l.tx.value ?? 0);
      if (value !== (b.source === NATIVE ? BigInt(l.amountIn) : 0n))
        throw new Error("Unexpected native value in swap transaction.");
      calls.push({
        to: router,
        data: l.tx.data,
        value: toHex(value),
        label: `Swap to ${resolveToken(b.chainId, l.address).symbol}`,
      });
    }
    summary.push(
      "Every swap must succeed or the entire batch reverts.",
      "Output minimums are encoded by the 1inch Swap API.",
    );
  } else {
    const base =
      b.source === NATIVE
        ? resolveToken(b.chainId, wrapped(b.chainId).address)
        : source;
    if (b.legs.some((l) => l.address === base.address))
      throw new Error(
        "The paired token must differ from the wrapped base token.",
      );
    if (b.source === NATIVE)
      calls.push({
        to: base.address,
        data: encodeFunctionData({
          abi: parseAbi(["function deposit() payable"]),
          functionName: "deposit",
        }),
        value: toHex(total),
        label: `Wrap ${source.symbol} to ${base.symbol}`,
      });
    await approve(base.address, AQUA, total);
    for (const leg of b.legs) {
      const t = resolveToken(b.chainId, leg.address);
      if (t.address === NATIVE)
        throw new Error("Choose a wrapped or ERC-20 token on the paired side.");
      const n = units(leg.amount, t.decimals);
      await requireBalance(t.address, n);
      await approve(t.address, AQUA, n);
      const range = leg.range ?? b.range;
      const s = makeStrategy(
        account,
        base.address,
        t.address,
        total,
        n,
        b.feeBps,
        range,
        BigInt("0x" + randomBytes(8).toString("hex")),
      );
      calls.push({ ...s.call, label: `Create ${base.symbol} / ${t.symbol}` });
      summary.push(
        `${base.symbol} / ${t.symbol}: shared ${b.amount} ${base.symbol}, paired with ${leg.amount} ${t.symbol}.`,
        range === "full"
          ? "Full-range constant product."
          : `Concentrated bounds ${range.minPct}% to +${range.maxPct}% around the reserve ratio.`,
      );
      strategies.push({
        hash: s.hash,
        pair: `${base.symbol} / ${t.symbol}`,
        tokens: s.tokens,
      });
    }
    summary.push(
      `${b.amount} ${base.symbol} backs all ${b.legs.length} pairs. It is shared, not multiplied.`,
      `Paired assets must already be in your wallet. Fills against one pair change the backing of the others.`,
      `The reserve amounts and selected curve determine the opening price. Review them against the market before signing.`,
      `Swap fee ${b.feeBps / 100}%.`,
      `Strategies include the 1inch resolver access check. Portfolio indexing and resolver discovery are external to AquaMux.`,
    );
  }
  return {
    chainId: b.chainId,
    account,
    mode: b.mode,
    calls,
    strategies,
    summary,
    verifiedTokens,
    createdAt: Date.now(),
    expiresAt,
  };
}
