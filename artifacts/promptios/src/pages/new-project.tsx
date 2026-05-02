import { Layout } from "@/components/layout";
import { useCreateProject, getListProjectsQueryKey, getGetRecentProjectsQueryKey, getGetProjectStatsQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Terminal, Sparkles, Smartphone, Code2, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name too long"),
  prompt: z.string().min(10, "Please provide a more detailed prompt (at least 10 chars)"),
  framework: z.enum(["swiftui", "uikit"])
});

type FormValues = z.infer<typeof formSchema>;

export default function NewProject() {
  const [, setLocation] = useLocation();
  const createProject = useCreateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      prompt: "",
      framework: "swiftui"
    }
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
            title: "Project Initialized",
            description: "Target locked. Redirecting to workspace...",
          });
          
          setLocation(`/projects/${project.id}`);
        },
        onError: (error) => {
          toast({
            title: "Initialization Failed",
            description: "Could not create project. Please check the systems.",
            variant: "destructive"
          });
        }
      }
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-8 pt-12 animate-in fade-in duration-500">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight font-mono flex items-center gap-3">
            <Cpu className="h-8 w-8 text-primary" />
            Initialize Target
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm">
            <span className="text-primary mr-2">&gt;</span>
            Provide application parameters. System will auto-generate scaffolding and implementation.
          </p>
        </div>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-xl">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardContent className="p-6 md:p-8 space-y-8">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Terminal className="h-3 w-3" />
                        Project Codename
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. FitTracker, Aura, DataSync" 
                          className="font-mono text-lg bg-background/50 border-input h-12 focus-visible:ring-primary focus-visible:border-primary transition-all" 
                          {...field} 
                          data-testid="input-name"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Internal identifier for this application.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Sparkles className="h-3 w-3" />
                        Application Blueprint (Prompt)
                      </FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe the iOS app in detail. E.g., 'A fitness tracking app with a dark theme. The main screen shows a circular progress ring of daily calories. A tab bar connects to a workout history list and a settings page. Include data models for Workout and simple persistence...'"
                          className="min-h-[160px] font-mono text-sm bg-background/50 border-input resize-y focus-visible:ring-primary focus-visible:border-primary leading-relaxed"
                          {...field}
                          data-testid="textarea-prompt"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Be specific about screens, features, styling, and data models.
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
                      <FormLabel className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Code2 className="h-3 w-3" />
                        Target Framework
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                          <FormItem>
                            <FormControl>
                              <RadioGroupItem value="swiftui" className="peer sr-only" data-testid="radio-swiftui" />
                            </FormControl>
                            <FormLabel className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all">
                              <Smartphone className="mb-3 h-6 w-6 text-foreground" />
                              <div className="font-bold">SwiftUI</div>
                              <div className="text-xs text-muted-foreground mt-1 text-center font-mono">Modern, declarative UI framework</div>
                            </FormLabel>
                          </FormItem>
                          
                          <FormItem>
                            <FormControl>
                              <RadioGroupItem value="uikit" className="peer sr-only" data-testid="radio-uikit" />
                            </FormControl>
                            <FormLabel className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all">
                              <Layers className="mb-3 h-6 w-6 text-foreground" />
                              <div className="font-bold">UIKit</div>
                              <div className="text-xs text-muted-foreground mt-1 text-center font-mono">Classic, imperative UI framework</div>
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="bg-muted/20 border-t border-border/50 p-6 flex justify-end">
                <Button 
                  type="submit" 
                  size="lg" 
                  disabled={createProject.isPending}
                  className="font-mono font-bold tracking-wide w-full md:w-auto min-w-[200px] hover-elevate"
                  data-testid="btn-submit"
                >
                  {createProject.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></span>
                      INITIALIZING...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      EXECUTE BUILD
                    </span>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </Layout>
  );
}