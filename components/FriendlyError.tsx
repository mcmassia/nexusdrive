import React from 'react';
import { AlertCircle, RefreshCw, Trash2, X } from 'lucide-react';

export type ErrorType =
    | 'indexeddb_migration'
    | 'indexeddb_quota'
    | 'network_error'
    | 'auth_expired'
    | 'unknown';

interface FriendlyErrorProps {
    error: Error;
    onDismiss: () => void;
    lang?: 'en' | 'es';
}

interface ErrorInfo {
    type: ErrorType;
    title: string;
    description: string;
    solutions: string[];
    severity: 'error' | 'warning' | 'info';
}

export function FriendlyError({ error, onDismiss, lang = 'es' }: FriendlyErrorProps) {
    const errorInfo = detectErrorType(error, lang);

    const icons = {
        error: AlertCircle,
        warning: AlertCircle,
        info: AlertCircle,
    };

    const Icon = icons[errorInfo.severity];

    const bgColors = {
        error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
        info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    };

    const textColors = {
        error: 'text-red-800 dark:text-red-200',
        warning: 'text-amber-800 dark:text-amber-200',
        info: 'text-blue-800 dark:text-blue-200',
    };

    const iconColors = {
        error: 'text-red-600 dark:text-red-400',
        warning: 'text-amber-600 dark:text-amber-400',
        info: 'text-blue-600 dark:text-blue-400',
    };

    return (
        <div className={`fixed top-4 right-4 max-w-md border rounded-lg shadow-lg p-4 z-50 animate-in slide-in-from-top-5 ${bgColors[errorInfo.severity]}`}>
            <div className="flex items-start gap-3">
                <Icon className={`flex-shrink-0 ${iconColors[errorInfo.severity]}`} size={24} />

                <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold mb-1 ${textColors[errorInfo.severity]}`}>
                        {errorInfo.title}
                    </h3>

                    <p className={`text-sm mb-3 ${textColors[errorInfo.severity]}`}>
                        {errorInfo.description}
                    </p>

                    {errorInfo.solutions.length > 0 && (
                        <div className={`text-sm ${textColors[errorInfo.severity]}`}>
                            <p className="font-medium mb-2">
                                {lang === 'es' ? '💡 Soluciones:' : '💡 Solutions:'}
                            </p>
                            <ol className="list-decimal list-inside space-y-1 ml-2">
                                {errorInfo.solutions.map((solution, idx) => (
                                    <li key={idx}>{solution}</li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {errorInfo.type === 'indexeddb_migration' && (
                        <button
                            onClick={() => {
                                window.location.reload();
                            }}
                            className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                        >
                            <RefreshCw size={16} />
                            {lang === 'es' ? 'Recargar Página' : 'Reload Page'}
                        </button>
                    )}

                    {errorInfo.type === 'indexeddb_quota' && (
                        <button
                            onClick={async () => {
                                if (confirm(lang === 'es'
                                    ? '¿Limpiar todos los datos de la aplicación? Esta acción no se puede deshacer.'
                                    : 'Clear all application data? This action cannot be undone.')) {
                                    // Clear IndexedDB
                                    const databases = await indexedDB.databases();
                                    for (const db of databases) {
                                        if (db.name) {
                                            indexedDB.deleteDatabase(db.name);
                                        }
                                    }
                                    // Clear localStorage
                                    localStorage.clear();
                                    // Reload
                                    window.location.reload();
                                }
                            }}
                            className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                        >
                            <Trash2 size={16} />
                            {lang === 'es' ? 'Limpiar Datos' : 'Clear Data'}
                        </button>
                    )}
                </div>

                <button
                    onClick={onDismiss}
                    className={`flex-shrink-0 ${textColors[errorInfo.severity]} hover:opacity-70 transition-opacity`}
                >
                    <X size={20} />
                </button>
            </div>
        </div>
    );
}

function detectErrorType(error: Error, lang: 'en' | 'es'): ErrorInfo {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // IndexedDB Migration Error
    if (message.includes('object store') && message.includes('not found')) {
        return {
            type: 'indexeddb_migration',
            title: lang === 'es' ? '⚠️ Base de Datos Desactualizada' : '⚠️ Outdated Database',
            description: lang === 'es'
                ? 'Tu aplicación necesita actualizar su base de datos a una nueva versión.'
                : 'Your application needs to update its database to a new version.',
            solutions: lang === 'es' ? [
                'Recarga la página con Cmd+Shift+R (Mac) o Ctrl+Shift+R (Windows/Linux)',
                'Si persiste, limpia los datos del sitio en DevTools (F12 → Application → Clear site data)',
            ] : [
                'Reload the page with Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)',
                'If it persists, clear site data in DevTools (F12 → Application → Clear site data)',
            ],
            severity: 'warning',
        };
    }

    // IndexedDB Quota Exceeded
    if (message.includes('quota') || message.includes('exceeded')) {
        return {
            type: 'indexeddb_quota',
            title: lang === 'es' ? '💾 Almacenamiento Lleno' : '💾 Storage Full',
            description: lang === 'es'
                ? 'El navegador no tiene suficiente espacio para almacenar más datos.'
                : 'The browser does not have enough space to store more data.',
            solutions: lang === 'es' ? [
                'Libera espacio eliminando documentos antiguos',
                'Limpia la caché del navegador',
                'Aumenta el límite de almacenamiento en configuración del navegador',
            ] : [
                'Free up space by deleting old documents',
                'Clear browser cache',
                'Increase storage limit in browser settings',
            ],
            severity: 'error',
        };
    }

    // Network Error
    if (message.includes('network') || message.includes('fetch') || message.includes('cors')) {
        return {
            type: 'network_error',
            title: lang === 'es' ? '🌐 Error de Conexión' : '🌐 Connection Error',
            description: lang === 'es'
                ? 'No se pudo conectar con el servidor. Verifica tu conexión a internet.'
                : 'Could not connect to the server. Check your internet connection.',
            solutions: lang === 'es' ? [
                'Verifica tu conexión a internet',
                'Recarga la página',
                'Si usas VPN, intenta desactivarla',
            ] : [
                'Check your internet connection',
                'Reload the page',
                'If using VPN, try disabling it',
            ],
            severity: 'error',
        };
    }

    // Auth Expired
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('401')) {
        return {
            type: 'auth_expired',
            title: lang === 'es' ? '🔐 Sesión Expirada' : '🔐 Session Expired',
            description: lang === 'es'
                ? 'Tu sesión ha expirado. Por favor, vuelve a iniciar sesión.'
                : 'Your session has expired. Please sign in again.',
            solutions: lang === 'es' ? [
                'Haz clic en el botón de Google para volver a autenticarte',
                'Si el problema persiste, cierra sesión y vuelve a entrar',
            ] : [
                'Click the Google button to re-authenticate',
                'If the problem persists, sign out and sign in again',
            ],
            severity: 'warning',
        };
    }

    // Unknown Error
    return {
        type: 'unknown',
        title: lang === 'es' ? '❌ Error Inesperado' : '❌ Unexpected Error',
        description: lang === 'es'
            ? `Se produjo un error: ${error.message}`
            : `An error occurred: ${error.message}`,
        solutions: lang === 'es' ? [
            'Recarga la página',
            'Si el problema persiste, abre la consola (F12) y reporta el error',
            'Intenta limpiar la caché del navegador',
        ] : [
            'Reload the page',
            'If the problem persists, open console (F12) and report the error',
            'Try clearing browser cache',
        ],
        severity: 'error',
    };
}
