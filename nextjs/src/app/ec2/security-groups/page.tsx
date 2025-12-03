"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";

import { SecurityGroupStats } from "@/components/ec2/SecurityGroupStats";
import { Button } from "@/components/ui/Button";
import { countFlattenedRules } from "@/lib/ec2/rules";
import type {
  SecurityGroupWarning,
  SecurityGroupWithWarnings,
} from "@/lib/ec2/security-group-warnings";
import {
  securityGroupsCheckboxLabelRecipe,
  securityGroupsCheckboxRecipe,
  securityGroupsContainerRecipe,
  securityGroupsErrorContainerRecipe,
  securityGroupsFilterGroupRecipe,
  securityGroupsFiltersRecipe,
  securityGroupsHeaderRecipe,
  securityGroupsHeaderTitleGroupRecipe,
  securityGroupsUserIpRecipe,
  securityGroupsInputRecipe,
  securityGroupsLabelRecipe,
  securityGroupsLoadingContainerRecipe,
  securityGroupsNoResultsRecipe,
  securityGroupsSelectRecipe,
  securityGroupsSpinnerRecipe,
  securityGroupsTableCellRecipe,
  securityGroupsTableContainerRecipe,
  securityGroupsTableCountsRecipe,
  securityGroupsTableDescriptionRecipe,
  securityGroupsTableHeaderCellRecipe,
  securityGroupsTableHeaderRowRecipe,
  securityGroupsTableHeaderSortButtonRecipe,
  securityGroupsTableHeaderSortIconRecipe,
  securityGroupsTableNameCellRecipe,
  securityGroupsTableNameMetaRecipe,
  securityGroupsTableNameTitleRecipe,
  securityGroupsTableRecipe,
  securityGroupsTableRowRecipe,
  securityGroupsTitleRecipe,
  securityGroupsWarningChipRecipe,
  securityGroupsWarningListRecipe,
} from "@/styles/recipes/pages/ec2-security-groups.recipe";
import { registerToTmpAction } from "./actions";

interface SecurityGroupsData {
  securityGroups: SecurityGroupWithWarnings[];
  statistics: {
    totalGroups: number;
    totalInboundRules: number;
    totalOutboundRules: number;
  };
}

const columnHelper = createColumnHelper<SecurityGroupWithWarnings>();

function getSortIndicator(direction: false | "asc" | "desc") {
  if (direction === "asc") {
    return "▲";
  }
  if (direction === "desc") {
    return "▼";
  }
  return "⇅";
}

export default function SecurityGroupsPage() {
  const searchInputId = useId();
  const vpcSelectId = useId();
  const router = useRouter();

  const [data, setData] = useState<SecurityGroupsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVpc, setSelectedVpc] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyWarnings, setShowOnlyWarnings] = useState(false);
  const [userIp, setUserIp] = useState<string | null>(null);
  const [isRegistering, startTransition] = useTransition();

  useEffect(() => {
    const fetchUserIp = async () => {
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        const data = await res.json();
        setUserIp(data.ip);
      } catch (err) {
        console.error("Failed to fetch user IP:", err);
      }
    };
    fetchUserIp();
  }, []);

  const fetchSecurityGroups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/ec2/security-groups");
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error ?? "Failed to fetch security groups");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch security groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecurityGroups();
  }, [fetchSecurityGroups]);

  const handleRegisterTmp = () => {
    if (!userIp) return;
    startTransition(async () => {
      const result = await registerToTmpAction(userIp);
      alert(result.message);
      if (result.success) {
        fetchSecurityGroups();
      }
    });
  };

  const vpcList = useMemo(() => {
    if (!data) {
      return [] as string[];
    }

    const allVpcs = data.securityGroups.map(
      (group) => group.vpcId || "EC2-Classic",
    );
    return Array.from(new Set(allVpcs));
  }, [data]);

  const filteredGroups = useMemo(() => {
    if (!data) {
      return [] as SecurityGroupWithWarnings[];
    }

    const lowerSearch = searchTerm.toLowerCase();
    return data.securityGroups.filter((group) => {
      const vpcMatches =
        selectedVpc === "all" || (group.vpcId || "EC2-Classic") === selectedVpc;
      const tagName = group.tags?.Name?.toLowerCase() ?? "";
      const searchMatches =
        group.groupName.toLowerCase().includes(lowerSearch) ||
        group.groupId.toLowerCase().includes(lowerSearch) ||
        group.description.toLowerCase().includes(lowerSearch) ||
        tagName.includes(lowerSearch);
      const warningsMatch = !showOnlyWarnings || group.warnings.length > 0;

      return vpcMatches && searchMatches && warningsMatch;
    });
  }, [data, searchTerm, selectedVpc, showOnlyWarnings]);

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.tags?.Name?.trim() ?? "", {
        id: "nameTag",
        header: "Name",
        sortingFn: "alphanumeric",
        cell: (info) => {
          const tagName = info.getValue();
          return <span>{tagName.length ? tagName : "—"}</span>;
        },
      }),
      columnHelper.accessor("groupName", {
        header: "Security Group",
        sortingFn: "alphanumeric",
        cell: ({ row, getValue }) => (
          <div className={securityGroupsTableNameCellRecipe()}>
            <span className={securityGroupsTableNameTitleRecipe()}>
              {getValue()}
            </span>
            <span className={securityGroupsTableNameMetaRecipe()}>
              <span>{row.original.groupId}</span>
              <span>{row.original.vpcId || "EC2-Classic"}</span>
            </span>
          </div>
        ),
      }),
      columnHelper.display({
        id: "description",
        header: "Description",
        enableSorting: true,
        sortingFn: (rowA, rowB) =>
          (rowA.original.description ?? "").localeCompare(
            rowB.original.description ?? "",
          ),
        cell: ({ row }) => (
          <p className={securityGroupsTableDescriptionRecipe()}>
            {row.original.description || "—"}
          </p>
        ),
      }),
      columnHelper.display({
        id: "rules",
        header: "Rules",
        enableSorting: true,
        sortingFn: (rowA, rowB) => {
          const aTotal =
            countFlattenedRules(rowA.original.inboundRules) +
            countFlattenedRules(rowA.original.outboundRules);
          const bTotal =
            countFlattenedRules(rowB.original.inboundRules) +
            countFlattenedRules(rowB.original.outboundRules);
          return aTotal - bTotal;
        },
        cell: ({ row }) => (
          <div className={securityGroupsTableCountsRecipe()}>
            <span>
              Inbound: {countFlattenedRules(row.original.inboundRules)}
            </span>
            <span>
              Outbound: {countFlattenedRules(row.original.outboundRules)}
            </span>
          </div>
        ),
      }),
      columnHelper.display({
        id: "warnings",
        header: "Warnings",
        enableSorting: true,
        sortingFn: (rowA, rowB) =>
          rowA.original.warnings.length - rowB.original.warnings.length,
        cell: ({ row }) => renderWarningSummary(row.original.warnings),
      }),
    ],
    [],
  );

  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable<SecurityGroupWithWarnings>({
    data: filteredGroups,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange: setSorting,
  });

  if (loading) {
    return (
      <div className={securityGroupsLoadingContainerRecipe()}>
        <div className={securityGroupsSpinnerRecipe()} />
        <p>Loading security groups...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={securityGroupsErrorContainerRecipe()}>
        <h2>Error</h2>
        <p>{error}</p>
        <Button onClick={fetchSecurityGroups} variant="destructive" size="md">
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className={securityGroupsContainerRecipe()}>
      <header className={securityGroupsHeaderRecipe()}>
        <div className={securityGroupsHeaderTitleGroupRecipe()}>
          <h1 className={securityGroupsTitleRecipe()}>EC2 Security Groups</h1>
          {userIp && (
            <p className={securityGroupsUserIpRecipe()}>Your IP: {userIp}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Button
            onClick={handleRegisterTmp}
            variant="outline"
            size="md"
            disabled={!userIp || isRegistering}
            title={
              !userIp
                ? "IP fetching..."
                : "Add 443/22 from your IP to 'tmp' group"
            }
          >
            {isRegistering ? "Registering..." : "Register to tmp"}
          </Button>
          <Button onClick={fetchSecurityGroups} variant="solid" size="md">
            🔄 Refresh
          </Button>
        </div>
      </header>

      <SecurityGroupStats statistics={data.statistics} />

      <div className={securityGroupsFiltersRecipe()}>
        <div className={securityGroupsFilterGroupRecipe()}>
          <label
            htmlFor={searchInputId}
            className={securityGroupsLabelRecipe()}
          >
            Search:
          </label>
          <input
            id={searchInputId}
            type="text"
            placeholder="Search by name, ID, or description..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className={securityGroupsInputRecipe()}
          />
        </div>

        <div className={securityGroupsFilterGroupRecipe()}>
          <label htmlFor={vpcSelectId} className={securityGroupsLabelRecipe()}>
            VPC:
          </label>
          <select
            id={vpcSelectId}
            value={selectedVpc}
            onChange={(event) => setSelectedVpc(event.target.value)}
            className={securityGroupsSelectRecipe()}
          >
            <option value="all">All VPCs</option>
            {vpcList.map((vpc) => (
              <option key={vpc} value={vpc}>
                {vpc}
              </option>
            ))}
          </select>
        </div>

        <div className={securityGroupsFilterGroupRecipe()}>
          <label className={securityGroupsCheckboxLabelRecipe()}>
            <input
              type="checkbox"
              checked={showOnlyWarnings}
              onChange={(event) => setShowOnlyWarnings(event.target.checked)}
              className={securityGroupsCheckboxRecipe()}
            />
            Show only groups with warnings
          </label>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <p className={securityGroupsNoResultsRecipe()}>
          No security groups found matching your criteria.
        </p>
      ) : (
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
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  className={securityGroupsTableRowRecipe({ clickable: true })}
                  onClick={() =>
                    router.push(`/ec2/security-groups/${row.original.groupId}`)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(
                        `/ec2/security-groups/${row.original.groupId}`,
                      );
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={securityGroupsTableCellRecipe()}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function renderWarningSummary(warnings: SecurityGroupWarning[]) {
  if (warnings.length === 0) {
    return <span>—</span>;
  }

  const criticalCount = warnings.filter(
    (warning) => warning.level === "critical",
  ).length;
  const warningCount = warnings.filter(
    (warning) => warning.level === "warning",
  ).length;

  return (
    <div className={securityGroupsWarningListRecipe()}>
      {criticalCount > 0 && (
        <span
          className={securityGroupsWarningChipRecipe({ level: "critical" })}
        >
          ⚠️ {criticalCount} Critical
        </span>
      )}
      {warningCount > 0 && (
        <span className={securityGroupsWarningChipRecipe({ level: "warning" })}>
          ⚠️ {warningCount} Warning
        </span>
      )}
    </div>
  );
}
