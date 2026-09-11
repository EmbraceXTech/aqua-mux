const loopbackHosts = new Set(["127.0.0.1", "[::1]", "localhost"]);
const loopbackPeers = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Constrained compatibility for Next's internal loopback hostname normalization. */
export function isLocalOriginAlias(request: Request, configuredOrigin: string) {
  const expected = new URL(configuredOrigin);
  const actual = new URL(request.url);
  const headers = request.headers;
  const origin = headers.get("origin");
  const site = headers.get("sec-fetch-site");
  const browserRead =
    ["GET", "HEAD"].includes(request.method) &&
    origin === null &&
    site === "same-origin";
  const forwardedMatches = (header: string, value: string) =>
    !headers.has(header) || headers.get(header) === value;

  // Forwarding headers are never used to choose a trusted origin. This exception
  // is for a loopback-bound prototype, not a remotely published reverse proxy.
  return (
    loopbackHosts.has(expected.hostname) &&
    loopbackHosts.has(actual.hostname) &&
    actual.protocol === expected.protocol &&
    actual.port === expected.port &&
    !actual.username &&
    !actual.password &&
    headers.get("host") === expected.host &&
    (origin === configuredOrigin || browserRead) &&
    (site === null || site === "same-origin") &&
    !headers.has("forwarded") &&
    forwardedMatches("x-forwarded-host", expected.host) &&
    forwardedMatches("x-forwarded-proto", expected.protocol.slice(0, -1)) &&
    forwardedMatches(
      "x-forwarded-port",
      expected.port || (expected.protocol === "https:" ? "443" : "80"),
    ) &&
    (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .every((peer) => !peer.trim() || loopbackPeers.has(peer.trim()))
  );
}
