import { erc20Abi, formatUnits } from "viem";
import { NATIVE, tokens, network } from "@/lib/config";
import { addressSchema } from "@/lib/model";
import { client, failure } from "@/lib/server/rpc";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const id = network(Number(p.get("chainId"))).id;
    const address = addressSchema.parse(p.get("address"));
    const c = client(id);
    const values = await Promise.all(
      tokens(id).map(async (t) => {
        try {
          const balance =
            t.address === NATIVE
              ? await c.getBalance({ address })
              : await c.readContract({
                  address: t.address,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [address],
                });
          return [t.address, formatUnits(balance, t.decimals)];
        } catch {
          return [t.address, null];
        }
      }),
    );
    return Response.json({ balances: Object.fromEntries(values) });
  } catch (e) {
    return failure(e);
  }
}
