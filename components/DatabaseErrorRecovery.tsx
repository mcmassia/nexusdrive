import React from 'react';
import { AlertCircle, RefreshCw, Database } from 'lucide-react';

export function DatabaseErrorRecovery() {
    const handleReset = async () => {
        try {
            console.log('[DBRecovery] Starting database reset...');

            // Delete all IndexedDB databases
            const databases = await indexedDB.databases();
            for (const database of databases) {
                if (database.name) {
                    indexedDB.deleteDatabase(database.name);
                    console.log('[DBRecovery] Deleted database:', database.name);
                }
            }

            // Clear the error flag
            localStorage.removeItem('nexus_db_error');

            // Clear other localStorage items that might cause issues
            const keysToKeep = ['nexus_auth_token', 'nexus_demo_mode'];
            const allKeys = Object.keys(localStorage);
            allKeys.forEach(key => {
                if (!keysToKeep.includes(key)) {
                    localStorage.removeItem(key);
                }
            });

            console.log('[DBRecovery] Reset complete. Reloading...');

            // Reload the page
            window.location.reload();
        } catch (err) {
            console.error('[DBRecovery] Error during reset:', err);
            alert('Error al resetear. Intenta: \n1. Cerrar todas las pestañas de la app\n2. Abrir DevTools (F12)\n3. Application → Storage → Clear site data\n4. Recargar');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
            <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-8">
                <div className="flex items-center justify-center w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full mx-auto mb-6">
                    <Database className="text-amber-600 dark:text-amber-400" size={32} />
                </div>

                <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-3">
                    ⚠️ Base de Datos Desactualizada
                </h1>

                <p className="text-slate-600 dark:text-slate-400 text-center mb-6">
                    Tu aplicación necesita actualizar su base de datos a una nueva versión.
                    Este proceso es seguro y no afectará tus documentos en Google Drive.
                </p>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={20} />
                        <div className="text-sm text-blue-800 dark:text-blue-200">
                            <p className="font-medium mb-1">¿Qué se va a resetear?</p>
                            <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-300">
                                <li>Base de datos local (IndexedDB)</li>
                                <li>Configuraciones locales</li>
                                <li>Caché de la aplicación</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" size={20} />
                        <div className="text-sm text-green-800 dark:text-green-200">
                            <p className="font-medium mb-1">¿Qué NO se va a perder?</p>
                            <ul className="list-disc list-inside space-y-1 text-green-700 dark:text-green-300">
                                <li>Tus documentos en Google Drive</li>
                                <li>Tu sesión de Google</li>
                                <li>Tus datos sincronizados</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition-colors text-lg shadow-lg"
                >
                    <RefreshCw size={24} />
                    Resetear y Continuar
                </button>

                <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
                    La aplicación se recargará automáticamente después del reset
                </p>
            </div>
        </div>
    );
}
