import { Zap } from 'lucide-react';

export default function AutomationPanel() {
  return (
    <div className="space-y-4">
      <div className="glass-panel p-6 text-center">
        <Zap size={28} className="mx-auto mb-3 text-jarvis-cyan/30" />
        <h3 className="text-sm font-medium text-jarvis-text mb-2">Scheduled automation is not available yet</h3>
        <p className="text-xs text-jarvis-muted/60 max-w-md mx-auto leading-relaxed">
          This screen does not currently create or run automated workflows. JARVIS will not schedule actions or launch tools in the background.
        </p>
      </div>
    </div>
  );
}
