import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Equipment from "./pages/Equipment";
import Leads from "./pages/Leads";
import OrderDetail from "./pages/OrderDetail";
import NewOrder from "./pages/NewOrder";
import EditOrder from "./pages/EditOrder";
import EquipmentMatch from "./pages/EquipmentMatch";
import EstimateDetail from "./pages/EstimateDetail";
import ConvertEstimate from "./pages/ConvertEstimate";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Settings from "./pages/Settings";
import Freight from "./pages/Freight";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout>
          <Routes>
            {/* Core pages */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/equipment" element={<Equipment />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/freight" element={<Freight />} />
            <Route path="/settings" element={<Settings />} />

            {/* Order detail routes (unchanged) */}
            <Route path="/orders/new" element={<NewOrder />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/orders/:id/edit" element={<EditOrder />} />
            <Route path="/orders/:id/match" element={<EquipmentMatch />} />

            {/* Estimate detail routes (unchanged) */}
            <Route path="/estimates/:id" element={<EstimateDetail />} />
            <Route path="/estimates/:id/convert" element={<ConvertEstimate />} />

            {/* Redirects — old URLs still work */}
            <Route path="/orders" element={<Navigate to="/equipment" replace />} />
            <Route path="/inventory" element={<Navigate to="/equipment?tab=instock" replace />} />
            <Route path="/production" element={<Navigate to="/equipment" replace />} />
            <Route path="/estimates" element={<Navigate to="/leads" replace />} />
            <Route path="/tasks" element={<Navigate to="/dashboard" replace />} />
            <Route path="/voice-memos" element={<Navigate to="/dashboard" replace />} />
            <Route path="/documents" element={<Navigate to="/dashboard" replace />} />
            <Route path="/paperwork" element={<Navigate to="/dashboard" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
