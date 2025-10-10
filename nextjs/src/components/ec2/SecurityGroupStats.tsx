"use client";

import { css } from "@/styled-system/css";

interface Props {
  statistics: {
    totalGroups: number;
    totalInboundRules: number;
    totalOutboundRules: number;
  };
}

export function SecurityGroupStats({ statistics }: Props) {
  return (
    <div className={statsContainerStyle}>
      <div className={statCardStyle}>
        <span className={statLabelStyle}>📦 Total Groups</span>
        <span className={statValueStyle}>{statistics.totalGroups}</span>
      </div>
      <div className={statCardStyle}>
        <span className={statLabelStyle}>📥 Inbound Rules</span>
        <span className={statValueStyle}>{statistics.totalInboundRules}</span>
      </div>
      <div className={statCardStyle}>
        <span className={statLabelStyle}>📤 Outbound Rules</span>
        <span className={statValueStyle}>{statistics.totalOutboundRules}</span>
      </div>
    </div>
  );
}

// Styles
const statsContainerStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "1rem",
  marginBottom: "2rem",
});

const statCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "1rem",
  backgroundColor: "surface",
  borderRadius: "0.5rem",
  border: "1px solid",
  borderColor: "border",
});

const statLabelStyle = css({
  fontSize: "0.875rem",
  color: "text.secondary",
  fontWeight: "500",
});

const statValueStyle = css({
  fontSize: "1.5rem",
  fontWeight: "bold",
  color: "primary.400",
});
