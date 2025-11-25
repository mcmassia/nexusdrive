import React, { useEffect, useState } from 'react';
import { BacklinkContext, TypeSchema } from '../types';
import { db } from '../services/db';
import { TRANSLATIONS } from '../constants';

interface BacklinksPanelProps {
    targetDocId: string;
    onNavigate: (docId: string) => void;
    lang: 'en' | 'es';
}

const BacklinksPanel: React.FC<BacklinksPanelProps> = ({ targetDocId, onNavigate, lang }) => {
    const [backlinks, setBacklinks] = useState<BacklinkContext[]>([]);
    const [typeSchemas, setTypeSchemas] = useState<TypeSchema[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const t = TRANSLATIONS[lang];

    useEffect(() => {
        loadBacklinks();
    }, [targetDocId]);

    const loadBacklinks = async () => {
        setIsLoading(true);
        try {
            const [links, schemas] = await Promise.all([
                db.getBacklinksWithContext(targetDocId),
                db.getAllTypeSchemas()
            ]);
            setBacklinks(links);
            setTypeSchemas(schemas);
        } catch (error) {
            console.error('Error loading backlinks:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getTypeColor = (type: string): string => {
        const schema = typeSchemas.find(s => s.type === type);
        return schema?.color || '#3b82f6';
    };

    const formatDate = (date: Date): string => {
        return new Date(date).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const highlightMention = (text: string, docTitle: string): React.ReactNode => {
        // Simple highlight - could be enhanced with more sophisticated parsing
        const parts = text.split(new RegExp(`(@${docTitle})`, 'gi'));
        return parts.map((part, i) =>
            part.toLowerCase() === `@${docTitle.toLowerCase()}` ? (
                <span key={i} className="font-semibold text-blue-600 dark:text-blue-400">
                    {part}
                </span>
            ) : (
                part
            )
        );
    };

    const totalMentions = backlinks.reduce((sum, b) => sum + b.mentionContexts.length, 0);

    if (isLoading) {
        return (
            <div className="w-64 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 overflow-y-auto hidden lg:block transition-colors no-scrollbar">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                    {t.linkedRefs}
                </h3>
                <p className="text-sm text-slate-400 italic">Loading...</p>
            </div>
        );
    }

    return (
        <div className="w-64 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 overflow-y-auto hidden lg:block transition-colors no-scrollbar">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                {t.linkedRefs} ({totalMentions})
            </h3>

            {backlinks.length > 0 ? (
                <div className="space-y-4">
                    {backlinks.map((backlink) => (
                        <div key={backlink.sourceDocId} className="space-y-2">
                            {/* Date header */}
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                    {formatDate(backlink.sourceDocDate)}
                                </span>
                                <span
                                    className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                                    style={{
                                        backgroundColor: getTypeColor(backlink.sourceDocType),
                                        color: 'white'
                                    }}
                                >
                                    {backlink.sourceDocType}
                                </span>
                            </div>

                            {/* Mention contexts */}
                            {backlink.mentionContexts.map((context, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onNavigate(backlink.sourceDocId)}
                                    className="w-full text-left p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 transition-all group"
                                >
                                    {/* Source title */}
                                    <div className="text-xs font-medium text-blue-600 dark:text-blue-400 group-hover:underline mb-1">
                                        {backlink.sourceDocTitle}
                                    </div>

                                    {/* Context text */}
                                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                        {context.contextText}
                                    </p>
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-slate-400 italic">{t.noBacklinks}</p>
            )}
        </div>
    );
};

export default BacklinksPanel;
