import { z } from "zod";
import { reviewResultSchema } from "./contract";

type Schema = {
  [key: string]: unknown;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
};
const original = z.toJSONSchema(reviewResultSchema, { io: "input" }) as Schema;

/** Derive the provider wire shape from the shared schema; optional fields become nullable. */
export function providerOutputSchema(): Schema {
  return strictWireSchema(original);
}

function strictWireSchema(schema: Schema): Schema {
  const next = { ...schema };
  delete next.$schema;
  if (schema.oneOf) {
    next.anyOf = schema.oneOf.map(strictWireSchema);
    delete next.oneOf;
  } else if (schema.anyOf) next.anyOf = schema.anyOf.map(strictWireSchema);
  if (schema.items) next.items = strictWireSchema(schema.items);
  if (schema.properties) {
    next.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, child]) => [
        key,
        schema.required?.includes(key)
          ? strictWireSchema(child)
          : { anyOf: [strictWireSchema(child), { type: "null" }] },
      ]),
    );
    next.required = Object.keys(schema.properties);
    next.additionalProperties = false;
  }
  return next;
}

export function decodeProviderOutput(value: unknown): unknown {
  return removeOptionalNulls(value, original);
}

function removeOptionalNulls(value: unknown, schema: Schema): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return schema.items
      ? value.map((v) => removeOptionalNulls(v, schema.items!))
      : value;
  const object = value as Record<string, unknown>;
  const choices = schema.oneOf ?? schema.anyOf;
  if (choices) {
    const selected = choices.find((option) =>
      Object.entries(option.properties ?? {}).every(
        ([key, child]) =>
          child.const === undefined || child.const === object[key],
      ),
    );
    return selected ? removeOptionalNulls(value, selected) : value;
  }
  if (!schema.properties) return value;
  return Object.fromEntries(
    Object.entries(object).flatMap(([key, child]) => {
      const property = schema.properties![key];
      if (!property) return [[key, child]];
      if (child === null && !schema.required?.includes(key)) return [];
      return [[key, removeOptionalNulls(child, property)]];
    }),
  );
}
