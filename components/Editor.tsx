import React, { useState, useEffect } from 'react';
import { NexusObject, NexusType, TypeSchema } from '../types';
import MetadataTable from './MetadataTable';
import RichEditor from './RichEditor';
import BacklinksPanel from './BacklinksPanel';
import { ArrowLeft, Save, Sparkles, Trash2, MoreVertical, Share2, Calendar, Clock, Tag, Pin, X } from 'lucide-react';
import { db } from '../services/db';
import { geminiService } from '../services/geminiService';
import { TRANSLATIONS } from '../constants';
import { useNotification } from './NotificationContext';

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

    const [availableSchemas, setAvailableSchemas] = useState<TypeSchema[]>([]);
    const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);

    useEffect(() => {
        setCurrentObject(object);
        setContent(object.content);

        // Load type schema for this object type
        db.getAllTypeSchemas().then(schemas => {
            setAvailableSchemas(schemas);
            const schema = schemas.find(s => s.type === object.type);
            setTypeSchema(schema);
        });

        // Load all objects for navigation
        db.getObjects().then(setObjects);
    }, [object]);

    const handleTypeChange = async (newType: NexusType) => {
        if (newType === currentObject.type) {
            setIsTypeMenuOpen(false);
            return;
        }

        const newSchema = availableSchemas.find(s => s.type === newType);
        if (!newSchema) return;

        // Migrate metadata
        const newMetadata = newSchema.properties.map(field => {
            // Try to find existing value with same key
            const existing = currentObject.metadata?.find(m => m.key === field.key);
            if (existing) {
                return { ...existing, type: field.type }; // Keep value, update type definition if needed
            }
            // Otherwise use default
            return {
                key: field.key,
                value: field.defaultValue,
                type: field.type
            };
        });

        const updated = {
            ...currentObject,
            type: newType,
            metadata: newMetadata,
            lastModified: new Date()
        };

        await db.saveObject(updated);
        onSave(updated);
        setCurrentObject(updated);
        setTypeSchema(newSchema);
        setIsTypeMenuOpen(false);
    };

    const handleSave = async () => {
        setIsSaving(true);

        // Extract Hashtags from content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const tags = Array.from(tempDiv.querySelectorAll('.nexus-tag')).map(el => el.textContent?.replace('#', '') || '');
        const currentTags = currentObject.tags || [];
        const uniqueTags = Array.from(new Set([...currentTags, ...tags.filter(t => t)]));

        // Extract Tasks
        const tasks: any[] = [];
        const taskElements = tempDiv.querySelectorAll('.nexus-task');
        taskElements.forEach((el) => {
            const checkbox = el as HTMLInputElement;
            // Get text following the checkbox
            let taskContent = '';
            let nextNode = checkbox.nextSibling;

            // Collect text until next block element or another checkbox
            while (nextNode) {
                if (nextNode.nodeType === Node.TEXT_NODE) {
                    taskContent += nextNode.textContent;
                } else if (nextNode.nodeType === Node.ELEMENT_NODE) {
                    const element = nextNode as HTMLElement;
                    if (['DIV', 'P', 'H1', 'H2', 'H3', 'LI', 'UL', 'OL', 'BLOCKQUOTE'].includes(element.tagName)) {
                        break;
                    }
                    // Skip completion date
                    if (!element.classList.contains('nexus-completion-date')) {
                        taskContent += element.textContent;
                    }
                }
                nextNode = nextNode.nextSibling;
            }

            if (taskContent.trim()) {
                tasks.push({
                    id: Math.random().toString(36).substr(2, 9), // Simple ID generation
                    content: taskContent.trim(),
                    completed: checkbox.hasAttribute('checked'), // Check attribute, not property, as we set it manually
                    createdAt: new Date(),
                    documentId: currentObject.id
                });
            }
        });

        const updated = {
            ...currentObject,
            content,
            lastModified: new Date(),
            tags: uniqueTags,
            extractedTasks: tasks
        };
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

    const { confirm } = useNotification();

    const handleDelete = async () => {
        const confirmed = await confirm({
            message: lang === 'es' ? '¿Eliminar documento?' : 'Delete document?',
            description: lang === 'es'
                ? '¿Estás seguro de que quieres eliminar este documento? Esta acción no se puede deshacer.'
                : 'Are you sure you want to delete this document? This action cannot be undone.'
        });

        if (!confirmed) return;

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

                    <div className="relative">
                        <button
                            onClick={() => setIsTypeMenuOpen(!isTypeMenuOpen)}
                            className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                            {currentObject.type}
                            <span className="text-slate-400 text-xs">▼</span>
                        </button>

                        {isTypeMenuOpen && (
                            <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-1 animate-in fade-in zoom-in-95 duration-100">
                                {availableSchemas.map(schema => (
                                    <button
                                        key={schema.type}
                                        onClick={() => handleTypeChange(schema.type)}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2
                                            ${currentObject.type === schema.type ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-200'}
                                        `}
                                    >
                                        <span className="text-lg">{schema.icon}</span>
                                        {schema.type}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <span className="text-sm text-slate-400 shrink-0">/</span>
                    <input
                        value={currentObject.title || ''}
                        onChange={(e) => setCurrentObject({ ...currentObject, title: e.target.value })}
                        className="flex-1 min-w-0 font-semibold text-slate-800 dark:!text-white outline-none hover:bg-slate-50 dark:hover:bg-slate-800 px-2 -ml-2 rounded bg-transparent transition-colors"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{isSaving ? t.saving : t.synced}</span>

                    <button
                        onClick={handleAutoTag}
                        className="flex items-center gap-2 px-3 py-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors text-sm font-medium"
                        title="AI Auto-Tag"
                    >
                        <Sparkles size={16} />
                        <span className="hidden sm:inline">Auto-Tag</span>
                    </button>

                    <button
                        onClick={async () => {
                            const updated = { ...currentObject, pinned: !currentObject.pinned };
                            await db.saveObject(updated);
                            setCurrentObject(updated);
                            onSave(updated); // Propagate change
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm font-medium ${currentObject.pinned ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        title={currentObject.pinned ? (lang === 'es' ? 'Desfijar' : 'Unpin') : (lang === 'es' ? 'Fijar' : 'Pin')}
                    >
                        <Pin size={16} fill={currentObject.pinned ? "currentColor" : "none"} />
                        <span className="hidden sm:inline">{lang === 'es' ? (currentObject.pinned ? 'Fijado' : 'Fijar') : (currentObject.pinned ? 'Pinned' : 'Pin')}</span>
                    </button>

                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                    >
                        <Save size={16} />
                        <span className="hidden sm:inline">{t.save}</span>
                    </button>

                    <button
                        onClick={handleDelete}
                        className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors text-sm font-medium"
                        title={lang === 'es' ? 'Eliminar documento' : 'Delete document'}
                    >
                        <Trash2 size={16} />
                        <span className="hidden sm:inline">{lang === 'es' ? 'Borrar' : 'Delete'}</span>
                    </button>

                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors text-sm font-medium"
                        title={t.close}
                    >
                        <X size={16} />
                        <span className="hidden sm:inline">{t.close}</span>
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Content - 95% Width */}
                <div className="flex-1 overflow-y-auto max-w-[95%] mx-auto w-full no-scrollbar">

                    <div className="p-8 pb-0">
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
                            availableSchemas={availableSchemas}
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
                    </div>

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
                                    [&_pre]:!bg-slate-100 [&_pre]:!p-4 [&_pre]:!rounded-lg
                                    [&_a]:underline
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