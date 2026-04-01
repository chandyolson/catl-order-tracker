import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import VoiceMemos from "./pages/VoiceMemos";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import NewOrder from "./pages/NewOrder";
import EditOrder from "./pages/EditOrder";
import EquipmentMatch from "./pages/EquipmentMatch";
import Estimates from "./pages/Estimates";
import ConvertEstimate from "./pages/ConvertEstimate";
import EstimateDetail from "./pages/EstimateDetail";
import Paperwork from "./pages/Paperwork";
import Production from "./pages/Production";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import InventoryPage from "./pages/Inventory";
import Documents from "./pages/Documents";
import Settings from "./pages/Settings";
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
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/voice-memos" element={<VoiceMemos />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/new" element={<NewOrder />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/orders/:id/edit" element={<EditOrder />} />
            <Route path="/orders/:id/match" element={<EquipmentMatch />} />
            <Route path="/estimates" element={<Estimates />} />
            <Route path="/estimates/:id" element={<EstimateDetail />} />
            <Route path="/estimates/:id/convert" element={<ConvertEstimate />} />
            <Route path="/paperwork" element={<Paperwork />} />
            <Route path="/production" element={<Production />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
