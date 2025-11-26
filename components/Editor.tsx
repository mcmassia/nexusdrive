import React, { useState, useEffect } from 'react';
import { NexusObject, NexusType, TypeSchema } from '../types';
import MetadataTable from './MetadataTable';
import RichEditor from './RichEditor';
import BacklinksPanel from './BacklinksPanel';
import { ArrowLeft, Save, Sparkles, Trash2, MoreVertical, Share2, Calendar, Clock, Tag } from 'lucide-react';
import { db } from '../services/db';
import { geminiService } from '../services/geminiService';
import { TRANSLATIONS } from '../constants';

interface EditorProps {
    object: NexusObject;
    onSave: (obj: NexusObject) => void;
    onClose: () => void;
    onDelete?: (id: string) => void;
    objects?: NexusObject[];
    lang: 'en' | 'es';
    onNavigateToDocuments?: (filterType?: string) => void;
    onTagClick?: (tagName: string) => void;
    onNavigate?: (obj: NexusObject) => void;
}

const Editor: React.FC<EditorProps> = ({ object, onSave, onClose, onDelete, lang, onNavigateToDocuments, onTagClick, onNavigate }) => {
    const t = TRANSLATIONS[lang];
    const [currentObject, setCurrentObject] = useState<NexusObject>(object);
    const [content, setContent] = useState(object.content);
    const [isSaving, setIsSaving] = useState(false);
    const [typeSchema, setTypeSchema] = useState<TypeSchema | undefined>(undefined);
    const [objects, setObjects] = useState<NexusObject[]>([]);

    useEffect(() => {
        setCurrentObject(object);
        setContent(object.content);

        // Load type schema for this object type
        db.getAllTypeSchemas().then(schemas => {
            const schema = schemas.find(s => s.type === object.type);
            setTypeSchema(schema);
        });

        // Load all objects for navigation
        db.getObjects().then(setObjects);
    }, [object]);

    const handleSave = async () => {
        setIsSaving(true);

        // Extract Hashtags from content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const tags = Array.from(tempDiv.querySelectorAll('.nexus-tag')).map(el => el.textContent?.replace('#', '') || '');
        const uniqueTags = Array.from(new Set([...currentObject.tags, ...tags.filter(t => t)]));

        const updated = { ...currentObject, content, lastModified: new Date(), tags: uniqueTags };
        await db.saveObject(updated);
        onSave(updated);
        setCurrentObject(updated);
        setTimeout(() => setIsSaving(false), 500);
    };

    const handleAutoTag = async () => {
        if (!content || content.trim().length === 0) {
            alert(lang === 'es' ? 'Escribe algo de contenido primero' : 'Write some content first');
            return;
        }

        setIsSaving(true);
        try {
            const plainText = content.replace(/<[^>]*>?/gm, ' ');
            console.log('[Editor] Calling autoTagContent with:', plainText.substring(0, 100) + '...');
            const newTags = await geminiService.autoTagContent(plainText);
            console.log('[Editor] Received tags:', newTags);

            if (newTags.length > 0) {
                setCurrentObject(prev => ({ ...prev, tags: [...new Set([...prev.tags, ...newTags])] }));
                alert(lang === 'es'
                    ? `${newTags.length} etiquetas sugeridas agregadas`
                    : `${newTags.length} suggested tags added`);
            } else {
                alert(lang === 'es' ? 'No se pudieron generar etiquetas' : 'Could not generate tags');
            }
        } catch (error) {
            console.error('[Editor] Auto-tag error:', error);
            alert(lang === 'es' ? 'Error al generar etiquetas' : 'Error generating tags');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm(lang === 'es' ? '¿Estás seguro de que quieres eliminar este documento?' : 'Are you sure you want to delete this document?')) {
            return;
        }

        setIsSaving(true);
        try {
            if (onDelete) {
                onDelete(currentObject.id);
            } else {
                await db.deleteObject(currentObject.id);
                onClose();
            }
        } catch (error) {
            console.error('Failed to delete object:', error);
            alert('Error al eliminar el documento. Por favor, intenta de nuevo.');
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 animate-in slide-in-from-right-10 duration-200 transition-colors">
            {/* Toolbar */}
            <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-white dark:bg-slate-900 shrink-0 transition-colors">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm text-slate-400 shrink-0">/ Nexus /</span>
                    <button
                        onClick={() => onNavigateToDocuments?.(currentObject.type)}
                        className="text-sm text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer shrink-0"
                    >
                        {currentObject.type}s
                    </button>
                    <span className="text-sm text-slate-400 shrink-0">/</span>
                    <input
                        value={currentObject.title}
                        onChange={(e) => setCurrentObject({ ...currentObject, title: e.target.value })}
                        className="flex-1 min-w-0 font-semibold text-slate-800 dark:!text-white outline-none hover:bg-slate-50 dark:hover:bg-slate-800 px-2 -ml-2 rounded bg-transparent transition-colors"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{isSaving ? t.saving : t.synced}</span>
                    <button onClick={handleAutoTag} className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors" title="AI Auto-Tag">
                        <Sparkles size={18} />
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-1.5 rounded-md text-sm hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors">
                        <Save size={16} /> {t.save}
                    </button>
                    <button onClick={handleDelete} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title={lang === 'es' ? 'Eliminar documento' : 'Delete document'}>
                        <Trash2 size={18} />
                    </button>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">{t.close}</button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Content - 95% Width */}
                <div className="flex-1 overflow-y-auto p-8 max-w-[95%] mx-auto w-full no-scrollbar">

                    <MetadataTable
                        object={currentObject}
                        onChange={(meta) => setCurrentObject({ ...currentObject, metadata: meta })}
                        onTagRemove={(tag) => {
                            const newTags = currentObject.tags.filter(t => t !== tag);
                            setCurrentObject({ ...currentObject, tags: newTags });
                        }}
                        onTagClick={onTagClick}
                        allObjects={objects}
                        typeSchema={typeSchema}
                        onDocumentClick={async (docId) => {
                            const obj = await db.getObjectById(docId);
                            if (obj) {
                                await handleSave();
                                if (onNavigate) {
                                    onNavigate(obj);
                                } else {
                                    onSave(obj);
                                }
                            }
                        }}
                        lang={lang}
                    />

                    {/* Rich Editor */}
                    <div className="min-h-[500px]">
                        <RichEditor
                            key={currentObject.id} // Force re-mount on object change to prevent content leakage
                            initialContent={content}
                            onChange={setContent}
                            allObjects={objects}
                            className="
                                    prose max-w-none
                                    !bg-white !text-slate-900
                                    p-8 rounded-lg shadow-sm
                                    [&_p]:!text-slate-900
                                    [&_h1]:!text-slate-900
                                    [&_h2]:!text-slate-900
                                    [&_h3]:!text-slate-900
                                    [&_li]:!text-slate-900
                                    [&_ul]:!text-slate-900
                                    [&_ol]:!text-slate-900
                                    [&_blockquote]:!text-slate-700 [&_blockquote]:!border-l-4 [&_blockquote]:!border-slate-300 [&_blockquote]:!pl-4 [&_blockquote]:!italic
                                    [&_code]:!bg-slate-100 [&_code]:!text-pink-600 [&_code]:!px-1 [&_code]:!rounded
                                    [&_pre]:!bg-slate-100 [&_pre]:!p-4 [&_pre]:!rounded-lg
                                    [&_a]:!text-blue-600 [&_a]:!underline
                                "
                            onTagClick={onTagClick}
                            onMentionClick={async (objectId) => {
                                console.log('[Editor] Mention clicked:', objectId);
                                // Open the mentioned document
                                const obj = await db.getObjectById(objectId);
                                console.log('[Editor] Resolved object:', obj?.title, obj?.id);

                                if (obj) {
                                    if (obj.id === currentObject.id) {
                                        console.log('[Editor] Clicked link to current document (self-link). Ignoring.');
                                        return;
                                    }

                                    console.log('[Editor] Saving current document before navigation...');
                                    // Save current document first
                                    await handleSave();

                                    // Navigate to new object
                                    if (onNavigate) {
                                        console.log('[Editor] Calling onNavigate with:', obj.title);
                                        onNavigate(obj);
                                    } else {
                                        console.warn('[Editor] onNavigate prop missing! Fallback to onSave.');
                                        onSave(obj);
                                    }
                                } else {
                                    console.error('[Editor] Could not find object with ID:', objectId);
                                    alert('Document not found');
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* BACKLINKS PANEL: Full width below editor */}
            <BacklinksPanel
                targetDocId={currentObject.id}
                onNavigate={async (docId, blockId) => {
                    const obj = objects.find(o => o.id === docId);
                    if (obj) {
                        // Await save to prevent state reversion race condition
                        await handleSave();

                        if (onNavigate) {
                            onNavigate(obj);
                        } else {
                            onSave(obj);
                        }

                        // Optional: Scroll to specific block if blockId is provided
                        // This would require passing blockId to the new view state or handling it in App.tsx
                        if (blockId) {
                            console.log('Navigating to block:', blockId);
                        }
                    }
                }}
                lang={lang}
            />
        </div>
    );
};

export default Editor;