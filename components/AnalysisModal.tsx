
import React, { useState, useEffect } from 'react';
import { X, Copy, FilePlus, Loader2, Sparkles, BookOpen, Lightbulb } from 'lucide-react';
import { NexusObject, NexusType } from '../types';
import { geminiService } from '../services/geminiService';
import { db } from '../services/db';

interface AnalysisModalProps {
    object: NexusObject;
    onClose: () => void;
    onNavigate: (obj: NexusObject) => void;
    lang: 'en' | 'es';
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ object, onClose, onNavigate, lang }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [analysisHtml, setAnalysisHtml] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const analyze = async () => {
            setIsLoading(true);
            try {
                // 1. Generate a search query from content
                const query = await geminiService.generateContextQuery(object.content);
                console.log('[Analysis] Generated query:', query);

                // 2. Find related documents
                const candidates = await db.multiSourceSearch(query, 10);

                // Filter out the current document from candidates
                const otherCandidates = candidates.filter(c => c.id !== object.id);

                // 3. Enrich and summarize
                const result = await geminiService.enrichDocument(object.content, otherCandidates, lang);
                setAnalysisHtml(result);
            } catch (err: any) {
                console.error("Analysis failed:", err);
                setError(err.message || "Error during analysis");
            } finally {
                setIsLoading(false);
            }
        };

        if (object && object.content) {
            analyze();
        } else {
            setIsLoading(false);
            setError(lang === 'es' ? 'El documento está vacío.' : 'Document is empty.');
        }
    }, [object, lang]);

    const handleCopy = async () => {
        try {
            // Create a temporary element to extract text
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = analysisHtml;
            const text = tempDiv.textContent || tempDiv.innerText || "";
            await navigator.clipboard.writeText(text);
            alert(lang === 'es' ? 'Copiado al portapapeles' : 'Copied to clipboard');
        } catch (err) {
            console.error('Failed to copy mode', err);
        }
    };

    const handleCreateDoc = async () => {
        const title = lang === 'es' ? `Análisis: ${object.title}` : `Analysis: ${object.title}`;
        const newDoc: NexusObject = {
            id: crypto.randomUUID(),
            title: title,
            type: NexusType.NOTE,
            content: analysisHtml,
            lastModified: new Date(),
            tags: ['ai-analysis', 'summary'],
            metadata: [],
            extractedTasks: [],
            aliases: []
        };
        await db.saveObject(newDoc);
        onNavigate(newDoc);
        onClose();
    };



    const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const link = target.closest('a');

        if (link && link.dataset.objectId && link.classList.contains('nexus-mention')) {
            e.preventDefault();
            const objectId = link.dataset.objectId;

            // Navigate to the object
            // We need to fetch it first to pass the full object to onNavigate, or onNavigate handles IDs?
            // The interface says onNavigate(obj: NexusObject).
            // We need to fetch the object.
            db.getObjectById(objectId).then(obj => {
                if (obj) {
                    onNavigate(obj);
                    onClose();
                } else {
                    console.warn('Referenced object not found:', objectId);
                }
            });
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-7xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                        <Sparkles size={20} />
                        <h2 className="font-semibold text-lg">
                            {lang === 'es' ? 'Análisis Inteligente' : 'Smart Analysis'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-4">
                            <Loader2 size={40} className="animate-spin text-purple-500" />
                            <p>{lang === 'es' ? 'Analizando contenido y contexto...' : 'Analyzing content and context...'}</p>
                        </div>
                    ) : error ? (
                        <div className="text-red-500 text-center p-8">
                            <p className="font-semibold mb-2">{lang === 'es' ? 'Error' : 'Error'}</p>
                            <p>{error}</p>
                        </div>
                    ) : (
                        <div
                            className="prose prose-lg dark:prose-invert max-w-none [&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:no-underline [&_a]:hover:underline [&_a]:cursor-pointer [&_a]:font-medium"
                            onClick={handleContentClick}
                        >
                            <div dangerouslySetInnerHTML={{ __html: analysisHtml }} />
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end gap-3">
                    <button
                        onClick={handleCopy}
                        disabled={isLoading || !!error}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                    >
                        <Copy size={16} />
                        {lang === 'es' ? 'Copiar' : 'Copy'}
                    </button>
                    <button
                        onClick={handleCreateDoc}
                        disabled={isLoading || !!error}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 shadow-lg shadow-purple-900/20"
                    >
                        <FilePlus size={16} />
                        {lang === 'es' ? 'Guardar como Nota' : 'Save as Note'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnalysisModal;
