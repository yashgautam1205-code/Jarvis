import { motion } from 'framer-motion';

interface Props {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  unit?: string;
}

export default function GaugeRing({ value, max = 100, size = 80, strokeWidth = 4, color = '#00E5FF', label, unit = '%' }: Props) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / max, 0), 1);
  const offset = circumference * (1 - pct);

  const getColor = () => {
    if (value > 90) return '#FF3D3D';
    if (value > 70) return '#FFB800';
    return color;
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth}
          />
          {/* Value ring */}
          <motion.circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={getColor()} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${getColor()}44)` }}
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-mono font-medium" style={{ color: getColor() }}>
            {Math.round(value)}<span className="text-[9px] opacity-60">{unit}</span>
          </span>
        </div>
      </div>
      {label && <span className="text-[10px] text-jarvis-muted">{label}</span>}
    </div>
  );
}

