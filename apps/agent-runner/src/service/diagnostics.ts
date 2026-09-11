/** Adapters can write outside onLog; only explicit service events may leave this process. */
export function closeDiagnostics(): (
  event: Record<string, string | number>,
) => void {
  const write = process.stdout.write.bind(process.stdout);
  const discard = (
    _chunk: unknown,
    encoding?: unknown,
    callback?: () => void,
  ) => {
    const done =
      typeof encoding === "function" ? (encoding as () => void) : callback;
    done?.();
    return true;
  };
  process.stdout.write = discard as typeof process.stdout.write;
  process.stderr.write = discard as typeof process.stderr.write;
  for (const method of [
    "log",
    "info",
    "warn",
    "error",
    "debug",
    "trace",
  ] as const)
    console[method] = () => {};
  return (event) => {
    write(`${JSON.stringify(event)}\n`);
  };
}
