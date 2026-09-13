"use client";

import Image from "next/image";
import { useState } from "react";
import { logoForTokenSymbol } from "@/lib/token-logo";

export const TOKEN_IMAGE_FALLBACK = "/aquamux-logo.svg";

type TokenImageProps = {
  logo?: string;
  symbol: string;
  size: number;
  className?: string;
  alt?: string;
};

export function TokenImage({
  logo,
  symbol,
  size,
  className,
  alt = `${symbol} token icon`,
}: TokenImageProps) {
  const [failedLogos, setFailedLogos] = useState<string[]>([]);
  const registryLogo = logo?.trim();
  const symbolLogo = logoForTokenSymbol(symbol);
  const candidates = [registryLogo, symbolLogo].filter(
    (candidate): candidate is string =>
      !!candidate && !failedLogos.includes(candidate),
  );
  const src = candidates[0] ?? TOKEN_IMAGE_FALLBACK;

  return (
    <Image
      className={className}
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={
        src === TOKEN_IMAGE_FALLBACK
          ? undefined
          : () =>
              setFailedLogos((current) =>
                current.includes(src) ? current : [...current, src],
              )
      }
    />
  );
}
