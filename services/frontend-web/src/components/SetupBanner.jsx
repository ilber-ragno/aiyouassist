import { useNavigate } from 'react-router-dom';
import { CheckCircle, Circle, Rocket, ArrowRight } from 'lucide-react';
import useSetupStatus from '../hooks/useSetupStatus';

const STEP_KEYS = ['company', 'whatsapp', 'agent', 'test'];

export default function SetupBanner() {
  const navigate = useNavigate();
  const { data, isLoading } = useSetupStatus();

  if (isLoading || !data || data.all_complete) return null;

  const firstIncomplete = STEP_KEYS.findIndex(k => !data.steps[k].complete);
  const stepParam = firstIncomplete >= 0 ? firstIncomplete + 1 : 1;
  const pct = Math.round((data.completed / data.total) * 100);

  return (
    <div className="card border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
          <Rocket className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Configure seu AiYou Assist</h3>
          <p className="text-sm text-gray-500">Complete os passos abaixo para usar o sistema</p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex flex-wrap gap-3 mb-4">
        {STEP_KEYS.map((key) => {
          const step = data.steps[key];
          return (
            <div
              key={key}
              className={`flex items-center gap-1.5 text-sm font-medium ${
                step.complete ? 'text-emerald-600' : 'text-gray-400'
              }`}
            >
              {step.complete ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-600">{data.completed}/{data.total}</span>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate(`/setup?step=${stepParam}`)}
        className="btn-primary inline-flex items-center gap-2"
      >
        Continuar Configuração
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
