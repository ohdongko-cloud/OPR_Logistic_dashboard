import { effectiveLevel, type AuthzUser } from "@/lib/authz";
import { UploadForm } from "@/components/upload/upload-form";

/**
 * 데이터 업로드 — SAP RAW .xlsx 업로드 · 검증 · 새 CURRENT 스냅샷 적재(주1회 운영).
 *
 * 인가: input 탭 MANAGE(업로드 권한)만 폼을 본다. 그 외(VIEWER/INPUT 미만)는 안내만.
 *   ※ UI 게이트는 표시일 뿐 — 실제 강제는 POST /api/upload 의 서버 가드(input MANAGE).
 */
export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const level = await safeUploadLevel();
  const canUpload = level === "MANAGE";

  return (
    <div className="flex-1 overflow-auto p-6">
      <header className="mb-5">
        <h1 className="text-[18px] font-semibold text-zinc-800">데이터 업로드</h1>
        <p className="mt-1 text-[12px] text-zinc-500">
          SAP RAW 엑셀(아이템 당월/누적 · 매장 당월)을 올리면 검증 후 새 CURRENT 스냅샷으로
          적재되고, 대시보드(물류 핵심지표 · 매장 SCM · 상품 SCM)가 자동 갱신됩니다.
        </p>
      </header>

      {canUpload ? (
        <UploadForm />
      ) : (
        <div className="max-w-[640px] rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-[14px] font-semibold text-amber-800">업로드 권한이 없습니다</h2>
          <p className="mt-1 text-[12px] text-amber-700">
            데이터 업로드는 <span className="font-medium">입력(MANAGE)</span> 권한을 가진 물류
            담당자만 수행할 수 있습니다. 권한이 필요하면 관리자에게 요청하세요.
          </p>
        </div>
      )}
    </div>
  );
}

/** 업로드(input) 유효레벨 — provider/DB 미구성·에러 시 null(차단)로 안전 폴백. */
async function safeUploadLevel(): Promise<string | null> {
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    const user = session?.user as AuthzUser | undefined;
    if (!user) return null;
    return await effectiveLevel(user, "input");
  } catch {
    return null;
  }
}
