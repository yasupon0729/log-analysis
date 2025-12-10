import { Sidebar } from "@/components/layouts/Sidebar";
import { css } from "../../../styled-system/css";
import SystemLogsClient from "./page-client";

export const metadata = {
  title: "System Logs | Log Analysis Dashboard",
};

export default function SystemLogsPage() {
  return (
    <div className={css({ display: "flex", minHeight: "100vh" })}>
      <Sidebar />
      <main className={css({ flex: 1, bg: "dark.bg" })}>
        <SystemLogsClient />
      </main>
    </div>
  );
}
