import type { AdditionalSignerInput, PolicyCreateParams } from "@privy-io/node/resources";

export const SEPOLIA_CAIP2 = "eip155:11155111";
export const SEPOLIA_CHAIN_ID = "11155111";

export type HarmlessSelfTransfer = {
  caip2: typeof SEPOLIA_CAIP2;
  params: {
    transaction: {
      chain_id: number;
      data: "0x";
      to: string;
      value: "0x0";
    };
  };
  sponsor: false;
};

function assertEvmAddress(address: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Expected an EVM address.");
  }
}

/**
 * This is a signer override policy, not a wallet-wide policy. Assign it only to
 * the additional agent signer. The owner retains their own Privy authorization.
 */
export function makeSignerPolicy(
  walletAddress: string,
  expiresAtUnixSeconds: number,
  ownerUserId: string,
): PolicyCreateParams {
  assertEvmAddress(walletAddress);
  if (!ownerUserId) throw new Error("A fresh Privy user must own the policy.");
  if (!Number.isSafeInteger(expiresAtUnixSeconds)) {
    throw new Error("Expiry must be a Unix timestamp in whole seconds.");
  }

  return {
    version: "1.0",
    name: "AquaMux POC Sepolia zero-value self-transfer only",
    chain_type: "ethereum",
    owner: { user_id: ownerUserId },
    rules: [
      {
        name: "Allow one harmless Sepolia action before expiry",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          {
            field_source: "ethereum_transaction",
            field: "to",
            operator: "eq",
            value: walletAddress,
          },
          {
            field_source: "ethereum_transaction",
            field: "chain_id",
            operator: "eq",
            value: SEPOLIA_CHAIN_ID,
          },
          {
            field_source: "ethereum_transaction",
            field: "value",
            operator: "eq",
            value: "0x0",
          },
          {
            field_source: "system",
            field: "current_unix_timestamp",
            operator: "lt",
            value: String(expiresAtUnixSeconds),
          },
        ],
      },
      {
        name: "Deny atomic batches",
        method: "wallet_sendCalls",
        action: "DENY",
        conditions: [],
      },
      {
        name: "Deny transaction signing without broadcast",
        method: "eth_signTransaction",
        action: "DENY",
        conditions: [],
      },
      {
        name: "Deny user operations",
        method: "eth_signUserOperation",
        action: "DENY",
        conditions: [],
      },
      {
        name: "Deny arbitrary messages",
        method: "personal_sign",
        action: "DENY",
        conditions: [],
      },
      {
        name: "Deny typed-data signatures",
        method: "eth_signTypedData_v4",
        action: "DENY",
        conditions: [],
      },
      {
        name: "Deny EIP-7702 authorization",
        method: "eth_sign7702Authorization",
        action: "DENY",
        conditions: [],
      },
      {
        name: "Deny private-key export",
        method: "exportPrivateKey",
        action: "DENY",
        conditions: [],
      },
      {
        name: "Deny seed-phrase export",
        method: "exportSeedPhrase",
        action: "DENY",
        conditions: [],
      },
    ],
  };
}

/** Attach this only through the authenticated fresh wallet owner's client. */
export function makeAgentSignerAttachment(
  agentKeyQuorumId: string,
  policyId: string,
): AdditionalSignerInput {
  if (!agentKeyQuorumId || !policyId) throw new Error("Signer quorum and policy IDs are required.");
  return [{
    signer_id: agentKeyQuorumId,
    override_policy_ids: [policyId],
  }];
}

/** The only action the agent-side live script may construct. */
export function makeHarmlessSelfTransfer(
  walletAddress: string,
): HarmlessSelfTransfer {
  assertEvmAddress(walletAddress);
  return {
    caip2: SEPOLIA_CAIP2,
    params: {
      transaction: {
        to: walletAddress,
        chain_id: 11_155_111,
        value: "0x0",
        data: "0x",
      },
    },
    sponsor: false,
  };
}
