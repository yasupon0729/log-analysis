"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { SecurityGroupCard } from "@/components/ec2/SecurityGroupCard";
import { SecurityGroupStats } from "@/components/ec2/SecurityGroupStats";
import { Button } from "@/components/ui/Button";
import type { SecurityGroupInfo } from "@/lib/ec2/security-groups";
import {
  securityGroupsCardsContainerRecipe,
  securityGroupsCheckboxLabelRecipe,
  securityGroupsCheckboxRecipe,
  securityGroupsContainerRecipe,
  securityGroupsErrorContainerRecipe,
  securityGroupsFilterGroupRecipe,
  securityGroupsFiltersRecipe,
  securityGroupsHeaderRecipe,
  securityGroupsInputRecipe,
  securityGroupsLabelRecipe,
  securityGroupsLoadingContainerRecipe,
  securityGroupsNoResultsRecipe,
  securityGroupsSelectRecipe,
  securityGroupsSpinnerRecipe,
  securityGroupsTitleRecipe,
} from "@/styles/recipes/pages/ec2-security-groups.recipe";

interface SecurityGroupWithWarnings extends SecurityGroupInfo {
  warnings: Array<{
    level: "critical" | "warning";
    message: string;
    // biome-ignore lint/suspicious/noExplicitAny: EC2 rule type is complex and varies by protocol
    rule: any;
  }>;
}

interface SecurityGroupsData {
  securityGroups: SecurityGroupWithWarnings[];
  statistics: {
    totalGroups: number;
    totalInboundRules: number;
    totalOutboundRules: number;
  };
}

export default function SecurityGroupsPage() {
  const searchInputId = useId();
  const vpcSelectId = useId();
  const [data, setData] = useState<SecurityGroupsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVpc, setSelectedVpc] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyWarnings, setShowOnlyWarnings] = useState(false);

  const fetchSecurityGroups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/ec2/security-groups");
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to fetch security groups");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecurityGroups();
  }, [fetchSecurityGroups]);

  // VPCの一覧を取得
  const vpcList = data
    ? [...new Set(data.securityGroups.map((sg) => sg.vpcId || "EC2-Classic"))]
    : [];

  // フィルタリング
  const filteredGroups =
    data?.securityGroups.filter((sg) => {
      const matchesVpc =
        selectedVpc === "all" || (sg.vpcId || "EC2-Classic") === selectedVpc;
      const matchesSearch =
        sg.groupName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sg.groupId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesWarnings = !showOnlyWarnings || sg.warnings.length > 0;
      return matchesVpc && matchesSearch && matchesWarnings;
    }) || [];

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

  return (
    <div className={securityGroupsContainerRecipe()}>
      <header className={securityGroupsHeaderRecipe()}>
        <h1 className={securityGroupsTitleRecipe()}>EC2 Security Groups</h1>
        <Button onClick={fetchSecurityGroups} variant="solid" size="md">
          🔄 Refresh
        </Button>
      </header>

      {data && <SecurityGroupStats statistics={data.statistics} />}

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
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
            onChange={(e) => setSelectedVpc(e.target.value)}
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
              onChange={(e) => setShowOnlyWarnings(e.target.checked)}
              className={securityGroupsCheckboxRecipe()}
            />
            Show only groups with warnings
          </label>
        </div>
      </div>

      <div className={securityGroupsCardsContainerRecipe()}>
        {filteredGroups.length === 0 ? (
          <p className={securityGroupsNoResultsRecipe()}>
            No security groups found matching your criteria
          </p>
        ) : (
          filteredGroups.map((sg) => (
            <SecurityGroupCard key={sg.groupId} securityGroup={sg} />
          ))
        )}
      </div>
    </div>
  );
}
