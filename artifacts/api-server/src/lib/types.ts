export interface SpmDependency {
  url: string;
  packageName: string;
  productNames: string[];
  version: string;
}

export interface ArchitecturePlan {
  screens: Array<{ name: string; purpose: string }>;
  models: Array<{ name: string; fields: string[] }>;
  navigation: string;
  spmDependencies: SpmDependency[];
  fileList: Array<{ filename: string; purpose: string }>;
  componentPatterns?: string[];
}

export type GeneratedFile = {
  filename: string;
  filepath: string;
  content: string;
  language: string;
};

export type ItemStatus = "matched" | "missing" | "off-spec" | "extra";

export interface AccuracyItem {
  type: "screen" | "model" | "file";
  name: string;
  status: ItemStatus;
  confidence: number;
  notes?: string;
}

export interface AccuracyReport {
  overallScore: number;
  summary: string;
  items: AccuracyItem[];
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  suggestion?: string;
}
