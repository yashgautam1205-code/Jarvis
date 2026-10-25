import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Zap, Brain,
  Monitor, Settings, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
  { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard, path: '/' },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare, path: '/conversations' },
  { id: 'automation', label: 'Automation', icon: Zap, path: '/automation' },
  { id: 'memory', label: 'Memory', icon: Brain, path: '/memory' },
  { id: 'system', label: 'System Monitor', icon: Monitor, path: '/system' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className={`flex flex-col border-r border-jarvis-border bg-jarvis-bg/50 backdrop-blur-xl transition-all duration-300 ${collapsed ? 'w-16' : 'w-52'}`}>
      <div className="flex-1 py-4 flex flex-col gap-1 px-2">
        {navItems.map(item => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`nav-item ${active ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="text-sm whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-3 border-t border-jarvis-border text-jarvis-muted hover:text-jarvis-text transition-colors flex justify-center"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </nav>
  );
}

