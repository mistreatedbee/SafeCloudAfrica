import React, { useEffect, useState, useRef, type ComponentType } from 'react';
import {
  BellIcon,
  XIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
  AlertCircleIcon } from
'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
type NotificationType = 'warning' | 'critical' | 'success' | 'info';
export type NotificationItem = {
  id: string | number;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
};
const iconMap: Record<
  NotificationType,
  ComponentType<{
    className?: string;
  }>> =
{
  warning: AlertTriangleIcon,
  critical: AlertCircleIcon,
  success: CheckCircleIcon,
  info: InfoIcon
};
const iconColorMap: Record<NotificationType, string> = {
  warning: 'text-warning',
  critical: 'text-critical',
  success: 'text-success',
  info: 'text-teal'
};
export function NotificationBell({ items = [] }: { items?: NotificationItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const unreadCount = items.filter((n) => !n.read).length;
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node))
      {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-charcoal-500 hover:bg-surface-200 hover:text-charcoal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}>

        <BellIcon className="w-5 h-5" />
        {unreadCount > 0 &&
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-critical rounded-full">
            {unreadCount}
          </span>
        }
      </button>

      <AnimatePresence>
        {isOpen &&
        <motion.div
          initial={{
            opacity: 0,
            y: -10,
            scale: 0.95
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1
          }}
          exit={{
            opacity: 0,
            y: -10,
            scale: 0.95
          }}
          transition={{
            duration: 0.15
          }}
          className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-elevated border border-surface-300 overflow-hidden z-50">

            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
              <h3 className="font-semibold text-charcoal">Notifications</h3>
              <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-surface-100 text-charcoal-400">

                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-charcoal-500">No notifications yet.</p>
                </div>
              )}
              {items.map((notification) => {
              const IconComponent =
              iconMap[notification.type as NotificationType];
              const iconColor =
              iconColorMap[notification.type as NotificationType];
              return (
                <div
                  key={notification.id}
                  className={`px-4 py-3 border-b border-surface-100 last:border-0 hover:bg-surface-50 cursor-pointer ${!notification.read ? 'bg-teal-50/30' : ''}`}>

                    <div className="flex gap-3">
                      <div className={`flex-shrink-0 mt-0.5 ${iconColor}`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal">
                          {notification.title}
                        </p>
                        <p className="text-sm text-charcoal-500 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-xs text-charcoal-400 mt-1">
                          {notification.time}
                        </p>
                      </div>
                      {!notification.read &&
                    <div className="flex-shrink-0">
                          <div className="w-2 h-2 bg-teal rounded-full" />
                        </div>
                    }
                    </div>
                  </div>);

            })}
            </div>

            <div className="px-4 py-3 border-t border-surface-200 bg-surface-50">
              <button className="w-full text-sm font-medium text-teal hover:text-teal-700 transition-colors">
                View all notifications
              </button>
            </div>
          </motion.div>
        }
      </AnimatePresence>
    </div>);

}