"use client";

import { useState } from "react";
import type { SecurityGroupInfo } from "@/lib/ec2/security-groups";
import {
  securityGroupCardHeaderRecipe,
  securityGroupCardMetaRecipe,
  securityGroupCardRecipe,
  securityGroupCardTitleContainerRecipe,
  securityGroupCardTitleRecipe,
  securityGroupCriticalBadgeRecipe,
  securityGroupDescriptionRecipe,
  securityGroupDetailsRecipe,
  securityGroupExpandButtonRecipe,
  securityGroupGroupIdRecipe,
  securityGroupNoRulesRecipe,
  securityGroupRulesSectionRecipe,
  securityGroupRulesTableRecipe,
  securityGroupSectionTitleRecipe,
  securityGroupSourceRecipe,
  securityGroupTableHeaderRecipe,
  securityGroupTableRowRecipe,
  securityGroupVpcBadgeRecipe,
  securityGroupWarningBadgeContainerRecipe,
  securityGroupWarningBadgeRecipe,
  securityGroupWarningItemRecipe,
  securityGroupWarningLevelRecipe,
  securityGroupWarningsSectionRecipe,
} from "@/styles/recipes/components/security-group-card.recipe";

interface SecurityGroupWithWarnings extends SecurityGroupInfo {
  warnings: Array<{
    level: "critical" | "warning";
    message: string;
    // biome-ignore lint/suspicious/noExplicitAny: ルールの型は複雑なため一時的にany
    rule: any;
  }>;
}

interface Props {
  securityGroup: SecurityGroupWithWarnings;
}

export function SecurityGroupCard({ securityGroup: sg }: Props) {
  const [expanded, setExpanded] = useState(false);

  const getRuleTargetDisplay = (
    rule: SecurityGroupInfo["inboundRules"][number],
  ): string => {
    const cidrTargets = [
      ...(rule.ipRanges ?? []),
      ...(rule.ipv6Ranges ?? []),
    ].filter((target) => target && target.length > 0);

    if (cidrTargets.length > 0) {
      return cidrTargets.join(", ");
    }

    if (rule.securityGroups && rule.securityGroups.length > 0) {
      return rule.securityGroups.filter((id) => id.length > 0).join(", ");
    }

    return "N/A";
  };

  const formatPort = (fromPort?: number, toPort?: number) => {
    if (!fromPort && !toPort) return "All";
    if (fromPort === toPort) return String(fromPort);
    return `${fromPort}-${toPort}`;
  };

  const hasWarnings = sg.warnings.length > 0;
  const criticalCount = sg.warnings.filter(
    (w) => w.level === "critical",
  ).length;
  const warningCount = sg.warnings.filter((w) => w.level === "warning").length;

  return (
    <div className={securityGroupCardRecipe({ hasWarnings })}>
      <button
        type="button"
        className={securityGroupCardHeaderRecipe()}
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div className={securityGroupCardTitleContainerRecipe()}>
          <h3 className={securityGroupCardTitleRecipe()}>{sg.groupName}</h3>
          <span className={securityGroupGroupIdRecipe()}>{sg.groupId}</span>
        </div>

        <div className={securityGroupCardMetaRecipe()}>
          {sg.vpcId && (
            <span className={securityGroupVpcBadgeRecipe()}>{sg.vpcId}</span>
          )}
          {hasWarnings && (
            <div className={securityGroupWarningBadgeContainerRecipe()}>
              {criticalCount > 0 && (
                <span className={securityGroupCriticalBadgeRecipe()}>
                  ⚠️ {criticalCount} Critical
                </span>
              )}
              {warningCount > 0 && (
                <span className={securityGroupWarningBadgeRecipe()}>
                  ⚠️ {warningCount} Warning
                </span>
              )}
            </div>
          )}
        </div>

        <span className={securityGroupExpandButtonRecipe()} aria-hidden="true">
          {expanded ? "▼" : "▶"}
        </span>
      </button>

      <div className={securityGroupDescriptionRecipe()}>{sg.description}</div>

      {expanded && (
        <div className={securityGroupDetailsRecipe()}>
          {/* Warnings Section */}
          {hasWarnings && (
            <div className={securityGroupWarningsSectionRecipe()}>
              <h4 className={securityGroupSectionTitleRecipe()}>
                ⚠️ Security Warnings
              </h4>
              {sg.warnings.map((warning, idx) => (
                <div
                  key={`${sg.groupId}-warning-${idx}-${warning.level}`}
                  className={securityGroupWarningItemRecipe({
                    level: warning.level,
                  })}
                >
                  <span
                    className={securityGroupWarningLevelRecipe({
                      level: warning.level,
                    })}
                  >
                    {warning.level.toUpperCase()}
                  </span>
                  <span>{warning.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Inbound Rules */}
          <div className={securityGroupRulesSectionRecipe()}>
            <h4 className={securityGroupSectionTitleRecipe()}>
              📥 Inbound Rules ({sg.inboundRules.length})
            </h4>
            {sg.inboundRules.length === 0 ? (
              <p className={securityGroupNoRulesRecipe()}>No inbound rules</p>
            ) : (
              <div className={securityGroupRulesTableRecipe()}>
                <div className={securityGroupTableHeaderRecipe()}>
                  <span>Protocol</span>
                  <span>Port</span>
                  <span>Source</span>
                  <span>Description</span>
                </div>
                {sg.inboundRules.map((rule, idx) => (
                  <div
                    key={`${sg.groupId}-inbound-${idx}-${rule.protocol}-${rule.fromPort || "all"}`}
                    className={securityGroupTableRowRecipe()}
                  >
                    <span>
                      {rule.protocol === "-1" ? "All" : rule.protocol}
                    </span>
                    <span>{formatPort(rule.fromPort, rule.toPort)}</span>
                    <span className={securityGroupSourceRecipe()}>
                      {getRuleTargetDisplay(rule)}
                    </span>
                    <span>{rule.description || "N/A"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outbound Rules */}
          <div className={securityGroupRulesSectionRecipe()}>
            <h4 className={securityGroupSectionTitleRecipe()}>
              📤 Outbound Rules ({sg.outboundRules.length})
            </h4>
            {sg.outboundRules.length === 0 ? (
              <p className={securityGroupNoRulesRecipe()}>No outbound rules</p>
            ) : (
              <div className={securityGroupRulesTableRecipe()}>
                <div className={securityGroupTableHeaderRecipe()}>
                  <span>Protocol</span>
                  <span>Port</span>
                  <span>Destination</span>
                  <span>Description</span>
                </div>
                {sg.outboundRules.map((rule, idx) => (
                  <div
                    key={`${sg.groupId}-outbound-${idx}-${rule.protocol}-${rule.toPort || "all"}`}
                    className={securityGroupTableRowRecipe()}
                  >
                    <span>
                      {rule.protocol === "-1" ? "All" : rule.protocol}
                    </span>
                    <span>{formatPort(rule.fromPort, rule.toPort)}</span>
                    <span className={securityGroupSourceRecipe()}>
                      {getRuleTargetDisplay(rule)}
                    </span>
                    <span>{rule.description || "N/A"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
