import { Layout } from "@/components/layout";
import {
  useCreateProject,
  getListProjectsQueryKey,
  getGetRecentProjectsQueryKey,
  getGetProjectStatsQueryKey,
} from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles, Smartphone, Code2, ArrowLeft, ArrowRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name too long"),
  prompt: z.string().min(10, "Add a bit more detail (at least 10 characters)"),
  framework: z.enum(["swiftui", "uikit"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewProject() {
  const [, setLocation] = useLocation();
  const createProject = useCreateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", prompt: "", framework: "swiftui" },
  });

  function onSubmit(data: FormValues) {
    createProject.mutate(
      { data },
      {
        onSuccess: (project) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentProjectsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey() });
          toast({
            title: "Project created",
            description: "Heading to the workspace.",
          });
          setLocation(`/projects/${project.id}`);
        },
        onError: () => {
          toast({
            title: "Could not create project",
            description: "Something went wrong on our side. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 md:py-14 animate-in fade-in duration-500">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Back to workspace
        </Link>

        <header className="mt-6 mb-10 space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl md:leading-[1.1]">
            Describe the app you want to build.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Give it a name and a prompt with screens, data, and any styling preferences.
            The engine will plan the architecture, then synthesize Swift source you can run in Xcode.
          </p>
        </header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Project name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Cinder, FieldNotes, Tideline"
                      className="h-12 rounded-lg border-border/80 bg-card/30 text-base transition-colors focus-visible:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/30"
                      {...field}
                      data-testid="input-name"
                    />
                  </FormControl>
                  <FormDescription className="text-xs text-muted-foreground/80">
                    Used for the Xcode workspace and folder name.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-primary" strokeWidth={2} />
                    Prompt
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="A weather app with a hero card showing the current city, an hourly scroll strip below, and a settings tab for units. Use a glassy translucent header. Persist favorite cities locally."
                      className="min-h-[180px] resize-y rounded-lg border-border/80 bg-card/30 leading-relaxed font-mono text-sm transition-colors focus-visible:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/30"
                      {...field}
                      data-testid="textarea-prompt"
                    />
                  </FormControl>
                  <FormDescription className="text-xs text-muted-foreground/80">
                    Mention screens, key flows, data models, and visual direction.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="framework"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
                    <Code2 className="h-3 w-3" strokeWidth={2} />
                    Target framework
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                      {[
                        {
                          value: "swiftui",
                          title: "SwiftUI",
                          desc: "Declarative, modern. Recommended for new apps.",
                          icon: Smartphone,
                        },
                        {
                          value: "uikit",
                          title: "UIKit",
                          desc: "Imperative, mature. Use when you need legacy compatibility.",
                          icon: Layers,
                        },
                      ].map((opt) => (
                        <FormItem key={opt.value} className="m-0">
                          <FormControl>
                            <RadioGroupItem
                              value={opt.value}
                              className="peer sr-only"
                              data-testid={`radio-${opt.value}`}
                            />
                          </FormControl>
                          <FormLabel className="group flex h-full cursor-pointer flex-col gap-2 rounded-xl border border-border/70 bg-card/30 p-5 transition-all hover:bg-card/60 active:scale-[0.99] peer-data-[state=checked]:border-primary/70 peer-data-[state=checked]:bg-primary/[0.04] peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-primary/40">
                            <div className="flex items-center justify-between">
                              <opt.icon className="h-5 w-5 text-foreground" strokeWidth={1.75} />
                              <span className="hidden h-2 w-2 rounded-full bg-primary peer-data-[state=checked]:block" />
                            </div>
                            <div className="font-medium">{opt.title}</div>
                            <div className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</div>
                          </FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-6 sm:flex-row sm:justify-end">
              <Link href="/" className="sm:order-1">
                <Button type="button" variant="ghost" className="w-full sm:w-auto">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={createProject.isPending}
                className="group h-11 w-full gap-2 rounded-lg px-6 font-medium transition-all active:scale-[0.98] sm:order-2 sm:w-auto sm:min-w-[200px]"
                data-testid="btn-submit"
              >
                {createProject.isPending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creating…
                  </>
                ) : (
                  <>
                    Create project
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={2}
                    />
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
