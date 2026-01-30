import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import Logo, { LogoWhite } from '../components/Logo';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Login realizado com sucesso!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-white">
        <div className="w-full max-w-sm space-y-8 animate-fade-in">
          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center mb-4">
              <Logo size={56} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Bem-vindo de volta</h1>
            <p className="mt-1.5 text-sm text-gray-500">Entre na sua conta AiYou Assist</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="input-label">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field pl-10"
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="input-label">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-10"
                    placeholder="Sua senha"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-700 hover:to-primary-800 shadow-md shadow-primary-200 hover:shadow-lg hover:shadow-primary-200/50 py-3 text-base font-semibold"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Não tem uma conta?{' '}
              <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-700">
                Cadastre-se
              </Link>
            </p>
          </form>
        </div>
      </div>

      {/* Right - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2" />

        <div className="relative text-center max-w-md space-y-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-3xl backdrop-blur-sm border border-white/20 p-2">
            <LogoWhite size={48} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white mb-3">AiYou Assist</h2>
            <p className="text-primary-100 text-lg leading-relaxed">
              Automatize seu atendimento no WhatsApp com Inteligência Artificial. Conecte em segundos.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { value: '24/7', label: 'Atendimento' },
              { value: '10x', label: 'Mais rápido' },
              { value: '99%', label: 'Satisfação' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/10">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-primary-200 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
