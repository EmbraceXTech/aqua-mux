import {
  useCreateWallet,
  usePrivy,
  useSendTransaction,
  useSigners,
} from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";

type FreshWallet = { address: string; id: string };
type PolicyGrant = { expiresAt: number; policyId: string; signerId: string };
type StoredWallet = FreshWallet & { userId: string };
const storedWalletKey = "aquamux-privy-poc-fresh-wallet";

function shortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function labelFor(error: unknown) {
  return error instanceof Error ? error.name : "Request failed";
}

export function OwnerPoc() {
  const { authenticated, login, logout, ready, user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { addSigners, removeSigners } = useSigners();
  const { sendTransaction } = useSendTransaction();
  const [wallet, setWallet] = useState<FreshWallet | null>(null);
  const [grant, setGrant] = useState<PolicyGrant | null>(null);
  const [status, setStatus] = useState("Open this page only for a new disposable email account.");
  const [busy, setBusy] = useState(false);
  const reusableWallet = useMemo(() => {
    const candidate = user?.linkedAccounts.find((account) => account.type === "wallet");
    if (!candidate || candidate.type !== "wallet") return null;
    if (
      candidate.chainType !== "ethereum" ||
      (candidate.walletClientType !== "privy" && candidate.walletClientType !== "privy-v2") ||
      !candidate.id
    ) return null;
    return { address: candidate.address, id: candidate.id };
  }, [user]);

  useEffect(() => {
    if (!user || wallet) return;
    try {
      const stored = JSON.parse(sessionStorage.getItem(storedWalletKey) ?? "null") as StoredWallet | null;
      if (stored?.userId === user.id && stored.address && stored.id) setWallet({ address: stored.address, id: stored.id });
    } catch {
      sessionStorage.removeItem(storedWalletKey);
    }
  }, [user, wallet]);

  function adoptFreshWallet() {
    if (!user || !reusableWallet) return;
    sessionStorage.setItem(storedWalletKey, JSON.stringify({ ...reusableWallet, userId: user.id }));
    setWallet(reusableWallet);
    setStatus("The fresh embedded wallet is restored for this browser session.");
  }

  async function createFreshWallet() {
    setBusy(true);
    try {
      if (!user) throw new Error("No authenticated owner");
      const created = await createWallet();
      if (!created.address || !created.id) throw new Error("Privy returned an incomplete wallet record");
      const freshWallet = { address: created.address, id: created.id };
      sessionStorage.setItem(storedWalletKey, JSON.stringify({ ...freshWallet, userId: user.id }));
      setWallet(freshWallet);
      setStatus("Fresh embedded wallet created. Fund it only with Sepolia faucet ETH before recovery testing.");
    } catch (error) {
      setStatus(`Fresh wallet creation did not complete: ${labelFor(error)}.`);
    } finally {
      setBusy(false);
    }
  }

  async function preparePolicy() {
    if (!wallet) return;
    setBusy(true);
    try {
      if (!user) throw new Error("No authenticated owner");
      const response = await fetch("/api/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, walletAddress: wallet.address, walletId: wallet.id }),
      });
      if (!response.ok) {
        const failure = await response.json() as { error?: string };
        throw new Error(failure.error ?? "Policy provisioning refused");
      }
      const provisioned = await response.json() as PolicyGrant;
      setGrant(provisioned);
      setStatus("The server created the five-minute, zero-value Sepolia policy. Review the boundary below before adding the signer.");
    } catch (error) {
      setStatus(`Policy provisioning did not complete: ${labelFor(error)}.`);
    } finally {
      setBusy(false);
    }
  }

  async function addScopedSigner() {
    if (!wallet || !grant) return;
    setBusy(true);
    try {
      await addSigners({
        address: wallet.address,
        signers: [{ signerId: grant.signerId, policyIds: [grant.policyId] }],
      });
      setStatus("Owner consent completed. The agent may now attempt only the displayed zero-value Sepolia action until expiry.");
    } catch (error) {
      setStatus(`Signer consent did not complete: ${labelFor(error)}.`);
    } finally {
      setBusy(false);
    }
  }

  async function revokeSigner() {
    if (!wallet) return;
    setBusy(true);
    try {
      await removeSigners({ address: wallet.address });
      setStatus("All signers were removed. The agent must now be refused.");
    } catch (error) {
      setStatus(`Signer revocation did not complete: ${labelFor(error)}.`);
    } finally {
      setBusy(false);
    }
  }

  async function ownerRecovery() {
    if (!wallet) return;
    setBusy(true);
    try {
      const result = await sendTransaction({
        to: wallet.address,
        value: 0n,
        data: "0x",
        chainId: 11_155_111,
      }, { address: wallet.address, sponsor: false });
      setStatus(`Owner recovery submitted on Sepolia: ${result.hash.slice(0, 10)}...${result.hash.slice(-8)}.`);
    } catch (error) {
      setStatus(`Owner recovery did not complete: ${labelFor(error)}.`);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main><p>Preparing the isolated Privy POC...</p></main>;

  return (
    <main>
      <header>
        <p className="eyebrow">AquaMux laboratory</p>
        <h1>Privy delegation boundary POC</h1>
        <p>Sepolia only. The agent can send only a zero-value transaction from the fresh wallet back to itself.</p>
      </header>

      <section className="boundary">
        <h2>Fixed boundary</h2>
        <ul>
          <li>Chain: Ethereum Sepolia, <code>eip155:11155111</code>.</li>
          <li>Action: self-transfer with <code>value: 0x0</code> and <code>data: 0x</code>.</li>
          <li>No batches, raw signatures, EIP-7702 authorization, key export, sponsorship, or mainnet.</li>
          <li>The signer expires five minutes after policy creation.</li>
        </ul>
      </section>

      {!authenticated ? (
        <section>
          <h2>1. Authenticate the test owner</h2>
          <p>Choose Email in the Privy dialog. Use a new disposable email address and enter its OTP yourself.</p>
          <button onClick={() => login()} disabled={busy}>Sign in with a fresh email</button>
        </section>
      ) : (
        <>
          <section>
            <h2>Test owner</h2>
            <p>Authenticated as a fresh Privy user. This page never displays the access token or any wallet key.</p>
            <button className="secondary" onClick={() => void logout()} disabled={busy}>Log out</button>
          </section>

          <section>
            <h2>2. Create the fresh wallet</h2>
            {!wallet ? (
              reusableWallet ? (
                <button onClick={adoptFreshWallet} disabled={busy}>Use the fresh wallet created in this POC</button>
              ) : (
                <button onClick={() => void createFreshWallet()} disabled={busy}>Create fresh embedded wallet</button>
              )
            ) : (
              <>
                <p className="success">Fresh wallet: <code>{shortAddress(wallet.address)}</code></p>
                <p>For gas only, copy this full address into a Sepolia faucet: <code>{wallet.address}</code></p>
              </>
            )}
          </section>

          <section>
            <h2>3. Create and review the scoped policy</h2>
            <button onClick={() => void preparePolicy()} disabled={busy || !wallet || Boolean(grant)}>
              Create five-minute policy
            </button>
            {grant && <p className="success">Policy created. It expires at {new Date(grant.expiresAt * 1000).toLocaleTimeString()}.</p>}
          </section>

          <section>
            <h2>4. Approve scoped signer access</h2>
            <p>The Privy owner confirmation must succeed before the agent can test the single allowlisted action.</p>
            <button onClick={() => void addScopedSigner()} disabled={busy || !grant}>Approve scoped signer</button>
          </section>

          <section>
            <h2>5. Revoke and recover</h2>
            <p>Use these only after the agent has recorded its allowed and refused tests.</p>
            <div className="actions">
              <button className="danger" onClick={() => void revokeSigner()} disabled={busy || !wallet}>Revoke all signers</button>
              <button onClick={() => void ownerRecovery()} disabled={busy || !wallet}>Submit owner recovery</button>
            </div>
          </section>
        </>
      )}

      <output aria-live="polite">{status}</output>
      <footer>User: {user ? "authenticated" : "not authenticated"}. No actions occur automatically.</footer>
    </main>
  );
}
