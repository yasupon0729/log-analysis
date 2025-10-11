import { NextResponse } from "next/server";

import { countFlattenedRules } from "@/lib/ec2/rules";
import { attachWarningsToSecurityGroups } from "@/lib/ec2/security-group-warnings";
import { listSecurityGroups } from "@/lib/ec2/security-groups";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    logger.info("Fetching security groups");
    const securityGroups = await listSecurityGroups();
    const securityGroupsWithWarnings =
      attachWarningsToSecurityGroups(securityGroups);

    const totalInboundRules = securityGroupsWithWarnings.reduce(
      (sum, group) => sum + countFlattenedRules(group.inboundRules),
      0,
    );
    const totalOutboundRules = securityGroupsWithWarnings.reduce(
      (sum, group) => sum + countFlattenedRules(group.outboundRules),
      0,
    );

    return NextResponse.json({
      success: true,
      data: {
        securityGroups: securityGroupsWithWarnings,
        statistics: {
          totalGroups: securityGroups.length,
          totalInboundRules,
          totalOutboundRules,
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
