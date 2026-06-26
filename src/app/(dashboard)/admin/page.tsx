import { ViewStub } from "@/components/view-stub";

/**
 * 관리자 — 사용자/권한(RBAC) · 업로드/ETL · 입력면 관리.
 * 설계문서 §5(입력/출력 분리·RBAC 시드) · §7 Q6(역할 매핑).
 * ⚠️ 라우트 가드(ADMIN 전용)는 다음 단계에서 세션 역할로 강제.
 */
export default function AdminPage() {
  return (
    <ViewStub
      title="관리자"
      subtitle="사용자·권한(RBAC) · SAP RAW 업로드/ETL · 입력면(비고·목표·물류비·점포마스터) 관리."
      source="설계 §5 / §6 데이터 계약 / §7 Q6"
      planned={[
        "사용자·역할 관리 (VIEWER/USER/ADMIN — 마스터는 env)",
        "SAP RAW 7종 업로드 → 칸반 ETL (참조 피킹앱 업로드 패턴)",
        "입력면: 비고·조치 / 목표·전년 / 물류비 총액 / 점포 마스터",
      ]}
    />
  );
}
