/**
 * Who hears about an alert.
 *
 * Pure, because the rule that matters here is a safety property and
 * safety properties deserve to be testable: THIS MUST NEVER RETURN
 * NOBODY. An alert sent to an empty list is indistinguishable from a
 * property that is fine, and the manager finds out from the city.
 *
 * So: the assigned manager if there is one who can actually be
 * reached, and everyone otherwise. Assignment narrows the audience; it
 * can never empty it.
 */

export interface Member {
  id: string;
  email?: string | null;
  phone?: string | null;
}

export interface Recipients {
  email: string[];
  sms: string[];
  /** Why this audience, for the notification log. */
  reason: "assigned" | "whole-team" | "assignee-unreachable" | "none-reachable";
}

function contactable(member: Member): boolean {
  return !!member.email || !!member.phone;
}

function split(members: Member[]): { email: string[]; sms: string[] } {
  return {
    email: members.map((m) => m.email).filter((e): e is string => !!e),
    sms: members.map((m) => m.phone).filter((p): p is string => !!p),
  };
}

export function recipientsFor(
  members: Member[],
  assigneeId: string | null | undefined
): Recipients {
  const reachable = members.filter(contactable);

  if (assigneeId) {
    const assignee = reachable.find((m) => m.id === assigneeId);
    if (assignee) return { ...split([assignee]), reason: "assigned" };

    // Assigned to somebody with no email or phone, or to someone who
    // has since left. Fall back to the team rather than dropping it.
    return {
      ...split(reachable),
      reason: reachable.length ? "assignee-unreachable" : "none-reachable",
    };
  }

  return {
    ...split(reachable),
    reason: reachable.length ? "whole-team" : "none-reachable",
  };
}
