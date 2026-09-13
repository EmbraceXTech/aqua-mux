"use client";

import Image from "next/image";
import { useState } from "react";

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
  const [failedLogo, setFailedLogo] = useState<string>();
  const registryLogo = logo?.trim();
  const showingRegistryLogo = !!registryLogo && failedLogo !== registryLogo;
  const src = showingRegistryLogo ? registryLogo : TOKEN_IMAGE_FALLBACK;

  return (
    <Image
      className={className}
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={
        showingRegistryLogo ? () => setFailedLogo(registryLogo) : undefined
      }
    />
  );
}
