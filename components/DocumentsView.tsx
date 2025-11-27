import React, { useState, useMemo } from 'react';
import { NexusObject, NexusType } from '../types';
import { Search, Filter, X, FileText, User, Calendar, Briefcase, ChevronDown, Trash2, Grid, Table as TableIcon } from 'lucide-react';
import { db } from '../services/db';
import { TYPE_CONFIG } from '../constants';

interface DocumentsViewProps {
    objects: NexusObject[];
    onSelectObject: (obj: NexusObject) => void;
    onRefresh?: () => void;
    activeTypeFilter?: string | null;
    lang: 'en' | 'es';
    availableTypes: TypeSchema[];
}

type SortOption = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'type';
type ViewMode = 'table' | 'cards';

import { TypeSchema } from '../types';

const DocumentsView: React.FC<DocumentsViewProps> = ({ objects, onSelectObject, onRefresh, activeTypeFilter, lang, availableTypes }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState<NexusType | 'all'>(
        (activeTypeFilter as NexusType) || 'all'
    );
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState<SortOption>('date-desc');
    const [showTagFilter, setShowTagFilter] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('cards');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    // Update selectedType when activeTypeFilter prop changes
    React.useEffect(() => {
        if (activeTypeFilter) {
            setSelectedType(activeTypeFilter as NexusType);
        } else {
            setSelectedType('all');
        }
    }, [activeTypeFilter]);

    // Get all unique tags from all objects
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        objects.forEach(obj => {
            obj.tags.forEach(tag => tagSet.add(tag));
        });
        return Array.from(tagSet).sort();
    }, [objects]);

    // Filter and sort objects
    const filteredAndSortedObjects = useMemo(() => {
        let filtered = objects;

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(obj =>
                obj.title.toLowerCase().includes(query) ||
                obj.content.toLowerCase().includes(query) ||
                obj.tags?.some(tag => tag.toLowerCase().includes(query))
            );
        }

        // Filter by type
        if (selectedType !== 'all') {
            filtered = filtered.filter(obj => obj.type === selectedType);
        }

        // Filter by tags
        if (selectedTags.length > 0) {
            filtered = filtered.filter(obj =>
                selectedTags.every(tag => obj.tags.includes(tag))
            );
        }

        // Sort
        const sorted = [...filtered].sort((a, b) => {
            switch (sortBy) {
                case 'date-desc':
                    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
                case 'date-asc':
                    return new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
                case 'title-asc':
                    return a.title.localeCompare(b.title);
                case 'title-desc':
                    return b.title.localeCompare(a.title);
                case 'type':
                    return a.type.localeCompare(b.type);
                default:
                    return 0;
            }
        });

        return sorted;
    }, [objects, searchQuery, selectedType, selectedTags, sortBy]);

    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    };

    const getTypeIcon = (type: NexusType) => {
        switch (type) {
            case NexusType.PAGE:
                return <FileText size={16} />;
            case NexusType.PERSON:
                return <User size={16} />;
            case NexusType.MEETING:
                return <Calendar size={16} />;
            case NexusType.PROJECT:
                return <Briefcase size={16} />;
        }
    };

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredAndSortedObjects.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredAndSortedObjects.map(obj => obj.id)));
        }
    };

    const toggleSelect = (id: string, event: React.MouseEvent) => {
        event.stopPropagation();
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;

        const confirmDelete = window.confirm(
            lang === 'es'
                ? `¿Estás seguro de que quieres eliminar ${selectedIds.size} documento(s)?\n\nEsta acción no se puede deshacer.`
                : `Are you sure you want to delete ${selectedIds.size} document(s)?\n\nThis action cannot be undone.`
        );

        if (!confirmDelete) return;

        setIsDeleting(true);
        try {
            // Delete all selected documents
            await Promise.all(
                Array.from(selectedIds).map((id: string) => db.deleteObject(id))
            );

            // Clear selection
            setSelectedIds(new Set());

            // Refresh the list
            if (onRefresh) {
                onRefresh();
            }

            // Notify user
            alert(
                lang === 'es'
                    ? `${selectedIds.size} documento(s) eliminado(s) correctamente`
                    : `${selectedIds.size} document(s) deleted successfully`
            );
        } catch (error) {
            console.error('Failed to delete documents:', error);
            alert(
                lang === 'es'
                    ? 'Error al eliminar algunos documentos'
                    : 'Error deleting some documents'
            );
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 p-6">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                        {lang === 'es' ? 'Documentos' : 'Documents'}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        {lang === 'es' ? `${filteredAndSortedObjects.length} documentos encontrados` : `${filteredAndSortedObjects.length} documents found`}
                    </p>
                </div>

                {/* View Mode Toggle & Bulk Actions */}
                <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={isDeleting}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Trash2 size={16} />
                            {lang === 'es' ? `Eliminar (${selectedIds.size})` : `Delete (${selectedIds.size})`}
                        </button>
                    )}

                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('cards')}
                            className={`p-2 rounded ${viewMode === 'cards' ? 'bg-white dark:bg-slate-700 shadow' : 'text-slate-500'}`}
                            title={lang === 'es' ? 'Vista de tarjetas' : 'Card view'}
                        >
                            <Grid size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            className={`p-2 rounded ${viewMode === 'table' ? 'bg-white dark:bg-slate-700 shadow' : 'text-slate-500'}`}
                            title={lang === 'es' ? 'Vista de tabla' : 'Table view'}
                        >
                            <TableIcon size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-wrap gap-3 mb-6">
                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder={lang === 'es' ? 'Buscar documentos...' : 'Search documents...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>

                {/* Type Filter */}
                <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value as NexusType | 'all')}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="all">{lang === 'es' ? 'Todos los tipos' : 'All types'}</option>
                    {availableTypes.map(schema => (
                        <option key={schema.type} value={schema.type}>
                            {schema.type}
                        </option>
                    ))}
                </select>

                {/* Tag Filter */}
                <div className="relative">
                    <button
                        onClick={() => setShowTagFilter(!showTagFilter)}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        <Filter size={16} />
                        <span>{lang === 'es' ? 'Etiquetas' : 'Tags'} {selectedTags.length > 0 && `(${selectedTags.length})`}</span>
                        <ChevronDown size={16} />
                    </button>

                    {showTagFilter && (
                        <div className="absolute top-full mt-2 right-0 w-64 max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg z-10">
                            <div className="p-2">
                                {allTags.length > 0 ? (
                                    allTags.map(tag => (
                                        <label
                                            key={tag}
                                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedTags.includes(tag)}
                                                onChange={() => toggleTag(tag)}
                                                className="rounded border-slate-300"
                                            />
                                            <span className="text-sm text-slate-700 dark:text-slate-300">#{tag}</span>
                                        </label>
                                    ))
                                ) : (
                                    <p className="text-sm text-slate-500 p-3">{lang === 'es' ? 'No hay etiquetas' : 'No tags available'}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sort */}
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="date-desc">{lang === 'es' ? 'Más reciente' : 'Newest first'}</option>
                    <option value="date-asc">{lang === 'es' ? 'Más antiguo' : 'Oldest first'}</option>
                    <option value="title-asc">{lang === 'es' ? 'Título A-Z' : 'Title A-Z'}</option>
                    <option value="title-desc">{lang === 'es' ? 'Título Z-A' : 'Title Z-A'}</option>
                    <option value="type">{lang === 'es' ? 'Por tipo' : 'By type'}</option>
                </select>
            </div>

            {/* Active Filters */}
            {(selectedType !== 'all' || selectedTags.length > 0 || searchQuery) && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {selectedType !== 'all' && (
                        <span className="flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm">
                            {selectedType}
                            <button onClick={() => setSelectedType('all')} className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5">
                                <X size={14} />
                            </button>
                        </span>
                    )}
                    {selectedTags.map(tag => (
                        <span key={tag} className="flex items-center gap-2 px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm">
                            #{tag}
                            <button onClick={() => toggleTag(tag)} className="hover:bg-purple-200 dark:hover:bg-purple-800 rounded-full p-0.5">
                                <X size={14} />
                            </button>
                        </span>
                    ))}
                    {searchQuery && (
                        <span className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-sm">
                            "{searchQuery}"
                            <button onClick={() => setSearchQuery('')} className="hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full p-0.5">
                                <X size={14} />
                            </button>
                        </span>
                    )}
                </div>
            )}

            {/* Documents View */}
            <div className="flex-1 overflow-auto">
                {filteredAndSortedObjects.length > 0 ? (
                    viewMode === 'table' ? (
                        // Table View
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                                    <tr>
                                        <th className="w-12 px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.size === filteredAndSortedObjects.length}
                                                onChange={toggleSelectAll}
                                                className="rounded border-slate-300"
                                            />
                                        </th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{lang === 'es' ? 'Título' : 'Title'}</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{lang === 'es' ? 'Tipo' : 'Type'}</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{lang === 'es' ? 'Etiquetas' : 'Tags'}</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{lang === 'es' ? 'Modificado' : 'Modified'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAndSortedObjects.map(obj => (
                                        <tr
                                            key={obj.id}
                                            className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                        >
                                            <td className="px-4 py-3" onClick={(e) => toggleSelect(obj.id, e)}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(obj.id)}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        toggleSelect(obj.id, e as any);
                                                    }}
                                                    className="rounded border-slate-300"
                                                />
                                            </td>
                                            <td className="px-4 py-3" onClick={() => onSelectObject(obj)}>
                                                <div className="flex items-center gap-2">
                                                    {getTypeIcon(obj.type)}
                                                    <span className="font-medium text-slate-900 dark:text-slate-100">{obj.title}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3" onClick={() => onSelectObject(obj)}>
                                                <span className="text-sm text-slate-600 dark:text-slate-400">{obj.type}</span>
                                            </td>
                                            <td className="px-4 py-3" onClick={() => onSelectObject(obj)}>
                                                <div className="flex flex-wrap gap-1">
                                                    {obj.tags.slice(0, 3).map(tag => (
                                                        <span key={tag} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                    {obj.tags.length > 3 && (
                                                        <span className="px-2 py-0.5 text-slate-500 dark:text-slate-500 text-xs">
                                                            +{obj.tags.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3" onClick={() => onSelectObject(obj)}>
                                                <span className="text-sm text-slate-600 dark:text-slate-400">{formatDate(obj.lastModified)}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        // Cards View
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                            {filteredAndSortedObjects.map(obj => (
                                <div
                                    key={obj.id}
                                    className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition-all flex flex-col h-48 relative"
                                >
                                    {/* Checkbox */}
                                    <div className="absolute top-3 left-3 z-10">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(obj.id)}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                toggleSelect(obj.id, e as any);
                                            }}
                                            className="rounded border-slate-300"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>

                                    <div onClick={() => onSelectObject(obj)} className="cursor-pointer p-5 flex flex-col h-full">
                                        <div className="flex items-start justify-between mb-2 pl-6">
                                            <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                                                {obj.type}
                                            </span>
                                            <div style={{ color: TYPE_CONFIG[obj.type as NexusType]?.color || '#999' }}>
                                                <div className="w-3 h-3 rounded-full bg-current" />
                                            </div>
                                        </div>
                                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-lg mb-1 truncate">{obj.title}</h3>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 flex-1 [&_*]:text-slate-500 dark:[&_*]:text-slate-400" dangerouslySetInnerHTML={{ __html: obj.content }} />
                                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                                            Last edited {formatDate(obj.lastModified)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <FileText size={48} className="mb-4 opacity-30" />
                        <p className="text-lg font-medium">{lang === 'es' ? 'No se encontraron documentos' : 'No documents found'}</p>
                        <p className="text-sm">{lang === 'es' ? 'Intenta cambiar los filtros' : 'Try changing the filters'}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentsView;
