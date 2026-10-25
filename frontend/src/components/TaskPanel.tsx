import { CheckCircle, Loader, AlertCircle, Clock } from 'lucide-react';
import type { Task, TaskStep } from '../types';

interface Props {
  tasks: Task[];
}

export default function TaskPanel({ tasks }: Props) {
  return (
    <div className="glass-panel p-4 h-full overflow-y-auto scrollbar-thin">
      <span className="text-xs font-mono text-jarvis-muted tracking-wider">TASK ACTIVITY</span>

      {tasks.length === 0 ? (
        <div className="mt-4 text-center text-jarvis-muted/40 text-xs">
          <Clock size={20} className="mx-auto mb-2 opacity-30" />
          No active tasks
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="bg-white/[0.02] rounded-lg p-3 border border-jarvis-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-jarvis-text">{task.name}</span>
                <StatusBadge status={task.status} />
              </div>
              {task.progress > 0 && task.progress < 100 && (
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-jarvis-cyan rounded-full transition-all duration-500"
                    style={{ width: `${task.progress}%` }} />
                </div>
              )}
              {task.steps.length > 0 && (
                <div className="space-y-1">
                  {task.steps.slice(-3).map(step => (
                    <div key={step.id} className="flex items-center gap-2 text-[10px]">
                      <StepIcon status={step.status} />
                      <span className="text-jarvis-muted">{step.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: 'text-jarvis-cyan bg-jarvis-cyan/10',
    completed: 'text-jarvis-success bg-jarvis-success/10',
    failed: 'text-jarvis-error bg-jarvis-error/10',
    pending: 'text-jarvis-muted bg-white/5',
    cancelled: 'text-jarvis-warning bg-jarvis-warning/10',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${styles[status] || styles.pending}`}>
      {status.toUpperCase()}
    </span>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle size={10} className="text-jarvis-success" />;
  if (status === 'running') return <Loader size={10} className="text-jarvis-cyan animate-spin" />;
  if (status === 'failed') return <AlertCircle size={10} className="text-jarvis-error" />;
  return <Clock size={10} className="text-jarvis-muted/40" />;
}

