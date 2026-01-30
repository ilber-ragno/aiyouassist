import { Outlet, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import api from '../lib/api';
import {
  LayoutDashboard,
  CreditCard,
  Smartphone,
  Puzzle,
  Globe,
  Webhook,
  FileText,
  Shield,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  DollarSign,
  Package,
  Bot,
  MessageSquare,
  Coins,
  Eye,
  ChevronDown,
  BookOpen,
  Send,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import Logo, { LogoWhite } from './Logo';

const MENU_REGISTRY = {
  'overview':      { name: 'Visão Geral', href: '/', icon: LayoutDashboard },
  'subscription':  { name: 'Assinatura', href: '/subscription', icon: CreditCard },
  'whatsapp':      { name: 'WhatsApp', href: '/whatsapp', icon: Smartphone },
  'integrations':  { name: 'Integrações', href: '/integrations', icon: Puzzle },
  'customer-api':  { name: 'Customer API', href: '/customer-api', icon: Globe },
  'webhooks':      { name: 'Webhooks', href: '/webhooks', icon: Webhook },
  'logs':          { name: 'Logs', href: '/logs', icon: FileText },
  'audit':         { name: 'Auditoria', href: '/audit', icon: Shield },
  'team':          { name: 'Equipe', href: '/team', icon: Users },
  'agent':         { name: 'Agente IA', href: '/agent', icon: MessageSquare },
  'llm-providers': { name: 'Provedores IA', href: '/llm-providers', icon: Bot },
  'tokens':        { name: 'Créditos', href: '/credits', icon: Coins },
  'conversations': { name: 'Conversas', href: '/conversations', icon: MessageSquare },
  'knowledge-base': { name: 'Base de Conhecimento', href: '/knowledge-base', icon: BookOpen },
  'telegram':      { name: 'Telegram', href: '/telegram', icon: Send },
  'webchat':       { name: 'Webchat', href: '/webchat', icon: Globe },
  'settings':      { name: 'Configurações', href: '/settings', icon: Settings },
};

const adminNavigation = [
  { name: 'Planos', href: '/admin/plans', icon: Package },
  { name: 'Financeiro', href: '/admin/billing', icon: DollarSign },
  { name: 'WhatsApp Admin', href: '/admin/whatsapp', icon: Smartphone },
  { name: 'Perfis de Visão', href: '/admin/view-profiles', icon: Eye },
  { name: 'Créditos Admin', href: '/admin/credits', icon: Coins },
  { name: 'Provedores IA', href: '/admin/llm-providers', icon: Bot },
  { name: 'Gateways Pagamento', href: '/admin/payment-gateways', icon: CreditCard },
];

export default function AppLayout() {
  const { user, tenant, logout } = useAuthStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 animate-slide-in-left">
            <SidebarContent
              user={user}
              tenant={tenant}
              logout={logout}
              location={location}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-72">
        <SidebarContent user={user} tenant={tenant} logout={logout} location={location} />
      </aside>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center h-14 px-4 bg-white/95 backdrop-blur-sm border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="ml-3 flex items-center gap-2">
            <Logo size={28} />
            <span className="text-base font-bold text-gray-900">AiYou</span>
          </div>
        </header>

        {/* Trial banner */}
        {tenant?.status === 'trial' && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200/60 px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <p className="text-sm text-amber-800">
              <strong>Período de teste ativo.</strong>{' '}
              <span className="hidden sm:inline">Escolha um plano para continuar usando.</span>
            </p>
            <Link
              to="/checkout"
              className="text-xs font-semibold text-amber-900 bg-amber-200/80 px-3 py-1.5 rounded-lg hover:bg-amber-300 transition-colors flex-shrink-0"
            >
              Escolher Plano
            </Link>
          </div>
        )}

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function ProfileSwitcher() {
  const { tenant, activeProfileSlug, setActiveProfile } = useAuthStore();
  const profiles = tenant?.available_profiles || [];
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const activeProfile = profiles.find(p => p.slug === activeProfileSlug) || profiles[0];

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (profiles.length <= 1) return null;

  return (
    <div ref={ref} className="relative px-4 mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500 bg-white/60 rounded-lg hover:bg-white/80 border border-gray-200/60 transition-all"
      >
        <span className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" />
          {activeProfile?.name || 'Modo'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-4 right-4 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 animate-scale-in overflow-hidden">
          {profiles.map((p) => (
            <button
              key={p.slug}
              onClick={() => { setActiveProfile(p.slug); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${
                p.slug === activeProfileSlug
                  ? 'bg-primary-50 text-primary-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreditBalanceWidget() {
  const { data } = useQuery({
    queryKey: ['sidebar-credit-balance'],
    queryFn: () => api.get('/credits/balance').then(r => r.data),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (!data) return null;

  const balance = parseFloat(data.balance_brl || 0);
  const isLow = data.low_balance;

  return (
    <Link to="/credits" className="block mx-4 mb-3 group">
      <div className={`px-3.5 py-2.5 rounded-xl text-xs transition-all group-hover:shadow-sm ${
        isLow
          ? 'bg-red-50 border border-red-200/60'
          : 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200/60'
      }`}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-gray-600">
            <Coins className="w-3.5 h-3.5" />
            Créditos
          </span>
          <span className={`font-bold text-sm ${isLow ? 'text-red-700' : 'text-green-700'}`}>
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(balance)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function SidebarContent({ user, tenant, logout, location, onClose }) {
  const { getVisibleMenuItems } = useAuthStore();
  const visibleItems = getVisibleMenuItems();
  const isAdmin = user?.roles?.some(r => r === 'admin' || r.name === 'admin');

  const navigation = visibleItems
    .map(key => MENU_REGISTRY[key])
    .filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-5 bg-gradient-to-r from-primary-600 via-primary-600 to-primary-700 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <LogoWhite size={32} />
          <span className="text-lg font-bold text-white tracking-tight">AiYou Assist</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors lg:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Profile switcher */}
      <div className="pt-3 px-0">
        <ProfileSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = item.href === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={onClose}
              className={`group flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-primary-50 text-primary-700 shadow-sm shadow-primary-100'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-100'
                  : 'bg-gray-100 group-hover:bg-gray-200'
              }`}>
                <item.icon className={`w-[18px] h-[18px] ${isActive ? 'text-primary-600' : 'text-gray-500 group-hover:text-gray-700'}`} />
              </div>
              {item.name}
            </Link>
          );
        })}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className="pt-5 pb-2">
              <div className="flex items-center gap-2 px-3">
                <div className="h-px flex-1 bg-gray-200" />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">
                  Admin
                </p>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            </div>
            {adminNavigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={onClose}
                  className={`group flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 shadow-sm shadow-primary-100'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-100'
                      : 'bg-gray-100 group-hover:bg-gray-200'
                  }`}>
                    <item.icon className={`w-[18px] h-[18px] ${isActive ? 'text-primary-600' : 'text-gray-500 group-hover:text-gray-700'}`} />
                  </div>
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Credit Balance */}
      <CreditBalanceWidget />

      {/* User */}
      <div className="p-4 border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-sm font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{tenant?.name}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
