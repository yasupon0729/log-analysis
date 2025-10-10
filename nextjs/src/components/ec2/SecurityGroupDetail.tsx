"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  type Table,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { Button } from "@/components/ui/Button";
import type {
  SecurityGroupWarning,
  SecurityGroupWithWarnings,
} from "@/lib/ec2/security-group-warnings";
import type { SecurityGroupRule } from "@/lib/ec2/security-groups";
import {
  securityGroupDetailBackLinkRecipe,
  securityGroupDetailContainerRecipe,
  securityGroupDetailDescriptionRecipe,
  securityGroupDetailHeaderRecipe,
  securityGroupDetailInfoCardRecipe,
  securityGroupDetailInfoGridRecipe,
  securityGroupDetailInfoLabelRecipe,
  securityGroupDetailInfoValueRecipe,
  securityGroupDetailMetaItemRecipe,
  securityGroupDetailMetaListRecipe,
  securityGroupDetailSectionHeaderRecipe,
  securityGroupDetailSectionRecipe,
  securityGroupDetailSectionSubtitleRecipe,
  securityGroupDetailSectionTitleRecipe,
  securityGroupDetailSubtitleRecipe,
  securityGroupDetailTagChipRecipe,
  securityGroupDetailTagListRecipe,
  securityGroupDetailTitleRecipe,
} from "@/styles/recipes/pages/ec2-security-group-detail.recipe";
import {
  securityGroupsNoResultsRecipe,
  securityGroupsTableCellRecipe,
  securityGroupsTableContainerRecipe,
  securityGroupsTableDescriptionRecipe,
  securityGroupsTableHeaderCellRecipe,
  securityGroupsTableHeaderRowRecipe,
  securityGroupsTableRecipe,
  securityGroupsTableRowRecipe,
  securityGroupsWarningChipRecipe,
  securityGroupsWarningListRecipe,
} from "@/styles/recipes/pages/ec2-security-groups.recipe";

interface Props {
  group: SecurityGroupWithWarnings;
}

const ruleColumnHelper = createColumnHelper<SecurityGroupRule>();

export function SecurityGroupDetail({ group }: Props) {
  const router = useRouter();

  const inboundColumns = useMemo(() => createRuleColumns("Source"), []);

  const outboundColumns = useMemo(() => createRuleColumns("Destination"), []);

  const inboundTable = useReactTable<SecurityGroupRule>({
    data: group.inboundRules,
    columns: inboundColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const outboundTable = useReactTable<SecurityGroupRule>({
    data: group.outboundRules,
    columns: outboundColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const criticalCount = group.warnings.filter(
    (warning) => warning.level === "critical",
  ).length;
  const warningCount = group.warnings.filter(
    (warning) => warning.level === "warning",
  ).length;

  return (
    <div className={securityGroupDetailContainerRecipe()}>
      <div className={securityGroupDetailHeaderRecipe()}>
        <div className={securityGroupDetailBackLinkRecipe()}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/ec2/security-groups")}
          >
            ← Back to list
          </Button>
        </div>

        <div>
          <h1 className={securityGroupDetailTitleRecipe()}>
            {group.groupName}
          </h1>
          <p className={securityGroupDetailSubtitleRecipe()}>{group.groupId}</p>
        </div>

        <div className={securityGroupDetailMetaListRecipe()}>
          <span className={securityGroupDetailMetaItemRecipe()}>
            VPC: {group.vpcId || "EC2-Classic"}
          </span>
          <span className={securityGroupDetailMetaItemRecipe()}>
            Inbound {group.inboundRules.length}
          </span>
          <span className={securityGroupDetailMetaItemRecipe()}>
            Outbound {group.outboundRules.length}
          </span>
        </div>
      </div>

      <p className={securityGroupDetailDescriptionRecipe()}>
        {group.description || "No description provided."}
      </p>

      {group.tags && Object.keys(group.tags).length > 0 && (
        <div>
          <h2 className={securityGroupDetailSectionTitleRecipe()}>Tags</h2>
          <div className={securityGroupDetailTagListRecipe()}>
            {Object.entries(group.tags).map(([key, value]) => (
              <span key={key} className={securityGroupDetailTagChipRecipe()}>
                {key}: {value}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={securityGroupDetailInfoGridRecipe()}>
        <div className={securityGroupDetailInfoCardRecipe()}>
          <span className={securityGroupDetailInfoLabelRecipe()}>
            Inbound rules
          </span>
          <span className={securityGroupDetailInfoValueRecipe()}>
            {group.inboundRules.length}
          </span>
        </div>
        <div className={securityGroupDetailInfoCardRecipe()}>
          <span className={securityGroupDetailInfoLabelRecipe()}>
            Outbound rules
          </span>
          <span className={securityGroupDetailInfoValueRecipe()}>
            {group.outboundRules.length}
          </span>
        </div>
        <div className={securityGroupDetailInfoCardRecipe()}>
          <span className={securityGroupDetailInfoLabelRecipe()}>
            Critical warnings
          </span>
          <span className={securityGroupDetailInfoValueRecipe()}>
            {criticalCount}
          </span>
        </div>
        <div className={securityGroupDetailInfoCardRecipe()}>
          <span className={securityGroupDetailInfoLabelRecipe()}>
            Warning notifications
          </span>
          <span className={securityGroupDetailInfoValueRecipe()}>
            {warningCount}
          </span>
        </div>
      </div>

      <WarningsSection warnings={group.warnings} />

      <section className={securityGroupDetailSectionRecipe()}>
        <div className={securityGroupDetailSectionHeaderRecipe()}>
          <h2 className={securityGroupDetailSectionTitleRecipe()}>
            📥 Inbound Rules
          </h2>
          <p className={securityGroupDetailSectionSubtitleRecipe()}>
            All ingress permissions that allow incoming traffic to this security
            group.
          </p>
        </div>
        {renderRulesTable(inboundTable, "No inbound rules")}
      </section>

      <section className={securityGroupDetailSectionRecipe()}>
        <div className={securityGroupDetailSectionHeaderRecipe()}>
          <h2 className={securityGroupDetailSectionTitleRecipe()}>
            📤 Outbound Rules
          </h2>
          <p className={securityGroupDetailSectionSubtitleRecipe()}>
            Egress permissions controlling the outbound traffic leaving this
            security group.
          </p>
        </div>
        {renderRulesTable(outboundTable, "No outbound rules")}
      </section>
    </div>
  );
}

function WarningsSection({ warnings }: { warnings: SecurityGroupWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  const criticalCount = warnings.filter(
    (warning) => warning.level === "critical",
  ).length;
  const warningCount = warnings.filter(
    (warning) => warning.level === "warning",
  ).length;

  return (
    <section className={securityGroupDetailSectionRecipe()}>
      <div className={securityGroupDetailSectionHeaderRecipe()}>
        <h2 className={securityGroupDetailSectionTitleRecipe()}>
          ⚠️ Security Warnings
        </h2>
        <p className={securityGroupDetailSectionSubtitleRecipe()}>
          Review public exposure and overly permissive rules detected for this
          group.
        </p>
      </div>
      <div className={securityGroupsWarningListRecipe()}>
        {criticalCount > 0 && (
          <span
            className={securityGroupsWarningChipRecipe({ level: "critical" })}
          >
            ⚠️ {criticalCount} Critical
          </span>
        )}
        {warningCount > 0 && (
          <span
            className={securityGroupsWarningChipRecipe({ level: "warning" })}
          >
            ⚠️ {warningCount} Warning
          </span>
        )}
      </div>
    </section>
  );
}

function renderRulesTable(
  table: Table<SecurityGroupRule>,
  emptyMessage: string,
) {
  const rows = table.getRowModel().rows;

  if (rows.length === 0) {
    return <p className={securityGroupsNoResultsRecipe()}>{emptyMessage}</p>;
  }

  return (
    <div className={securityGroupsTableContainerRecipe()}>
      <table className={securityGroupsTableRecipe()}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              className={securityGroupsTableHeaderRowRecipe()}
            >
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={securityGroupsTableHeaderCellRecipe()}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={securityGroupsTableRowRecipe({ clickable: false })}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={securityGroupsTableCellRecipe()}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function createRuleColumns(targetLabel: string) {
  return [
    ruleColumnHelper.accessor("protocol", {
      header: "Protocol",
      cell: (info) => formatProtocol(info.getValue()),
    }),
    ruleColumnHelper.display({
      id: "portRange",
      header: "Port Range",
      cell: ({ row }) =>
        formatPortRange(row.original.fromPort, row.original.toPort),
    }),
    ruleColumnHelper.display({
      id: "target",
      header: targetLabel,
      cell: ({ row }) => (
        <span className={securityGroupsTableDescriptionRecipe()}>
          {formatRuleTargets(row.original)}
        </span>
      ),
    }),
    ruleColumnHelper.accessor("description", {
      header: "Description",
      cell: (info) => info.getValue() || "—",
    }),
  ];
}

function formatProtocol(protocol: string) {
  if (!protocol || protocol === "-1") {
    return "All";
  }

  return protocol.toUpperCase();
}

function formatPortRange(fromPort?: number, toPort?: number) {
  if (fromPort === undefined && toPort === undefined) {
    return "All";
  }

  if (fromPort !== undefined && toPort !== undefined && fromPort === toPort) {
    return String(fromPort);
  }

  if (fromPort !== undefined && toPort !== undefined) {
    return `${fromPort} - ${toPort}`;
  }

  if (fromPort !== undefined) {
    return `${fromPort}+`;
  }

  if (toPort !== undefined) {
    return `≤ ${toPort}`;
  }

  return "—";
}

function formatRuleTargets(rule: SecurityGroupRule) {
  const cidrTargets = [
    ...(rule.ipRanges ?? []),
    ...(rule.ipv6Ranges ?? []),
  ].filter((target) => target && target.length > 0);

  const securityGroupTargets = rule.securityGroups?.filter(
    (id) => id.length > 0,
  );

  const targets = [...cidrTargets, ...(securityGroupTargets ?? [])];

  if (targets.length === 0) {
    return "—";
  }

  return targets.join(", ");
}
