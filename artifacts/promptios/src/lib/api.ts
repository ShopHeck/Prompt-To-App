const BASE = "/api";

function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)pta_csrf=([^;]*)/);
  return match?.[1];
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    ...(opts.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...opts,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? "Request failed", body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  plan: string;
}

export interface QuotaInfo {
  plan: string;
  used: number;
  limit: number;
  allowed: boolean;
}

export interface AuthResponse {
  user: User;
  quota?: QuotaInfo;
}

export function getMe() {
  return request<AuthResponse>("/auth/me");
}

export function register(data: { email: string; password: string; displayName?: string }) {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function login(data: { email: string; password: string }) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function logout() {
  return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

export function changePassword(data: { currentPassword: string; newPassword: string }) {
  return request<{ ok: boolean }>("/auth/password", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Billing ─────────────────────────────────────────────────────────────────

export interface PlanInfo {
  name: string;
  price: string;
  features: string[];
}

export function getPlans() {
  return request<{ plans: Record<string, PlanInfo> }>("/billing/plans");
}

export function getSubscription() {
  return request<{ plan: string; status: string; currentPeriodEnd: string | null }>("/billing/subscription");
}

export function createCheckout(plan: string) {
  return request<{ url: string }>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

export function createPortalSession() {
  return request<{ url: string }>("/billing/portal", { method: "POST" });
}

// ── Providers & Templates ───────────────────────────────────────────────────

export interface ProviderInfo {
  id: string;
  name: string;
  available: boolean;
  models: Record<string, string>;
}

export function getProviders() {
  return request<{ providers: ProviderInfo[] }>("/providers");
}

export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  prompt: string;
  icon: string;
}

export function getTemplates() {
  return request<{ templates: PromptTemplate[] }>("/templates");
}

// ── Refinement ──────────────────────────────────────────────────────────────

export interface RefinementMessage {
  id: number;
  projectId: number;
  role: string;
  content: string;
  createdAt: string;
}

export function getRefinements(projectId: number) {
  return request<RefinementMessage[]>(`/projects/${projectId}/refinements`);
}

export function refine(projectId: number, instruction: string) {
  return request<unknown>(`/projects/${projectId}/refine`, {
    method: "POST",
    body: JSON.stringify({ instruction }),
  });
}

export interface RefineSuggestion {
  id: string;
  label: string;
  instruction: string;
  impact: "high" | "medium" | "low";
  source: "quality" | "accuracy" | "preset";
}

export function getRefineSuggestions(projectId: number) {
  return request<{ suggestions: RefineSuggestion[] }>(`/projects/${projectId}/refine-suggestions`);
}
