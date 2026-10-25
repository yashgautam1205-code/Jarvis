import { AlertTriangle } from 'lucide-react';

export default function DemoModeBanner() {
  return (
    <div className="mx-4 mt-2 px-3 py-2 bg-jarvis-warning/5 border border-jarvis-warning/20 rounded-lg flex items-center gap-2">
      <AlertTriangle size={14} className="text-jarvis-warning flex-shrink-0" />
      <span className="text-[11px] text-jarvis-warning/80">
        <strong>Local AI unavailable</strong> — Install or start Ollama, then download the configured model in Settings. No API key is required.
      </span>
    </div>
  );
}
