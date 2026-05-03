import * as React from "react";
import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  FileCode,
  AlertTriangle,
  File,
  Copy,
  CheckCircle2,
  Download,
  Code2,
  FolderTree,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PlanPanel, type ArchitecturePlan } from "@/components/plan-panel";
import { ClarifyAnswersDisplay, type ClarifyAnswer } from "@/components/clarify-panel";
import { AccuracyReportPanel, type AccuracyReport, type RepairHistoryEntry } from "@/components/accuracy-report-panel";

interface ProjectFile {
  id: number;
  projectId: number;
  filename: string;
  filepath: string;
  content: string;
  language: string;
  createdAt: string;
}

interface Project {
  id: number;
  name: string;
  prompt: string;
  description: string | null;
  status: string;
  framework: string;
  fileCount: number;
  shareToken: string | null;
  architecturePlan: string | null;
  clarifyingQuestions: string | null;
  clarifyAnswers: string | null;
  enrichedPrompt: string | null;
  accuracyReport: string | null;
  repairHistory: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SharedProjectData {
  project: Project;
  files: ProjectFile[];
}

function FileList({
  files,
  isLoading,
  selectedId,
  onSelect,
  closeOnSelect = false,
}: {
  files: ProjectFile[];
  isLoading: boolean;
  selectedId: number | undefined;
  onSelect: (id: number) => void;
  closeOnSelect?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-2 border-b border-border/60 px-4 shrink-0">
        <FolderTree className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Files
        </span>
        {!isLoading && files.length > 0 && (
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {files.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading ? (
          <div className="space-y-2 px-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-4/6" />
            <Skeleton className="h-5 w-3/6" />
          </div>
        ) : files.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-muted-foreground">
            No files in this project.
          </div>
        ) : (
          <div className="flex flex-col">
            {files.map((file) => {
              const active = selectedId === file.id;
              const btn = (
                <button
                  onClick={() => onSelect(file.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-left font-mono text-[12.5px] transition-all active:scale-[0.99] ${
                    active
                      ? "bg-secondary/70 text-foreground border-l-2 border-primary"
                      : "border-l-2 border-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
                  }`}
                >
                  <FileCode
                    className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground/50"}`}
                    strokeWidth={1.75}
                  />
                  <span className="truncate">{file.filepath}</span>
                </button>
              );
              return closeOnSelect ? (
                <SheetClose key={file.id} asChild>
                  {btn}
                </SheetClose>
              ) : (
                <div key={file.id} className="contents">
                  {btn}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SharedProject() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token ?? "";
  const { toast } = useToast();
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [planCollapsed, setPlanCollapsed] = useState(true);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);

  const { data, isLoading, error } = useQuery<SharedProjectData>({
    queryKey: ["shared", token],
    queryFn: async () => {
      const res = await fetch(`/api/share/${token}`);
      if (!res.ok) throw new Error("Not found");
      return res.json() as Promise<SharedProjectData>;
    },
    enabled: !!token,
  });

  const project = data?.project;
  const files: ProjectFile[] = data?.files ?? [];
  const selectedFile =
    files.find((f: ProjectFile) => f.id === selectedFileId) ?? files[0];
  const activeId = selectedFileId ?? files[0]?.id;

  const parsedPlan: ArchitecturePlan | null = (() => {
    if (!project?.architecturePlan) return null;
    try {
      return JSON.parse(project.architecturePlan) as ArchitecturePlan;
    } catch {
      return null;
    }
  })();

  const parsedAnswers: ClarifyAnswer[] = (() => {
    if (!project?.clarifyAnswers) return [];
    try {
      const parsed = JSON.parse(project.clarifyAnswers);
      return Array.isArray(parsed) ? (parsed as ClarifyAnswer[]) : [];
    } catch {
      return [];
    }
  })();

  const parsedAccuracy: AccuracyReport | null = (() => {
    if (!project?.accuracyReport) return null;
    try {
      const parsed = JSON.parse(project.accuracyReport) as AccuracyReport;
      return parsed && Array.isArray(parsed.items) ? parsed : null;
    } catch {
      return null;
    }
  })();

  const parsedRepairs: RepairHistoryEntry[] = (() => {
    if (!project?.repairHistory) return [];
    try {
      const parsed = JSON.parse(project.repairHistory);
      return Array.isArray(parsed) ? (parsed as RepairHistoryEntry[]) : [];
    } catch {
      return [];
    }
  })();

  const copyToClipboard = () => {
    if (selectedFile?.content) {
      navigator.clipboard.writeText(selectedFile.content);
      toast({
        title: "Copied",
        description: `${selectedFile.filename} copied to clipboard.`,
      });
    }
  };

  const handleDownload = () => {
    if (!project) return;
    const link = document.createElement("a");
    link.href = `/api/projects/${project.id}/download`;
    link.download = `${project.name}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return (
      <div className="dark flex min-h-[100dvh] items-center justify-center bg-background p-8 font-sans text-foreground">
        <div className="max-w-md space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 ring-1 ring-destructive/30">
            <AlertTriangle className="h-5 w-5 text-destructive" strokeWidth={1.75} />
          </div>
          <h2 className="text-xl font-semibold">Link not found</h2>
          <p className="text-sm text-muted-foreground">
            This share link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dark flex min-h-[100dvh] flex-col bg-background font-sans text-foreground">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/70 px-4 py-2.5 backdrop-blur md:h-14 md:flex-nowrap md:py-0 shrink-0">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <Sheet open={mobileExplorerOpen} onOpenChange={setMobileExplorerOpen}>
            <SheetTrigger
              aria-label="Open file explorer"
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-all active:scale-95 hover:text-foreground"
            >
              <FolderTree className="h-4 w-4" strokeWidth={1.75} />
            </SheetTrigger>
            <SheetContent side="left" className="w-80 border-r border-border bg-sidebar p-0">
              <SheetTitle className="sr-only">File explorer</SheetTitle>
              <FileList
                files={files}
                isLoading={isLoading}
                selectedId={activeId}
                onSelect={setSelectedFileId}
                closeOnSelect
              />
            </SheetContent>
          </Sheet>
          <a
            href="/"
            className="hidden md:flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
              <Terminal className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight">
              prompt<span className="text-primary">iOS</span>
            </span>
          </a>
          <span className="hidden md:inline text-border">/</span>
          {isLoading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate font-mono font-semibold text-foreground">{project?.name}</span>
              <span className="rounded-md bg-secondary/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {project?.framework}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                Read-only
              </span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isLoading && files.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              className="gap-1.5 rounded-md font-mono text-xs active:scale-[0.97]"
            >
              <Download className="h-3 w-3" strokeWidth={2} /> .zip
            </Button>
          )}
          <a
            href="/"
            className="hidden sm:inline-flex font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
          >
            Build your own →
          </a>
        </div>
      </header>

      {/* Prompt banner */}
      {!isLoading && project?.prompt && (
        <div className="border-b border-border bg-card/30 px-4 py-2.5">
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
            <span className="mr-2 font-semibold tracking-widest text-primary">PROMPT</span>
            {project.prompt}
          </p>
        </div>
      )}

      {/* Clarifications (read-only) */}
      {!isLoading && parsedAnswers.length > 0 && (
        <ClarifyAnswersDisplay answers={parsedAnswers} />
      )}

      {/* Accuracy Report (read-only) */}
      {!isLoading && (
        <AccuracyReportPanel
          report={parsedAccuracy}
          history={parsedRepairs}
          defaultCollapsed
        />
      )}

      {/* Architecture Plan Panel */}
      {!isLoading && parsedPlan && (
        <PlanPanel
          plan={parsedPlan}
          collapsed={planCollapsed}
          onToggle={() => setPlanCollapsed((prev) => !prev)}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop file explorer */}
        <div className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-background">
          <FileList
            files={files}
            isLoading={isLoading}
            selectedId={activeId}
            onSelect={setSelectedFileId}
          />
        </div>

        {/* Code Viewer */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#1E1E1E]">
          {selectedFile ? (
            <>
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 bg-background/70 px-4">
                <div className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
                  <File className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{selectedFile.filepath}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground active:scale-90"
                  onClick={copyToClipboard}
                  title="Copy code"
                >
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                </Button>
              </div>
              <div className="flex-1 overflow-auto">
                <SyntaxHighlighter
                  language={
                    selectedFile.language === "swift" ? "swift" : "typescript"
                  }
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    padding: "1rem",
                    background: "transparent",
                    fontSize: "13px",
                    lineHeight: "1.5",
                  }}
                  showLineNumbers
                  lineNumberStyle={{
                    minWidth: "2.5em",
                    paddingRight: "1em",
                    color: "#6e7681",
                    textAlign: "right",
                  }}
                >
                  {selectedFile.content}
                </SyntaxHighlighter>
              </div>
            </>
          ) : isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="animate-pulse font-mono text-sm text-muted-foreground">
                Loading…
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Code2 className="mb-4 h-12 w-12 opacity-20" strokeWidth={1.5} />
              <p className="text-base font-medium text-foreground">Select a file</p>
              <p className="mt-1 text-sm">Tap the explorer to browse generated source.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
