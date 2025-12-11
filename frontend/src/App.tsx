import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

// Kiosk Pages
import WelcomePage from "./pages/WelcomePage";
import IdentifyPage from "./pages/IdentifyPage";
import AppointmentPage from "./pages/AppointmentPage";
import WalkinPage from "./pages/WalkinPage";
// import ConsentPage from "./pages/ConsentPage";
import ReasonPage from "./pages/ReasonPage";
import PaymentPage from "./pages/PaymentPage";
import DiagnosticsPage from "./pages/DiagnosticsPage";
import DiagnosticsBookingPage from "./pages/DiagnosticsBookingPage";
import TokenPage from "./pages/TokenPage";
import QueuePage from "./pages/QueuePage";
import LabPage from "./pages/LabPage";
import PharmacyPage from "./pages/PharmacyPage";
import HelpPage from "./pages/HelpPage";
import ErrorPage from "./pages/ErrorPage";
import StaffPage from "./pages/StaffPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import WalkinSlotPage from "@/pages/WalkinSlotPage";
import CashPendingPage from "./pages/CashPendingPage";
import FrontDeskCashPage from "./pages/FrontDeskCashPage";

const queryClient = new QueryClient();

/**
 * Scrolls window to top whenever the route (pathname) changes.
 */
function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* Ensure each route change starts at top of the page */}
        <ScrollToTop />
        <Routes>
          {/* Kiosk Routes */}
          <Route path="/" element={<WelcomePage />} />
          <Route path="/start" element={<WelcomePage />} />
          <Route path="/identify" element={<IdentifyPage />} />
          <Route path="/appt" element={<AppointmentPage />} />
          <Route path="/walkin" element={<WalkinPage />} />
          {/* <Route path="/consent" element={<ConsentPage />} /> */}
          <Route path="/reason" element={<ReasonPage />} />
          {/* <Route path="/pay" element={<PaymentPage />} /> */}
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
          <Route
            path="/diagnostics-booking"
            element={<DiagnosticsBookingPage />}
          />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/token" element={<TokenPage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/lab" element={<LabPage />} />
          <Route path="/pharmacy" element={<PharmacyPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/error" element={<ErrorPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/walkin-slot" element={<WalkinSlotPage />} />
          <Route path="/cash-pending" element={<CashPendingPage />} />
          <Route path="/frontdeskcash" element={<FrontDeskCashPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
