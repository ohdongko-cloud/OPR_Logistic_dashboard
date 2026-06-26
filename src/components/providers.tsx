"use client";

import { SessionProvider } from "next-auth/react";

/**
 * 클라이언트 프로바이더 래퍼 — Auth.js SessionProvider.
 * useSession()·signIn()·signOut() 가 클라 컴포넌트에서 동작하도록 루트에 감싼다.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
