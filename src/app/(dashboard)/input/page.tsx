import { LogiCostForm } from "@/components/input/logi-cost-form";

/**
 * 입력면(/input) — 물류본부장 수기 입력 허브.
 *
 * 현재 구성:
 *   ① 물류비예측 월입력 폼(7대 비용총액) — LogiCostForm.
 *   ※ 목표·전년·비고·조치(노드별)는 엔진 뷰(/engine) 내 ‘목표·비고 입력’ 패널에서.
 *
 * 인가: 페이지는 미들웨어 인증 게이트(세션). 저장 API(POST /api/annotations)가
 *   input INPUT 권한을 서버단에서 강제(VIEWER 는 403). 권한 없으면 폼은 보이되 저장 차단.
 */
export default function InputPage() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <header className="mb-5">
        <h1 className="text-[18px] font-semibold text-zinc-800">입력면 — 물류본부장</h1>
        <p className="mt-1 text-[12px] text-zinc-500">
          목표·전년·비고·조치는 <span className="font-medium text-zinc-700">물류 핵심지표</span> 화면의
          ‘목표·비고 입력’ 패널에서 노드별로 입력합니다. 이 페이지는 물류비예측 월입력입니다.
        </p>
      </header>
      <LogiCostForm />
    </div>
  );
}
