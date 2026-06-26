import { ViewStub } from "@/components/view-stub";

/**
 * 데이터 업로드 — RAW xlsx 업로드·파싱·검증면 (스텁).
 * 업로드 파이프라인(/api/upload·ingest)은 구현되어 있으나, 화면(드롭존·검증 리포트)은 후속.
 */
export default function UploadPage() {
  return (
    <ViewStub
      title="데이터 업로드"
      subtitle="RAW 엑셀(매출·물류재고·점재고·센터입출고 등) 업로드 · 검증 · 스테이징."
      source="/api/upload · src/lib/ingest · 설계 §5(입력면)"
      planned={[
        "드래그앤드롭 업로드존 + 시트셋 자동 감지",
        "검증 리포트(누락·중복·형식 오류) 표시",
        "당월/누적 스냅샷 적재 이력",
      ]}
    />
  );
}
