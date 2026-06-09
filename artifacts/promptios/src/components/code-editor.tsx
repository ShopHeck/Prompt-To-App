import * as React from "react";
import Editor from "@monaco-editor/react";
import { Save, File, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLanguageFromFilename } from "@/lib/editor-utils";

interface CodeEditorProps {
  filename: string;
  filepath: string;
  content: string;
  readOnly?: boolean;
  onSave?: (newContent: string) => void;
  isSaving?: boolean;
}

export function CodeEditor({
  filename,
  filepath,
  content,
  readOnly = false,
  onSave,
  isSaving = false,
}: CodeEditorProps) {
  const [value, setValue] = React.useState(content);
  const [isDirty, setIsDirty] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setValue(content);
    setIsDirty(false);
  }, [content]);

  const handleChange = (newValue: string | undefined) => {
    const v = newValue ?? "";
    setValue(v);
    setIsDirty(v !== content);
  };

  const handleSave = () => {
    if (onSave && isDirty) {
      onSave(value);
    }
  };

  // Keyboard shortcut: Ctrl/Cmd+S scoped to the editor container
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (onSave && isDirty && !readOnly) {
          onSave(value);
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [onSave, isDirty, readOnly, value]);

  const language = getLanguageFromFilename(filename);

  return (
    <div ref={containerRef} className="flex h-full flex-col" tabIndex={-1}>
      {/* File header bar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-4">
        <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <File className="h-3.5 w-3.5" />
          <span>{filepath}</span>
          {isDirty && (
            <span className="ml-1 h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" />
          )}
        </div>
        {!readOnly && onSave && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="h-7 gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            title="Save (Ctrl+S)"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </Button>
        )}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          value={value}
          onChange={handleChange}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            readOnly,
            automaticLayout: true,
            padding: { top: 16 },
            roundedSelection: false,
            cursorStyle: "line",
            wordWrap: "on",
            tabSize: 2,
          }}
          loading={
            <div className="flex h-full items-center justify-center bg-[#1E1E1E]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        />
      </div>
    </div>
  );
}
