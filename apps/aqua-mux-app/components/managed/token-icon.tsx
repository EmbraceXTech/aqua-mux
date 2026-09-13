import { TokenImage } from "@/components/token-image";
import { NATIVE, network, tokens, type Token } from "@/lib/config";

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
  const logo = tokens(chainId).find((item) => item.address === NATIVE)!.logo;
  return (
    <TokenImage
      className="network-icon"
      logo={logo}
      symbol={net.symbol}
      size={size}
      alt={`${net.name} network icon`}
    />
  );
}
