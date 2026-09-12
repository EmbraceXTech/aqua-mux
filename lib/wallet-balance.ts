import { createConfig, http, type Config } from "wagmi";
import { getBalance } from "wagmi/actions";
import { createPublicClient, erc20Abi, type Address } from "viem";
import type { Network, NetworkBalances, Token } from "./types/network.ts";
import { assetBalance } from "./utils/asset-balance.ts";

function wagmiConfig(network: Network, rpcUrl: string): Config {
  return createConfig({
    chains: [network.chain],
    transports: { [network.chain.id]: http(rpcUrl, { timeout: 20_000 }) },
  });
}

async function discoveredTokens(
  network: Network,
  address: Address,
  env: Record<string, string>,
): Promise<Token[]> {
  const graphToken = env.THE_GRAPH_TOKEN_API_TOKEN;
  if (network.tokenApiNetwork && graphToken) {
    const tokens: Token[] = [];
    for (let page = 1; ; page += 1) {
      const url = new URL("https://api.pinax.network/v1/evm/balances");
      url.searchParams.set("network", network.tokenApiNetwork);
      url.searchParams.set("address", address);
      url.searchParams.set("limit", "1000");
      url.searchParams.set("page", String(page));
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${graphToken}`,
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`The Graph Token API returned HTTP ${response.status}.`);
      }
      const body = (await response.json()) as {
        data?: { contract?: string }[];
      };
      const rows = body.data ?? [];
      for (const row of rows) {
        if (row.contract && /^0x[0-9a-fA-F]{40}$/.test(row.contract)) {
          tokens.push({ address: row.contract as Address, symbol: "ERC-20" });
        }
      }
      if (rows.length < 1000) return tokens;
    }
  }

  const apiKey = env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "THE_GRAPH_TOKEN_API_TOKEN or ALCHEMY_API_KEY is not set in .env.",
    );
  }
  const response = await fetch(`https://${network.alchemyHost}/v2/${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getTokenBalances",
      params: [address, "erc20"],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Alchemy returned HTTP ${response.status}.`);
  const body = (await response.json()) as {
    error?: { message?: string };
    result?: { tokenBalances?: { contractAddress: string; tokenBalance: string }[] };
  };
  if (body.error) throw new Error(body.error.message ?? "Alchemy returned an error.");
  return (body.result?.tokenBalances ?? []).flatMap((token) =>
    /^0x[0-9a-fA-F]{40}$/.test(token.contractAddress) &&
    BigInt(token.tokenBalance) > 0n
      ? [{ address: token.contractAddress as Address, symbol: "ERC-20" }]
      : [],
  );
}

export async function balancesFor(
  network: Network,
  address: Address,
  env: Record<string, string>,
): Promise<NetworkBalances> {
  const rpcUrl = env[network.rpcEnv];
  if (!rpcUrl) throw new Error(`${network.rpcEnv} is not set in .env.`);

  const config = wagmiConfig(network, rpcUrl);
  const client = createPublicClient({
    chain: network.chain,
    transport: http(rpcUrl, { timeout: 20_000 }),
  });
  if ((await client.getChainId()) !== network.chain.id) {
    throw new Error(`${network.rpcEnv} is connected to the wrong network.`);
  }

  const tokensToCheck = await discoveredTokens(network, address, env).catch(
    () => network.tokens,
  );
  const [native, tokens] = await Promise.all([
    getBalance(config, { address, chainId: network.chain.id }),
    Promise.all(
      tokensToCheck.map(async (token) => {
        const [value, decimals, onChainSymbol] = await Promise.all([
          client.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
            authorizationList: undefined,
          }),
          client.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "decimals",
            authorizationList: undefined,
          }),
          client.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "symbol",
            authorizationList: undefined,
          }),
        ]);
        return assetBalance(
          onChainSymbol || token.symbol,
          value,
          decimals,
          token.address,
        );
      }),
    ).then((items) => items.filter((token) => token.value > 0n)),
  ]);

  return {
    native: assetBalance(native.symbol, native.value, native.decimals),
    tokens,
  };
}

export async function balanceFor(
  network: Network,
  address: Address,
  env: Record<string, string>,
) {
  return (await balancesFor(network, address, env)).native.formatted;
}
