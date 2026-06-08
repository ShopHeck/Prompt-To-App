import type { Provider } from "./ai-client";
import type { ArchitecturePlan, AccuracyReport } from "./types";
import type { QualityReport } from "./quality-scorer";

/** Callback used by the service to emit SSE events to the client. */
export type SendEvent = (data: object) => void;

/** Minimal logger interface matching pino's method signature used in route handlers. */
export interface ReqLogger {
  error: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
}

/** Parameters for the planning phase. */
export interface PlanningParams {
  projectId: number;
  promptForPlanning: string;
  projectName: string;
  frameworkName: string;
  additionalContext: string | null;
  provider: Provider;
  stylePresetId: string | null;
}

/** Parameters for code generation (approve-plan phase). */
export interface CodeGenerationParams {
  projectId: number;
  approvedPlan: ArchitecturePlan;
  additionalContext: string | null;
  provider: Provider;
  userId?: number | null;
}

/** Parameters for answering clarifications. */
export interface ClarificationParams {
  projectId: number;
  answers: Array<{ id: string; question: string; answer: string }>;
  additionalContext: string | null;
  skip: boolean;
  provider: Provider;
}

/** Result of the code generation phase. */
export interface CodeGenerationResult {
  fileCount: number;
  description: string | null;
  accuracyReport: AccuracyReport;
  repairHistory: Array<{ at: string; targets: string[]; before: AccuracyReport; after: AccuracyReport }>;
  previewAvailable: boolean;
  qualityReport: QualityReport | null;
}
