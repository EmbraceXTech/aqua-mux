import { keccak256, type Address, type Hex } from "viem";
import { implementation, implementationHash } from "../dev-wallet/batch";
import { ManagedError } from "../managed-service/errors";

export const externalAdapterId = "simple7702-self-signed-v1";
export const delegatedAccountCode =
  `0xef0100${implementation.slice(2).toLowerCase()}` as Hex;
export type AccountReader = {
  getChainId(): Promise<number>;
  getCode(args: { address: Address }): Promise<Hex | undefined>;
};
export async function verifyExternalAccount(
  owner: string,
  maker: Address,
  chainId: number,
  rpc: AccountReader,
) {
  if (
    owner.toLowerCase() !== maker.toLowerCase() ||
    ![56, 42161, 4663].includes(chainId)
  )
    throw new ManagedError(
      "external_account_unsupported",
      "This adapter requires the authenticated owner to be the execution account on a supported chain.",
    );
  if ((await rpc.getChainId()) !== chainId)
    throw new ManagedError(
      "external_chain_mismatch",
      "The account RPC returned a different chain.",
    );
  const accountCode = await rpc.getCode({ address: maker });
  const code = await rpc.getCode({ address: implementation });
  if (
    accountCode?.toLowerCase() !== delegatedAccountCode ||
    !code ||
    keccak256(code) !== implementationHash
  )
    throw new ManagedError(
      "external_account_unsupported",
      "This account is not delegated to the verified Simple7702Account implementation.",
    );
}
