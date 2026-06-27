/**
 * 업로드 양식 템플릿 — 공개 표면.
 *
 * 파서가 실제로 읽는 좌표(시트명·열letter·헤더)를 단일 진실원(template-spec)으로
 * 고정하고, 그대로 .xlsx 를 생성(build-template). API/버튼에서 소비.
 */
export * from "./template-spec";
export * from "./build-template";
