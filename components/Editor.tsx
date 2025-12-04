import React, { useState, useEffect } from 'react';
import { NexusObject, NexusType, TypeSchema } from '../types';
import MetadataTable from './MetadataTable';
import RichEditor from './RichEditor';
import BacklinksPanel from './BacklinksPanel';
import { ArrowLeft, Save, Sparkles, Trash2, MoreVertical, Share2, Calendar, Clock, Tag, Pin, X, LayoutTemplate, ExternalLink } from 'lucide-react';
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
    const { addNotification } = useNotification();
    const [currentObject, setCurrentObject] = useState<NexusObject>(object);
    const [content, setContent] = useState(object.content);
    const [isSaving, setIsSaving] = useState(false);
    const [typeSchema, setTypeSchema] = useState<TypeSchema | undefined>(undefined);
    const [objects, setObjects] = useState<NexusObject[]>([]);

    // Sync state with prop changes (e.g. after external save/sync)
    useEffect(() => {
        setCurrentObject(object);
        // Only update content if it's different to avoid losing unsaved changes?
        // Actually, if the parent updates the object, we should probably reflect it, 
        // but we must be careful not to overwrite user typing if the update comes from a background sync.
        // However, in this context, the update comes from `onSave` completion in App.tsx which updates `selectedObject`.
        // So it is safe to update `currentObject` here.
    }, [object]);

    const [availableSchemas, setAvailableSchemas] = useState<TypeSchema[]>([]);
    const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
    const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);

    const handleApplyTemplate = async (template: any) => {
        setIsTemplateMenuOpen(false);

        // If content is empty, just replace
        if (!content || content.trim() === '' || content === '<p><br></p>') {
            setContent(template.content);
            return;
        }

        const choice = await confirm({
            message: 'Apply Template',
            description: 'How would you like to apply this template?',
            confirmLabel: 'Append to bottom',
            cancelLabel: 'Replace content',
            isDestructive: false // Reusing the confirm dialog, but we need a 3rd option or custom buttons. 
            // Since confirm only has 2 options (Confirm/Cancel), let's use it as "Append" vs "Replace" (Cancel).
            // Wait, "Cancel" usually means "Do nothing".
            // I should probably use a custom modal or just standard window.confirm/prompt if the custom one is limited.
            // Or I can just ask "Replace existing content?" -> Yes (Replace), No (Append).
        });

        // Let's rephrase: "This document has content. Do you want to replace it?"
        // Confirm -> Replace
        // Cancel -> Append (or do nothing? User might want to cancel).

        // Better approach: Use window.confirm for simplicity or assume Append is safer, 
        // but user might want Replace.

        // Let's try to use the existing confirm dialog but with clear labels if possible.
        // The existing confirm dialog has `confirmLabel` and `cancelLabel`.
        // So I can set confirmLabel="Replace" and cancelLabel="Append".
        // But what if they want to cancel?
        // The current `confirm` implementation returns boolean.

        // I'll stick to a simple strategy:
        // 1. If content is empty -> Replace
        // 2. If content exists -> Ask "Replace content?"
        //    - Yes -> Replace
        //    - No -> Append

        // Actually, "Cancel" in a confirm dialog usually implies "Abort".
        // So I should probably ask: "Do you want to replace the current content? (Cancel to append)"
        // But that's confusing.

        // Let's just append by default if content exists, maybe with a separator?
        // Or better, use a standard `window.prompt` or `window.confirm` is not enough for 3 choices.

        // Let's use `window.confirm` for "Replace?". If false, then Append.
        // But user might want to Cancel.

        // I'll implement a simple choice:
        // "Replace content" (Destructive)
        // "Append" (Safe)

        // Since I can't easily add a 3rd button to the existing `confirm` hook without checking its implementation,
        // I'll assume "Append" is the default safe action, and "Replace" requires explicit confirmation.

        // Let's try this:
        const shouldReplace = window.confirm(`Replace existing content with "${template.name}" template?\nClick OK to REPLACE.\nClick Cancel to APPEND.`);

        if (shouldReplace) {
            setContent(template.content);
        } else {
            setContent(content + '<br/>' + template.content);
        }
    };

    useEffect(() => {
        setCurrentObject(object);
        setContent(object.content);

        // Check for missing content (lazy load trigger)
        // If content is empty but we have a Drive ID, try to fetch the full content
        if ((!object.content || object.content.trim() === '') && object.driveFileId) {
            console.log('[Editor] Content missing, triggering lazy load for:', object.title);
            db.getObjectById(object.id).then(fullObj => {
                if (fullObj && fullObj.content && fullObj.content !== object.content) {
                    console.log('[Editor] Lazy load complete, updating content.');
                    setCurrentObject(fullObj);
                    setContent(fullObj.content);
                }
            });
        }

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
        // Support both old checkboxes and new visual tags
        const taskElements = tempDiv.querySelectorAll('.nexus-task, .nexus-task-tag');

        taskElements.forEach((el) => {
            let isCompleted = false;
            let taskContent = '';
            let nextNode = el.nextSibling;

            // Determine completion status
            if (el.tagName === 'INPUT') {
                isCompleted = (el as HTMLInputElement).hasAttribute('checked');
            } else {
                isCompleted = el.classList.contains('done') || el.textContent === 'REALIZADO';
            }

            // Collect text until next block element or another task
            while (nextNode) {
                if (nextNode.nodeType === Node.TEXT_NODE) {
                    taskContent += nextNode.textContent;
                } else if (nextNode.nodeType === Node.ELEMENT_NODE) {
                    const element = nextNode as HTMLElement;
                    if (['DIV', 'P', 'H1', 'H2', 'H3', 'LI', 'UL', 'OL', 'BLOCKQUOTE'].includes(element.tagName) ||
                        element.classList.contains('nexus-task') ||
                        element.classList.contains('nexus-task-tag')) {
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
                    completed: isCompleted,
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
        const saved = await db.saveObject(updated);
        await onSave(saved);
        setCurrentObject(saved);
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
            {/* Toolbar - Split into 2 rows */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 transition-colors flex flex-col">
                {/* Row 1: Title & Context */}
                <div className="h-12 border-b border-slate-100 dark:border-slate-800/50 flex items-center px-6 bg-white dark:bg-slate-900 shrink-0 transition-colors">
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
                        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
                            <span>Aliases:</span>
                            <input
                                value={currentObject.aliases?.join(', ') || ''}
                                onChange={(e) => {
                                    const aliases = e.target.value
                                        .split(',')
                                        .map(s => s.trim())
                                        .filter(Boolean);
                                    setCurrentObject({ ...currentObject, aliases });
                                }}
                                placeholder={lang === 'es' ? 'ej: Alberto, mi amigo, socio...' : 'e.g: John, my friend, partner...'}
                                className="w-48 text-xs text-slate-600 dark:text-slate-300 outline-none hover:bg-slate-50 dark:hover:bg-slate-800 px-2 py-1 rounded bg-transparent transition-colors border border-transparent focus:border-slate-300 dark:focus:border-slate-600"
                            />
                        </div>
                    </div>
                </div>

                {/* Row 2: Actions */}
                <div className="h-12 flex items-center justify-between px-6 bg-white dark:bg-slate-900 shrink-0 transition-colors">
                    <span className="text-xs text-slate-400 mr-auto">
                        {isSaving
                            ? t.saving
                            : (currentObject.driveFileId
                                ? t.synced
                                : (lang === 'es' ? 'Solo Local' : 'Local Only')
                            )
                        }
                    </span>

                    <div className="flex items-center gap-3">
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

                        {/* Templates Button */}
                        {(typeSchema?.templates && typeSchema.templates.length > 0) && (
                            <div className="relative">
                                <button
                                    onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                                    className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors text-sm font-medium"
                                    title="Templates"
                                >
                                    <LayoutTemplate size={16} />
                                    <span className="hidden sm:inline">Templates</span>
                                </button>

                                {isTemplateMenuOpen && (
                                    <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-1 animate-in fade-in zoom-in-95 duration-100">
                                        <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 mb-1">
                                            Apply Template
                                        </div>
                                        {typeSchema.templates.map(template => (
                                            <button
                                                key={template.id}
                                                onClick={() => handleApplyTemplate(template)}
                                                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-between group"
                                            >
                                                <span className="text-slate-700 dark:text-slate-200">{template.name}</span>
                                                {template.isDefault && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">Default</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <a
                            href={currentObject.driveWebViewLink || (currentObject.driveFileId ? `https://docs.google.com/document/d/${currentObject.driveFileId}/edit` : '#')}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                                if (!currentObject.driveFileId && !currentObject.driveWebViewLink) {
                                    e.preventDefault();
                                    addNotification({
                                        type: 'warning',
                                        message: lang === 'es' ? 'Documento no sincronizado' : 'Document not synced',
                                        description: lang === 'es' ? 'Guarda el documento para sincronizarlo con Drive.' : 'Save the document to sync with Drive.',
                                        duration: 5000
                                    });
                                }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm font-medium
                                ${(currentObject.driveFileId || currentObject.driveWebViewLink)
                                    ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                                    : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            title="Open in Drive"
                        >
                            <ExternalLink size={16} />
                            <span className="hidden sm:inline">Drive</span>
                        </a>

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
        </div >
    );
};

export default Editor;