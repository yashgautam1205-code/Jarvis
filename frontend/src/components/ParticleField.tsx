import { motion } from 'framer-motion';
import { useMemo } from 'react';

export default function ParticleField({ count = 30 }: { count?: number }) {
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 10,
    })),
  [count]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-jarvis-cyan/20"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{
            y: [0, -30, 0, 20, 0],
            x: [0, 15, -10, 5, 0],
            opacity: [0, 0.6, 0.3, 0.7, 0],
          }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

