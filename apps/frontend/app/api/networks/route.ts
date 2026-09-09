import { networks, AQUA, SWAP_VM } from "@/lib/config";
import { client } from "@/lib/server/rpc";
export const dynamic = "force-dynamic";
export async function GET() {
  const items = await Promise.all(
    networks.map(async (n) => {
      try {
        const c = client(n.id);
        const [id, block, aqua, vm] = await Promise.all([
          c.getChainId(),
          c.getBlockNumber(),
          c.getCode({ address: AQUA }),
          c.getCode({ address: SWAP_VM }),
        ]);
        return {
          id: n.id,
          online: id === n.id,
          block: block.toString(),
          aqua: !!aqua && aqua !== "0x",
          swapVm: !!vm && vm !== "0x",
        };
      } catch {
        return { id: n.id, online: false, aqua: false, swapVm: false };
      }
    }),
  );
  return Response.json({
    networks: items,
    swapApiConfigured: !!process.env.ONEINCH_API_KEY,
    checkedAt: new Date().toISOString(),
  });
}
