import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  type DescribeSecurityGroupsCommandInput,
  type Filter,
  type IpPermission,
  ModifySecurityGroupRulesCommand,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
  type SecurityGroup,
} from "@aws-sdk/client-ec2";
import { logger } from "../logger";
import { getEC2Client } from "./client";

export interface SecurityGroupInfo {
  groupId: string;
  groupName: string;
  description: string;
  vpcId?: string;
  inboundRules: SecurityGroupRule[];
  outboundRules: SecurityGroupRule[];
  tags?: Record<string, string>;
}

export interface SecurityGroupRule {
  protocol: string;
  fromPort?: number;
  toPort?: number;
  ipRanges?: string[];
  ipv6Ranges?: string[];
  securityGroups?: string[];
  description?: string;
}

/**
 * セキュリティグループ一覧を取得
 */
export async function listSecurityGroups(
  filters?: Filter[],
): Promise<SecurityGroupInfo[]> {
  const client = getEC2Client();
  const input: DescribeSecurityGroupsCommandInput = {
    Filters: filters,
  };

  const command = new DescribeSecurityGroupsCommand(input);
  const response = await client.send(command);

  return (response.SecurityGroups ?? []).map(parseSecurityGroup);
}

/**
 * 特定のセキュリティグループを取得
 */
export async function getSecurityGroup(
  groupId: string,
): Promise<SecurityGroupInfo | null> {
  const filters: Filter[] = [
    {
      Name: "group-id",
      Values: [groupId],
    },
  ];

  const groups = await listSecurityGroups(filters);
  return groups[0] ?? null;
}

/**
 * VPC内のセキュリティグループを取得
 */
export async function getSecurityGroupsByVpc(
  vpcId: string,
): Promise<SecurityGroupInfo[]> {
  const filters: Filter[] = [
    {
      Name: "vpc-id",
      Values: [vpcId],
    },
  ];

  return listSecurityGroups(filters);
}

/**
 * セキュリティグループを名前で検索
 */
export async function findSecurityGroupsByName(
  groupName: string,
): Promise<SecurityGroupInfo[]> {
  const filters: Filter[] = [
    {
      Name: "group-name",
      Values: [groupName],
    },
  ];

  return listSecurityGroups(filters);
}

/**
 * 開放されているポートをチェック
 */
export async function checkOpenPorts(
  groupId: string,
): Promise<{ port: number; protocol: string; sources: string[] }[]> {
  const group = await getSecurityGroup(groupId);
  if (!group) {
    return [];
  }

  const openPorts: {
    port: number;
    protocol: string;
    sources: string[];
  }[] = [];

  for (const rule of group.inboundRules) {
    // 0.0.0.0/0 からのアクセスを許可しているルールをチェック
    const publicSources = rule.ipRanges?.filter(
      (range) => range === "0.0.0.0/0",
    );

    if (publicSources && publicSources.length > 0 && rule.fromPort) {
      for (
        let port = rule.fromPort;
        port <= (rule.toPort ?? rule.fromPort);
        port++
      ) {
        openPorts.push({
          port,
          protocol: rule.protocol ?? "unknown",
          sources: publicSources,
        });
      }
    }
  }

  return openPorts;
}

/**
 * SecurityGroupオブジェクトをSecurityGroupInfoに変換
 */
function parseSecurityGroup(sg: SecurityGroup): SecurityGroupInfo {
  return {
    groupId: sg.GroupId ?? "",
    groupName: sg.GroupName ?? "",
    description: sg.Description ?? "",
    vpcId: sg.VpcId,
    inboundRules: parseIpPermissions(sg.IpPermissions ?? []),
    outboundRules: parseIpPermissions(sg.IpPermissionsEgress ?? []),
    tags: parseTags(sg.Tags),
  };
}

/**
 * IpPermissionをSecurityGroupRuleに変換
 */
function parseIpPermissions(permissions: IpPermission[]): SecurityGroupRule[] {
  return permissions.map((perm) => ({
    protocol: perm.IpProtocol ?? "-1",
    fromPort: perm.FromPort,
    toPort: perm.ToPort,
    ipRanges: perm.IpRanges?.map((r) => r.CidrIp ?? ""),
    ipv6Ranges: perm.Ipv6Ranges?.map((r) => r.CidrIpv6 ?? ""),
    securityGroups: perm.UserIdGroupPairs?.map((g) => g.GroupId ?? ""),
    description: perm.IpRanges?.[0]?.Description,
  }));
}

/**
 * タグをオブジェクトに変換
 */
function parseTags(
  tags?: Array<{ Key?: string; Value?: string }>,
): Record<string, string> | undefined {
  if (!tags || tags.length === 0) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const tag of tags) {
    if (tag.Key) {
      result[tag.Key] = tag.Value ?? "";
    }
  }
  return result;
}

// ===== CRUD Operations =====

/**
 * セキュリティグループを作成
 */
export async function createSecurityGroup(params: {
  groupName: string;
  description: string;
  vpcId?: string;
  tags?: Record<string, string>;
}): Promise<{ groupId: string }> {
  const client = getEC2Client();

  const command = new CreateSecurityGroupCommand({
    GroupName: params.groupName,
    Description: params.description,
    VpcId: params.vpcId,
    TagSpecifications: params.tags
      ? [
          {
            ResourceType: "security-group",
            Tags: Object.entries(params.tags).map(([key, value]) => ({
              Key: key,
              Value: value,
            })),
          },
        ]
      : undefined,
  });

  const response = await client.send(command);

  if (!response.GroupId) {
    throw new Error("Failed to create security group");
  }

  return { groupId: response.GroupId };
}

/**
 * インバウンドルールを追加
 */
export async function addInboundRule(params: {
  groupId: string;
  protocol: string;
  fromPort: number;
  toPort: number;
  source: string | { groupId: string };
  description?: string;
}): Promise<void> {
  const client = getEC2Client();

  const ipPermission: IpPermission = {
    IpProtocol: params.protocol,
    FromPort: params.fromPort,
    ToPort: params.toPort,
  };

  if (typeof params.source === "string") {
    // IP範囲の場合
    ipPermission.IpRanges = [
      {
        CidrIp: params.source,
        Description: params.description,
      },
    ];
  } else {
    // セキュリティグループの場合
    ipPermission.UserIdGroupPairs = [
      {
        GroupId: params.source.groupId,
        Description: params.description,
      },
    ];
  }

  const command = new AuthorizeSecurityGroupIngressCommand({
    GroupId: params.groupId,
    IpPermissions: [ipPermission],
  });

  await client.send(command);
}

/**
 * アウトバウンドルールを追加
 */
export async function addOutboundRule(params: {
  groupId: string;
  protocol: string;
  fromPort: number;
  toPort: number;
  destination: string | { groupId: string };
  description?: string;
}): Promise<void> {
  const client = getEC2Client();

  const ipPermission: IpPermission = {
    IpProtocol: params.protocol,
    FromPort: params.fromPort,
    ToPort: params.toPort,
  };

  if (typeof params.destination === "string") {
    // IP範囲の場合
    ipPermission.IpRanges = [
      {
        CidrIp: params.destination,
        Description: params.description,
      },
    ];
  } else {
    // セキュリティグループの場合
    ipPermission.UserIdGroupPairs = [
      {
        GroupId: params.destination.groupId,
        Description: params.description,
      },
    ];
  }

  const command = new AuthorizeSecurityGroupEgressCommand({
    GroupId: params.groupId,
    IpPermissions: [ipPermission],
  });

  await client.send(command);
}

/**
 * インバウンドルールを削除
 */
export async function removeInboundRule(params: {
  groupId: string;
  protocol: string;
  fromPort: number;
  toPort: number;
  source: string | { groupId: string };
}): Promise<void> {
  const client = getEC2Client();

  const ipPermission: IpPermission = {
    IpProtocol: params.protocol,
    FromPort: params.fromPort,
    ToPort: params.toPort,
  };

  if (typeof params.source === "string") {
    ipPermission.IpRanges = [{ CidrIp: params.source }];
  } else {
    ipPermission.UserIdGroupPairs = [{ GroupId: params.source.groupId }];
  }

  const command = new RevokeSecurityGroupIngressCommand({
    GroupId: params.groupId,
    IpPermissions: [ipPermission],
  });

  await client.send(command);
}

/**
 * アウトバウンドルールを削除
 */
export async function removeOutboundRule(params: {
  groupId: string;
  protocol: string;
  fromPort: number;
  toPort: number;
  destination: string | { groupId: string };
}): Promise<void> {
  const client = getEC2Client();

  const ipPermission: IpPermission = {
    IpProtocol: params.protocol,
    FromPort: params.fromPort,
    ToPort: params.toPort,
  };

  if (typeof params.destination === "string") {
    ipPermission.IpRanges = [{ CidrIp: params.destination }];
  } else {
    ipPermission.UserIdGroupPairs = [{ GroupId: params.destination.groupId }];
  }

  const command = new RevokeSecurityGroupEgressCommand({
    GroupId: params.groupId,
    IpPermissions: [ipPermission],
  });

  await client.send(command);
}

/**
 * セキュリティグループの説明を更新
 */
export async function updateSecurityGroupDescription(params: {
  groupId: string;
  vpcId?: string;
  rules: Array<{
    ruleId: string;
    description: string;
  }>;
}): Promise<void> {
  const client = getEC2Client();

  const command = new ModifySecurityGroupRulesCommand({
    GroupId: params.groupId,
    SecurityGroupRules: params.rules.map((rule) => ({
      SecurityGroupRuleId: rule.ruleId,
      SecurityGroupRule: {
        Description: rule.description,
      },
    })),
  });

  await client.send(command);
}

/**
 * セキュリティグループをコピー
 */
export async function copySecurityGroup(params: {
  sourceGroupId: string;
  newGroupName: string;
  newDescription?: string;
  vpcId?: string;
  copyInboundRules?: boolean;
  copyOutboundRules?: boolean;
  copyTags?: boolean;
}): Promise<{ groupId: string; copiedRules: number }> {
  const client = getEC2Client();

  // ソースグループを取得
  const sourceGroup = await getSecurityGroup(params.sourceGroupId);
  if (!sourceGroup) {
    throw new Error(`Source security group not found: ${params.sourceGroupId}`);
  }

  // 新しいグループを作成
  const newGroupResult = await createSecurityGroup({
    groupName: params.newGroupName,
    description: params.newDescription || sourceGroup.description,
    vpcId: params.vpcId ?? sourceGroup.vpcId,
    tags: params.copyTags !== false ? sourceGroup.tags : undefined,
  });

  let copiedRules = 0;

  // インバウンドルールをコピー
  if (params.copyInboundRules !== false) {
    for (const rule of sourceGroup.inboundRules) {
      try {
        const ipPermission: IpPermission = {
          IpProtocol: rule.protocol,
          FromPort: rule.fromPort,
          ToPort: rule.toPort,
        };

        // IP範囲
        if (rule.ipRanges && rule.ipRanges.length > 0) {
          ipPermission.IpRanges = rule.ipRanges.map((ip) => ({
            CidrIp: ip,
            Description: rule.description,
          }));
        }

        // IPv6範囲
        if (rule.ipv6Ranges && rule.ipv6Ranges.length > 0) {
          ipPermission.Ipv6Ranges = rule.ipv6Ranges.map((ip) => ({
            CidrIpv6: ip,
            Description: rule.description,
          }));
        }

        // セキュリティグループ
        if (rule.securityGroups && rule.securityGroups.length > 0) {
          ipPermission.UserIdGroupPairs = rule.securityGroups.map((sg) => ({
            GroupId: sg,
            Description: rule.description,
          }));
        }

        const command = new AuthorizeSecurityGroupIngressCommand({
          GroupId: newGroupResult.groupId,
          IpPermissions: [ipPermission],
        });

        await client.send(command);
        copiedRules++;
        // biome-ignore lint/suspicious/noExplicitAny: <error>
      } catch (error: any) {
        // 重複ルールの場合はスキップ
        if (!error?.message?.includes("already exists")) {
          console.error(`Failed to copy inbound rule: ${error.message}`);
        }
      }
    }
  }

  // アウトバウンドルールをコピー（デフォルトルール以外）
  if (params.copyOutboundRules === true) {
    // デフォルトの全許可ルールを削除
    try {
      const defaultRule: IpPermission = {
        IpProtocol: "-1",
        IpRanges: [{ CidrIp: "0.0.0.0/0" }],
      };

      const revokeCommand = new RevokeSecurityGroupEgressCommand({
        GroupId: newGroupResult.groupId,
        IpPermissions: [defaultRule],
      });

      await client.send(revokeCommand);
      // biome-ignore lint/suspicious/noExplicitAny: <errorのため>
    } catch (error: any) {
      // デフォルトルールが存在しない場合は無視
      logger.info(error.message);
    }

    // カスタムアウトバウンドルールをコピー
    for (const rule of sourceGroup.outboundRules) {
      try {
        const ipPermission: IpPermission = {
          IpProtocol: rule.protocol,
          FromPort: rule.fromPort,
          ToPort: rule.toPort,
        };

        // IP範囲
        if (rule.ipRanges && rule.ipRanges.length > 0) {
          ipPermission.IpRanges = rule.ipRanges.map((ip) => ({
            CidrIp: ip,
            Description: rule.description,
          }));
        }

        // IPv6範囲
        if (rule.ipv6Ranges && rule.ipv6Ranges.length > 0) {
          ipPermission.Ipv6Ranges = rule.ipv6Ranges.map((ip) => ({
            CidrIpv6: ip,
            Description: rule.description,
          }));
        }

        // セキュリティグループ
        if (rule.securityGroups && rule.securityGroups.length > 0) {
          ipPermission.UserIdGroupPairs = rule.securityGroups.map((sg) => ({
            GroupId: sg,
            Description: rule.description,
          }));
        }

        const command = new AuthorizeSecurityGroupEgressCommand({
          GroupId: newGroupResult.groupId,
          IpPermissions: [ipPermission],
        });

        await client.send(command);
        copiedRules++;
        // biome-ignore lint/suspicious/noExplicitAny: <error>
      } catch (error: any) {
        // 重複ルールの場合はスキップ
        if (!error?.message?.includes("already exists")) {
          console.error(`Failed to copy outbound rule: ${error.message}`);
        }
      }
    }
  }

  return {
    groupId: newGroupResult.groupId,
    copiedRules,
  };
}

/**
 * 一般的なルールを追加するヘルパー関数
 */
export const CommonRules = {
  /**
   * SSHアクセスを許可
   */
  async allowSSH(groupId: string, source = "0.0.0.0/0"): Promise<void> {
    await addInboundRule({
      groupId,
      protocol: "tcp",
      fromPort: 22,
      toPort: 22,
      source,
      description: "SSH access",
    });
  },

  /**
   * HTTPアクセスを許可
   */
  async allowHTTP(groupId: string, source = "0.0.0.0/0"): Promise<void> {
    await addInboundRule({
      groupId,
      protocol: "tcp",
      fromPort: 80,
      toPort: 80,
      source,
      description: "HTTP access",
    });
  },

  /**
   * HTTPSアクセスを許可
   */
  async allowHTTPS(groupId: string, source = "0.0.0.0/0"): Promise<void> {
    await addInboundRule({
      groupId,
      protocol: "tcp",
      fromPort: 443,
      toPort: 443,
      source,
      description: "HTTPS access",
    });
  },

  /**
   * RDPアクセスを許可
   */
  async allowRDP(groupId: string, source = "0.0.0.0/0"): Promise<void> {
    await addInboundRule({
      groupId,
      protocol: "tcp",
      fromPort: 3389,
      toPort: 3389,
      source,
      description: "RDP access",
    });
  },

  /**
   * MySQLアクセスを許可
   */
  async allowMySQL(
    groupId: string,
    source: string | { groupId: string },
  ): Promise<void> {
    await addInboundRule({
      groupId,
      protocol: "tcp",
      fromPort: 3306,
      toPort: 3306,
      source,
      description: "MySQL/Aurora access",
    });
  },

  /**
   * PostgreSQLアクセスを許可
   */
  async allowPostgreSQL(
    groupId: string,
    source: string | { groupId: string },
  ): Promise<void> {
    await addInboundRule({
      groupId,
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      source,
      description: "PostgreSQL access",
    });
  },
};
