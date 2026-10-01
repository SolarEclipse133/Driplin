/**
 * Saying what went wrong, without saying anything that shouldn't be said.
 *
 * Driplin had no logging at all. That was a real security property -- no
 * secret could leak into a log that did not exist -- and a real operational
 * problem: when a vendor connection starts returning 403s, or the nightly
 * run half-fails, there is nothing to look at.
 *
 * The obvious fix is the dangerous one. "Log the error and the context"
 * becomes a log aggregator holding vendor API keys, board-link tokens and
 * customers' street addresses, in a system with weaker access control than
 * the database those things came from, retained for longer.
 *
 * So two rules, one of them enforced rather than trusted:
 *
 *   1. Context is named explicitly at the call site. Never a request body,
 *      never a whole row, never an error object's own properties.
 *   2. Everything passes through redact() on the way out, which strips
 *      anything that looks like a credential whatever it is called. There
 *      are tests for that, because a promise nobody checks is not a
 *      control.
 *
 * Output is one line of JSON on stderr, which the host already captures.
 * No new vendor and no new secret to hold. Swapping in a hosted service
 * later means changing emit() and nothing else.
 */

/** Keys whose value is never printed, whatever it contains. */
const SECRET_KEY = /(token|secret|password|credential|authorization|cookie|api[-_]?key|apikey|^key$|service[-_]?role|anon[-_]?key)/i;

/** Values that are a credential regardless of what they are called. */
const SECRET_VALUE: RegExp[] = [
  /^Bearer\s+\S+/i,
  // A JWT, which is what a Supabase key looks like.
  /^eyJ[A-Za-z0-9_-]{10,}\./,
  // Driplin's own encrypted-secret envelope, v1.<iv>.<tag>.<ciphertext>.
  /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./,
  // A 32-byte link token, base64url, as generateLinkToken produces.
  /^[A-Za-z0-9_-]{43}$/,
  // A hex digest: a token hash is not a secret, but it identifies one.
  /^[0-9a-f]{64}$/i,
];

export const REDACTED = "[redacted]";

/** Keep the domain, lose the person. */
function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at < 1) return value;
  const first = value[0];
  return `${first}***${value.slice(at)}`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_DEPTH = 4;
const MAX_STRING = 300;
const MAX_ARRAY = 20;

/**
 * Strip anything credential-shaped out of a value before it is printed.
 *
 * Deliberately conservative: it would rather redact a harmless string that
 * happens to look like a token than print a real one.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[too deep]";

  if (typeof value === "string") {
    if (SECRET_VALUE.some((re) => re.test(value))) return REDACTED;
    if (EMAIL.test(value)) return maskEmail(value);
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…[${value.length} chars]`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
    if (value.length > MAX_ARRAY) out.push(`…and ${value.length - MAX_ARRAY} more`);
    return out;
  }

  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1) };
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }

  // Functions, symbols, bigints: say the type and nothing else.
  return `[${typeof value}]`;
}

export interface ReportedEvent {
  level: "error" | "warn";
  /** A stable, searchable name for the thing that failed. */
  event: string;
  message: string;
  context: Record<string, unknown>;
  at: string;
}

/** The single place anything is written. Swap this for a vendor later. */
function emit(entry: ReportedEvent): void {
  // One line of JSON: greppable by hand, parseable by a log tool.
  const line = JSON.stringify(entry);
  if (entry.level === "error") console.error(line);
  else console.warn(line);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Something failed in a way somebody will need to investigate.
 *
 * `context` must be assembled by hand from fields chosen on purpose --
 * ids, counts, vendor names, status codes. Not a row, not a body, not an
 * address.
 */
/*
 * Named reportServerError, not reportError: the DOM declares a global
 * reportError(error) taking one argument, so a missing import here would
 * quietly bind to that and throw the entry away instead of failing to
 * compile. This spelling cannot resolve to anything but itself.
 */
export function reportServerError(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  emit({
    level: "error",
    event,
    message: String(redact(messageOf(error))),
    context: redact(context) as Record<string, unknown>,
    at: new Date().toISOString(),
  });
}

/** Something is wrong but nothing is broken yet. */
export function reportServerWarning(
  event: string,
  message: string,
  context: Record<string, unknown> = {}
): void {
  emit({
    level: "warn",
    event,
    message: String(redact(message)),
    context: redact(context) as Record<string, unknown>,
    at: new Date().toISOString(),
  });
}
