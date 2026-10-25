interface Props {
  status: 'online' | 'offline' | 'warning' | 'error';
  label?: string;
}

const colors = {
  online: 'bg-jarvis-success',
  offline: 'bg-jarvis-error',
  warning: 'bg-jarvis-warning',
  error: 'bg-jarvis-error',
};

export default function StatusIndicator({ status, label }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${colors[status]} ${status === 'online' ? 'animate-pulse' : ''}`} />
      {label && <span className="text-[10px] text-jarvis-muted">{label}</span>}
    </div>
  );
}

