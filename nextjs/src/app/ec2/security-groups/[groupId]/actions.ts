"use server";

import { join } from "node:path";
import { revalidatePath } from "next/cache";
import pino from "pino";

import {
  addInboundRule,
  removeInboundRule,
  removeOutboundRule,
} from "@/lib/ec2/security-groups";

// import { logger } from "@/lib/logger/server"; // アプリケーション全体のloggerはそのまま使用

// セキュリティグループ操作用の専用 logger インスタンス
const isDevelopment = process.env.NODE_ENV === "development";
const deleteSecurityLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info", // デフォルトレベルをinfoに設定
    formatters: {
      level: (label) => ({ level: label }),
      bindings: () => ({
        pid: process.pid,
        hostname: process.env.HOSTNAME || "localhost",
        environment: isDevelopment ? "development" : "production",
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({
    dest: join(process.cwd(), "logs", "delete-security.log"),
    sync: false, // 非同期書き込み
    mkdir: true,
  }),
);

export interface AddInboundRuleActionInput {
  groupId: string;
  protocol: "tcp" | "udp" | "all";
  ipVersion: "ipv4" | "ipv6";
  cidr: string;
  fromPort?: number;
  toPort?: number;
  description?: string;
}

export interface AddInboundRuleActionResult {
  ok: boolean;
  error?: string;
}

export async function addInboundRuleAction(
  input: AddInboundRuleActionInput,
): Promise<AddInboundRuleActionResult> {
  try {
    if (!input.groupId) {
      return { ok: false, error: "セキュリティグループIDが指定されていません" };
    }

    const protocol = normalizeProtocol(input.protocol);
    const cidr = input.cidr.trim();

    if (!cidr) {
      return { ok: false, error: "CIDRを入力してください" };
    }

    const cidrValidationError = validateCidr(cidr, input.ipVersion);
    if (cidrValidationError) {
      return { ok: false, error: cidrValidationError };
    }

    const portResult = resolvePortRange(input);
    if (!portResult.ok) {
      return { ok: false, error: portResult.error };
    }
    const { fromPort, toPort } = portResult;

    await addInboundRule({
      groupId: input.groupId,
      protocol,
      fromPort,
      toPort,
      source: cidr,
      description: input.description?.trim() || undefined,
    });

    revalidatePath(`/ec2/security-groups/${input.groupId}`);
    deleteSecurityLogger.info({
      msg: "Inbound rule added",
      groupId: input.groupId,
      protocol,
      cidr,
      fromPort,
      toPort,
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    deleteSecurityLogger.error({
      msg: "Failed to add inbound rule",
      error: message,
      groupId: input.groupId,
    });
    return { ok: false, error: message };
  }
}

export interface RemoveRuleInput {
  protocol: string;
  fromPort?: number;
  toPort?: number;
  source: string; // CIDR or Group ID
  description?: string;
}

export async function removeInboundRulesAction(
  groupId: string,
  rules: RemoveRuleInput[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!groupId) return { ok: false, error: "Group ID is missing" };

    for (const rule of rules) {
      const source = rule.source.startsWith("sg-")
        ? { groupId: rule.source }
        : rule.source;

      const fromPort = rule.fromPort ?? -1; // Default to -1 (all) if undefined, though logic should ensure values
      const toPort = rule.toPort ?? -1;

              await removeInboundRule({
                groupId,
                protocol: rule.protocol,
                fromPort,
                toPort,
                source,
              });
      deleteSecurityLogger.info({
        msg: "Inbound rule removed",

        groupId,

        protocol: rule.protocol,

        fromPort,

        toPort,

        source: rule.source,

        description: rule.description,
      });
    }

    revalidatePath(`/ec2/security-groups/${groupId}`);
    return { ok: true };
    // biome-ignore lint/suspicious/noExplicitAny: <>
  } catch (error: any) {
    deleteSecurityLogger.error({
      msg: "Failed to remove inbound rules",
      error,
      groupId,
    });
    return { ok: false, error: error.message };
  }
}

export async function removeOutboundRulesAction(
  groupId: string,
  rules: RemoveRuleInput[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!groupId) return { ok: false, error: "Group ID is missing" };

    for (const rule of rules) {
      const destination = rule.source.startsWith("sg-")
        ? { groupId: rule.source }
        : rule.source;

      const fromPort = rule.fromPort ?? -1;
      const toPort = rule.toPort ?? -1;

      await removeOutboundRule({
        groupId,
        protocol: rule.protocol,
        fromPort,
        toPort,
        destination,
      });

      deleteSecurityLogger.info({
        msg: "Outbound rule removed",

        groupId,

        protocol: rule.protocol,

        fromPort,

        toPort,

        destination: rule.source,

        description: rule.description,
      });
    }

    revalidatePath(`/ec2/security-groups/${groupId}`);
    return { ok: true };
    // biome-ignore lint/suspicious/noExplicitAny: <>
  } catch (error: any) {
    deleteSecurityLogger.error({
      msg: "Failed to remove outbound rules",
      error,
      groupId,
    });
    return { ok: false, error: error.message };
  }
}

function normalizeProtocol(
  protocol: AddInboundRuleActionInput["protocol"],
): string {
  if (protocol === "all") {
    return "-1";
  }
  return protocol;
}

type PortResolutionResult =
  | { ok: true; fromPort: number; toPort: number }
  | { ok: false; error: string };

function resolvePortRange(
  input: AddInboundRuleActionInput,
): PortResolutionResult {
  if (input.protocol === "all") {
    return { ok: true, fromPort: 0, toPort: 0 };
  }

  const fromResult = parsePort(input.fromPort);
  if (!fromResult.ok) {
    return fromResult;
  }

  const toResult = parsePort(input.toPort);
  if (!toResult.ok) {
    return toResult;
  }

  if (fromResult.value > toResult.value) {
    return { ok: false, error: "開始ポートは終了ポート以下で指定してください" };
  }

  return { ok: true, fromPort: fromResult.value, toPort: toResult.value };
}

function parsePort(
  value?: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined || Number.isNaN(value)) {
    return { ok: false, error: "ポート番号を入力してください" };
  }

  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    return { ok: false, error: "ポート番号は0〜65535の整数で指定してください" };
  }

  return { ok: true, value };
}

function validateCidr(cidr: string, version: "ipv4" | "ipv6"): string | null {
  if (version === "ipv4") {
    const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    if (!ipv4Pattern.test(cidr)) {
      return "IPv4 CIDRの形式で入力してください (例: 203.0.113.0/24)";
    }
    const [address, prefixStr] = cidr.split("/");
    const octets = address.split(".");
    if (octets.some((octet) => Number(octet) > 255) || Number(prefixStr) > 32) {
      return "IPv4 CIDRが不正です";
    }
    return null;
  }

  const ipv6Pattern = /^[0-9a-fA-F:]+\/\d{1,3}$/;
  if (!ipv6Pattern.test(cidr)) {
    return "IPv6 CIDRの形式で入力してください (例: 2001:db8::/64)";
  }
  const prefix = Number(cidr.split("/")[1]);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 128) {
    return "IPv6のプレフィックス長が不正です";
  }
  return null;
}
