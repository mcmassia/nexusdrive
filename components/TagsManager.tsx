import React, { useState, useEffect } from 'react';
// Force reload
import { TagConfig, NexusObject } from '../types';
import { db } from '../services/db';
import { Tag, Edit2, Trash2, Search, Plus, Check, X, Merge, FileText } from 'lucide-react';
import TagAnalytics from './TagAnalytics';

interface TagsManagerProps {
    lang: 'en' | 'es';
    onNavigate?: (doc: NexusObject) => void;
    initialSearchQuery?: string;
}

const TagsManager: React.FC<TagsManagerProps> = ({ lang, onNavigate, initialSearchQuery }) => {
    const [allTags, setAllTags] = useState<string[]>([]);
    const [tagConfigs, setTagConfigs] = useState<Map<string, TagConfig>>(new Map());
    const [tagStats, setTagStats] = useState<Map<string, number>>(new Map());
    const [searchQuery, setSearchQuery] = useState('');
    const [editingTag, setEditingTag] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [viewingDocs, setViewingDocs] = useState<string | null>(null);
    const [docsForTag, setDocsForTag] = useState<NexusObject[]>([]);
    const [sortBy, setSortBy] = useState<'name' | 'usage'>('usage');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [activeTab, setActiveTab] = useState<'manage' | 'analytics'>('manage');

    const t = lang === 'es' ? {
        title: 'Gestión de Etiquetas',
        subtitle: 'Configura colores, renombra y gestiona tus etiquetas',
        search: 'Buscar etiquetas...',
        newTag: 'Nueva Etiqueta',
        documents: 'documentos',
        edit: 'Editar',
        delete: 'Eliminar',
        save: 'Guardar',
        cancel: 'Cancelar',
        color: 'Color',
        description: 'Descripción',
        rename: 'Renombrar',
        viewDocs: 'Ver documentos',
        confirmDelete: '¿Eliminar etiqueta?',
        willAffect: 'Esto afectará a',
        noTags: 'No hay etiquetas creadas aún',
        sortByName: 'Ordenar por nombre',
        sortByUsage: 'Ordenar por uso',
        created: 'Creada',
        modified: 'Modificada',
        select: 'Seleccionar',
        cancelSelection: 'Cancelar selección',
        deleteSelected: 'Eliminar seleccionadas',
        mergeSelected: 'Fusionar',
        bulkActions: 'Acciones masivas',
        selected: 'seleccionadas',
        confirmBulkDelete: '¿Estás seguro de que quieres eliminar estas etiquetas?',
        mergePrompt: 'Ingresa el nombre de la nueva etiqueta para fusionar las seleccionadas:',
        mergeSuccess: 'Etiquetas fusionadas correctamente',
        manage: 'Gestionar',
        analytics: 'Analíticas'
    } : {
        title: 'Tags Management',
        subtitle: 'Configure colors, rename and manage your tags',
        search: 'Search tags...',
        newTag: 'New Tag',
        documents: 'documents',
        edit: 'Edit',
        delete: 'Delete',
        save: 'Save',
        cancel: 'Cancel',
        color: 'Color',
        description: 'Description',
        rename: 'Rename',
        viewDocs: 'View documents',
        confirmDelete: 'Delete tag?',
        willAffect: 'This will affect',
        noTags: 'No tags created yet',
        sortByName: 'Sort by name',
        sortByUsage: 'Sort by usage',
        created: 'Created',
        modified: 'Modified',
        select: 'Select',
        cancelSelection: 'Cancel selection',
        deleteSelected: 'Delete selected',
        mergeSelected: 'Merge',
        bulkActions: 'Bulk Actions',
        selected: 'selected',
        confirmBulkDelete: 'Are you sure you want to delete these tags?',
        mergePrompt: 'Enter the name of the new tag to merge selected tags into:',
        mergeSuccess: 'Tags merged successfully',
        manage: 'Manage',
        analytics: 'Analytics'
    };

    useEffect(() => {
        loadTags();
    }, []);

    // Apply initial search query if provided
    useEffect(() => {
        if (initialSearchQuery) {
            setSearchQuery(initialSearchQuery);
        }
    }, [initialSearchQuery]);

    const loadTags = async () => {
        const stats = await db.getTagStats();
        setTagStats(stats);

        const tags = Array.from(stats.keys());
        setAllTags(tags);

        const configs = await db.getAllTagConfigs();
        const configMap = new Map<string, TagConfig>();
        configs.forEach(config => configMap.set(config.name, config));
        setTagConfigs(configMap);
    };

    const handleSaveTag = async (tagName: string) => {
        const config: TagConfig = {
            name: newName || tagName,
            color: newColor || '#10b981',
            description: newDescription,
            created: tagConfigs.get(tagName)?.created || new Date(),
            lastModified: new Date()
        };

        await db.saveTagConfig(config);

        // If renamed, update all documents
        if (newName && newName !== tagName) {
            await db.renameTag(tagName, newName);
        }

        await loadTags();
        setEditingTag(null);
        setNewName('');
        setNewColor('');
        setNewDescription('');
    };

    const handleDeleteTag = async (tagName: string) => {
        const count = tagStats.get(tagName) || 0;
        const confirmed = window.confirm(`${t.confirmDelete} \n${t.willAffect} ${count} ${t.documents} `);

        if (confirmed) {
            await db.deleteTagFromAllDocs(tagName);
            await loadTags();
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(t.confirmBulkDelete)) return;

        for (const tag of selectedTags) {
            await db.deleteTagFromAllDocs(tag);
        }

        setSelectedTags(new Set());
        setIsSelectionMode(false);
        await loadTags();
    };

    const handleBulkMerge = async () => {
        const targetTag = window.prompt(t.mergePrompt);
        if (!targetTag) return;

        const sourceTags: string[] = Array.from(selectedTags);
        await db.mergeTags(sourceTags, targetTag);

        setSelectedTags(new Set());
        setIsSelectionMode(false);
        await loadTags();
        alert(t.mergeSuccess);
    };

    const toggleTagSelection = (tag: string) => {
        const newSelected = new Set(selectedTags);
        if (newSelected.has(tag)) {
            newSelected.delete(tag);
        } else {
            newSelected.add(tag);
        }
        setSelectedTags(newSelected);
    };

    const handleViewDocs = async (tagName: string) => {
        const docs = await db.getDocumentsByTag(tagName);
        setDocsForTag(docs);
        setViewingDocs(tagName);
    };

    const startEdit = (tagName: string) => {
        const config = tagConfigs.get(tagName);
        setEditingTag(tagName);
        setNewName(tagName);
        setNewColor(config?.color || '#10b981');
        setNewDescription(config?.description || '');
    };

    const filteredTags = allTags.filter(tag =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const sortedTags = [...filteredTags].sort((a, b) => {
        if (sortBy === 'usage') {
            return (tagStats.get(b) || 0) - (tagStats.get(a) || 0);
        }
        return a.localeCompare(b);
    });

    const predefinedColors = [
        '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
        '#ef4444', '#ec4899', '#06b6d4', '#84cc16'
    ];

    return (
        <div className="p-8 max-w-6xl mx-auto pb-24">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Tag className="text-slate-600 dark:text-slate-400" size={32} />
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{t.title}</h1>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">{t.subtitle}</p>
                </div>

                <div className="flex gap-2">
                    <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex">
                        <button
                            onClick={() => setActiveTab('manage')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'manage'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            {t.manage}
                        </button>
                        <button
                            onClick={() => setActiveTab('analytics')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'analytics'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            {t.analytics}
                        </button>
                    </div>

                    {activeTab === 'manage' && (
                        <button
                            onClick={() => {
                                setIsSelectionMode(!isSelectionMode);
                                setSelectedTags(new Set());
                            }}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${isSelectionMode
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                        >
                            {isSelectionMode ? t.cancelSelection : t.select}
                        </button>
                    )}
                </div>
            </div>

            {activeTab === 'analytics' ? (
                <TagAnalytics lang={lang} />
            ) : (
                <>
                    {/* Search and Sort */}
                    <div className="mb-6 flex gap-4 items-center">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                type="text"
                                placeholder={t.search}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                            />
                        </div>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'name' | 'usage')}
                            className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                        >
                            <option value="usage">{t.sortByUsage}</option>
                            <option value="name">{t.sortByName}</option>
                        </select>
                    </div>

                    {/* Tags Grid */}
                    {sortedTags.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Tag size={48} className="mx-auto mb-4 opacity-50" />
                            <p>{t.noTags}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sortedTags.map(tag => {
                                const config = tagConfigs.get(tag);
                                const isEditing = editingTag === tag;
                                const count = tagStats.get(tag) || 0;
                                const color = config?.color || '#10b981';
                                const isSelected = selectedTags.has(tag);

                                return (
                                    <div
                                        key={tag}
                                        className={`bg-white dark:bg-slate-900 border rounded-lg p-4 transition-all ${isSelected
                                            ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-slate-200 dark:border-slate-700'
                                            }`}
                                        onClick={() => isSelectionMode && toggleTagSelection(tag)}
                                    >
                                        {isEditing ? (
                                            /* Edit Mode */
                                            <div className="space-y-3" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    value={newName}
                                                    onChange={(e) => setNewName(e.target.value)}
                                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                                    placeholder={t.rename}
                                                />

                                                <div>
                                                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2">{t.color}</label>
                                                    <div className="flex gap-2 mb-2">
                                                        {predefinedColors.map(preColor => (
                                                            <button
                                                                key={preColor}
                                                                onClick={() => setNewColor(preColor)}
                                                                className={`w-8 h-8 rounded border-2 ${newColor === preColor ? 'border-slate-800 dark:border-slate-200' : 'border-transparent'} `}
                                                                style={{ backgroundColor: preColor }}
                                                            />
                                                        ))}
                                                    </div>
                                                    <input
                                                        type="color"
                                                        value={newColor}
                                                        onChange={(e) => setNewColor(e.target.value)}
                                                        className="w-full h-10 rounded cursor-pointer"
                                                    />
                                                </div>

                                                <textarea
                                                    value={newDescription}
                                                    onChange={(e) => setNewDescription(e.target.value)}
                                                    placeholder={t.description}
                                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm"
                                                    rows={2}
                                                />

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleSaveTag(tag)}
                                                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2"
                                                    >
                                                        <Check size={16} />
                                                        {t.save}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingTag(null)}
                                                        className="flex-1 px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg flex items-center justify-center gap-2"
                                                    >
                                                        <X size={16} />
                                                        {t.cancel}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* View Mode */
                                            <div>
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        {isSelectionMode && (
                                                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected
                                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                                : 'border-slate-300 dark:border-slate-600'
                                                                }`}>
                                                                {isSelected && <Check size={12} />}
                                                            </div>
                                                        )}
                                                        <span
                                                            className="px-3 py-1 rounded-full text-white font-semibold text-sm"
                                                            style={{ backgroundColor: color }}
                                                        >
                                                            #{tag}
                                                        </span>
                                                    </div>
                                                    {!isSelectionMode && (
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); startEdit(tag); }}
                                                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-400"
                                                                title={t.edit}
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag); }}
                                                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-600 dark:text-red-400"
                                                                title={t.delete}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="text-sm text-slate-600 dark:text-slate-400 mb-2 pl-7">
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={14} />
                                                        <span className="font-semibold">{count}</span> {t.documents}
                                                    </div>
                                                </div>

                                                {config?.description && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2 pl-7">
                                                        {config.description}
                                                    </p>
                                                )}

                                                {!isSelectionMode && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleViewDocs(tag); }}
                                                        className="w-full mt-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <FileText size={14} />
                                                        {t.viewDocs}
                                                    </button>
                                                )}

                                                {config?.created && (
                                                    <div className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 pl-7">
                                                        {t.created}: {new Date(config.created).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Bulk Actions Toolbar */}
                    {selectedTags.size > 0 && (
                        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-full px-6 py-3 flex items-center gap-4 z-40">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {selectedTags.size} {t.selected}
                            </span>
                            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
                            <button
                                onClick={handleBulkMerge}
                                className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium text-sm"
                            >
                                <Merge size={18} />
                                {t.mergeSelected}
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                className="flex items-center gap-2 text-red-600 dark:text-red-400 hover:text-red-700 font-medium text-sm"
                            >
                                <Trash2 size={18} />
                                {t.deleteSelected}
                            </button>
                        </div>
                    )}

                    {/* Documents Modal */}
                    {viewingDocs && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                                {/* Modal Header */}
                                <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="px-3 py-1 rounded-full text-white font-semibold text-sm"
                                            style={{ backgroundColor: tagConfigs.get(viewingDocs)?.color || '#10b981' }}
                                        >
                                            #{viewingDocs}
                                        </span>
                                        <span className="text-slate-600 dark:text-slate-400 text-sm">
                                            {docsForTag.length} {t.documents}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setViewingDocs(null);
                                            setDocsForTag([]);
                                        }}
                                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Documents List */}
                                <div className="flex-1 overflow-y-auto p-6">
                                    <div className="space-y-3">
                                        {docsForTag.map(doc => (
                                            <div
                                                key={doc.id}
                                                onClick={() => {
                                                    if (onNavigate) {
                                                        onNavigate(doc);
                                                        setViewingDocs(null);
                                                        setDocsForTag([]);
                                                    }
                                                }}
                                                className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors cursor-pointer group"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 mb-1">
                                                            {doc.title}
                                                        </h4>
                                                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                                                            <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700">
                                                                {doc.type}
                                                            </span>
                                                            <span>
                                                                {new Date(doc.lastModified).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default TagsManager;
