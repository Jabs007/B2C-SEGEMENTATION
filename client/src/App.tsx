import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Auth0ProviderWrapper } from "@/components/Auth0Provider";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Predict from "./pages/Predict";
import Explorer from "@/pages/Explorer";
import Visualizations from "@/pages/Visualizations";
import SegmentProfiles from "@/pages/SegmentProfiles";
import Pipeline from "@/pages/Pipeline";
import DataUpload from "@/pages/DataUpload";
import ReportViewer from "@/pages/ReportViewer";
import BulkPredict from "@/pages/BulkPredict";
import SegmentMigrations from "@/pages/SegmentMigrations";
import CampaignActionBoard from "@/pages/CampaignActionBoard";

function AppRoutes() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/predict" component={Predict} />
        <Route path="/explorer" component={Explorer} />
        <Route path="/visualizations" component={Visualizations} />
        <Route path="/segments" component={SegmentProfiles} />
        <Route path="/pipeline" component={Pipeline} />
        <Route path="/upload" component={DataUpload} />
        <Route path="/report" component={ReportViewer} />
        <Route path="/bulk-predict" component={BulkPredict} />
        <Route path="/migrations" component={SegmentMigrations} />
        <Route path="/campaigns" component={CampaignActionBoard} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <Auth0ProviderWrapper>
          <TooltipProvider>
            <Toaster />
            <AppRoutes />
          </TooltipProvider>
        </Auth0ProviderWrapper>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
