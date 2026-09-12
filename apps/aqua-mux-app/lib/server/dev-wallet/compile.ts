import { encodeFunctionData, erc20Abi, formatUnits, type Address } from "viem";
import { NATIVE } from "../../config";
import { basketSchema, splitAmount, units, type Call } from "../../model";
import { resolveLegacyBasket } from "../legacy-token-resolution";
import { buildPlan } from "../plan";
import { verifiedRouteCalls } from "../route-policy/route-calls";
import { quoteVerifiedRoute } from "../route-policy/quote";
import { validateCompiledRoute } from "../route-policy/validate";
import type { RoutePolicyRequest, VerifiedRoute } from "../route-policy/types";
import { client } from "../rpc";
import type { DevBatchPlan } from "./batch";
import { DevWalletError } from "./config";
import { validateDevPlan } from "./policy";

type Dependencies = {
  resolve?: typeof resolveLegacyBasket;
  quote?: typeof quoteVerifiedRoute;
  rpc?: typeof client;
  liquidity?: typeof buildPlan;
};

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    /^(No verified|Verified routes|Route amount|A route must|The verified|Direct-pool|Route RPC|Route deployment)/.test(
      message,
    )
  )
    return message;
  return "The verified local route is unavailable. Review the selected pair and configured RPC connection.";
}

/** The local signer never forwards quote-provider executor calldata. */
export async function buildDevBasketPlan(
  input: unknown,
  account: Address,
  dependencies: Dependencies = {},
): Promise<DevBatchPlan> {
  if (basketSchema.parse(input).mode === "liquidity")
    return (dependencies.liquidity ?? buildPlan)(input, account);
  const { basket, tokens, resolveToken } = await (
    dependencies.resolve ?? resolveLegacyBasket
  )(input);
  const source = resolveToken(basket.chainId, basket.source);
  const total = units(basket.amount, source.decimals);
  const rpc = (dependencies.rpc ?? client)(basket.chainId);
  if ((await rpc.getChainId()) !== basket.chainId)
    throw new DevWalletError("Configured RPC returned the wrong chain.");
  const balance =
    source.address === NATIVE
      ? await rpc.getBalance({ address: account })
      : await rpc.readContract({
          address: source.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        });
  if (balance < total)
    throw new DevWalletError(
      "Insufficient source balance for the reviewed basket.",
    );
  const amounts = splitAmount(
    total,
    basket.legs.map((leg) => leg.bps),
  );
  const plan: DevBatchPlan = {
    chainId: basket.chainId,
    account,
    mode: "swap",
    calls: [],
    strategies: [],
    summary: [`Pay ${basket.amount} ${source.symbol}.`],
    createdAt: Date.now(),
    expiresAt: Date.now() + 30_000,
    verifiedTokens: [...tokens],
    minimumReceipts: [],
    verifiedRoutes: [],
  };
  let spender: Address | undefined;
  for (const [index, leg] of basket.legs.entries()) {
    const destination = resolveToken(basket.chainId, leg.address);
    const request: RoutePolicyRequest = {
      chainId: basket.chainId,
      maker: account,
      source: source.address,
      destination: destination.address,
      amountIn: String(amounts[index]),
      minimumAmountOut: "1",
      slippageBps: basket.slippageBps,
    };
    let route: VerifiedRoute;
    try {
      route = await (dependencies.quote ?? quoteVerifiedRoute)({
        ...request,
      });
    } catch (error) {
      throw new DevWalletError(routeError(error));
    }
    validateCompiledRoute(request, route);
    if (
      route.approvalRequired !== false &&
      spender &&
      spender !== route.spender
    )
      throw new DevWalletError("The basket routes use different spenders.");
    if (route.approvalRequired !== false) spender = route.spender;
    plan.verifiedRoutes!.push({ request, route });
    plan.calls.push(...verifiedRouteCalls(route));
    plan.minimumReceipts!.push({
      token: {
        address: destination.address,
        decimals: destination.decimals,
        symbol: destination.symbol,
      },
      amount: route.minimumAmountOut,
    });
    plan.summary.push(
      `Receive at least ${formatUnits(BigInt(route.minimumAmountOut), destination.decimals)} ${destination.symbol}.`,
    );
    plan.expiresAt = Math.min(plan.expiresAt, route.expiresAt);
  }
  if (source.address !== NATIVE && spender) {
    const allowance = await rpc.readContract({
      address: source.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, spender],
    });
    if (allowance < total) {
      const approve = (amount: bigint): Call => ({
        to: source.address,
        value: "0x0",
        label: `Approve ${source.symbol} for the reviewed basket`,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender!, amount],
        }),
      });
      plan.calls.unshift(
        ...(allowance > 0n ? [approve(0n)] : []),
        approve(total),
      );
    }
  }
  plan.summary.push("Every swap must succeed or the entire batch reverts.");
  validateDevPlan(plan, account);
  return plan;
}
