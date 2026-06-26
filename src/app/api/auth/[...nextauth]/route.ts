/**
 * Auth.js (NextAuth v5) Route Handler — /api/auth/*
 * provider 미구성 상태에서도 라우트 자체는 존재(골격).
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
