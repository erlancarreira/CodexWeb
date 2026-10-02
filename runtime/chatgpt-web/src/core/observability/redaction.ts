const SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-key]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, "Bearer [redacted]"],
  [/\b(runtime[-_ ]?key|api[-_ ]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]"],
];

export function redactTurnDiagnosticText(value: string): string {
  let redacted = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) redacted = redacted.replace(pattern, replacement);
  return redacted;
}
