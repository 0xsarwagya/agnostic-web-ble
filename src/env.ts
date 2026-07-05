/**
 * Best-effort, PII-light fingerprint of the current runtime for error messages.
 * The User-Agent is truncated to the tokens most useful for diagnosing why
 * Web Bluetooth is or isn't available (browser family + platform), so error
 * logs stay short and don't leak full client strings verbatim.
 */
export function describeRuntime(): string {
  const g = globalThis as {
    navigator?: { userAgent?: string };
    process?: { versions?: { node?: string } };
  };
  const parts: string[] = [];

  const ua = g.navigator?.userAgent;
  if (typeof ua === "string" && ua.length > 0) {
    parts.push(`ua="${shortenUserAgent(ua)}"`);
  }

  const node = g.process?.versions?.node;
  if (typeof node === "string" && node.length > 0) {
    parts.push(`node=${node}`);
  }

  if (parts.length === 0) parts.push("runtime=unknown");
  return parts.join(" ");
}

function shortenUserAgent(ua: string): string {
  const tokens: string[] = [];
  const browser = ua.match(
    /(Edg|OPR|Chrome|Firefox|Safari|SamsungBrowser)\/[\d.]+/,
  );
  if (browser) tokens.push(browser[0]);
  const platform = ua.match(
    /\((?:Windows|Macintosh|X11|Linux|Android|iPhone|iPad)[^)]*\)/,
  );
  if (platform) tokens.push(platform[0]);
  const short = tokens.join(" ").slice(0, 120);
  return short.length > 0 ? short : ua.slice(0, 120);
}
