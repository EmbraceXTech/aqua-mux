import assert from "node:assert/strict";
import { Address as SdkAddress, HexString } from "@1inch/sdk-core";
import { Order, SwapVMContract, TakerTraits } from "@1inch/swap-vm-sdk";
import {
  createWalletClient,
  encodeErrorResult,
  encodeFunctionData,
  erc20Abi,
  http,
  parseAbi,
  parseEther,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { KYC, SWAP_VM } from "../../lib/config";
import type { LifecyclePlan, Token } from "../../lib/managed";
import { encodeDevBatch } from "../../lib/server/dev-wallet/batch";
import { delegatedAccountCode } from "../../lib/server/external-adapter/account";
import type { controlledFork } from "./controlled-fork";

/** Only resolver credential and synthetic taker state are replaced on the isolated fork. */
export async function verifyResolverFills(
  fork: Awaited<ReturnType<typeof controlledFork>>,
  plan: LifecyclePlan,
  base: Token,
  quote: Token,
  amount: bigint,
) {
  const account = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const wallet = createWalletClient({
    account,
    chain: fork.rpc.chain,
    transport: http(fork.url),
  });
  await fork.request("anvil_setBalance", [
    account.address,
    toHex(parseEther("1")),
  ]);
  await fork.request("anvil_setCode", [account.address, delegatedAccountCode]);
  const originalCredential = await fork.rpc.getCode({ address: KYC });
  const order = Order.decode(new HexString(plan.registrations[0].strategy));
  const swap = (input: Token, output: Token, value: bigint) => ({
    order,
    tokenIn: new SdkAddress(input.address),
    tokenOut: new SdkAddress(output.address),
    amount: value,
    takerTraits: TakerTraits.default().with({
      threshold: 1n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
    }),
  });
  const balance = (token: Token, address = plan.maker) =>
    fork.rpc.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
  const execute = async (
    input: Token,
    output: Token,
    value: bigint,
    wrap = false,
  ) => {
    const calls = [
      ...(wrap
        ? [
            {
              to: base.address,
              data: "0xd0e30db0" as Hex,
              value: toHex(value),
              label: "Fixture taker wrap",
            },
          ]
        : []),
      {
        to: input.address,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [SWAP_VM, value],
        }),
        value: "0x0" as Hex,
        label: "Fixture taker approval",
      },
      {
        to: SWAP_VM,
        data: SwapVMContract.encodeSwapCallData(
          swap(input, output, value),
        ).toString() as Hex,
        value: "0x0" as Hex,
        label: "Fixture resolver fill",
      },
    ];
    const hash = await wallet.sendTransaction({
      to: account.address,
      data: encodeDevBatch(calls),
      gas: 2000000n,
    });
    const receipt = await fork.rpc.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    return hash;
  };
  try {
    const expectedRevert = encodeErrorResult({
      abi: parseAbi([
        "error TxOriginTokenBalanceIsZero(address txOrigin, address token)",
      ]),
      errorName: "TxOriginTokenBalanceIsZero",
      args: [account.address, KYC],
    });
    await assert.rejects(
      fork.rpc.call({
        account: account.address,
        to: SWAP_VM,
        data: SwapVMContract.encodeQuoteCallData(
          swap(base, quote, amount),
        ).toString() as Hex,
      }),
      (error: unknown) => {
        let cause = error;
        while (cause && typeof cause === "object") {
          const item = cause as { data?: unknown; cause?: unknown };
          const data =
            typeof item.data === "object" && item.data
              ? (item.data as { data?: unknown }).data
              : item.data;
          if (
            typeof data === "string" &&
            data.toLowerCase() === expectedRevert.toLowerCase()
          )
            return true;
          cause = item.cause;
        }
        return false;
      },
      "Uncredentialed origin must revert with the exact credential error, origin and credential token",
    );
    // Test-only credential contract returns one for balanceOf. No production gate is changed.
    await fork.request("anvil_setCode", [KYC, "0x600160005260206000f3"]);
    const forward = await execute(base, quote, amount, true);
    const received = await balance(quote, account.address);
    assert.ok(received > 1n);
    const before = await balance(base);
    const reverse = await execute(quote, base, received / 2n);
    const after = await balance(base);
    assert.ok(
      after < before,
      "Reverse fill consumes the maker base shared with sibling positions",
    );
    return {
      forward,
      reverse,
      uncredentialedOriginRejected: true,
      credentialRevert: "TxOriginTokenBalanceIsZero(address,address)",
      credentialFixtureOnly: true,
      sharedBaseBefore: String(before),
      sharedBaseAfter: String(after),
    };
  } finally {
    await fork.request("anvil_setCode", [KYC, originalCredential ?? "0x"]);
  }
}
