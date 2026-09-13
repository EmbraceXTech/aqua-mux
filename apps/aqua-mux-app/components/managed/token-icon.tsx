import { TokenImage } from "@/components/token-image";
import { network, type Token } from "@/lib/config";

export function TokenIcon({
  token,
  size = 36,
}: {
  token: Token;
  size?: number;
}) {
  return (
    <TokenImage
      className="token-icon"
      logo={token.logo}
      symbol={token.symbol}
      size={size}
    />
  );
}

export function NetworkIcon({
  chainId,
  size = 23,
}: {
  chainId: number;
  size?: number;
}) {
  const net = network(chainId);
  return (
    <TokenImage
      className="network-icon"
      logo={net.logo}
      symbol={net.symbol}
      size={size}
      alt={`${net.name} network icon`}
    />
  );
}
