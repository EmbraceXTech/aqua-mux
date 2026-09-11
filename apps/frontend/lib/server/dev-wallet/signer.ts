import {
  createWalletClient,
  http,
  keccak256,
  TransactionReceiptNotFoundError,
  type Hex,
} from "viem";
import { client } from "../rpc";
import { devAccount, assertDevChain, DevWalletError } from "./config";
import { validateDevPlan } from "./policy";
import { verifyDevAssets } from "./assets";
import { verifyDevRoutes } from "./routes";

import {
  encodeDevBatch,
  implementation,
  implementationHash,
  type DevBatchPlan,
} from "./batch";
export { implementation, implementationHash } from "./batch";

export type SignedDevBatch = {
  hash: Hex;
  nonce: number;
  broadcast: (beforeSend?: () => void) => Promise<Hex>;
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
  plan: DevBatchPlan,
  assertCurrent: () => void | Promise<void>,
  reviewedFeeLimit?: bigint,
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
  const data = encodeDevBatch(plan.calls);
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
  const configuredLimit = maxFeeBudget();
  const feeLimit =
    reviewedFeeLimit !== undefined && reviewedFeeLimit < configuredLimit
      ? reviewedFeeLimit
      : configuredLimit;
  if (gas * maxFeePerGas > feeLimit)
    throw new DevWalletError(
      "Estimated maximum fee exceeds the configured local wallet limit.",
    );
  const value = plan.calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
  const reserve = BigInt(plan.gasReserveWei ?? "0");
  if (reserve < 0n) throw new DevWalletError("Invalid native gas reserve.");
  const assertReady = async () => {
    await verifyDevAssets(plan, rpc);
    await verifyDevRoutes(plan);
    const balance = await rpc.getBalance({ address: account.address });
    const freshPrice = await rpc.getGasPrice();
    if (balance < value + gas * maxFeePerGas + reserve)
      throw new DevWalletError(
        "Insufficient native funds after retaining the reviewed gas reserve and maximum fee.",
      );
    if (freshPrice > maxFeePerGas || gas * maxFeePerGas > maxFeeBudget())
      throw new DevWalletError(
        "Transaction fees changed. Review a fresh plan.",
      );
    await assertCurrent();
    validateDevPlan(plan, account.address);
  };
  await assertReady();
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
    broadcast: async (beforeSend) => {
      await assertReady();
      // Persist the known hash and nonce after guards, immediately before the RPC.
      // No async work or fallible policy check may intervene after this callback.
      beforeSend?.();
      return rpc.sendRawTransaction({ serializedTransaction: serialized });
    },
  };
}

export async function devReceipt(chainId: number, hash: Hex) {
  assertDevChain(chainId);
  try {
    const rpc = client(chainId);
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
