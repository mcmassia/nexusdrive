import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { NexusObject } from '../types';

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

    useEffect(() => {
        loadPersonDocuments();
    }, []);

    const loadPersonDocuments = async () => {
        try {
            const allDocs = await db.getAllDocuments();
            // Filter documents with type "Persona" or "Person"
            const persons = allDocs.filter(d =>
                d.type.toLowerCase() === 'persona' ||
                d.type.toLowerCase() === 'person'
            );
            setPersonDocs(persons);
        } catch (error) {
            console.error('Error loading person documents:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedId = e.target.value;
        if (!selectedId) {
            onSelect(undefined);
            return;
        }

        const doc = personDocs.find(d => d.id === selectedId);
        if (doc) {
            onSelect({
                personDocumentId: doc.id,
                name: doc.title
            });
        }
    };

    if (loading) {
        return <div className="text-slate-500 dark:text-slate-400">Cargando...</div>;
    }

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                👤 Usuario Actual
            </label>
            <select
                value={currentUser?.personDocumentId || ""}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
                <option value="">-- Ninguno --</option>
                {personDocs.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.title}</option>
                ))}
            </select>
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Configura tu documento de persona para búsquedas como &quot;mis reuniones&quot; o &quot;donde participo&quot;
            </p>
        </div>
    );
}
