
import React, { useEffect } from 'react';
import { AppNotification } from '../../types';

interface NotificationToastProps {
  notification: AppNotification;
  onClose: (id: string) => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ notification, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => onClose(notification.id), 5000);
    return () => clearTimeout(timer);
  }, [notification, onClose]);

  const colors = {
    info: 'bg-blue-600',
    success: 'bg-emerald-600',
    warning: 'bg-amber-500',
    error: 'bg-rose-600'
  };

  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '🚨'
  };

  return (
    <div className={`${colors[notification.type]} text-white p-4 rounded-2xl shadow-2xl flex items-center space-x-4 space-x-reverse min-w-[300px] animate-slide-in-right transform transition-all`}>
      <span className="text-2xl">{icons[notification.type]}</span>
      <div className="flex-1">
        <h4 className="font-black text-sm">{notification.title}</h4>
        <p className="text-xs opacity-90">{notification.message}</p>
      </div>
      <button onClick={() => onClose(notification.id)} className="p-1 hover:bg-white/20 rounded-lg">
        ✕
      </button>
    </div>
  );
};

export default NotificationToast;
