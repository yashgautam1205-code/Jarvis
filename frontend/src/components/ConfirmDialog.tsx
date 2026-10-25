import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="glass-panel-bright p-6 max-w-md w-full mx-4"
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-jarvis-warning/10 rounded-lg">
                <AlertTriangle size={20} className="text-jarvis-warning" />
              </div>
              <h3 className="text-base font-semibold text-jarvis-text">{title}</h3>
            </div>
            <p className="text-sm text-jarvis-muted mb-6 leading-relaxed">{message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={onCancel} className="btn-ghost text-sm">Cancel</button>
              <button onClick={onConfirm} className="btn-danger text-sm">Confirm</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

