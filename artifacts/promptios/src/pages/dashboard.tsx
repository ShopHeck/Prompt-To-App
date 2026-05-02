import { Layout } from "@/components/layout";
import { useGetRecentProjects, useGetProjectStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, TerminalSquare, Layers, Clock, FileCode2, Zap, ArrowRight, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: isLoadingStats } = useGetProjectStats();
  const { data: recentProjects, isLoading: isLoadingRecent } = useGetRecentProjects();

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-8 animate-in fade-in duration-500">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              Command Center
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
            </h1>
            <p className="text-muted-foreground mt-2 font-mono text-sm">
              <span className="text-primary mr-2">&gt;</span>
              Welcome back. iOS code generation systems are operational.
            </p>
          </div>
          <Link href="/projects/new">
            <Button data-testid="btn-new-project" className="gap-2 font-mono hover-elevate">
              <Plus className="h-4 w-4" />
              Initialize Project
            </Button>
          </Link>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Projects</CardTitle>
              <TerminalSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold font-mono">{stats?.totalProjects || 0}</div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Files Generated</CardTitle>
              <FileCode2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-3xl font-bold font-mono text-primary">{stats?.totalFilesGenerated || 0}</div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">SwiftUI Apps</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold font-mono">{stats?.frameworkBreakdown?.swiftui || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed Builds</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold font-mono">{stats?.completedProjects || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Projects */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight font-mono flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Targets
            </h2>
          </div>

          <div className="space-y-3">
            {isLoadingRecent ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="bg-card/30">
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-1/3 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))
            ) : recentProjects?.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground bg-card/20">
                <Activity className="h-10 w-10 mx-auto mb-4 opacity-50" />
                <p className="font-mono mb-2">No projects initialized.</p>
                <p className="text-sm mb-6">Create your first target to begin generation.</p>
                <Link href="/projects/new">
                  <Button variant="outline" className="font-mono">Start Build</Button>
                </Link>
              </div>
            ) : (
              recentProjects?.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card className="bg-card/40 border-border/50 hover:bg-card/80 hover:border-primary/50 transition-all cursor-pointer group hover-elevate">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg">{project.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-secondary text-secondary-foreground border border-secondary-border">
                            {project.framework}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                            project.status === 'complete' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            project.status === 'generating' ? 'bg-primary/10 text-primary border-primary/20 animate-pulse' :
                            project.status === 'error' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                            'bg-muted text-muted-foreground border-border'
                          }`}>
                            {project.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1 max-w-2xl">
                          {project.prompt}
                        </p>
                        <div className="text-xs text-muted-foreground font-mono mt-1 opacity-70">
                          ID: #{project.id} • Updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors transform group-hover:translate-x-1" />
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}