import type { SecurityGroupInfo, SecurityGroupRule } from "./security-groups";

export type SecurityGroupWarningLevel = "critical" | "warning";

export interface SecurityGroupWarning {
  level: SecurityGroupWarningLevel;
  message: string;
  rule: SecurityGroupRule;
}

const DANGEROUS_PORTS = [22, 3389, 3306, 5432, 1433, 27017, 6379];

export function computeSecurityGroupWarnings(
  securityGroup: SecurityGroupInfo,
): SecurityGroupWarning[] {
  const warnings: SecurityGroupWarning[] = [];

  for (const rule of securityGroup.inboundRules) {
    const hasPublicIpv4 = rule.ipRanges?.some((range) => range === "0.0.0.0/0");
    const hasPublicIpv6 = rule.ipv6Ranges?.some((range) => range === "::/0");

    if (!hasPublicIpv4 && !hasPublicIpv6) {
      continue;
    }

    const isDangerousPort =
      rule.fromPort !== undefined &&
      DANGEROUS_PORTS.includes(Number(rule.fromPort));

    const allowsAllPorts = rule.fromPort === undefined;

    if (isDangerousPort || rule.protocol === "-1") {
      warnings.push({
        level: "critical",
        message: `Allows access from anywhere on port ${rule.fromPort ?? "all"}`,
        rule,
      });
      continue;
    }

    if (allowsAllPorts) {
      warnings.push({
        level: "warning",
        message: "Allows access from anywhere on all ports",
        rule,
      });
    }
  }

  return warnings;
}

export interface SecurityGroupWithWarnings extends SecurityGroupInfo {
  warnings: SecurityGroupWarning[];
}

export function attachWarningsToSecurityGroups(
  securityGroups: SecurityGroupInfo[],
): SecurityGroupWithWarnings[] {
  return securityGroups.map((group) => ({
    ...group,
    warnings: computeSecurityGroupWarnings(group),
  }));
}

export function attachWarningsToSecurityGroup(
  securityGroup: SecurityGroupInfo | null,
): SecurityGroupWithWarnings | null {
  if (!securityGroup) {
    return null;
  }

  return {
    ...securityGroup,
    warnings: computeSecurityGroupWarnings(securityGroup),
  };
}
