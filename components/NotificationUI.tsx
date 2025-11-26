import React from 'react';
import { useNotification, Notification, NotificationType } from './NotificationContext';
import { X, Info, CheckCircle, AlertTriangle, AlertOctagon, HelpCircle } from 'lucide-react';

const NotificationItem: React.FC<{ notification: Notification; onRemove: (id: string) => void }> = ({ notification, onRemove }) => {
    const icons: Record<NotificationType, React.ReactNode> = {
        info: <Info size={20} className="text-blue-500" />,
        success: <CheckCircle size={20} className="text-green-500" />,
        warning: <AlertTriangle size={20} className="text-amber-500" />,
        error: <AlertOctagon size={20} className="text-red-500" />,
        question: <HelpCircle size={20} className="text-purple-500" />,
    };

    const bgColors: Record<NotificationType, string> = {
        info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
        success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
        warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
        error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        question: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    };

    return (
        <div
            className={`
        relative w-full max-w-sm p-4 rounded-lg shadow-lg border backdrop-blur-sm
        flex items-start gap-3 transition-all duration-300 animate-in slide-in-from-right-full
        ${bgColors[notification.type]}
      `}
            role="alert"
        >
            <div className="shrink-0 mt-0.5">{icons[notification.type]}</div>
            <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                    {notification.message}
                </h4>
                {notification.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {notification.description}
                    </p>
                )}
                {notification.action && (
                    <button
                        onClick={() => {
                            notification.action?.onClick();
                            onRemove(notification.id);
                        }}
                        className="mt-2 text-xs font-medium px-3 py-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                    >
                        {notification.action.label}
                    </button>
                )}
            </div>
            <button
                onClick={() => onRemove(notification.id)}
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
                <X size={16} />
            </button>
        </div>
    );
};

export const NotificationUI: React.FC = () => {
    const { notifications, removeNotification } = useNotification();

    if (notifications.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none">
            <div className="pointer-events-auto flex flex-col gap-3">
                {notifications.map((notification) => (
                    <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onRemove={removeNotification}
                    />
                ))}
            </div>
        </div>
    );
};
