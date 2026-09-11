import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeFunctionData,
  encodeFunctionData,
  parseAbi,
  type Hex,
} from "viem";
import {
  compileTransparentCall,
  transparentRouterAbi,
} from "../lib/server/route-policy/calldata";
import {
  validateCompiledRoute,
  verifyRouteProvenance,
  type VerifiedRoute,
} from "../lib/server/route-policy";
import calls from "../lib/server/route-policy/fixtures/arbitrum-calls.json";
import runtime from "../lib/server/route-policy/fixtures/arbitrum-runtime.json";

const fixture = calls[0].route as VerifiedRoute;
const now = fixture.quotedAt + 1000;
function reject(change: (route: VerifiedRoute) => void, pattern?: RegExp) {
  const route = structuredClone(fixture);
  change(route);
  assert.throws(
    () => validateCompiledRoute(fixture.request, route, now),
    pattern,
  );
}

test("real Arbitrum calldata fixtures enforce observed output minima", () => {
  for (const record of calls) {
    const route = record.route as VerifiedRoute;
    validateCompiledRoute(route.request, route, route.quotedAt + 1000);
    assert.ok(BigInt(record.simulatedOutput) >= BigInt(route.minimumAmountOut));
    assert.equal(record.broadcasts, 0);
  }
});

test("reject altered receiver, minimum, pool, flags, trailing second call and unknown executor", () => {
  const decoded = decodeFunctionData({
    abi: transparentRouterAbi,
    data: fixture.call.data,
  });
  assert.equal(decoded.functionName, "ethUnoswapTo");
  const [receiver, minimum, dex] = decoded.args;
  for (const args of [
    [receiver + 1n, minimum, dex],
    [receiver, 1n, dex],
    [receiver, minimum, dex + 1n],
    [receiver, minimum, dex | (1n << 250n)],
    [receiver, minimum, dex | (1n << 251n)],
    [receiver, minimum, dex | (1n << 254n)],
  ]) {
    reject((r) => {
      r.call.data = encodeFunctionData({
        abi: transparentRouterAbi,
        functionName: "ethUnoswapTo",
        args: args as [bigint, bigint, bigint],
      });
    });
  }
  reject((r) => {
    r.call.data = `${r.call.data}deadbeef`;
  });
  const swapAbi = parseAbi([
    "function swap(address executor,(address srcToken,address dstToken,address srcReceiver,address dstReceiver,uint256 amount,uint256 minReturnAmount,uint256 flags) desc,bytes data) payable returns(uint256,uint256)",
  ]);
  reject((r) => {
    r.call.data = encodeFunctionData({
      abi: swapAbi,
      functionName: "swap",
      args: [
        r.request.maker,
        {
          srcToken: r.request.source,
          dstToken: r.request.destination,
          srcReceiver: r.request.maker,
          dstReceiver: r.request.maker,
          amount: BigInt(r.request.amountIn),
          minReturnAmount: BigInt(r.minimumAmountOut),
          flags: 0n,
        },
        "0xdeadbeef",
      ],
    });
  });
});

test("reject metadata and canonical-plan amount or asset substitution", () => {
  reject((r) => {
    r.request.amountIn = "9000000000000000000";
  });
  reject((r) => {
    r.request.source = r.request.destination;
  });
  reject((r) => {
    r.request.destination = r.request.maker;
  });
  reject((r) => {
    r.minimumAmountOut = "1";
  });
  reject((r) => {
    r.amountIn = "1";
  });
  reject((r) => {
    r.call.value = "0x1";
  });
  reject((r) => {
    r.spender = r.request.maker;
  });
  reject((r) => {
    r.call.to = r.request.maker;
  });
  reject((r) => {
    r.policy.poolId = "unknown";
  });
  reject((r) => {
    r.expiresAt = now;
  });
  reject((r) => {
    r.quotedAt = now + 1;
  });
  reject((r) => {
    r.expiresAt = r.quotedAt + 30_001;
  });
  reject((r) => {
    r.amountOut = "01";
  });
  reject((r) => {
    r.request.chainId = 4663;
  });
});

test("ERC20 amount and native unwrap are explicit and have no permit or arbitrary-call bytes", () => {
  const request = {
    ...fixture.request,
    source: fixture.request.destination,
    destination: fixture.request.source,
    amountIn: "1000000",
  };
  const call = compileTransparentCall(request, "100000000000000");
  assert.equal(call.value, "0x0");
  const decoded = decodeFunctionData({
    abi: transparentRouterAbi,
    data: call.data,
  });
  assert.equal(decoded.functionName, "unoswapTo");
  assert.equal(decoded.args[0], BigInt(request.maker));
  assert.equal(decoded.args[1], BigInt(request.source));
  assert.equal(decoded.args[2], 1000000n);
  assert.equal(decoded.args[4] & (1n << 252n), 1n << 252n);
  assert.equal(decoded.args[4] & (1n << 250n), 0n);
  const route: VerifiedRoute = {
    ...fixture,
    request,
    call,
    amountIn: request.amountIn,
    amountOut: "100000000000000",
    minimumAmountOut: "100000000000000",
  };
  validateCompiledRoute(request, route, now);
  const changed = structuredClone(route);
  changed.call.data = encodeFunctionData({
    abi: transparentRouterAbi,
    functionName: "unoswapTo",
    args: [
      decoded.args[0],
      decoded.args[1],
      9000000n,
      decoded.args[3],
      decoded.args[4],
    ],
  });
  assert.throws(() => validateCompiledRoute(request, changed, now));
});

test("fresh provenance checks reject wrong chain, absent code and changed pool/router code", async () => {
  const route = structuredClone(fixture);
  route.quotedAt = Date.now();
  route.expiresAt = route.quotedAt + 30_000;
  const reader = {
    getChainId: async () => 42161,
    getCode: async ({ address }: { address: string }) =>
      (address === route.call.to ? runtime.router : runtime.pool) as Hex,
  };
  await verifyRouteProvenance(route, reader);
  await assert.rejects(
    verifyRouteProvenance(route, { ...reader, getChainId: async () => 56 }),
    /chain/,
  );
  await assert.rejects(
    verifyRouteProvenance(route, { ...reader, getCode: async () => "0x" }),
    /code/,
  );
  for (const changed of [route.call.to, "pool"]) {
    await assert.rejects(
      verifyRouteProvenance(route, {
        ...reader,
        getCode: async ({ address }) =>
          (changed === "pool" ? address !== route.call.to : address === changed)
            ? "0x6000"
            : reader.getCode({ address }),
      }),
      /code/,
    );
  }
});
