import type {
  RegistryToken,
  TokenPairValidation,
  TokenRouteCheck,
} from "@/lib/token-registry";
import { managedRequest, type ManagedSession } from "./api";
import { exactAmount } from "./numeric-input";
import { hasVerifiedDecimals } from "../token-metadata";

type SelectedAsset = Pick<RegistryToken, "address" | "decimals">;

export async function validateProposalFunding({
  chainId,
  funding,
  assets,
  budget,
  session,
  assertCurrent,
  onCheck,
}: {
  chainId: number;
  funding: SelectedAsset;
  assets: SelectedAsset[];
  budget: string;
  session: ManagedSession;
  assertCurrent: () => void;
  onCheck: (check: TokenPairValidation) => void;
}): Promise<string> {
  const destinations = assets.filter(
    (asset) => asset.address.toLowerCase() !== funding.address.toLowerCase(),
  );
  if (!destinations.length)
    throw new Error("Choose a paired asset different from the funding token.");
  const amount = exactAmount(budget, funding.decimals).toString();
  // The API admits one in-flight validation per owner. Each result must also
  // bind the displayed amount to freshly verified metadata before submission.
  for (const asset of destinations) {
    assertCurrent();
    const check = await managedRequest<TokenPairValidation>(
      "/api/tokens/validate",
      session,
      { chainId, src: funding.address, dst: asset.address, amount },
    );
    assertCurrent();
    check.route = await managedRequest<TokenRouteCheck>(
      "/funding-route",
      session,
      { chainId, src: funding.address, dst: asset.address, amount },
    );
    assertCurrent();
    onCheck(check);
    if (check.route.status !== "available")
      throw new Error(
        "No verified execution route is available for this pair and amount. Select a supported paired asset or reduce the funding amount.",
      );
    if (
      check.chainId !== chainId ||
      check.source.address.toLowerCase() !== funding.address.toLowerCase() ||
      check.destination.address.toLowerCase() !== asset.address.toLowerCase() ||
      check.route.amountIn !== amount
    )
      throw new Error(
        "Token validation does not match the selected funding route. Refresh and retry.",
      );
    if (
      !hasVerifiedDecimals(check.metadata.source, check.source.decimals) ||
      !hasVerifiedDecimals(
        check.metadata.destination,
        check.destination.decimals,
      ) ||
      !check.source.selectable ||
      !check.destination.selectable
    )
      throw new Error(
        "Token metadata could not be verified. Resolve the selected token before requesting an executable proposal.",
      );
    if (
      check.source.decimals !== funding.decimals ||
      check.metadata.source.registryDecimals !== funding.decimals ||
      check.metadata.source.onchainDecimals !== funding.decimals
    )
      throw new Error(
        "Funding token decimals changed. Reselect the funding token and review your budget before retrying.",
      );
    if (
      check.destination.decimals !== asset.decimals ||
      check.metadata.destination.registryDecimals !== asset.decimals ||
      check.metadata.destination.onchainDecimals !== asset.decimals
    )
      throw new Error(
        "Paired token decimals changed. Reselect the paired token before retrying.",
      );
  }
  return amount;
}
