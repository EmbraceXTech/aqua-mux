import assert from "node:assert/strict";
import test from "node:test";
import {
  makeAgentSignerAttachment,
  makeHarmlessSelfTransfer,
  makeSignerPolicy,
} from "./policy.ts";

type Request = {
  chainId?: string;
  method: string;
  signerAttached: boolean;
  to?: string;
  value?: string;
};

/**
 * Small, documentation-derived evaluator for local policy-shape checks only.
 * It does not call Privy and is not evidence that Privy's enclave accepted a
 * request. The live procedure must establish that separately.
 */
function localDecision(
  policy: ReturnType<typeof makeSignerPolicy>,
  request: Request,
  nowUnixSeconds: number,
) {
  if (!request.signerAttached) return "DENY";
  let allow = false;
  for (const rule of policy.rules.filter((rule) => rule.method === request.method)) {
    const matches = rule.conditions.every((condition) => {
      if (condition.field_source === "ethereum_transaction") {
        const observed =
          condition.field === "to"
            ? request.to
            : condition.field === "value"
              ? request.value
              : request.chainId;
        return observed === condition.value;
      }
      if (condition.field_source === "system") {
        return nowUnixSeconds < Number(condition.value);
      }
      throw new Error(`Unsupported local condition ${condition.field_source}`);
    });
    if (matches && rule.action === "DENY") return "DENY";
    if (matches && rule.action === "ALLOW") allow = true;
  }
  return allow ? "ALLOW" : "DENY";
}

const wallet = "0x1111111111111111111111111111111111111111";
const expiresAt = 2_000_000_000;
const policy = makeSignerPolicy(wallet, expiresAt, "did:privy:fresh-test-user");

test("the policy has no wildcard allow, wallet-wide policy, batch, or export permission", () => {
  assert.deepEqual(policy.owner, { user_id: "did:privy:fresh-test-user" });
  assert.equal(policy.rules.some((rule) => rule.method === "*" && rule.action === "ALLOW"), false);
  assert.equal(policy.rules.some((rule) => rule.method === "wallet_sendCalls" && rule.action === "ALLOW"), false);
  assert.equal(policy.rules.some((rule) => rule.method === "exportPrivateKey" && rule.action === "ALLOW"), false);
  assert.equal(policy.rules.some((rule) => rule.method === "exportSeedPhrase" && rule.action === "ALLOW"), false);
});

test("the owner attachment gives the agent one policy override and no wallet-wide policy", () => {
  assert.deepEqual(makeAgentSignerAttachment("agent-key-quorum", "poc-policy"), [{
    signer_id: "agent-key-quorum",
    override_policy_ids: ["poc-policy"],
  }]);
});

test("the only allowlisted agent request is a zero-value self-transfer on Sepolia before expiry", () => {
  const action = makeHarmlessSelfTransfer(wallet);
  assert.deepEqual(action, {
    caip2: "eip155:11155111",
    params: {
      transaction: {
        to: wallet,
        chain_id: 11_155_111,
        value: "0x0",
        data: "0x",
      },
    },
    sponsor: false,
  });
  assert.equal(
    localDecision(policy, {
      method: "eth_sendTransaction",
      signerAttached: true,
      to: wallet,
      chainId: "11155111",
      value: "0x0",
    }, expiresAt - 1),
    "ALLOW",
  );
});

test("positive value, another chain, another recipient, batches, and signatures are refused locally", () => {
  const base = {
    method: "eth_sendTransaction",
    signerAttached: true,
    to: wallet,
    chainId: "11155111",
    value: "0x0",
  };
  assert.equal(localDecision(policy, { ...base, value: "0x1" }, expiresAt - 1), "DENY");
  assert.equal(localDecision(policy, { ...base, chainId: "1" }, expiresAt - 1), "DENY");
  assert.equal(
    localDecision(policy, { ...base, to: "0x2222222222222222222222222222222222222222" }, expiresAt - 1),
    "DENY",
  );
  assert.equal(localDecision(policy, { method: "wallet_sendCalls", signerAttached: true }, expiresAt - 1), "DENY");
  assert.equal(localDecision(policy, { method: "eth_signTypedData_v4", signerAttached: true }, expiresAt - 1), "DENY");
  assert.equal(localDecision(policy, { method: "exportPrivateKey", signerAttached: true }, expiresAt - 1), "DENY");
});

test("the time-bound rule and local revocation state both fail closed", () => {
  const request = {
    method: "eth_sendTransaction",
    signerAttached: true,
    to: wallet,
    chainId: "11155111",
    value: "0x0",
  };
  assert.equal(localDecision(policy, request, expiresAt), "DENY");
  assert.equal(localDecision(policy, { ...request, signerAttached: false }, expiresAt - 1), "DENY");
});
