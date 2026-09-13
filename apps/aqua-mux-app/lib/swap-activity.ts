export type SwapActivity = {
  hash: `0x${string}`;
  label: string;
  submittedAt: number;
  state: "pending" | "confirmed" | "reverted" | "unknown";
};

const storageKey = "aquamux:swap-activity";
export const swapActivityEvent = "aquamux:swap-activity";

function storedActivities(): SwapActivity[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SwapActivity =>
        !!item &&
        typeof item === "object" &&
        "hash" in item &&
        typeof item.hash === "string" &&
        /^0x[\da-f]{64}$/i.test(item.hash) &&
        "label" in item &&
        typeof item.label === "string" &&
        "submittedAt" in item &&
        typeof item.submittedAt === "number" &&
        "state" in item &&
        ["pending", "confirmed", "reverted", "unknown"].includes(
          String(item.state),
        ),
    );
  } catch {
    return [];
  }
}

export function loadSwapActivities() {
  return storedActivities();
}

export function saveSwapActivity(next: SwapActivity) {
  const activities = storedActivities();
  const prior = activities.find((activity) => activity.hash === next.hash);
  const updated = [
    { ...prior, ...next },
    ...activities.filter((activity) => activity.hash !== next.hash),
  ].slice(0, 20);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(updated));
  } catch {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<SwapActivity[]>(swapActivityEvent, { detail: updated }),
  );
}
