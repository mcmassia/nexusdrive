import React, { useState } from 'react';
import { RefreshCw, Database, AlertCircle, CheckCircle } from 'lucide-react';
import { db } from '../services/db';
import { driveService } from '../services/driveService';

interface SyncSettingsProps {
    lang: 'en' | 'es';
}

const SyncSettings: React.FC<SyncSettingsProps> = ({ lang }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ imported: number; errors: number } | null>(null);

    const handleForceFullSync = async () => {
        if (!confirm(lang === 'es'
            ? '¿Estás seguro? Esto borrará todos los documentos locales y los volverá a importar desde Google Drive.'
            : 'Are you sure? This will delete all local documents and re-import them from Google Drive.'
        )) {
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            // Step 1: Clear all local objects
            console.log('[SyncSettings] Clearing local objects...');
            await db.clearAllObjects();
            console.log('[SyncSettings] Local objects cleared');

            // Step 2: Perform full sync
            console.log('[SyncSettings] Starting full sync...');
            const syncResult = await driveService.fullSyncFromDrive();
            console.log('[SyncSettings] Full sync complete:', syncResult);

            setResult(syncResult);

            // Reload page after 2 seconds
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('[SyncSettings] Error during full sync:', error);
            alert(lang === 'es'
                ? `Error durante la sincronización: ${error instanceof Error ? error.message : 'Error desconocido'}`
                : `Error during sync: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">
                {lang === 'es' ? 'Sincronización con Google Drive' : 'Google Drive Sync'}
            </h2>

            {/* Force Full Sync Section */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                        <RefreshCw className="text-blue-600 dark:text-blue-400" size={24} />
                    </div>

                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
                            {lang === 'es' ? 'Forzar Sincronización Completa' : 'Force Full Sync'}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            {lang === 'es'
                                ? 'Importa TODOS los documentos desde Google Drive, sobrescribiendo los datos locales. Útil si faltan documentos o hay inconsistencias.'
                                : 'Imports ALL documents from Google Drive, overwriting local data. Useful if documents are missing or there are inconsistencies.'
                            }
                        </p>

                        <button
                            onClick={handleForceFullSync}
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                            {loading
                                ? (lang === 'es' ? 'Sincronizando...' : 'Syncing...')
                                : (lang === 'es' ? 'Iniciar Full Sync' : 'Start Full Sync')
                            }
                        </button>
                    </div>
                </div>

                {/* Progress */}
                {loading && (
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3">
                            <RefreshCw size={20} className="text-blue-600 dark:text-blue-400 animate-spin" />
                            <span className="text-sm text-blue-800 dark:text-blue-200">
                                {lang === 'es'
                                    ? 'Importando documentos desde Drive... Esto puede tomar varios minutos.'
                                    : 'Importing documents from Drive... This may take several minutes.'
                                }
                            </span>
                        </div>
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className={`mt-4 p-4 rounded-lg border ${result.errors === 0
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        }`}>
                        <div className="flex items-start gap-3">
                            {result.errors === 0 ? (
                                <CheckCircle size={20} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                            ) : (
                                <AlertCircle size={20} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                            )}
                            <div className="flex-1">
                                <p className={`text-sm font-medium ${result.errors === 0
                                    ? 'text-green-800 dark:text-green-200'
                                    : 'text-yellow-800 dark:text-yellow-200'
                                    }`}>
                                    {lang === 'es'
                                        ? `✅ Sincronización completa: ${result.imported} documentos importados`
                                        : `✅ Sync complete: ${result.imported} documents imported`
                                    }
                                </p>
                                {result.errors > 0 && (
                                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                                        {lang === 'es'
                                            ? `⚠️ ${result.errors} error(es) durante la importación`
                                            : `⚠️ ${result.errors} error(s) during import`
                                        }
                                    </p>
                                )}
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                                    {lang === 'es'
                                        ? 'La página se recargará automáticamente...'
                                        : 'Page will reload automatically...'
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Info Section */}
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                    <Database size={18} />
                    {lang === 'es' ? '¿Cuándo usar Full Sync?' : 'When to use Full Sync?'}
                </h4>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        {lang === 'es'
                            ? 'Faltan documentos que existen en Google Drive'
                            : 'Documents are missing that exist in Google Drive'
                        }
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        {lang === 'es'
                            ? 'Primera instalación en un nuevo dispositivo'
                            : 'First installation on a new device'
                        }
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        {lang === 'es'
                            ? 'Datos locales corruptos o inconsistentes'
                            : 'Local data is corrupted or inconsistent'
                        }
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default SyncSettings;
