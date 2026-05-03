import * as React from "react";
import { useEffect, useState, useRef } from "react";
import { useRoute } from "wouter";
import { Layout } from "@/components/layout";
import { 
  useGetProject, 
  getGetProjectQueryKey,
  useGetProjectFiles,
  getGetProjectFilesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileCode, Play, RotateCw, AlertTriangle, File, CheckCircle2,
  Copy, Download, Code2, Cpu, Share2, Check, Layers, Hammer, PencilLine,
  FolderTree, Smartphone
} from "lucide-react";
import { PhonePreview } from "@/components/phone-preview";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { PlanPanel, parsePartialPlan, type ArchitecturePlan, type PartialPlan } from "@/components/plan-panel";
import { ClarifyPanel, ClarifyAnswersDisplay, type ClarifyingQuestion, type ClarifyAnswer } from "@/components/clarify-panel";
import { AccuracyReportPanel, type AccuracyReport, type RepairHistoryEntry } from "@/components/accuracy-report-panel";

interface ExplorerFile {
  id: number;
  filename: string;
  filepath: string;
  language: string;
  content: string;
}

function FileExplorerContents({
  files,
  isLoadingFiles,
  selectedFileId,
  setSelectedFileId,
  isActivelyGenerating,
  isAwaitingApproval,
  closeOnSelect = false,
}: {
  files: ExplorerFile[] | undefined;
  isLoadingFiles: boolean;
  selectedFileId: number | null;
  setSelectedFileId: (id: number) => void;
  isActivelyGenerating: boolean;
  isAwaitingApproval: boolean;
  closeOnSelect?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-2 border-b border-border/60 px-4 shrink-0">
        <FolderTree className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Files
        </span>
        {!isLoadingFiles && files && files.length > 0 && (
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {files.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {isLoadingFiles ? (
          <div className="space-y-2 px-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-4/6" />
            <Skeleton className="h-5 w-3/6" />
          </div>
        ) : files?.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-muted-foreground">
            {isActivelyGenerating
              ? "Awaiting output stream…"
              : isAwaitingApproval
                ? "Approve the plan to generate files."
                : "No files generated yet."}
          </div>
        ) : (
          <div className="flex flex-col">
            {files?.map((file) => {
              const active = selectedFileId === file.id;
              const btn = (
                <button
                  onClick={() => setSelectedFileId(file.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-left font-mono text-[12.5px] transition-all active:scale-[0.99] ${
                    active
                      ? "bg-secondary/70 text-foreground border-l-2 border-primary"
                      : "border-l-2 border-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
                  }`}
                  data-testid={`file-item-${file.id}`}
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

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const hasTriggeredInitialGeneration = useRef(false);

  // Auto-close mobile file explorer drawer whenever a file is selected
  useEffect(() => {
    if (selectedFileId !== null) setMobileExplorerOpen(false);
  }, [selectedFileId]);

  // Two-phase generation state
  const [generationPhase, setGenerationPhase] = useState<"idle" | "planning" | "clarifying" | "awaiting_approval" | "building" | "validating">("idle");
  const [planAccumulatedChunks, setPlanAccumulatedChunks] = useState("");
  const [partialPlan, setPartialPlan] = useState<PartialPlan>({ screens: [], models: [], navigation: "" });
  const [livePlan, setLivePlan] = useState<ArchitecturePlan | null>(null);
  const [editedPlan, setEditedPlan] = useState<ArchitecturePlan | null>(null);
  const [planPanelCollapsed, setPlanPanelCollapsed] = useState(false);

  // Clarify + accuracy state
  const [clarifyingQuestions, setClarifyingQuestions] = useState<ClarifyingQuestion[]>([]);
  const [submittedAnswers, setSubmittedAnswers] = useState<ClarifyAnswer[]>([]);
  const [accuracyReport, setAccuracyReport] = useState<AccuracyReport | null>(null);
  const [repairHistory, setRepairHistory] = useState<RepairHistoryEntry[]>([]);

  // Live preview state
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewAvailable, setPreviewAvailable] = useState(false);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);

  const { data: project, isLoading: isLoadingProject, error: projectError } = useGetProject(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetProjectQueryKey(projectId)
    }
  });

  const { data: files, isLoading: isLoadingFiles } = useGetProjectFiles(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetProjectFilesQueryKey(projectId)
    }
  });

  const consumeSseStream = async (response: Response, onEvent: (event: any) => void) => {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().startsWith("data: ")) {
          try {
            const event = JSON.parse(line.trim().slice(6));
            onEvent(event);
          } catch (_) {}
        }
      }
    }
  };

  const handleGenerate = async () => {
    if (!projectId || isGenerating) return;
    
    setIsGenerating(true);
    setGenerationPhase("planning");
    setPlanAccumulatedChunks("");
    setPartialPlan({ screens: [], models: [], navigation: "" });
    setLivePlan(null);
    setEditedPlan(null);
    setPlanPanelCollapsed(false);
    setClarifyingQuestions([]);
    setSubmittedAnswers([]);
    setAccuracyReport(null);
    setRepairHistory([]);
    hasTriggeredInitialGeneration.current = true;
    
    queryClient.setQueryData(getGetProjectQueryKey(projectId), (old: any) => 
      old ? { ...old, status: 'generating' } : old
    );

    try {
      const response = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalContext: null }),
      });
      
      if (!response.ok) throw new Error("Generation request failed");

      await consumeSseStream(response, (event) => {
        if (event.type === "clarify_questions") {
          setClarifyingQuestions((event.questions ?? []) as ClarifyingQuestion[]);
        } else if (event.type === "awaiting_clarification") {
          setGenerationPhase("clarifying");
          queryClient.setQueryData(getGetProjectQueryKey(projectId), (old: any) =>
            old ? { ...old, status: "awaiting_clarification" } : old
          );
        } else if (event.type === "planning") {
          setGenerationPhase("planning");
        } else if (event.type === "planning_chunk") {
          setPlanAccumulatedChunks(prev => {
            const next = prev + event.chunk;
            setPartialPlan(parsePartialPlan(next));
            return next;
          });
        } else if (event.type === "plan") {
          setLivePlan(event.plan as ArchitecturePlan);
          setEditedPlan(event.plan as ArchitecturePlan);
        } else if (event.type === "awaiting_approval") {
          setGenerationPhase("awaiting_approval");
          setPlanPanelCollapsed(false);
          queryClient.setQueryData(getGetProjectQueryKey(projectId), (old: any) =>
            old ? { ...old, status: "awaiting_approval" } : old
          );
        } else if (event.type === "error" || event.error) {
          setGenerationPhase("idle");
          toast({
            title: "Generation Error",
            description: event.message || event.error || "Generation failed",
            variant: "destructive"
          });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        }
      });
    } catch (error) {
      setGenerationPhase("idle");
      toast({
        title: "Connection Error",
        description: "Failed to stream generation updates.",
        variant: "destructive"
      });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprovePlan = async () => {
    if (!projectId || isGenerating) return;
    const planToSend = editedPlan ?? livePlan;
    if (!planToSend) return;

    setIsGenerating(true);
    setGenerationPhase("building");
    setPlanPanelCollapsed(true);
    setPreviewAvailable(false);
    setIsGeneratingPreview(false);
    setViewMode("code");
    queryClient.setQueryData(getGetProjectQueryKey(projectId), (old: any) =>
      old ? { ...old, status: "generating", livePreviewHtml: null } : old
    );

    try {
      const response = await fetch(`/api/projects/${projectId}/approve-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planToSend, additionalContext: null }),
      });

      if (!response.ok) throw new Error("Approve plan request failed");

      await consumeSseStream(response, (event) => {
        if (event.type === "building") {
          setGenerationPhase("building");
        } else if (event.type === "validating") {
          setGenerationPhase("validating");
        } else if (event.type === "accuracy_report" && event.report) {
          setAccuracyReport(event.report as AccuracyReport);
        } else if (event.type === "repair_complete") {
          if (event.report) setAccuracyReport(event.report as AccuracyReport);
          if (event.history) setRepairHistory(event.history as RepairHistoryEntry[]);
        } else if (event.type === "preview_generating") {
          setIsGeneratingPreview(true);
          setPreviewAvailable(false);
        } else if (event.type === "preview_ready") {
          setIsGeneratingPreview(false);
          setPreviewAvailable(!!event.available);
          if (event.available) setPreviewReloadKey(k => k + 1);
        } else if (event.done) {
          setGenerationPhase("idle");
          setIsGeneratingPreview(false);
          if (typeof event.previewAvailable === "boolean") {
            setPreviewAvailable(event.previewAvailable);
            if (event.previewAvailable) setPreviewReloadKey(k => k + 1);
          }
          if (event.accuracyReport) setAccuracyReport(event.accuracyReport as AccuracyReport);
          if (event.repairHistory) setRepairHistory(event.repairHistory as RepairHistoryEntry[]);
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectFilesQueryKey(projectId) });
          toast({
            title: "Generation Complete",
            description: "Project source code has been synthesized.",
          });
        } else if (event.type === "error" || event.error) {
          setGenerationPhase("idle");
          toast({
            title: "Generation Error",
            description: event.message || event.error || "Generation failed",
            variant: "destructive"
          });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        }
      });
    } catch (error) {
      setGenerationPhase("idle");
      toast({
        title: "Connection Error",
        description: "Failed to stream code generation.",
        variant: "destructive"
      });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmitClarifications = async (answers: ClarifyAnswer[], skip: boolean) => {
    if (!projectId || isGenerating) return;
    setIsGenerating(true);
    setSubmittedAnswers(answers);
    setGenerationPhase("planning");
    setClarifyingQuestions([]);
    setPlanAccumulatedChunks("");
    setPartialPlan({ screens: [], models: [], navigation: "" });
    setLivePlan(null);
    setEditedPlan(null);
    queryClient.setQueryData(getGetProjectQueryKey(projectId), (old: any) =>
      old ? { ...old, status: "generating" } : old
    );

    try {
      const response = await fetch(`/api/projects/${projectId}/answer-clarifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip, answers, additionalContext: null }),
      });
      if (!response.ok) throw new Error("Answer submission failed");

      await consumeSseStream(response, (event) => {
        if (event.type === "planning") {
          setGenerationPhase("planning");
        } else if (event.type === "planning_chunk") {
          setPlanAccumulatedChunks(prev => {
            const next = prev + event.chunk;
            setPartialPlan(parsePartialPlan(next));
            return next;
          });
        } else if (event.type === "plan") {
          setLivePlan(event.plan as ArchitecturePlan);
          setEditedPlan(event.plan as ArchitecturePlan);
        } else if (event.type === "awaiting_approval") {
          setGenerationPhase("awaiting_approval");
          setPlanPanelCollapsed(false);
          queryClient.setQueryData(getGetProjectQueryKey(projectId), (old: any) =>
            old ? { ...old, status: "awaiting_approval" } : old
          );
        } else if (event.type === "error" || event.error) {
          setGenerationPhase("idle");
          toast({
            title: "Planning Error",
            description: event.message || event.error || "Failed",
            variant: "destructive",
          });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        }
      });
    } catch (error) {
      setGenerationPhase("idle");
      toast({
        title: "Connection Error",
        description: "Failed to stream planning updates.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-trigger generation if pending
  useEffect(() => {
    if (project?.status === 'pending' && !isGenerating && !hasTriggeredInitialGeneration.current) {
      handleGenerate();
    }
  }, [project?.status, isGenerating]);

  // Load stored plan from project when not generating
  useEffect(() => {
    if (!isGenerating && project?.architecturePlan && !livePlan) {
      try {
        const parsed = JSON.parse(project.architecturePlan) as ArchitecturePlan;
        setLivePlan(parsed);
        setEditedPlan(parsed);
        if (project.status === "awaiting_approval") {
          setGenerationPhase("awaiting_approval");
          setPlanPanelCollapsed(false);
        } else {
          setPlanPanelCollapsed(true);
        }
      } catch (_) {}
    }
  }, [project?.architecturePlan, project?.status, isGenerating]);

  // Restore clarify questions / answers / accuracy report from project
  useEffect(() => {
    if (isGenerating || !project) return;
    if (project.clarifyingQuestions && clarifyingQuestions.length === 0) {
      try {
        const parsed = JSON.parse(project.clarifyingQuestions) as ClarifyingQuestion[];
        if (Array.isArray(parsed)) setClarifyingQuestions(parsed);
      } catch (_) {}
    }
    if (project.clarifyAnswers && submittedAnswers.length === 0) {
      try {
        const parsed = JSON.parse(project.clarifyAnswers) as ClarifyAnswer[];
        if (Array.isArray(parsed)) setSubmittedAnswers(parsed);
      } catch (_) {}
    }
    if (project.accuracyReport && !accuracyReport) {
      try {
        const parsed = JSON.parse(project.accuracyReport) as AccuracyReport;
        if (parsed && Array.isArray(parsed.items)) setAccuracyReport(parsed);
      } catch (_) {}
    }
    if (project.repairHistory && repairHistory.length === 0) {
      try {
        const parsed = JSON.parse(project.repairHistory) as RepairHistoryEntry[];
        if (Array.isArray(parsed)) setRepairHistory(parsed);
      } catch (_) {}
    }
    if (project.status === "awaiting_clarification" && generationPhase === "idle") {
      setGenerationPhase("clarifying");
    }
  }, [project, isGenerating]);

  // Auto-select first file when loaded
  useEffect(() => {
    if (files && files.length > 0 && !selectedFileId) {
      setSelectedFileId(files[0].id);
    }
  }, [files, selectedFileId]);

  // Detect existing preview availability and default the view mode appropriately
  const initialPreviewModeApplied = useRef(false);
  useEffect(() => {
    if (!project) return;
    const hasPreview = !!project.livePreviewHtml;
    setPreviewAvailable(hasPreview);
    if (hasPreview && project.status === "complete" && !initialPreviewModeApplied.current) {
      setViewMode("preview");
      initialPreviewModeApplied.current = true;
    }
  }, [project?.livePreviewHtml, project?.status]);

  const selectedFile = files?.find(f => f.id === selectedFileId);

  const handleDownload = () => {
    if (!projectId) return;
    const link = document.createElement("a");
    link.href = `/api/projects/${projectId}/download`;
    link.download = `${project?.name ?? "project"}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [isCopiedLink, setIsCopiedLink] = useState(false);
  const handleShare = async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/share`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const { url } = await res.json();
      await navigator.clipboard.writeText(url);
      setIsCopiedLink(true);
      toast({ title: "Link copied!", description: "Share link copied to clipboard." });
      setTimeout(() => setIsCopiedLink(false), 3000);
    } catch {
      toast({ title: "Error", description: "Could not generate share link.", variant: "destructive" });
    }
  };

  const copyToClipboard = () => {
    if (selectedFile?.content) {
      navigator.clipboard.writeText(selectedFile.content);
      toast({
        title: "Copied to clipboard",
        description: `${selectedFile.filename} copied.`,
      });
    }
  };

  if (projectError) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Target Not Found</h2>
            <p className="text-muted-foreground">The requested project ID does not exist or has been purged.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const isAwaitingClarification = generationPhase === "clarifying" || (!isGenerating && project?.status === "awaiting_clarification");
  const isActivelyGenerating = (isGenerating || project?.status === 'generating') && !isAwaitingClarification;
  const isAwaitingApproval = generationPhase === "awaiting_approval" || (!isGenerating && project?.status === "awaiting_approval");
  const statusBadge = () => {
    if (isAwaitingClarification) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
          <PencilLine className="h-3 w-3" />
          Needs Clarification
        </span>
      );
    }
    if (generationPhase === "validating") {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400 inline-block animate-ping"></span>
          Validating...
        </span>
      );
    }
    if (generationPhase === "planning") {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 inline-block animate-ping"></span>
          Planning...
        </span>
      );
    }
    if (isAwaitingApproval) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
          <PencilLine className="h-3 w-3" />
          Review Plan
        </span>
      );
    }
    if (generationPhase === "building" || (isActivelyGenerating && generationPhase === "idle")) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block animate-ping"></span>
          Building...
        </span>
      );
    }
    if (project?.status === 'complete') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Complete
        </span>
      );
    }
    if (project?.status === 'error') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Failed
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-muted text-muted-foreground border border-border">
        Pending
      </span>
    );
  };

  return (
    <Layout>
      <div className="flex flex-col h-full min-h-[calc(100dvh-3.5rem)] md:min-h-[100dvh]">
        {/* Workspace Header */}
        <header className="border-b border-border bg-card/70 backdrop-blur flex items-center justify-between gap-2 px-4 py-2.5 md:h-14 md:py-0 shrink-0">
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
                <FileExplorerContents
                  files={files}
                  isLoadingFiles={isLoadingFiles}
                  selectedFileId={selectedFileId}
                  setSelectedFileId={setSelectedFileId}
                  isActivelyGenerating={isActivelyGenerating}
                  isAwaitingApproval={isAwaitingApproval}
                  closeOnSelect
                />
              </SheetContent>
            </Sheet>
            {isLoadingProject ? (
              <Skeleton className="h-5 w-32" />
            ) : (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="truncate font-mono font-semibold text-foreground">{project?.name}</h1>
                <span className="rounded-md bg-secondary/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {project?.framework}
                </span>
                {statusBadge()}
              </div>
            )}
          </div>
          
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {project?.status === 'complete' && (files?.length ?? 0) > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleShare}
                  className="gap-1.5 rounded-md font-mono text-xs active:scale-[0.97]"
                  title="Copy shareable link"
                >
                  {isCopiedLink ? <Check className="h-3 w-3 text-emerald-400" strokeWidth={2.25} /> : <Share2 className="h-3 w-3" strokeWidth={2} />}
                  <span className="hidden sm:inline">{isCopiedLink ? "Copied" : "Share"}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownload}
                  className="gap-1.5 rounded-md font-mono text-xs active:scale-[0.97]"
                  title="Download as Xcode-ready zip"
                >
                  <Download className="h-3 w-3" strokeWidth={2} />
                  <span className="hidden sm:inline">.zip</span>
                </Button>
              </>
            )}
            {isAwaitingApproval && (
              <Button
                size="sm"
                variant="default"
                disabled={isGenerating}
                onClick={handleApprovePlan}
                className="gap-1.5 rounded-md font-mono text-xs active:scale-[0.97] bg-amber-500 hover:bg-amber-600 text-black border-0"
                data-testid="btn-approve-plan"
              >
                <Hammer className="h-3 w-3" strokeWidth={2} />
                <span className="hidden sm:inline">Approve &amp; build</span>
                <span className="sm:hidden">Build</span>
              </Button>
            )}
            <Button 
              size="sm" 
              variant={project?.status === 'complete' ? "outline" : isAwaitingApproval ? "outline" : "default"}
              disabled={isActivelyGenerating || isLoadingProject || isAwaitingApproval}
              onClick={handleGenerate}
              className="gap-1.5 rounded-md font-mono text-xs active:scale-[0.97]"
              data-testid="btn-generate"
            >
              {isActivelyGenerating ? (
                <><RotateCw className="h-3 w-3 animate-spin" strokeWidth={2} /> <span className="hidden sm:inline">Working…</span></>
              ) : project?.status === 'complete' || project?.status === 'error' ? (
                <><RotateCw className="h-3 w-3" strokeWidth={2} /> <span className="hidden sm:inline">Regenerate</span></>
              ) : isAwaitingApproval ? (
                <><RotateCw className="h-3 w-3" strokeWidth={2} /> <span className="hidden sm:inline">Re-plan</span></>
              ) : (
                <><Play className="h-3 w-3 fill-current" strokeWidth={2} /> <span className="hidden sm:inline">Start build</span><span className="sm:hidden">Build</span></>
              )}
            </Button>
          </div>
        </header>

        {/* Clarifying Questions */}
        {isAwaitingClarification && clarifyingQuestions.length > 0 && (
          <ClarifyPanel
            questions={clarifyingQuestions}
            onSubmit={handleSubmitClarifications}
            isSubmitting={isGenerating}
          />
        )}

        {/* Submitted clarifications display (read-only) */}
        {!isAwaitingClarification && submittedAnswers.length > 0 && (
          <ClarifyAnswersDisplay answers={submittedAnswers} />
        )}

        {/* Accuracy Report */}
        <AccuracyReportPanel
          report={accuracyReport}
          history={repairHistory}
          defaultCollapsed={project?.status === "complete"}
        />

        {/* Architecture Plan Panel */}
        <PlanPanel
          plan={livePlan}
          isStreaming={generationPhase === "planning"}
          partialPlan={partialPlan}
          collapsed={planPanelCollapsed}
          onToggle={() => setPlanPanelCollapsed(prev => !prev)}
          editable={isAwaitingApproval}
          editedPlan={editedPlan}
          onEditedPlanChange={setEditedPlan}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Desktop file explorer sidebar */}
          <div className="hidden md:flex w-64 border-r border-border bg-background flex-col shrink-0">
            <FileExplorerContents
              files={files}
              isLoadingFiles={isLoadingFiles}
              selectedFileId={selectedFileId}
              setSelectedFileId={setSelectedFileId}
              isActivelyGenerating={isActivelyGenerating}
              isAwaitingApproval={isAwaitingApproval}
            />
          </div>

          {/* Code / Preview Viewer Area */}
          <div className="flex-1 flex flex-col bg-[#1E1E1E] overflow-hidden relative">
            {/* View mode toggle */}
            {(previewAvailable || isGeneratingPreview || project?.status === "complete") && (
              <div className="h-9 flex items-center gap-1 border-b border-border/40 bg-background/80 px-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("code")}
                  data-testid="btn-view-code"
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                    viewMode === "code"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Code2 className="h-3 w-3" /> Code
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("preview")}
                  data-testid="btn-view-preview"
                  disabled={!previewAvailable && !isGeneratingPreview}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors disabled:opacity-40 ${
                    viewMode === "preview"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Smartphone className="h-3 w-3" /> Preview
                  {isGeneratingPreview && (
                    <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </button>
                {viewMode === "preview" && previewAvailable && (
                  <button
                    type="button"
                    onClick={() => setPreviewReloadKey(k => k + 1)}
                    title="Reload preview"
                    className="ml-auto flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    <RotateCw className="h-3 w-3" /> Reload
                  </button>
                )}
              </div>
            )}

            {viewMode === "preview" ? (
              <PhonePreview
                src={previewAvailable ? `/api/projects/${projectId}/preview` : null}
                isGenerating={isGeneratingPreview}
                reloadKey={previewReloadKey}
                emptyHint="Finish a build to render the live preview here."
              />
            ) : (
              <>
            {/* Generation overlay — two-phase messaging */}
            {isActivelyGenerating && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                <div className="h-16 w-16 mb-4 relative">
                  <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin"></div>
                  <div className="absolute inset-2 rounded-full border-r-2 border-primary/50 animate-spin animation-delay-150"></div>
                  <div className="absolute inset-4 rounded-full border-b-2 border-primary/25 animate-spin animation-delay-300"></div>
                  {generationPhase === "planning" ? (
                    <Layers className="absolute inset-0 m-auto h-6 w-6 text-blue-400 animate-pulse" />
                  ) : (
                    <Cpu className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
                  )}
                </div>
                {generationPhase === "planning" ? (
                  <>
                    <h3 className="text-lg font-mono font-bold text-foreground">DESIGNING ARCHITECTURE</h3>
                    <p className="text-sm font-mono text-muted-foreground mt-2 max-w-md text-center">
                      Planning screens, data models, and navigation flow...
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-mono font-bold text-foreground">SYNTHESIZING SOURCE CODE</h3>
                    <p className="text-sm font-mono text-muted-foreground mt-2 max-w-md text-center">
                      Compiling {project?.framework} views, models, Package.swift, and Info.plist...
                    </p>
                  </>
                )}
              </div>
            )}

            {selectedFile ? (
              <>
                <div className="h-10 bg-background/80 border-b border-border/40 flex items-center px-4 justify-between shrink-0">
                  <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                    <File className="h-3.5 w-3.5" />
                    <span>{selectedFile.filepath}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={copyToClipboard} title="Copy code">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-auto bg-[#1E1E1E]">
                  <SyntaxHighlighter
                    language={selectedFile.language === 'swift' ? 'swift' : selectedFile.filename.endsWith('.plist') ? 'xml' : selectedFile.filename.endsWith('.md') ? 'markdown' : 'typescript'}
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      padding: '1rem',
                      background: 'transparent',
                      fontSize: '13px',
                      lineHeight: '1.5',
                    }}
                    showLineNumbers
                    lineNumberStyle={{
                      minWidth: '2.5em',
                      paddingRight: '1em',
                      color: '#6e7681',
                      textAlign: 'right'
                    }}
                  >
                    {selectedFile.content}
                  </SyntaxHighlighter>
                </div>
              </>
            ) : !isActivelyGenerating ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-background">
                <Code2 className="h-16 w-16 opacity-20 mb-4" />
                <p className="font-mono text-lg mb-2">Workspace initialized</p>
                <p className="text-sm max-w-md">
                  {project?.status === 'pending' 
                    ? "Click 'Start Build' to synthesize code based on your prompt." 
                    : "Select a file from the explorer to view its contents."}
                </p>
              </div>
            ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
