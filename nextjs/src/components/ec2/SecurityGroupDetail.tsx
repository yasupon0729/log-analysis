"use client";

import {
  type ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  type Table,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useMemo, useState, useTransition } from "react";

import {
  addInboundRuleAction,
  type RemoveRuleInput,
  removeInboundRulesAction,
  removeOutboundRulesAction,
} from "@/app/ec2/security-groups/[groupId]/actions";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import type {
  SecurityGroupWarning,
  SecurityGroupWithWarnings,
} from "@/lib/ec2/security-group-warnings";
import type { SecurityGroupRule } from "@/lib/ec2/security-groups";
import { css } from "@/styled-system/css";
import {
  securityGroupDetailBackLinkRecipe,
  securityGroupDetailContainerRecipe,
  securityGroupDetailDescriptionRecipe,
  securityGroupDetailFormActionsRecipe,
  securityGroupDetailFormCheckboxLabelRecipe,
  securityGroupDetailFormContainerRecipe,
  securityGroupDetailFormFieldRecipe,
  securityGroupDetailFormGridRecipe,
  securityGroupDetailFormHelperButtonRecipe,
  securityGroupDetailFormHelperRecipe,
  securityGroupDetailFormHelperRowRecipe,
  securityGroupDetailFormInputRecipe,
  securityGroupDetailFormLabelRecipe,
  securityGroupDetailFormSelectRecipe,
  securityGroupDetailHeaderRecipe,
  securityGroupDetailInfoCardRecipe,
  securityGroupDetailInfoGridRecipe,
  securityGroupDetailInfoLabelRecipe,
  securityGroupDetailInfoValueRecipe,
  securityGroupDetailMetaItemRecipe,
  securityGroupDetailMetaListRecipe,
  securityGroupDetailModalActionsRecipe,
  securityGroupDetailModalContentRecipe,
  securityGroupDetailModalDescriptionRecipe,
  securityGroupDetailModalOverlayRecipe,
  securityGroupDetailModalTitleRecipe,
  securityGroupDetailSectionHeaderRecipe,
  securityGroupDetailSectionRecipe,
  securityGroupDetailSectionSubtitleRecipe,
  securityGroupDetailSectionTitleRecipe,
  securityGroupDetailSubtitleRecipe,
  securityGroupDetailTableCheckboxRecipe,
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
  securityGroupsTableHeaderSortButtonRecipe,
  securityGroupsTableHeaderSortIconRecipe,
  securityGroupsTableRecipe,
  securityGroupsTableRowRecipe,
  securityGroupsWarningChipRecipe,
  securityGroupsWarningListRecipe,
} from "@/styles/recipes/pages/ec2-security-groups.recipe";

interface Props {
  group: SecurityGroupWithWarnings;
}

interface RuleTableRow {
  id: string; // unique id for selection
  name: string;
  ipVersion: string;
  type: string;
  protocol: string;
  portRange: string;
  source: string;
  description: string;
  raw: {
    protocol: string;
    fromPort?: number;
    toPort?: number;
    source: string;
  };
}

const ruleColumnHelper = createColumnHelper<RuleTableRow>();

function getSortIndicator(direction: false | "asc" | "desc") {
  if (direction === "asc") {
    return "▲";
  }
  if (direction === "desc") {
    return "▼";
  }
  return "⇅";
}

export function SecurityGroupDetail({ group }: Props) {
  const router = useRouter();
  const isDeletionEnabled =
    group.groupName === "tmp" || group.tags?.Name === "tmp";

  const inboundRows = useMemo(
    () => flattenRules(group.inboundRules),
    [group.inboundRules],
  );

  const outboundRows = useMemo(
    () => flattenRules(group.outboundRules),
    [group.outboundRules],
  );

  const inboundColumns = useMemo(() => {
    const cols: ColumnDef<RuleTableRow>[] = createRuleColumns("Source");
    if (isDeletionEnabled) {
      cols.unshift(createSelectionColumn());
    }
    return cols;
  }, [isDeletionEnabled]);

  const outboundColumns = useMemo(() => {
    const cols: ColumnDef<RuleTableRow>[] = createRuleColumns("Destination");
    if (isDeletionEnabled) {
      cols.unshift(createSelectionColumn());
    }
    return cols;
  }, [isDeletionEnabled]);

  const [protocol, setProtocol] = useState<"tcp" | "udp" | "all">("tcp");
  const [fromPort, setFromPort] = useState("443");
  const [toPort, setToPort] = useState("443");
  const [ipVersion, setIpVersion] = useState<"ipv4" | "ipv6">("ipv4");
  const [cidr, setCidr] = useState("");
  const [append32, setAppend32] = useState(true);
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Selection state
  const [inboundRowSelection, setInboundRowSelection] =
    useState<RowSelectionState>({});
  const [outboundRowSelection, setOutboundRowSelection] =
    useState<RowSelectionState>({});

  // Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    "inbound" | "outbound" | null
  >(null);

  const portInputsDisabled = protocol === "all";
  const idBase = useId();
  const protocolId = `${idBase}-protocol`;
  const fromPortId = `${idBase}-from-port`;
  const toPortId = `${idBase}-to-port`;
  const ipVersionId = `${idBase}-ip-version`;
  const cidrId = `${idBase}-cidr`;
  const descriptionId = `${idBase}-description`;
  const append32Id = `${idBase}-append-32`;
  const append32InfoId = `${idBase}-append-32-info`;

  const [inboundSorting, setInboundSorting] = useState<SortingState>([]);
  const [outboundSorting, setOutboundSorting] = useState<SortingState>([]);

  const inboundTable = useReactTable<RuleTableRow>({
    data: inboundRows,
    columns: inboundColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting: inboundSorting,
      rowSelection: inboundRowSelection,
    },
    enableRowSelection: isDeletionEnabled,
    onSortingChange: setInboundSorting,
    onRowSelectionChange: setInboundRowSelection,
    getRowId: (row) => row.id,
  });

  const outboundTable = useReactTable<RuleTableRow>({
    data: outboundRows,
    columns: outboundColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting: outboundSorting,
      rowSelection: outboundRowSelection,
    },
    enableRowSelection: isDeletionEnabled,
    onSortingChange: setOutboundSorting,
    onRowSelectionChange: setOutboundRowSelection,
    getRowId: (row) => row.id,
  });

  const criticalCount = group.warnings.filter(
    (warning) => warning.level === "critical",
  ).length;
  const warningCount = group.warnings.filter(
    (warning) => warning.level === "warning",
  ).length;

  const cidrPlaceholder = ipVersion === "ipv4" ? "203.0.113.10" : "2001:db8::";

  const handleAddInboundRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const rawEntries = cidr
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (rawEntries.length === 0) {
      setErrorMessage("CIDRを入力してください");
      return;
    }

    let parsedFrom: number | undefined;
    let parsedTo: number | undefined;

    if (portInputsDisabled) {
      parsedFrom = 0;
      parsedTo = 0;
    } else {
      parsedFrom = Number.parseInt(fromPort, 10);
      if (Number.isNaN(parsedFrom)) {
        setErrorMessage("開始ポートを入力してください");
        return;
      }

      parsedTo = Number.parseInt(toPort, 10);
      if (Number.isNaN(parsedTo)) {
        setErrorMessage("終了ポートを入力してください");
        return;
      }

      if (
        !Number.isInteger(parsedFrom) ||
        parsedFrom < 0 ||
        parsedFrom > 65535
      ) {
        setErrorMessage("開始ポートは0〜65535の整数で指定してください");
        return;
      }

      if (!Number.isInteger(parsedTo) || parsedTo < 0 || parsedTo > 65535) {
        setErrorMessage("終了ポートは0〜65535の整数で指定してください");
        return;
      }

      if (parsedFrom > parsedTo) {
        setErrorMessage("開始ポートは終了ポート以下で指定してください");
        return;
      }
    }

    startTransition(async () => {
      let successCount = 0;

      for (const rawEntry of rawEntries) {
        const normalizedEntry =
          ipVersion === "ipv4" && append32 && !rawEntry.includes("/")
            ? `${rawEntry}/32`
            : rawEntry;
        const displayValue =
          normalizedEntry === rawEntry
            ? normalizedEntry
            : `${rawEntry} (${normalizedEntry})`;

        const result = await addInboundRuleAction({
          groupId: group.groupId,
          protocol,
          ipVersion,
          cidr: normalizedEntry,
          fromPort: parsedFrom,
          toPort: parsedTo,
          description,
        });

        if (!result.ok) {
          setErrorMessage(
            result.error
              ? `CIDR "${displayValue}" の追加に失敗しました: ${result.error}`
              : `CIDR "${displayValue}" の追加に失敗しました`,
          );
          return;
        }

        successCount += 1;
      }

      setSuccessMessage(
        successCount > 1
          ? `インバウンドルールを ${successCount} 件追加しました`
          : "インバウンドルールを追加しました",
      );
      setCidr("");
      setDescription("");
      if (!portInputsDisabled) {
        setFromPort("443");
        setToPort("443");
      }
      router.refresh();
    });
  };

  const handleDeleteClick = (type: "inbound" | "outbound") => {
    setDeleteTarget(type);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;

    startTransition(async () => {
      let result: { ok: boolean; error?: string };

      if (deleteTarget === "inbound") {
        const selectedRows = inboundTable.getSelectedRowModel().rows;
        const rulesToRemove: RemoveRuleInput[] = selectedRows.map(
          (row) => row.original.raw,
        );
        result = await removeInboundRulesAction(group.groupId, rulesToRemove);
        setInboundRowSelection({});
      } else {
        const selectedRows = outboundTable.getSelectedRowModel().rows;
        const rulesToRemove: RemoveRuleInput[] = selectedRows.map(
          (row) => row.original.raw,
        );
        result = await removeOutboundRulesAction(group.groupId, rulesToRemove);
        setOutboundRowSelection({});
      }

      setDeleteModalOpen(false);
      setDeleteTarget(null);

      if (!result.ok) {
        setErrorMessage(`削除に失敗しました: ${result.error}`);
      } else {
        setSuccessMessage("ルールを削除しました");
        router.refresh();
      }
    });
  };

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
            Inbound {inboundRows.length}
          </span>
          <span className={securityGroupDetailMetaItemRecipe()}>
            Outbound {outboundRows.length}
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
            {inboundRows.length}
          </span>
        </div>
        <div className={securityGroupDetailInfoCardRecipe()}>
          <span className={securityGroupDetailInfoLabelRecipe()}>
            Outbound rules
          </span>
          <span className={securityGroupDetailInfoValueRecipe()}>
            {outboundRows.length}
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div>
              <h2 className={securityGroupDetailSectionTitleRecipe()}>
                📥 Inbound Rules
              </h2>
              <p className={securityGroupDetailSectionSubtitleRecipe()}>
                All ingress permissions that allow incoming traffic to this
                security group.
              </p>
            </div>
            {isDeletionEnabled &&
              Object.keys(inboundRowSelection).length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteClick("inbound")}
                  disabled={isPending}
                >
                  選択したルールを削除 (
                  {Object.keys(inboundRowSelection).length})
                </Button>
              )}
          </div>
        </div>
        <form
          className={securityGroupDetailFormContainerRecipe()}
          onSubmit={handleAddInboundRule}
        >
          <div className={securityGroupDetailFormGridRecipe()}>
            <div className={securityGroupDetailFormFieldRecipe()}>
              <label
                htmlFor={protocolId}
                className={securityGroupDetailFormLabelRecipe()}
              >
                Protocol
              </label>
              <select
                id={protocolId}
                value={protocol}
                onChange={(event) => {
                  const next = event.target.value as "tcp" | "udp" | "all";
                  setProtocol(next);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  if (next === "all") {
                    setFromPort("0");
                    setToPort("0");
                  } else if (protocol === "all") {
                    setFromPort("443");
                    setToPort("443");
                  }
                }}
                className={securityGroupDetailFormSelectRecipe()}
                disabled={isPending}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className={securityGroupDetailFormFieldRecipe()}>
              <label
                htmlFor={fromPortId}
                className={securityGroupDetailFormLabelRecipe()}
              >
                From Port
              </label>
              <input
                id={fromPortId}
                type="number"
                min={0}
                max={65535}
                value={fromPort}
                onChange={(event) => {
                  setFromPort(event.target.value);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={securityGroupDetailFormInputRecipe()}
                disabled={portInputsDisabled || isPending}
                placeholder="0"
              />
            </div>
            <div className={securityGroupDetailFormFieldRecipe()}>
              <label
                htmlFor={toPortId}
                className={securityGroupDetailFormLabelRecipe()}
              >
                To Port
              </label>
              <input
                id={toPortId}
                type="number"
                min={0}
                max={65535}
                value={toPort}
                onChange={(event) => {
                  setToPort(event.target.value);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={securityGroupDetailFormInputRecipe()}
                disabled={portInputsDisabled || isPending}
                placeholder="65535"
              />
            </div>
            <div className={securityGroupDetailFormFieldRecipe()}>
              <label
                htmlFor={ipVersionId}
                className={securityGroupDetailFormLabelRecipe()}
              >
                IP Version
              </label>
              <select
                id={ipVersionId}
                value={ipVersion}
                onChange={(event) => {
                  const next = event.target.value as "ipv4" | "ipv6";
                  setIpVersion(next);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  if (next === "ipv6") {
                    setAppend32(false);
                  } else if (!append32) {
                    setAppend32(true);
                  }
                }}
                className={securityGroupDetailFormSelectRecipe()}
                disabled={isPending}
              >
                <option value="ipv4">IPv4</option>
                <option value="ipv6">IPv6</option>
              </select>
            </div>
            <div
              className={securityGroupDetailFormFieldRecipe({ span: "full" })}
            >
              <label
                htmlFor={cidrId}
                className={securityGroupDetailFormLabelRecipe()}
              >
                Source CIDR
              </label>
              <input
                id={cidrId}
                type="text"
                value={cidr}
                onChange={(event) => {
                  setCidr(event.target.value);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={securityGroupDetailFormInputRecipe()}
                placeholder={cidrPlaceholder}
                disabled={isPending}
                autoComplete="off"
              />
              <span className={securityGroupDetailFormHelperRecipe()}>
                例: {ipVersion === "ipv4" ? "203.0.113.10" : "2001:db8::/64"}
                （複数はカンマまたは空白区切りで入力）
              </span>
            </div>
            <div
              className={securityGroupDetailFormFieldRecipe({ span: "full" })}
            >
              <label
                className={securityGroupDetailFormLabelRecipe()}
                htmlFor={append32Id}
              >
                IPv4 CIDR options
              </label>
              <div className={securityGroupDetailFormHelperRowRecipe()}>
                <label
                  htmlFor={append32Id}
                  className={securityGroupDetailFormCheckboxLabelRecipe()}
                >
                  <input
                    id={append32Id}
                    type="checkbox"
                    checked={ipVersion === "ipv4" && append32}
                    onChange={(event) => {
                      setAppend32(event.target.checked);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    disabled={ipVersion !== "ipv4" || isPending}
                  />
                  /32 を自動付与する
                </label>
                <button
                  id={append32InfoId}
                  type="button"
                  onClick={() =>
                    alert(
                      "/32 をオンにすると IPv4 アドレスだけを入力した場合に自動で `アドレス/32` の形式へ補完します。CIDR を手動で入力したいときはチェックを外してください。",
                    )
                  }
                  className={securityGroupDetailFormHelperButtonRecipe()}
                  aria-label="/32 自動付与の説明"
                >
                  ?
                </button>
              </div>
            </div>
            <div
              className={securityGroupDetailFormFieldRecipe({ span: "full" })}
            >
              <label
                htmlFor={descriptionId}
                className={securityGroupDetailFormLabelRecipe()}
              >
                Description
              </label>
              <input
                id={descriptionId}
                type="text"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={securityGroupDetailFormInputRecipe()}
                placeholder="例: Allow HTTPS from corporate network"
                disabled={isPending}
                autoComplete="off"
              />
            </div>
          </div>
          {errorMessage ? (
            <AlertBanner
              variant="error"
              description={errorMessage}
              className={css({ marginTop: 4 })}
            />
          ) : null}
          {!errorMessage && successMessage ? (
            <AlertBanner
              variant="success"
              description={successMessage}
              className={css({ marginTop: 4 })}
            />
          ) : null}
          <div className={securityGroupDetailFormActionsRecipe()}>
            <Button
              type="submit"
              disabled={isPending}
              variant="solid"
              size="sm"
            >
              {isPending ? "Adding..." : "Add inbound rule"}
            </Button>
          </div>
        </form>
        {renderRulesTable(inboundTable, "No inbound rules")}
      </section>

      <section className={securityGroupDetailSectionRecipe()}>
        <div className={securityGroupDetailSectionHeaderRecipe()}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div>
              <h2 className={securityGroupDetailSectionTitleRecipe()}>
                📤 Outbound Rules
              </h2>
              <p className={securityGroupDetailSectionSubtitleRecipe()}>
                Egress permissions controlling the outbound traffic leaving this
                security group.
              </p>
            </div>
            {isDeletionEnabled &&
              Object.keys(outboundRowSelection).length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteClick("outbound")}
                  disabled={isPending}
                >
                  選択したルールを削除 (
                  {Object.keys(outboundRowSelection).length})
                </Button>
              )}
          </div>
        </div>
        {renderRulesTable(outboundTable, "No outbound rules")}
      </section>

      {deleteModalOpen && (
        <DeleteConfirmationModal
          count={
            deleteTarget === "inbound"
              ? Object.keys(inboundRowSelection).length
              : Object.keys(outboundRowSelection).length
          }
          isPending={isPending}
          onCancel={() => setDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

function DeleteConfirmationModal({
  count,
  isPending,
  onCancel,
  onConfirm,
}: {
  count: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={securityGroupDetailModalOverlayRecipe()}>
      <div className={securityGroupDetailModalContentRecipe()}>
        <div>
          <h3 className={securityGroupDetailModalTitleRecipe()}>
            ルールの削除確認
          </h3>
          <p className={securityGroupDetailModalDescriptionRecipe()}>
            選択した {count} 件のルールを削除してもよろしいですか？
            <br />
            この操作は取り消せません。
          </p>
        </div>
        <div className={securityGroupDetailModalActionsRecipe()}>
          <Button
            variant="outline"
            size="md"
            onClick={onCancel}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            size="md"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "削除中..." : "削除する"}
          </Button>
        </div>
      </div>
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

function renderRulesTable(table: Table<RuleTableRow>, emptyMessage: string) {
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
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={securityGroupsTableHeaderSortButtonRecipe()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      <span
                        className={securityGroupsTableHeaderSortIconRecipe()}
                        aria-hidden="true"
                      >
                        {getSortIndicator(header.column.getIsSorted())}
                      </span>
                    </button>
                  ) : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )
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

function createSelectionColumn() {
  return ruleColumnHelper.display({
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        className={securityGroupDetailTableCheckboxRecipe()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        className={securityGroupDetailTableCheckboxRecipe()}
      />
    ),
  });
}

function createRuleColumns(targetLabel: string) {
  return [
    ruleColumnHelper.accessor("name", {
      header: "Name",
      sortingFn: "alphanumeric",
    }),
    ruleColumnHelper.accessor("ipVersion", {
      header: "IP Version",
      sortingFn: "alphanumeric",
    }),
    ruleColumnHelper.accessor("type", {
      header: "Type",
      sortingFn: "alphanumeric",
    }),
    ruleColumnHelper.accessor("protocol", {
      header: "Protocol",
      sortingFn: "alphanumeric",
    }),
    ruleColumnHelper.accessor("portRange", {
      header: "Port Range",
      enableSorting: true,
      sortingFn: "alphanumeric",
    }),
    ruleColumnHelper.accessor("source", {
      header: targetLabel,
      sortingFn: "alphanumeric",
      cell: (info) => (
        <span className={securityGroupsTableDescriptionRecipe()}>
          {info.getValue()}
        </span>
      ),
    }),
    ruleColumnHelper.accessor("description", {
      header: "Description",
      cell: (info) => (
        <span className={securityGroupsTableDescriptionRecipe()}>
          {info.getValue() || "—"}
        </span>
      ),
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

function flattenRules(rules: SecurityGroupRule[]): RuleTableRow[] {
  return rules.flatMap((rule) => ruleToRows(rule));
}

function ruleToRows(rule: SecurityGroupRule): RuleTableRow[] {
  const name = formatRuleName(rule);
  const protocol = formatProtocol(rule.protocol);
  const portRange = formatPortRange(rule.fromPort, rule.toPort);
  const description = rule.description?.trim() ?? "—";

  // raw base
  const rawBase = {
    protocol: rule.protocol,
    fromPort: rule.fromPort,
    toPort: rule.toPort,
  };

  const rows: RuleTableRow[] = [];

  if (rule.ipRanges?.length) {
    for (const range of rule.ipRanges) {
      if (!range?.cidr) continue;
      const raw = { ...rawBase, source: range.cidr };
      rows.push({
        id: JSON.stringify(raw), // simple unique id
        name,
        ipVersion: "IPv4",
        type: "IPv4 CIDR",
        protocol,
        portRange,
        source: range.cidr,
        description: range.description?.trim() || description,
        raw,
      });
    }
  }

  if (rule.ipv6Ranges?.length) {
    for (const range of rule.ipv6Ranges) {
      if (!range?.cidr) continue;
      const raw = { ...rawBase, source: range.cidr };
      rows.push({
        id: JSON.stringify(raw),
        name,
        ipVersion: "IPv6",
        type: "IPv6 CIDR",
        protocol,
        portRange,
        source: range.cidr,
        description: range.description?.trim() || description,
        raw,
      });
    }
  }

  if (rule.securityGroups?.length) {
    for (const peer of rule.securityGroups) {
      if (!peer?.groupId) continue;
      const raw = { ...rawBase, source: peer.groupId };
      rows.push({
        id: JSON.stringify(raw),
        name,
        ipVersion: "N/A",
        type: "Security Group",
        protocol,
        portRange,
        source: peer.groupId,
        description: peer.description?.trim() || description,
        raw,
      });
    }
  }

  if (rows.length === 0) {
    // Custom empty rule usually shouldn't happen in flattened view unless needed to show protocol only rules
    // For deletion purpose, we need a source.
    // If it's a rule without source (like just protocol -1), AWS returns 0.0.0.0/0 usually for default.
    // If here, maybe we skip it or handle carefully.
    // Assuming standard rules have sources.
  }

  return rows;
}

function formatRuleName(rule: SecurityGroupRule) {
  const protocolLabel = formatProtocol(rule.protocol);
  const portLabel = formatPortRange(rule.fromPort, rule.toPort);
  return `${protocolLabel} ${portLabel}`.trim();
}
