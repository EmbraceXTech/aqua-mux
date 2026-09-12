const requiredForProvisioning = [
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_AGENT_AUTHORIZATION_PRIVATE_KEY",
  "POC_SIGNER_KEY_QUORUM_ID",
] as const;

const requiredAfterOwnerProvisioning = [
  "POC_WALLET_ID",
  "POC_WALLET_ADDRESS",
  "POC_POLICY_ID",
] as const;

function configured(name: string) {
  return Boolean(process.env[name]?.trim());
}

const missingProvisioning = requiredForProvisioning.filter((name) => !configured(name));
const missingAfterProvisioning = requiredAfterOwnerProvisioning.filter((name) => !configured(name));

console.log(JSON.stringify({
  network: "Sepolia only, eip155:11155111",
  credentialValuesReadOrPrinted: false,
  provisioningReady: missingProvisioning.length === 0,
  missingForProvisioning: missingProvisioning,
  liveActionReady: missingProvisioning.length === 0 && missingAfterProvisioning.length === 0,
  missingAfterProvisioning,
}));

if (missingProvisioning.length > 0) process.exitCode = 2;
