import { NextResponse } from "next/server";
import {
  listSecurityGroups,
  type SecurityGroupInfo,
} from "@/lib/ec2/security-groups";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    logger.info("Fetching security groups");
    const securityGroups = await listSecurityGroups();

    // 危険なルールをチェックする関数
    const checkDangerousRules = (sg: SecurityGroupInfo) => {
      const warnings: Array<{
        level: "critical" | "warning";
        message: string;
        // biome-ignore lint/suspicious/noExplicitAny: EC2 rule type is complex and varies by protocol
        rule: any;
      }> = [];

      for (const rule of sg.inboundRules) {
        const hasPublicIPv4 = rule.ipRanges?.some(
          (range) => range === "0.0.0.0/0",
        );
        const hasPublicIPv6 = rule.ipv6Ranges?.some(
          (range) => range === "::/0",
        );

        if (hasPublicIPv4 || hasPublicIPv6) {
          const dangerousPorts = [22, 3389, 3306, 5432, 1433, 27017, 6379];
          const isDangerous =
            rule.fromPort && dangerousPorts.includes(Number(rule.fromPort));

          if (isDangerous || rule.protocol === "-1") {
            warnings.push({
              level: "critical",
              message: `Allows access from anywhere on port ${rule.fromPort || "all"}`,
              rule,
            });
          } else if (!rule.fromPort) {
            warnings.push({
              level: "warning",
              message: "Allows access from anywhere on all ports",
              rule,
            });
          }
        }
      }

      return warnings;
    };

    // セキュリティグループに警告情報を追加
    const securityGroupsWithWarnings = securityGroups.map((sg) => ({
      ...sg,
      warnings: checkDangerousRules(sg),
    }));

    return NextResponse.json({
      success: true,
      data: {
        securityGroups: securityGroupsWithWarnings,
        statistics: {
          totalGroups: securityGroups.length,
          totalInboundRules: securityGroups.reduce(
            (sum, sg) => sum + sg.inboundRules.length,
            0,
          ),
          totalOutboundRules: securityGroups.reduce(
            (sum, sg) => sum + sg.outboundRules.length,
            0,
          ),
        },
      },
    });
  } catch (error) {
    logger.error("Failed to fetch security groups:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch security groups" },
      { status: 500 },
    );
  }
}
