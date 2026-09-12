import { encodeFunctionData, erc20Abi, formatUnits, type Address } from "viem";
import { verifyRobinhoodAssets } from "./route-policy/direct/assets";
import { NATIVE, wrapped } from "../config";
import {
  basketSchema,
  splitAmount,
  units,
  type Call,
  type Plan,
} from "../model";
import { resolveLegacyBasket } from "./legacy-token-resolution";
import { buildPlan } from "./plan";
import { client } from "./rpc";
import {
  quoteVerifiedRoute,
  validateCompiledRoute,
  verifiedRouteCalls,
} from "./route-policy";

/** Public swap plans use the same source-attested compiler as managed execution. */
export async function buildVerifiedPublicPlan(
  input: unknown,
  account: Address,
): Promise<Plan> {
  const parsed = basketSchema.parse(input);
  if (parsed.mode === "liquidity") {
    await verifyRobinhoodAssets(
      parsed.chainId,
      [
        parsed.source,
        ...parsed.legs.map((leg) => leg.address),
        ...(parsed.source === NATIVE ? [wrapped(parsed.chainId).address] : []),
      ],
      client(parsed.chainId),
    );
    return buildPlan(input, account);
  }
  const { basket, tokens, resolveToken } = await resolveLegacyBasket(input);
  const rpc = client(basket.chainId);
  if ((await rpc.getChainId()) !== basket.chainId)
    throw new Error("Configured RPC returned the wrong chain.");
  const source = resolveToken(basket.chainId, basket.source);
  const total = units(basket.amount, source.decimals);
  const balance =
    basket.source === NATIVE
      ? await rpc.getBalance({ address: account })
      : await rpc.readContract({
          address: basket.source,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        });
  if (balance < total)
    throw new Error(`Insufficient ${source.symbol} balance.`);
  const amounts = splitAmount(
    total,
    basket.legs.map((leg) => leg.bps),
  );
  const requests = basket.legs.map((leg, index) => ({
    chainId: basket.chainId,
    maker: account,
    source: basket.source,
    destination: leg.address,
    amountIn: amounts[index].toString(),
    minimumAmountOut: "1",
    slippageBps: basket.slippageBps,
  }));
  const routes = await Promise.all(requests.map(quoteVerifiedRoute));
  const calls: Call[] = [];
  const approvals = new Map<Address, bigint>();
  if (basket.source !== NATIVE) {
    for (const route of routes) {
      if (route.approvalRequired !== false)
        approvals.set(
          route.spender,
          (approvals.get(route.spender) ?? 0n) + BigInt(route.amountIn),
        );
    }
  }
  for (const [spender, amount] of approvals) {
    const allowance = await rpc.readContract({
      address: basket.source,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, spender],
    });
    if (allowance >= amount) continue;
    for (const value of allowance > 0n ? [0n, amount] : [amount])
      calls.push({
        to: basket.source,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, value],
        }),
        value: "0x0",
        label: `Approve ${source.symbol} for verified route`,
      });
  }
  const summary = [`Pay ${basket.amount} ${source.symbol}.`];
  routes.forEach((route, index) => {
    validateCompiledRoute(requests[index], route);
    calls.push(...verifiedRouteCalls(route));
    const output = resolveToken(basket.chainId, basket.legs[index].address);
    summary.push(
      `Receive at least ${formatUnits(BigInt(route.minimumAmountOut), output.decimals)} ${output.symbol}.`,
    );
  });
  summary.push(
    "Every call must succeed or the entire batch reverts.",
    "Output minimums and receiver are encoded by the verified route compiler.",
  );
  return {
    chainId: basket.chainId,
    account,
    mode: "swap",
    calls,
    strategies: [],
    summary,
    verifiedTokens: tokens,
    createdAt: Date.now(),
    expiresAt: Math.min(...routes.map((route) => route.expiresAt)),
  };
}
