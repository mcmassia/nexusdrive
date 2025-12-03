import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { NexusObject } from '../types';
import { Search, X } from 'lucide-react';

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
    const wrapperRef = useRef<HTMLDivElement>(null);

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
        } catch (error) {
            console.error('[UserSelector] Error loading person documents:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredPersons = personDocs.filter(doc =>
        doc.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelect = (doc: NexusObject) => {
        onSelect({
            personDocumentId: doc.id,
            name: doc.title
        });
        setSearchTerm('');
        setIsOpen(false);
    };

    const handleClear = () => {
        onSelect(undefined);
        setSearchTerm('');
    };

    if (loading) {
        return <div className="text-slate-500 dark:text-slate-400">Cargando...</div>;
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
