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
            <div className="w-96 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-6 overflow-y-auto hidden lg:block transition-colors no-scrollbar">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">
                    {t.linkedRefs}
                </h3>
                <p className="text-sm text-slate-400 italic">Loading...</p>
            </div>
        );
    }

    return (
        <div className="w-96 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-6 overflow-y-auto hidden lg:block transition-colors no-scrollbar">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {t.linkedRefs}
                </h3>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded-full">
                    {totalMentions}
                </span>
            </div>

            {backlinks.length > 0 ? (
                <div className="space-y-5">
                    {backlinks.map((backlink) => (
                        <div key={backlink.sourceDocId} className="space-y-2.5">
                            {/* Date header with type badge */}
                            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                                <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                                    {formatDate(backlink.sourceDocDate)}
                                </span>
                                <span
                                    className="text-xs font-bold uppercase px-2.5 py-1 rounded-md shadow-sm"
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
                                    className="w-full text-left p-3.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all group"
                                >
                                    {/* Source title */}
                                    <div className="flex items-start gap-2 mb-2">
                                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: getTypeColor(backlink.sourceDocType) }}></div>
                                        <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 group-hover:underline leading-snug">
                                            {backlink.sourceDocTitle}
                                        </div>
                                    </div>

                                    {/* Context text with better readability */}
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed pl-3.5">
                                        "{context.contextText}"
                                    </p>
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12">
                    <p className="text-sm text-slate-400 italic">{t.noBacklinks}</p>
                </div>
            )}
        </div>
    );
};

export default BacklinksPanel;

