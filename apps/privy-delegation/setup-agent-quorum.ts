import { generateP256KeyPair, PrivyClient } from "@privy-io/node";
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const runtimeDirectory = join(process.cwd(), ".runtime");
const credentialFile = join(runtimeDirectory, "privy-agent.env");

function requireEnvironment(name: "PRIVY_APP_ID" | "PRIVY_APP_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function safeFailure(error: unknown) {
  if (typeof error !== "object" || error === null) return { type: typeof error };
  const candidate = error as { constructor?: { name?: string }; status?: unknown; code?: unknown };
  return {
    type: candidate.constructor?.name ?? "Error",
    status: typeof candidate.status === "number" ? candidate.status : null,
    code: typeof candidate.code === "string" ? candidate.code : null,
  };
}

async function main() {
  const appId = requireEnvironment("PRIVY_APP_ID");
  const appSecret = requireEnvironment("PRIVY_APP_SECRET");
  await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
  try {
    await stat(credentialFile);
    throw new Error("Refusing to overwrite the existing local POC authorization key.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code !== "ENOENT") throw error;
    if (error instanceof Error && error.message.startsWith("Refusing")) throw error;
  }

  const keyPair = await generateP256KeyPair();
  await writeFile(
    credentialFile,
    `PRIVY_AGENT_AUTHORIZATION_PRIVATE_KEY=${keyPair.privateKey}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );

  try {
    const client = new PrivyClient({ appId, appSecret });
    const quorum = await client.keyQuorums().create({
      display_name: "AquaMux POC agent signer, Sepolia only",
      public_keys: [keyPair.publicKey],
      authorization_threshold: 1,
    });
    await appendFile(
      credentialFile,
      `POC_SIGNER_KEY_QUORUM_ID=${quorum.id}\n`,
      { encoding: "utf8" },
    );
    console.log(JSON.stringify({
      result: "created",
      authorizationThreshold: quorum.authorization_threshold,
      authorizationKeyCount: quorum.authorization_keys.length,
      localAuthorizationKeyStored: true,
      quorumIdStoredLocally: true,
    }));
  } catch (error) {
    // The private key remains local. The user can choose whether to retain or remove it.
    console.log(JSON.stringify({ result: "not_created", failure: safeFailure(error) }));
    process.exitCode = 1;
  }
}

await main();
