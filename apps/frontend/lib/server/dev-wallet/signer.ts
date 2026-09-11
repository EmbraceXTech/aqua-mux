import {
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  TransactionReceiptNotFoundError,
  type Hex,
} from "viem";
import type { Plan } from "../../model";
import { client } from "../rpc";
import { devAccount, assertDevChain, DevWalletError } from "./config";
import { validateDevPlan } from "./policy";

export const implementation = "0xe6Cae83BdE06E4c305530e199D7217f42808555B";
export const implementationHash =
  "0xcc7b633aef4b2543cb8f37522adf1a401f910f0f6b2430c1eecc11f401ccfcf3";
const batchAbi = parseAbi([
  "function executeBatch((address target,uint256 value,bytes data)[] calls)",
]);

export type SignedDevBatch = {
  hash: Hex;
  nonce: number;
  broadcast: () => Promise<Hex>;
};

export function maxFeeBudget() {
  const amount = process.env.AQUAMUX_DEV_WALLET_MAX_FEE_WEI;
  if (!amount || !/^[1-9]\d{0,29}$/.test(amount))
    throw new DevWalletError(
      "Configure a positive local wallet maximum fee in wei.",
    );
  return BigInt(amount);
}

export async function signDevBatch(
  plan: Plan,
  assertCurrent: () => void | Promise<void>,
): Promise<SignedDevBatch> {
  const account = devAccount();
  validateDevPlan(plan, account.address);
  const rpc = client(plan.chainId);
  if ((await rpc.getChainId()) !== plan.chainId)
    throw new DevWalletError("Configured RPC returned the wrong chain.");
  const code = await rpc.getCode({ address: implementation });
  if (!code || keccak256(code) !== implementationHash)
    throw new DevWalletError(
      "The atomic account implementation is not verified on this chain.",
    );
  const ownerCode = await rpc.getCode({ address: account.address });
  const delegatedCode = `0xef0100${implementation.slice(2).toLowerCase()}`;
  if (
    ownerCode &&
    ownerCode !== "0x" &&
    ownerCode.toLowerCase() !== delegatedCode
  )
    throw new DevWalletError(
      "The local wallet delegates to an unknown implementation.",
    );
  const wallet = createWalletClient({
    account,
    chain: rpc.chain,
    transport: http(rpc.chain.rpcUrls.default.http[0], { retryCount: 0 }),
  });
  const nonce = await rpc.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  // A self-executed type-4 transaction increments the sender nonce before authorization.
  const authorizationList =
    !ownerCode || ownerCode === "0x"
      ? [
          await wallet.signAuthorization({
            contractAddress: implementation,
            executor: "self",
            nonce: nonce + 1,
          }),
        ]
      : undefined;
  const data = encodeFunctionData({
    abi: batchAbi,
    functionName: "executeBatch",
    args: [
      plan.calls.map((call) => ({
        target: call.to,
        value: BigInt(call.value),
        data: call.data,
      })),
    ],
  });
  const transaction = {
    account: account.address,
    to: account.address,
    data,
    nonce,
    authorizationList,
  };
  const authGas = await rpc.estimateGas(transaction);
  const stateOverride = [{ address: account.address, code }];
  const batchGas = await rpc.estimateGas({
    account: account.address,
    to: account.address,
    data,
    stateOverride,
  });
  await rpc.call({
    account: account.address,
    to: account.address,
    data,
    stateOverride,
  });
  // Same authorization overhead and 30% execution margin as the verified live runner.
  const gas =
    ((authGas > batchGas + 25_000n ? authGas : batchGas + 25_000n) * 130n) /
    100n;
  const gasPrice = await rpc.getGasPrice();
  const maxFeePerGas = gasPrice * 2n;
  if (gas * maxFeePerGas > maxFeeBudget())
    throw new DevWalletError(
      "Estimated maximum fee exceeds the configured local wallet limit.",
    );
  const value = plan.calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
  if (
    (await rpc.getBalance({ address: account.address })) <=
    value + gas * maxFeePerGas
  )
    throw new DevWalletError(
      "Insufficient native funds after reserving the maximum transaction fee.",
    );
  await assertCurrent();
  validateDevPlan(plan, account.address);
  const serialized = await wallet.signTransaction({
    ...transaction,
    account,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas: gasPrice,
  });
  return {
    hash: keccak256(serialized),
    nonce,
    // The service must persist the hash and nonce before calling this closure.
    broadcast: async () => {
      await assertCurrent();
      validateDevPlan(plan, account.address);
      return rpc.sendRawTransaction({ serializedTransaction: serialized });
    },
  };
}

export async function devReceipt(chainId: number, hash: Hex) {
  assertDevChain(chainId);
  const rpc = client(chainId);
  try {
    if ((await rpc.getChainId()) !== chainId) return "unknown" as const;
    const receipt = await rpc.getTransactionReceipt({ hash });
    return receipt.status === "success"
      ? ("confirmed" as const)
      : ("reverted" as const);
  } catch (error) {
    return error instanceof TransactionReceiptNotFoundError
      ? ("pending" as const)
      : ("unknown" as const);
  }
}
