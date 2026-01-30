import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/auth';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Overview from './pages/Overview';
import Subscription from './pages/Subscription';
import WhatsappConnection from './pages/WhatsappConnection';
import Integrations from './pages/Integrations';
import CustomerApi from './pages/CustomerApi';
import Webhooks from './pages/Webhooks';
import Logs from './pages/Logs';
import Audit from './pages/Audit';
import Team from './pages/Team';
import SettingsPage from './pages/SettingsPage';
import AdminBilling from './pages/AdminBilling';
import AdminWhatsapp from './pages/AdminWhatsapp';
import AdminPlans from './pages/AdminPlans';
import Checkout from './pages/Checkout';
import LlmProviders from './pages/LlmProviders';
import AgentSettings from './pages/AgentSettings';
import AdminViewProfiles from './pages/AdminViewProfiles';
import Credits from './pages/Credits';
import AdminCredits from './pages/AdminCredits';
import AdminLlmProviders from './pages/AdminLlmProviders';
import AdminPaymentGateways from './pages/AdminPaymentGateways';
import SetupWizard from './pages/SetupWizard';
import KnowledgeBase from './pages/KnowledgeBase';
import TelegramConnection from './pages/TelegramConnection';
import ConversationLog from './pages/ConversationLog';
import WebchatConfig from './pages/WebchatConfig';

// Layout
import AppLayout from './components/AppLayout';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

export default function App() {
  const { isAuthenticated, user, refreshUser, token } = useAuthStore();

  // Restore user data on mount (token persists but user/tenant don't)
  useEffect(() => {
    if (isAuthenticated && token && !user) {
      refreshUser().catch(() => {
        // Token expired - force logout
        useAuthStore.getState().logout();
      });
    }
  }, [isAuthenticated, token, user]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="whatsapp" element={<WhatsappConnection />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="customer-api" element={<CustomerApi />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="logs" element={<Logs />} />
        <Route path="audit" element={<Audit />} />
        <Route path="team" element={<Team />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin/billing" element={<AdminBilling />} />
        <Route path="admin/whatsapp" element={<AdminWhatsapp />} />
        <Route path="admin/plans" element={<AdminPlans />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="agent" element={<AgentSettings />} />
        <Route path="llm-providers" element={<LlmProviders />} />
        <Route path="admin/view-profiles" element={<AdminViewProfiles />} />
        <Route path="credits" element={<Credits />} />
        <Route path="admin/credits" element={<AdminCredits />} />
        <Route path="admin/llm-providers" element={<AdminLlmProviders />} />
        <Route path="admin/payment-gateways" element={<AdminPaymentGateways />} />
        <Route path="setup" element={<SetupWizard />} />
        <Route path="knowledge-base" element={<KnowledgeBase />} />
        <Route path="conversations" element={<ConversationLog />} />
        <Route path="telegram" element={<TelegramConnection />} />
        <Route path="webchat" element={<WebchatConfig />} />
      </Route>
    </Routes>
  );
}
