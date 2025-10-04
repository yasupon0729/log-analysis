import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layouts/Sidebar";
import { css } from "@/styled-system/css";

export const metadata: Metadata = {
  title: "Log Analysis Dashboard",
  description: "S3 Log Analysis Dashboard with Dark Theme",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <div
          className={css({
            display: "flex",
            height: "100vh",
            bg: "background",
          })}
        >
          <Sidebar />
          <main
            className={css({
              flex: 1,
              marginLeft: "80px",
              transition: "margin-left 0.3s ease-in-out",
              overflowY: "auto",
            })}
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
