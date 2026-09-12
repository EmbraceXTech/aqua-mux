import {
  ArrowRight,
  ChartNoAxesCombined,
  Layers3,
  MoveUpRight,
  Waves,
} from "lucide-react";
import { Button } from "../ui/button";
import { strategyCatalog } from "@/lib/managed/catalog";

export type RecipeId =
  | "wide-range-lp"
  | "managed-concentrated-lp"
  | "upward-only-lp"
  | "inventory-aware-mm";

const recipes = [
  {
    id: "wide-range-lp",
    title: "Wide-range LP",
    label: "Manual confirmation",
    icon: Waves,
    description:
      "Provide wallet-backed liquidity across a broad price range, with one shared base inventory.",
    behavior: "Monitor backing and review inventory. No automatic recentering.",
    conditions: "For a longer holding period with room for price movement.",
    risk: "Inventory can lose value. Shared reserves compete across pairs, and registration does not guarantee fills.",
    available: true,
  },
  {
    id: "managed-concentrated-lp",
    title: "Managed concentrated LP",
    label: "Experimental",
    icon: Layers3,
    description:
      "Set a range for each pair and review changes when prices move outside it.",
    behavior: "Propose bounded replacements after cooldown and cost checks.",
    conditions: "For active range management with regular browser reviews.",
    risk: "A position can become inactive outside its range. Replacements incur costs and require approval.",
    available: true,
  },
  {
    id: "upward-only-lp",
    title: "Upward-only recenter LP",
    label: "Experimental",
    icon: MoveUpRight,
    description:
      "Review upward range moves while keeping a defined inventory and action budget.",
    behavior:
      "Move the reference upward only when the configured trigger permits.",
    conditions: "For a directional approach that may hold or pause on decline.",
    risk: "Upward-only management does not prevent losses and can leave positions inactive.",
    available: true,
  },
  {
    id: "inventory-aware-mm",
    title: "Inventory-aware MM",
    label: "Unavailable",
    icon: ChartNoAxesCombined,
    description:
      "Bounded buy and sell quotes with inventory-dependent sizing and expiry.",
    behavior:
      "Requires a separately verified quote compiler and fill lifecycle.",
    conditions:
      "A subsequent milestone, with no executable recipe available yet.",
    risk: "Spread capture must cover execution costs and adverse selection.",
    available: false,
  },
] as const;

export function StrategyCatalog({
  onSelect,
}: {
  onSelect: (recipe: RecipeId) => void;
}) {
  return (
    <section aria-labelledby="strategy-catalog-title">
      <div className="managed-heading">
        <div>
          <span className="managed-eyebrow">YOUR LIQUIDITY, ONE WORKSPACE</span>
          <h1 id="strategy-catalog-title">Choose how you provide liquidity</h1>
          <p>
            Start with a fresh wallet analysis. Review every allocation before
            it reaches your wallet.
          </p>
        </div>
        <span className="managed-badge">Browser-bound reviews</span>
      </div>
      <div className="managed-catalog">
        {recipes.map(({ icon: Icon, ...recipe }) => (
          <article
            className={`managed-recipe ${recipe.available ? "" : "managed-unavailable"}`}
            key={recipe.id}
          >
            <div className="managed-recipe-top">
              <span className="managed-recipe-icon">
                <Icon size={25} />
              </span>
              <span
                className={`managed-badge ${recipe.label === "Experimental" ? "managed-badge-amber" : ""}`}
              >
                {recipe.label}
              </span>
            </div>
            <h2>{recipe.title}</h2>
            <p>{recipe.description}</p>
            <dl>
              <dt>Management</dt>
              <dd>{recipe.behavior}</dd>
              <dt>Market conditions</dt>
              <dd>{recipe.conditions}</dd>
              <dt>Inventory and availability</dt>
              <dd>
                Base and paired tokens on one supported chain. Wallet balances
                and route availability are checked in the proposal.
              </dd>
            </dl>
            <p className="managed-risk">{recipe.risk}</p>
            <Button
              variant={recipe.id === "wide-range-lp" ? "default" : "outline"}
              disabled={
                strategyCatalog.find((entry) => entry.id === recipe.id)
                  ?.status === "unavailable"
              }
              onClick={() => onSelect(recipe.id)}
            >
              {recipe.available ? "Configure strategy" : "Not available yet"}
              {recipe.available && <ArrowRight size={16} />}
            </Button>
          </article>
        ))}
      </div>
      <p className="managed-footnote">
        Recurring reviews need an active browser lease. Existing positions can
        still fill after you stop management or close this tab. No performance
        estimates are shown without attributable data.
      </p>
    </section>
  );
}
