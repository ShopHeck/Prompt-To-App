import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, Bot, UserIcon, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth";
import * as api from "@/lib/api";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

interface RefinementChatProps {
  projectId: number;
}

export function RefinementChat({ projectId }: RefinementChatProps) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["refinements", projectId],
    queryFn: () => api.getRefinements(projectId),
    refetchInterval: 10_000,
  });

  const refineMut = useMutation({
    mutationFn: (text: string) => api.refine(projectId, text),
    onSuccess: () => {
      setInstruction("");
      queryClient.invalidateQueries({ queryKey: ["refinements", projectId] });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const isPaidPlan = user?.plan === "pro" || user?.plan === "studio";

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <Lock className="h-8 w-8 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium">Sign in required</p>
          <p className="text-xs text-muted-foreground mt-1">Log in to use refinement chat</p>
        </div>
        <Link href="/auth">
          <Button size="sm" variant="outline">Sign in</Button>
        </Link>
      </div>
    );
  }

  if (!isPaidPlan) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <Sparkles className="h-8 w-8 text-primary/50" />
        <div>
          <p className="text-sm font-medium">Pro or Studio plan required</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upgrade to refine your generated code with AI
          </p>
        </div>
        <Link href="/pricing">
          <Button size="sm">View plans</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <Bot className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Ask the AI to modify your generated code.
            </p>
            <p className="text-xs text-muted-foreground/60">
              e.g. &quot;Add a dark mode toggle&quot; or &quot;Make the header sticky&quot;
            </p>
          </div>
        ) : (
          messages?.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/60 text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className="mt-1 text-[10px] opacity-50">
                  {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                </p>
              </div>
              {msg.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}

        {refineMut.isPending && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-secondary/60 px-4 py-2.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Refining code...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border/60 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (instruction.trim() && !refineMut.isPending) {
              refineMut.mutate(instruction.trim());
            }
          }}
          className="flex gap-2"
        >
          <Textarea
            placeholder="Describe the change you want..."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (instruction.trim() && !refineMut.isPending) {
                  refineMut.mutate(instruction.trim());
                }
              }
            }}
            rows={1}
            className="min-h-[44px] max-h-32 resize-none rounded-xl border-border/80 bg-background/50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!instruction.trim() || refineMut.isPending}
            className="h-11 w-11 shrink-0 rounded-xl"
          >
            {refineMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
