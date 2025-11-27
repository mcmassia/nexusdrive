import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'question';

export interface NotificationAction {
    label: string;
    onClick: () => void;
}

export interface Notification {
    id: string;
    type: NotificationType;
    message: string;
    description?: string;
    duration?: number; // in ms, 0 for persistent
    action?: NotificationAction;
}

interface NotificationContextType {
    notifications: Notification[];
    addNotification: (notification: Omit<Notification, 'id'>) => string;
    removeNotification: (id: string) => void;
    clearNotifications: () => void;
    confirm: (options: { message: string; description?: string; confirmLabel?: string; cancelLabel?: string; isDestructive?: boolean }) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [confirmation, setConfirmation] = useState<{
        message: string;
        description?: string;
        confirmLabel?: string;
        cancelLabel?: string;
        isDestructive?: boolean;
        onConfirm: () => void;
        onCancel: () => void;
    } | null>(null);

    const removeNotification = useCallback((id: string) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, []);

    const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newNotification = { ...notification, id };

        setNotifications((prev) => [...prev, newNotification]);

        if (notification.duration !== 0) {
            const duration = notification.duration || 5000; // Default 5s
            setTimeout(() => {
                removeNotification(id);
            }, duration);
        }

        return id;
    }, [removeNotification]);

    const clearNotifications = useCallback(() => {
        setNotifications([]);
    }, []);

    const confirm = useCallback((options: { message: string; description?: string; confirmLabel?: string; cancelLabel?: string; isDestructive?: boolean }): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmation({
                message: options.message,
                description: options.description,
                confirmLabel: options.confirmLabel,
                cancelLabel: options.cancelLabel,
                isDestructive: options.isDestructive !== undefined ? options.isDestructive : true,
                onConfirm: () => {
                    setConfirmation(null);
                    resolve(true);
                },
                onCancel: () => {
                    setConfirmation(null);
                    resolve(false);
                }
            });
        });
    }, []);

    return (
        <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, clearNotifications, confirm }}>
            {children}
            {confirmation && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 m-4 animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                            {confirmation.message}
                        </h3>
                        {confirmation.description && (
                            <p className="text-slate-600 dark:text-slate-300 mb-6">
                                {confirmation.description}
                            </p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={confirmation.onCancel}
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                {confirmation.cancelLabel || 'Cancel'}
                            </button>
                            <button
                                onClick={confirmation.onConfirm}
                                className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-colors ${confirmation.isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                            >
                                {confirmation.confirmLabel || 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </NotificationContext.Provider>
    );
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};
