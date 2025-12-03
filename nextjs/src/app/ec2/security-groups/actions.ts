"use server";

import { revalidatePath } from "next/cache";
import { addInboundRule, findSecurityGroupsByName, listSecurityGroups } from "@/lib/ec2/security-groups";
import { logger } from "@/lib/logger";

export async function registerToTmpAction(userIp: string) {
  if (!userIp) {
    return { success: false, message: "User IP is missing" };
  }

  const memberName = process.env.KNIT_MEMBER || "Unknown Member";
  
  const date = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const description = `${memberName} ${date}`;

  try {
    // First, try to find by GroupName "tmp"
    let groups = await findSecurityGroupsByName("tmp");

    // If not found, try to find by Tag Name "tmp"
    if (groups.length === 0) {
      groups = await listSecurityGroups([{ Name: "tag:Name", Values: ["tmp"] }]);
    }

    if (groups.length === 0) {
      return { success: false, message: "Security group 'tmp' not found." };
    }

    // Use the first found group
    const groupId = groups[0].groupId;
    const groupName = groups[0].groupName; // For log/message

    const ports = [443, 22];
    const protocol = "tcp";
    const ipCidr = `${userIp}/32`;

    const results = [];

    for (const port of ports) {
      try {
        await addInboundRule({
          groupId,
          protocol,
          fromPort: port,
          toPort: port,
          source: ipCidr,
          description,
        });
        results.push(`Port ${port}: Registered`);
      } catch (error: any) {
        if (
          error.name === "InvalidPermission.Duplicate" ||
          error.message?.includes("already exists") ||
          error.Code === "InvalidPermission.Duplicate"
        ) {
          results.push(`Port ${port}: Already registered`);
        } else {
          logger.error("Failed to add inbound rule", { error, groupId, port, userIp });
          results.push(`Port ${port}: Failed - ${error.message}`);
        }
      }
    }

    revalidatePath("/ec2/security-groups");
    return { 
        success: true, 
        message: `Security Group: ${groupName} (${groupId})\n${results.join("\n")}` 
    };

  } catch (error: any) {
    logger.error("registerToTmpAction error", { error });
    return { success: false, message: `Error: ${error.message}` };
  }
}
