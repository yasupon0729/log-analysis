import { NextResponse } from "next/server";

import { attachWarningsToSecurityGroups } from "@/lib/ec2/security-group-warnings";
import { listSecurityGroups } from "@/lib/ec2/security-groups";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    logger.info("Fetching security groups");
    const securityGroups = await listSecurityGroups();
    const securityGroupsWithWarnings =
      attachWarningsToSecurityGroups(securityGroups);

    return NextResponse.json({
      success: true,
      data: {
        securityGroups: securityGroupsWithWarnings,
        statistics: {
          totalGroups: securityGroups.length,
          totalInboundRules: securityGroups.reduce(
            (sum, group) => sum + group.inboundRules.length,
            0,
          ),
          totalOutboundRules: securityGroups.reduce(
            (sum, group) => sum + group.outboundRules.length,
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
