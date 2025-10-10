import { notFound } from "next/navigation";

import { SecurityGroupDetail } from "@/components/ec2/SecurityGroupDetail";
import { attachWarningsToSecurityGroup } from "@/lib/ec2/security-group-warnings";
import { getSecurityGroup } from "@/lib/ec2/security-groups";

interface SecurityGroupDetailPageProps {
  params: {
    groupId: string;
  };
}

export default async function SecurityGroupDetailPage({
  params,
}: SecurityGroupDetailPageProps) {
  const group = await getSecurityGroup(params.groupId);
  const groupWithWarnings = attachWarningsToSecurityGroup(group);

  if (!groupWithWarnings) {
    notFound();
  }

  return <SecurityGroupDetail group={groupWithWarnings} />;
}
