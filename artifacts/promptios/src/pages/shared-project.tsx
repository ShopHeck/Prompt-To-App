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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PlanPanel, type ArchitecturePlan } from "@/components/plan-panel";

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
  createdAt: string;
  updatedAt: string;
}

interface SharedProjectData {
  project: Project;
  files: ProjectFile[];
}

export default function SharedProject() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token ?? "";
  const { toast } = useToast();
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [planCollapsed, setPlanCollapsed] = useState(false);

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
  const selectedFile = files.find((f: ProjectFile) => f.id === selectedFileId) ?? files[0];

  const parsedPlan: ArchitecturePlan | null = (() => {
    if (!project?.architecturePlan) return null;
    try {
      return JSON.parse(project.architecturePlan) as ArchitecturePlan;
    } catch {
      return null;
    }
  })();

  const copyToClipboard = () => {
    if (selectedFile?.content) {
      navigator.clipboard.writeText(selectedFile.content);
      toast({ title: "Copied", description: `${selectedFile.filename} copied to clipboard.` });
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
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center max-w-md space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold font-mono">Link Not Found</h2>
          <p className="text-muted-foreground text-sm">
            This share link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-primary font-mono font-bold text-lg tracking-tight">
            <span className="text-muted-foreground">/&gt;_</span> promptiOS
          </span>
          <span className="text-border">|</span>
          {isLoading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <>
              <span className="font-mono font-bold text-foreground">{project?.name}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-secondary text-secondary-foreground border border-border">
                {project?.framework}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Shared Read-Only
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && files.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleDownload} className="gap-2 font-mono text-xs">
              <Download className="h-3 w-3" /> Download .zip
            </Button>
          )}
          <a
            href="/"
            className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
          >
            Generate your own →
          </a>
        </div>
      </header>

      {/* Prompt banner */}
      {!isLoading && project?.prompt && (
        <div className="border-b border-border bg-card/40 px-4 py-2">
          <p className="text-xs font-mono text-muted-foreground">
            <span className="text-primary mr-2">PROMPT</span>
            {project.prompt}
          </p>
        </div>
      )}

      {/* Architecture Plan Panel */}
      {!isLoading && parsedPlan && (
        <PlanPanel
          plan={parsedPlan}
          collapsed={planCollapsed}
          onToggle={() => setPlanCollapsed(prev => !prev)}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer */}
        <div className="w-64 border-r border-border bg-background flex flex-col shrink-0">
          <div className="p-3 text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase border-b border-border/50">
            Explorer
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {isLoading ? (
              <div className="space-y-2 px-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-5/6" />
                <Skeleton className="h-6 w-4/6" />
                <Skeleton className="h-6 w-5/6" />
              </div>
            ) : files.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground font-mono">
                No files in this project.
              </div>
            ) : (
              <div className="flex flex-col">
                {files.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFileId(file.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors font-mono hover:bg-secondary/50 ${
                      (selectedFileId ?? files[0]?.id) === file.id
                        ? "bg-secondary text-primary border-l-2 border-primary"
                        : "text-muted-foreground border-l-2 border-transparent"
                    }`}
                  >
                    <FileCode
                      className={`h-4 w-4 shrink-0 ${
                        (selectedFileId ?? files[0]?.id) === file.id
                          ? "text-primary"
                          : "text-muted-foreground/60"
                      }`}
                    />
                    <span className="truncate">{file.filepath}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Code Viewer */}
        <div className="flex-1 flex flex-col bg-[#1E1E1E] overflow-hidden">
          {selectedFile ? (
            <>
              <div className="h-10 bg-background/80 border-b border-border/40 flex items-center px-4 justify-between shrink-0">
                <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                  <File className="h-3.5 w-3.5" />
                  <span>{selectedFile.filepath}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={copyToClipboard}
                  title="Copy code"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex-1 overflow-auto">
                <SyntaxHighlighter
                  language={selectedFile.language === "swift" ? "swift" : "typescript"}
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
            <div className="flex-1 flex items-center justify-center">
              <div className="text-muted-foreground font-mono text-sm animate-pulse">
                Loading...
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <Code2 className="h-16 w-16 opacity-20 mb-4" />
              <p className="font-mono text-lg">Select a file to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
