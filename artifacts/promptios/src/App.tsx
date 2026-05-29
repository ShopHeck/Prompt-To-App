import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import NewProject from "@/pages/new-project";
import ProjectDetail from "@/pages/project-detail";
import SharedProject from "@/pages/shared-project";
import AppStoreGuide from "@/pages/app-store-guide";
import AuthPage from "@/pages/auth";
import PricingPage from "@/pages/pricing";
import SettingsPage from "@/pages/settings";
import TemplatesPage from "@/pages/templates";
import { TourProvider } from "@/components/tour";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/projects/new" component={NewProject} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/share/:token" component={SharedProject} />
      <Route path="/guide/app-store" component={AppStoreGuide} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/templates" component={TemplatesPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <TourProvider>
              <Router />
            </TourProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
