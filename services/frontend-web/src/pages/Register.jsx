import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { Mail, Lock, User, Building2, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import Logo, { LogoWhite } from '../components/Logo';
import toast from 'react-hot-toast';

export default function Register() {
  const [formData, setFormData] = useState({
    company_name: '',
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.password_confirmation) {
      toast.error('As senhas não conferem');
      return;
    }
    setLoading(true);
    try {
      await register(formData);
      toast.success('Conta criada com sucesso!');
      navigate('/checkout');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 -translate-x-1/2" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-white/5 rounded-full translate-y-1/3 translate-x-1/3" />

        <div className="relative max-w-md space-y-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20 p-1.5">
            <LogoWhite size={40} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white mb-3">Comece agora</h2>
            <p className="text-primary-100 text-lg leading-relaxed">
              Automatize seu atendimento e escale suas vendas no WhatsApp.
            </p>
          </div>
          <div className="space-y-3 pt-2">
            {[
              'Configuração em menos de 5 minutos',
              'Sem cartão de crédito necessário',
              'IA treinada para seu negócio',
              'Suporte em português',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-primary-100">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-white py-8">
        <div className="w-full max-w-sm space-y-6 animate-fade-in">
          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center mb-4 lg:hidden">
              <Logo size={56} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Crie sua conta</h1>
            <p className="mt-1.5 text-sm text-gray-500">Comece seu trial gratuito</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="input-label">Nome da empresa</label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  name="company_name"
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={handleChange}
                  className="input-field pl-10"
                  placeholder="Sua empresa"
                />
              </div>
            </div>

            <div>
              <label className="input-label">Seu nome</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="input-field pl-10"
                  placeholder="Nome completo"
                />
              </div>
            </div>

            <div>
              <label className="input-label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="input-field pl-10"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="input-label">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    value={formData.password}
                    onChange={handleChange}
                    className="input-field pl-10"
                    placeholder="Min. 8 caracteres"
                  />
                </div>
              </div>
              <div>
                <label className="input-label">Confirmar</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    name="password_confirmation"
                    type="password"
                    required
                    value={formData.password_confirmation}
                    onChange={handleChange}
                    className="input-field pl-10"
                    placeholder="Confirmar senha"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-700 hover:to-primary-800 shadow-md shadow-primary-200 hover:shadow-lg py-3 text-base font-semibold mt-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Criar conta
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Já tem uma conta?{' '}
              <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
                Entrar
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
