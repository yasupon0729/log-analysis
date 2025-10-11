import type { SecurityGroupRule } from "./security-groups";

export function countFlattenedRules(rules: SecurityGroupRule[]): number {
  let total = 0;

  for (const rule of rules) {
    const ipv4Count = rule.ipRanges?.length ?? 0;
    const ipv6Count = rule.ipv6Ranges?.length ?? 0;
    const peerCount = rule.securityGroups?.length ?? 0;
    const entries = ipv4Count + ipv6Count + peerCount;
    total += entries > 0 ? entries : 1;
  }

  return total;
}
