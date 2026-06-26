import { redirect } from "next/navigation";

import { LANDING_PATH } from "@/lib/nav";

/** 루트 → 랜딩(① 물류 핵심지표, 설계 §1). */
export default function Home() {
  redirect(LANDING_PATH);
}
