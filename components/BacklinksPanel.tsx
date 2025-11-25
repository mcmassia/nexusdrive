import React, { useEffect, useState } from 'react';
import { BacklinkContext, TypeSchema } from '../types';
import { db } from '../services/db';
import { ChevronDown } from 'lucide-react';
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
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

    const highlightMention = (text: string): React.ReactNode => {
        // Highlight @mentions in the context text
        const parts = text.split(/(@[^\s]+)/g);
        return parts.map((part, i) => {
            if (part.startsWith('@')) {
                return (
                    <span key={i} className="font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-1 rounded">
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    const toggleGroup = (docId: string) => {
        const newCollapsed = new Set(collapsedGroups);
        if (newCollapsed.has(docId)) {
            newCollapsed.delete(docId);
        } else {
            newCollapsed.add(docId);
        }
        setCollapsedGroups(newCollapsed);
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
                    {backlinks.map((backlink) => {
                        const isCollapsed = collapsedGroups.has(backlink.sourceDocId);
                        return (
                            <div key={backlink.sourceDocId} className="space-y-2.5">
                                {/* Date header with type badge - Clickable to collapse */}
                                <button
                                    onClick={() => toggleGroup(backlink.sourceDocId)}
                                    className="w-full flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
                                >
                                    <div className="flex items-center gap-2">
                                        <ChevronDown
                                            size={14}
                                            className={`text-slate-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                                        />
                                        <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold group-hover:text-slate-800 dark:group-hover:text-slate-300">
                                            {formatDate(backlink.sourceDocDate)}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            ({backlink.mentionContexts.length})
                                        </span>
                                    </div>
                                    <span
                                        className="text-xs font-bold uppercase px-2.5 py-1 rounded-md shadow-sm"
                                        style={{
                                            backgroundColor: getTypeColor(backlink.sourceDocType),
                                            color: 'white'
                                        }}
                                    >
                                        {backlink.sourceDocType}
                                    </span>
                                </button>

                                {/* Mention contexts - Collapsible */}
                                {!isCollapsed && backlink.mentionContexts.map((context, idx) => (
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

                                        {/* Context text with mention highlighting */}
                                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed pl-3.5">
                                            "{highlightMention(context.contextText)}"
                                        </p>
                                    </button>
                                ))}
                            </div>
                        );
                    })}
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

