// Small formatting helpers. All monetary values are atto-scale (wei); 1 GEN = 10^18.

export function truncate(hexOrText, head = 6, tail = 4) {
  if (!hexOrText) return "";
  const s = String(hexOrText);
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function formatGen(atto) {
  try {
    const v = BigInt(atto ?? 0);
    const whole = v / 10n ** 18n;
    const frac = v % 10n ** 18n;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : `${whole}`;
  } catch {
    return "0";
  }
}

export function genToAtto(gen) {
  // Parse a decimal GEN string into an atto-scale bigint without floating point.
  const s = String(gen ?? "").trim();
  if (!s || isNaN(Number(s))) return 0n;
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded || "0");
}

export const VERDICT = {
  AWAITING_EVIDENCE: { label: "AWAITING EVIDENCE", cls: "review" },
  VERIFIED: { label: "VERIFIED", cls: "verified" },
  REJECTED: { label: "REJECTED", cls: "rejected" },
};
