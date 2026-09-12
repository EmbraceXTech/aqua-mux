import Image from "next/image";
import { NATIVE, network, tokens, type Token } from "@/lib/config";

export function TokenIcon({
  token,
  size = 36,
}: {
  token: Token;
  size?: number;
}) {
  if (!token.logo) {
    return (
      <span
        className="token-initial"
        style={{ width: size, height: size }}
        aria-label={`${token.symbol} icon`}
      >
        {token.symbol.slice(0, 2)}
      </span>
    );
  }
  return (
    <Image
      className="token-icon"
      src={token.logo}
      alt={`${token.symbol} icon`}
      width={size}
      height={size}
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
  const logo =
    "logo" in net
      ? net.logo
      : tokens(chainId).find((item) => item.address === NATIVE)!.logo;
  return (
    <Image
      className="network-icon"
      src={logo}
      alt={`${net.name} token logo`}
      width={size}
      height={size}
    />
  );
}
