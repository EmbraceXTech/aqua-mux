import type { Address } from "viem";
import type { ChainObservation, ObservedEvent, PositionRef } from "./types";

export function matchesPosition(event: ObservedEvent, position: PositionRef) {
  return (
    event.chainId === position.chainId &&
    event.maker.toLowerCase() === position.maker.toLowerCase() &&
    event.app.toLowerCase() === position.app.toLowerCase() &&
    event.strategyHash.toLowerCase() === position.strategyHash.toLowerCase()
  );
}
export function movementDelta(
  event: ObservedEvent,
): { token: Address; amount: string } | null {
  if (
    (event.kind !== "Pulled" && event.kind !== "Pushed") ||
    !event.token ||
    event.amount === undefined
  )
    return null;
  return {
    token: event.token,
    amount: (event.kind === "Pulled"
      ? -BigInt(event.amount)
      : BigInt(event.amount)
    ).toString(),
  };
}

/** Call with authenticated owner identity, never an owner supplied in a request body. */
export function getPositionHistory(
  observation: ChainObservation | null,
  positions: PositionRef[],
  ownerId: string,
  groupId: string,
) {
  const selected = positions.filter(
    (position) =>
      position.ownerId.toLowerCase() === ownerId.toLowerCase() &&
      position.groupId === groupId,
  );
  const events = (observation?.events ?? []).filter((event) =>
    selected.some((position) => matchesPosition(event, position)),
  );
  return {
    coverage: observation
      ? {
          startBlock: observation.config.startBlock,
          indexedThrough: observation.indexedThrough,
          targetBlock: observation.targetBlock,
          confirmations: observation.config.confirmations,
          health: observation.health,
          checkedAt: observation.checkedAt,
        }
      : null,
    positions: selected.map((position) => {
      const own = events.filter((event) => matchesPosition(event, position));
      const registration = own
        .filter((event) => event.kind === "Shipped" || event.kind === "Docked")
        .at(-1);
      return {
        position,
        registration: registration
          ? {
              state: registration.kind === "Docked" ? "docked" : "active",
              blockNumber: registration.blockNumber,
              transactionHash: registration.transactionHash,
            }
          : null,
        resolverDiscovery: "unknown" as const,
        lastSuccessfulQuote: null,
        observedFills: own.filter((event) => event.kind === "Swapped").length,
        monitoringHealth: observation?.health ?? "unknown",
      };
    }),
    // Swap amounts describe executed order amounts. Aqua events describe actual virtual movements.
    // Do not add Swap amounts a second time when computing maker inventory changes.
    activity: events.map((event) => ({
      event,
      source:
        event.kind === "Swapped"
          ? "resolver-fill"
          : event.kind === "Shipped" || event.kind === "Docked"
            ? "registration"
            : "inventory-movement",
      delta: movementDelta(event),
      feeAccounting: "unknown" as const,
    })),
    performance: {
      realized: null,
      unrealized: null,
      fees: null,
      spreadCapture: null,
      markout: null,
    },
  };
}
