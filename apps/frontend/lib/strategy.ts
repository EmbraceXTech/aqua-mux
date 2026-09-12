import { Address as SdkAddress } from "@1inch/sdk-core";
import { AquaXYCAmmStrategy, MakerTraits, Order } from "@1inch/swap-vm-sdk";
import { AquaProtocolContract } from "@1inch/aqua-sdk";
import { type Address, type Hex } from "viem";
import { AQUA, SWAP_VM, KYC } from "./config";
import type { Call, PriceRange } from "./model";
export function makeStrategy(
  account: Address,
  base: Address,
  paired: Address,
  baseAmount: bigint,
  pairAmount: bigint,
  feeBps: number,
  range: PriceRange,
  salt: bigint,
) {
  const sorted = base.toLowerCase() < paired.toLowerCase();
  const amounts = sorted ? [baseAmount, pairAmount] : [pairAmount, baseAmount];
  const addresses = sorted ? [base, paired] : [paired, base];
  const price = (amounts[1] * 10n ** 18n) / amounts[0];
  if (price === 0n) throw new Error("Pair ratio is too small to encode.");
  // Percent offsets carry two decimal places, so the multiplier is scaled by 10000 (not 100).
  const strategy =
    range === "full"
      ? AquaXYCAmmStrategy.new()
      : AquaXYCAmmStrategy.newConcentrate({
          rawPriceMin:
            (price * BigInt(Math.round((100 + range.minPct) * 100))) / 10000n,
          rawPriceMax:
            (price * BigInt(Math.round((100 + range.maxPct) * 100))) / 10000n,
        });
  const program = strategy
    .withFeeTokenIn(feeBps)
    .withTxOriginAccessToken(new SdkAddress(KYC))
    .withSalt(salt)
    .build();
  const order = Order.new({
    maker: new SdkAddress(account),
    traits: MakerTraits.default().with({ useAquaInsteadOfSignature: true }),
    program,
  });
  const data = AquaProtocolContract.encodeShipCallData({
    app: new SdkAddress(SWAP_VM),
    strategy: order.encode(),
    amountsAndTokens: addresses.map((a, i) => ({
      token: new SdkAddress(a),
      amount: amounts[i],
    })),
  }).toString() as Hex;
  return {
    call: {
      to: AQUA,
      data,
      value: "0x0",
      label: "Register Aqua strategy",
    } as Call,
    hash: order.hash().toString() as Hex,
    tokens: addresses,
    order: order.build(),
  };
}
