import { motion } from 'framer-motion';
import type { AIState } from '../types';

interface AICoreProps {
  state: AIState;
  size?: number;
}

const stateConfig: Record<AIState, { color: string; speed: number; label: string; scale: number }> = {
  idle:      { color: '#00E5FF', speed: 1,    label: 'STANDING BY',   scale: 1 },
  listening: { color: '#00E5FF', speed: 0.5,  label: 'LISTENING',     scale: 1.05 },
  thinking:  { color: '#62BFFF', speed: 0.3,  label: 'PROCESSING',    scale: 1.02 },
  speaking:  { color: '#00E5FF', speed: 0.6,  label: 'RESPONDING',    scale: 1.08 },
  executing: { color: '#FFB800', speed: 0.4,  label: 'EXECUTING',     scale: 1.03 },
  error:     { color: '#FF3D3D', speed: 2,    label: 'ERROR',         scale: 0.98 },
};

export default function AICore({ state, size = 240 }: AICoreProps) {
  const cfg = stateConfig[state];
  const r = size / 2;

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-full blur-3xl opacity-20"
          style={{ background: `radial-gradient(circle, ${cfg.color}, transparent 70%)` }}
        />

        {/* Ring 4 — outermost dashed */}
        <motion.svg
          className="absolute inset-0"
          viewBox={`0 0 ${size} ${size}`}
          animate={{ rotate: 360 }}
          transition={{ duration: 30 / cfg.speed, repeat: Infinity, ease: 'linear' }}
        >
          <circle
            cx={r} cy={r} r={r - 8}
            fill="none" stroke={cfg.color} strokeWidth="0.5"
            strokeDasharray="8 12" opacity="0.3"
          />
        </motion.svg>

        {/* Ring 3 */}
        <motion.svg
          className="absolute inset-0"
          viewBox={`0 0 ${size} ${size}`}
          animate={{ rotate: -360 }}
          transition={{ duration: 20 / cfg.speed, repeat: Infinity, ease: 'linear' }}
        >
          <circle
            cx={r} cy={r} r={r - 24}
            fill="none" stroke={cfg.color} strokeWidth="1"
            strokeDasharray="30 20" opacity="0.4"
          />
        </motion.svg>

        {/* Ring 2 — solid pulsing */}
        <motion.svg
          className="absolute inset-0"
          viewBox={`0 0 ${size} ${size}`}
          animate={{ rotate: 360, scale: [1, 1.02, 1] }}
          transition={{
            rotate: { duration: 15 / cfg.speed, repeat: Infinity, ease: 'linear' },
            scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          <circle
            cx={r} cy={r} r={r - 40}
            fill="none" stroke={cfg.color} strokeWidth="1.5"
            opacity="0.5"
          />
        </motion.svg>

        {/* Ring 1 — inner bright */}
        <motion.svg
          className="absolute inset-0"
          viewBox={`0 0 ${size} ${size}`}
          animate={{ rotate: -360 }}
          transition={{ duration: 12 / cfg.speed, repeat: Infinity, ease: 'linear' }}
        >
          <circle
            cx={r} cy={r} r={r - 56}
            fill="none" stroke={cfg.color} strokeWidth="2"
            strokeDasharray="4 8" opacity="0.6"
          />
        </motion.svg>

        {/* Core sphere */}
        <motion.div
          className="absolute rounded-full"
          style={{
            top: '50%', left: '50%',
            width: size * 0.35, height: size * 0.35,
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle at 40% 35%, ${cfg.color}88, ${cfg.color}22 60%, transparent 80%)`,
            boxShadow: `0 0 40px ${cfg.color}44, 0 0 80px ${cfg.color}22, inset 0 0 30px ${cfg.color}33`,
          }}
          animate={{
            scale: [cfg.scale, cfg.scale * 0.95, cfg.scale],
            opacity: [0.9, 1, 0.9],
          }}
          transition={{ duration: 3 * cfg.speed, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Core center dot */}
        <motion.div
          className="absolute rounded-full"
          style={{
            top: '50%', left: '50%',
            width: size * 0.08, height: size * 0.08,
            transform: 'translate(-50%, -50%)',
            background: cfg.color,
            boxShadow: `0 0 20px ${cfg.color}, 0 0 40px ${cfg.color}88`,
          }}
          animate={{ opacity: [0.8, 1, 0.8], scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Orbiting particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 3, height: 3,
              top: '50%', left: '50%',
              background: cfg.color,
              boxShadow: `0 0 6px ${cfg.color}`,
            }}
            animate={{
              x: [
                Math.cos((i / 6) * Math.PI * 2) * (r - 32),
                Math.cos((i / 6 + 1) * Math.PI * 2) * (r - 32),
              ],
              y: [
                Math.sin((i / 6) * Math.PI * 2) * (r - 32),
                Math.sin((i / 6 + 1) * Math.PI * 2) * (r - 32),
              ],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: (10 + i * 2) / cfg.speed,
              repeat: Infinity,
              ease: 'linear',
              delay: i * 0.5,
            }}
          />
        ))}

        {/* Tick marks */}
        <svg className="absolute inset-0" viewBox={`0 0 ${size} ${size}`}>
          {[...Array(36)].map((_, i) => {
            const angle = (i * 10 * Math.PI) / 180;
            const len = i % 3 === 0 ? 8 : 4;
            const outerR = r - 2;
            return (
              <line
                key={i}
                x1={r + Math.cos(angle) * outerR}
                y1={r + Math.sin(angle) * outerR}
                x2={r + Math.cos(angle) * (outerR - len)}
                y2={r + Math.sin(angle) * (outerR - len)}
                stroke={cfg.color}
                strokeWidth="0.5"
                opacity={i % 3 === 0 ? 0.4 : 0.15}
              />
            );
          })}
        </svg>
      </div>

      {/* State label */}
      <motion.div
        className="mt-4 text-center"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <span
          className="text-[10px] font-mono tracking-[0.3em] font-medium"
          style={{ color: cfg.color }}
        >
          {cfg.label}
        </span>
      </motion.div>
    </div>
  );
}

