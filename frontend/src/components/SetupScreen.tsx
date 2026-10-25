import { ArrowRight, Sparkles } from 'lucide-react';

interface Props {
  onSkip: () => void;
}

export default function SetupScreen({ onSkip }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-jarvis-bg p-8">
      <div className="glass-panel-bright p-8 max-w-lg w-full text-center">
        <div className="w-16 h-16 mx-auto mb-6 bg-jarvis-cyan/10 rounded-full flex items-center justify-center border border-jarvis-cyan/30">
          <Sparkles size={28} className="text-jarvis-cyan" />
        </div>
        <h1 className="text-2xl font-semibold text-jarvis-text mb-2">Welcome to J.A.R.V.I.S.</h1>
        <p className="text-sm text-jarvis-muted mb-6">
          Your assistant runs AI locally with Ollama. No developer account or API key is required.
        </p>

        <div className="text-left bg-black/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-jarvis-cyan" />
            <span className="text-xs font-mono text-jarvis-muted">Local AI setup</span>
          </div>
          <ol className="text-xs text-jarvis-muted space-y-2 ml-4 list-decimal">
            <li>Install Ollama from <a className="text-jarvis-cyan underline" href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a> if it is not already installed.</li>
            <li>Start Ollama. JARVIS will detect it and report whether its configured model is available.</li>
            <li>Download the model from Settings. Model downloads happen directly through your local Ollama installation.</li>
          </ol>
        </div>

        <button onClick={onSkip} className="btn-primary w-full flex items-center justify-center gap-2">
          Continue to JARVIS Settings <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
