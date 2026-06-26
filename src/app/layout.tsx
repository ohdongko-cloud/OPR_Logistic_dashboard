import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "OPR 물류 실적 대시보드",
  description:
    "OPR 물류 실적 보고 — 시즌·아이템 엔진 드릴다운 + 매장/상품 SCM (내부 도구)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-zinc-50 text-zinc-900">{children}</body>
    </html>
  );
}
