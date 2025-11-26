import React, { useEffect } from 'react';
import { useNotification } from './NotificationContext';

export const GlobalErrorHandler: React.FC = () => {
    const { addNotification } = useNotification();

    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            event.preventDefault();
            console.error('Global Error Caught:', event.error);
            addNotification({
                type: 'error',
                message: 'An unexpected error occurred',
                description: event.message || 'Something went wrong. Please try refreshing the page.',
                duration: 10000, // Long duration for errors
                action: {
                    label: 'Refresh Page',
                    onClick: () => window.location.reload()
                }
            });
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            event.preventDefault();
            console.error('Unhandled Rejection:', event.reason);
            addNotification({
                type: 'error',
                message: 'Async Operation Failed',
                description: event.reason?.message || 'A background operation failed. Check your connection.',
                duration: 10000,
            });
        };

        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, [addNotification]);

    return null;
};
