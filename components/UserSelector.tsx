import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { NexusObject } from '../types';
import { Search, X, AlertCircle, RefreshCw } from 'lucide-react';
import { useNotification } from './NotificationContext';

interface UserSelectorProps {
    currentUser?: {
        personDocumentId: string;
        name: string;
    };
    onSelect: (user: { personDocumentId: string; name: string } | undefined) => void;
}

export function UserSelector({ currentUser, onSelect }: UserSelectorProps) {
    const [personDocs, setPersonDocs] = useState<NexusObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { addNotification } = useNotification();

    useEffect(() => {
        loadPersonDocuments();
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadPersonDocuments = async () => {
        try {
            const allDocs = await db.getObjects();
            console.log('[UserSelector] Total docs:', allDocs.length);

            // Filter documents with type "Persona" or "Person"
            const persons = allDocs.filter(d =>
                d.type.toLowerCase() === 'persona' ||
                d.type.toLowerCase() === 'person'
            );

            console.log('[UserSelector] Persona docs found:', persons.length);
            console.log('[UserSelector] Sample persona docs:', persons.slice(0, 3).map(d => ({ id: d.id, title: d.title, type: d.type })));

            setPersonDocs(persons);
            setError(null);
        } catch (err) {
            console.error('[UserSelector] Error loading person documents:', err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    const filteredPersons = personDocs.filter(doc =>
        doc.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelect = async (doc: NexusObject) => {
        try {
            onSelect({
                personDocumentId: doc.id,
                name: doc.title
            });
            setSearchTerm('');
            setIsOpen(false);

            addNotification({
                type: 'success',
                message: '✅ Usuario configurado',
                description: `Ahora puedes usar búsquedas como "mis reuniones"`,
                duration: 3000
            });
        } catch (err) {
            console.error('[UserSelector] Error selecting user:', err);

            if (err instanceof Error && err.message.includes('object store')) {
                addNotification({
                    type: 'error',
                    message: '⚠️ Base de Datos Desactualizada',
                    description: 'Haz clic en "Resetear Base de Datos" abajo',
                    duration: 10000
                });
            }
        }
    };

    const handleClear = () => {
        onSelect(undefined);
        setSearchTerm('');
    };

    const handleResetDatabase = async () => {
        if (!confirm('⚠️ ¿Resetear la base de datos?\n\nEsto eliminará todos los datos locales y recargará la aplicación.\nTus datos en Google Drive NO se eliminarán.\n\n¿Continuar?')) {
            return;
        }

        try {
            // Delete all IndexedDB databases
            const databases = await indexedDB.databases();
            for (const database of databases) {
                if (database.name) {
                    indexedDB.deleteDatabase(database.name);
                    console.log('[UserSelector] Deleted database:', database.name);
                }
            }

            // Clear localStorage
            localStorage.clear();

            // Reload the page
            window.location.reload();
        } catch (err) {
            console.error('[UserSelector] Error resetting database:', err);
            alert('Error al resetear la base de datos. Recarga manualmente (Cmd/Ctrl + Shift + R)');
        }
    };

    if (loading) {
        return <div className="text-slate-500 dark:text-slate-400">Cargando...</div>;
    }

    // Show error with reset option
    if (error && error.message.includes('object store')) {
        return (
            <div className="space-y-3">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
                        <div className="flex-1">
                            <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                                ⚠️ Base de Datos Desactualizada
                            </h4>
                            <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                                Tu base de datos necesita actualizarse. Resetea la base de datos para continuar.
                            </p>
                            <button
                                onClick={handleResetDatabase}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors text-sm font-medium"
                            >
                                <RefreshCw size={16} />
                                Resetear Base de Datos
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2" ref={wrapperRef}>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                👤 Usuario Actual
            </label>

            {currentUser ? (
                <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 rounded-lg text-slate-900 dark:text-slate-100">
                        {currentUser.name}
                    </div>
                    <button
                        onClick={handleClear}
                        className="px-3 py-2 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Limpiar selección"
                    >
                        <X size={18} />
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setIsOpen(true);
                            }}
                            onFocus={() => setIsOpen(true)}
                            placeholder={`Buscar persona... (${personDocs.length} disponibles)`}
                            className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {isOpen && (
                        <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg">
                            {filteredPersons.length > 0 ? (
                                filteredPersons.map(doc => (
                                    <button
                                        key={doc.id}
                                        onClick={() => handleSelect(doc)}
                                        className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition-colors"
                                    >
                                        {doc.title}
                                    </button>
                                ))
                            ) : (
                                <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                    {searchTerm ? 'No se encontraron personas' : 'No hay personas disponibles'}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <p className="text-sm text-slate-500 dark:text-slate-400">
                Configura tu documento de persona para búsquedas como &quot;mis reuniones&quot; o &quot;donde participo&quot;
            </p>

            {!loading && personDocs.length === 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                    ⚠️ No se encontraron documentos de tipo &quot;Persona&quot;. Crea uno primero.
                </p>
            )}
        </div>
    );
}
