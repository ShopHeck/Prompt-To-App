import { useState } from "react";
import { HelpCircle, SkipForward, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ClarifyingQuestion {
  id: string;
  question: string;
  suggestion?: string;
}

export interface ClarifyAnswer {
  id: string;
  question: string;
  answer: string;
}

interface ClarifyPanelProps {
  questions: ClarifyingQuestion[];
  onSubmit: (answers: ClarifyAnswer[], skip: boolean) => void;
  isSubmitting?: boolean;
}

export function ClarifyPanel({ questions, onSubmit, isSubmitting }: ClarifyPanelProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map(q => [q.id, ""])),
  );

  if (questions.length === 0) return null;

  const update = (id: string, value: string) => {
    setValues(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (skip: boolean) => {
    const answers: ClarifyAnswer[] = questions.map(q => ({
      id: q.id,
      question: q.question,
      answer: skip ? "" : (values[q.id] ?? ""),
    }));
    onSubmit(answers, skip);
  };

  const useSuggestions = () => {
    setValues(prev => {
      const next = { ...prev };
      for (const q of questions) {
        if (!next[q.id] && q.suggestion) next[q.id] = q.suggestion;
      }
      return next;
    });
  };

  const hasAnyAnswer = Object.values(values).some(v => v.trim().length > 0);

  return (
    <div className="border-b border-border shrink-0 bg-blue-950/20 border-blue-500/30">
      <div className="px-4 py-3 flex items-center justify-between border-b border-blue-500/20">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-mono font-bold text-blue-400 uppercase tracking-widest">
            Clarifying Questions
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {questions.length} question{questions.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          onClick={useSuggestions}
          className="text-[10px] font-mono text-blue-400/80 hover:text-blue-300 flex items-center gap-1 transition-colors"
          data-testid="btn-use-suggestions"
        >
          <Sparkles className="h-3 w-3" />
          Use suggested defaults
        </button>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-[11px] font-mono text-blue-200/80">
          Your prompt is a bit broad. Answer 1-line questions below so the plan reflects what you actually want, or skip to take the AI's best guess.
        </p>
        {questions.map((q, idx) => (
          <div key={q.id} className="space-y-1" data-testid={`clarify-q-${q.id}`}>
            <label className="text-xs font-mono text-foreground flex items-start gap-2">
              <span className="text-blue-400 shrink-0">{idx + 1}.</span>
              <span>{q.question}</span>
            </label>
            <input
              value={values[q.id] ?? ""}
              onChange={e => update(q.id, e.target.value)}
              placeholder={q.suggestion ?? "Your answer..."}
              className="w-full text-xs font-mono bg-background/80 border border-blue-500/30 rounded px-2 py-1.5 text-foreground focus:outline-none focus:border-blue-400/70 placeholder:text-muted-foreground/50"
              data-testid={`clarify-input-${q.id}`}
            />
            {q.suggestion && (
              <p className="text-[10px] font-mono text-muted-foreground pl-5">
                Suggested: {q.suggestion}
              </p>
            )}
          </div>
        ))}

        <div className="flex items-center gap-2 pt-2 border-t border-blue-500/20">
          <Button
            size="sm"
            variant="default"
            disabled={isSubmitting}
            onClick={() => handleSubmit(false)}
            className="gap-2 font-mono text-xs bg-blue-500 hover:bg-blue-600 text-white border-0"
            data-testid="btn-submit-clarifications"
          >
            <ArrowRight className="h-3 w-3" />
            {hasAnyAnswer ? "Submit answers" : "Submit (use my best guess)"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => handleSubmit(true)}
            className="gap-2 font-mono text-xs"
            data-testid="btn-skip-clarifications"
          >
            <SkipForward className="h-3 w-3" />
            Skip — let AI decide
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ClarifyAnswersDisplayProps {
  answers: ClarifyAnswer[];
}

export function ClarifyAnswersDisplay({ answers }: ClarifyAnswersDisplayProps) {
  const visible = answers.filter(a => a.answer && a.answer.trim().length > 0);
  if (visible.length === 0) return null;
  return (
    <div className="border-b border-border shrink-0 bg-blue-950/10 px-4 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <HelpCircle className="h-3 w-3 text-blue-400" />
        <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-widest">
          Clarifications
        </span>
      </div>
      <ul className="space-y-1">
        {visible.map(a => (
          <li key={a.id} className="text-[11px] font-mono">
            <span className="text-muted-foreground">{a.question}</span>
            <span className="text-muted-foreground/60"> → </span>
            <span className="text-foreground">{a.answer}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
