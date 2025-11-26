import React, { useState, useEffect } from 'react';
import { TypeSchema, NexusType } from '../types';
import { db } from '../services/db';
import { Settings, Edit2, Plus, Trash2, FileText, User, Calendar, Briefcase } from 'lucide-react';
import { TYPE_CONFIG } from '../constants';
import PropertyEditor from './PropertyEditor';

const TypeManager: React.FC = () => {
    const [schemas, setSchemas] = useState<TypeSchema[]>([]);
    const [editingSchema, setEditingSchema] = useState<TypeSchema | null>(null);
    const [creatingNew, setCreatingNew] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');
    const [importStatus, setImportStatus] = useState<{ message: string; current: number; total: number } | null>(null);
    const [canRevert, setCanRevert] = useState(false);

    useEffect(() => {
        loadSchemas();
        checkRevertAvailability();
    }, []);

    const checkRevertAvailability = () => {
        const lastImport = localStorage.getItem('nexus_last_import');
        setCanRevert(!!lastImport);
    };

    const loadSchemas = async () => {
        const allSchemas = await db.getAllTypeSchemas();
        setSchemas(allSchemas);
    };

    const handleZipImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!window.confirm('Start ZIP import? This will update schemas and import data.')) return;

        try {
            setImportStatus({ message: 'Processing ZIP file...', current: 0, total: 100 });

            // Dynamic import to avoid loading JSZip/Marked on initial load
            const { importService } = await import('../services/ImportService');

            const { schemas: newSchemas, objects, assets } = await importService.processZip(file);

            const createdTypes: string[] = [];
            const importedIds: string[] = [];

            // Phase 1: Update Schemas
            setImportStatus({ message: 'Updating schemas...', current: 0, total: newSchemas.length });

            for (let i = 0; i < newSchemas.length; i++) {
                const schema = newSchemas[i];
                const existing = await db.getTypeSchema(schema.type);

                if (existing) {
                    const existingProps = new Set(existing.properties.map(p => p.key));
                    const newProps = schema.properties.filter((p: any) => !existingProps.has(p.key));

                    if (newProps.length > 0) {
                        const updatedSchema = {
                            ...existing,
                            properties: [...existing.properties, ...newProps]
                        };
                        await db.saveTypeSchema(updatedSchema);
                    }
                } else {
                    await db.saveTypeSchema(schema);
                    createdTypes.push(schema.type);
                }
                setImportStatus({ message: `Processed schema: ${schema.type}`, current: i + 1, total: newSchemas.length });
            }

            await loadSchemas();

            // Phase 2: Process Assets (Convert to Base64 for simplicity)
            setImportStatus({ message: 'Processing assets...', current: 0, total: assets.size });
            const assetUrls = new Map<string, string>();

            let assetCount = 0;
            for (const [name, blob] of assets.entries()) {
                const reader = new FileReader();
                const base64 = await new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
                assetUrls.set(name, base64);
                assetCount++;
                if (assetCount % 5 === 0) setImportStatus({ message: `Processing asset ${assetCount}/${assets.size}`, current: assetCount, total: assets.size });
            }

            // Phase 3: Import Objects & Replace Asset URLs
            setImportStatus({ message: 'Importing objects...', current: 0, total: objects.length });

            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];

                // Replace asset:// placeholders with Base64
                let content = obj.content;
                content = content.replace(/src="asset:\/\/([^"]+)"/g, (match, assetName) => {
                    const base64 = assetUrls.get(assetName);
                    return base64 ? `src="${base64}"` : match;
                });
                obj.content = content;

                await db.saveObject(obj);
                importedIds.push(obj.id);

                if (i % 5 === 0) {
                    setImportStatus({ message: `Importing: ${obj.title}`, current: i + 1, total: objects.length });
                }
            }

            // Save import state for revert
            localStorage.setItem('nexus_last_import', JSON.stringify({
                timestamp: Date.now(),
                types: createdTypes,
                ids: importedIds
            }));
            setCanRevert(true);

            setImportStatus({ message: 'Done!', current: objects.length, total: objects.length });
            alert(`Successfully imported ${objects.length} objects and ${assets.size} assets!`);

            setTimeout(() => {
                setImportStatus(null);
                window.location.reload();
            }, 1000);

        } catch (error) {
            console.error('Import failed:', error);
            alert('Import failed: ' + (error as Error).message);
            setImportStatus(null);
        }
    };

    const handleRevert = async () => {
        if (!window.confirm('⚠️ Are you sure you want to REVERT the last import? This will delete all imported objects and types. This action cannot be undone.')) return;

        try {
            const lastImportStr = localStorage.getItem('nexus_last_import');
            if (!lastImportStr) return;

            const lastImport = JSON.parse(lastImportStr);
            const { ids, types } = lastImport;

            setImportStatus({ message: 'Reverting import...', current: 0, total: ids.length + types.length });

            // 1. Delete Objects
            let count = 0;
            for (const id of ids) {
                await db.deleteObject(id);
                count++;
                if (count % 10 === 0) {
                    setImportStatus({ message: `Deleting object ${count}/${ids.length}`, current: count, total: ids.length + types.length });
                }
            }

            // 2. Delete Types
            for (const type of types) {
                await db.deleteTypeSchema(type);
                count++;
                setImportStatus({ message: `Deleting type ${type}`, current: count, total: ids.length + types.length });
            }

            // 3. Clear storage
            localStorage.removeItem('nexus_last_import');
            setCanRevert(false);

            await loadSchemas();

            setImportStatus({ message: 'Revert complete!', current: count, total: count });
            alert('Import reverted successfully.');

            setTimeout(() => {
                setImportStatus(null);
                window.location.reload();
            }, 1000);

        } catch (error) {
            console.error('Revert failed:', error);
            alert('Revert failed: ' + (error as Error).message);
            setImportStatus(null);
        }
    };

    const handleSaveSchema = async (schema: TypeSchema) => {
        await db.saveTypeSchema(schema);
        await loadSchemas();
        setEditingSchema(null);
        setCreatingNew(false);
    };

    const handleCreateNewType = () => {
        if (!newTypeName.trim()) return;

        // Generate random color
        const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

        const newSchema: TypeSchema = {
            type: newTypeName,
            properties: [],
            color: randomColor
        };

        setEditingSchema(newSchema);
        setCreatingNew(false);
        setNewTypeName('');
    };

    const handleDeleteType = async (type: string) => {
        const builtInTypes = Object.values(NexusType);
        if (builtInTypes.includes(type as NexusType)) {
            alert('Cannot delete built-in types');
            return;
        }

        const confirm = window.confirm(`Delete type "${type}"? This will not delete existing documents.`);
        if (confirm) {
            await db.deleteTypeSchema(type);
            await loadSchemas();
        }
    };

    if (editingSchema) {
        return (
            <PropertyEditor
                schema={editingSchema}
                onSave={handleSaveSchema}
                onCancel={() => setEditingSchema(null)}
            />
        );
    }

    return (
        <div className="h-full overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Settings className="text-slate-600 dark:text-slate-400" size={32} />
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Type Manager</h1>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                        Manage object types and their custom properties
                    </p>
                </div>

                {/* Create New Type */}
                {creatingNew ? (
                    <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={newTypeName}
                                onChange={(e) => setNewTypeName(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleCreateNewType()}
                                placeholder="New type name (e.g., Task, Organization)..."
                                className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded"
                                autoFocus
                            />
                            <button
                                onClick={handleCreateNewType}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Create
                            </button>
                            <button
                                onClick={() => { setCreatingNew(false); setNewTypeName(''); }}
                                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setCreatingNew(true)}
                        className="mb-6 flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded hover:bg-slate-800 dark:hover:bg-slate-200"
                    >
                        <Plus size={18} />
                        Create Custom Type
                    </button>
                )}

                {/* Type List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {schemas.map((schema) => {
                        const isBuiltIn = Object.values(NexusType).includes(schema.type as NexusType);
                        const iconName = TYPE_CONFIG[schema.type as NexusType]?.icon;
                        const Icon = (iconName === 'User' ? User :
                            iconName === 'Calendar' ? Calendar :
                                iconName === 'Briefcase' ? Briefcase :
                                    FileText);

                        return (
                            <div
                                key={schema.type}
                                className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800/50 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/50">
                                            <Icon size={24} style={{ color: schema.color || '#94a3b8' }} />
                                        </div>
                                        <div>
                                            <h3
                                                className="text-lg font-semibold dark:text-slate-100"
                                            >
                                                {schema.type}
                                            </h3>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                {schema.properties.length} {schema.properties.length === 1 ? 'property' : 'properties'}
                                                {isBuiltIn && <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(Built-in)</span>}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setEditingSchema(schema)}
                                            className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                                            title="Edit schema"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        {!isBuiltIn && (
                                            <button
                                                onClick={() => handleDeleteType(schema.type)}
                                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                title="Delete type"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Property List */}
                                {schema.properties.length > 0 && (
                                    <div className="space-y-1">
                                        {schema.properties.slice(0, 4).map((prop) => (
                                            <div key={prop.key} className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                                <span className="text-xs text-slate-400">•</span>
                                                <span className="font-medium">{prop.label}</span>
                                                <span className="text-xs text-slate-400">({prop.type})</span>
                                                {prop.required && <span className="text-xs text-red-500">*</span>}
                                            </div>
                                        ))}
                                        {schema.properties.length > 4 && (
                                            <div className="text-xs text-slate-400 italic">
                                                +{schema.properties.length - 4} more...
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {schemas.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                        <Settings size={48} className="mx-auto mb-4 opacity-50" />
                        <p>No type schemas found. Initialize defaults or create a new type.</p>
                    </div>
                )}

                {/* Import Section */}
                <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Data Management</h2>
                    <div className="bg-white dark:bg-slate-800/50 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Import from Capacities (ZIP)</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Upload a ZIP file containing your Capacities export (Markdown files and Images folder).
                            This will automatically create new types, update schemas, and import all content.
                        </p>

                        {importStatus ? (
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                                    <span>{importStatus.message}</span>
                                    <span>{Math.round((importStatus.current / importStatus.total) * 100)}%</span>
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                                    <div
                                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                        style={{ width: `${(importStatus.current / importStatus.total) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-3 items-center">
                                <label className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors flex items-center gap-2 cursor-pointer">
                                    <Settings size={16} />
                                    <span>Select ZIP File</span>
                                    <input
                                        type="file"
                                        accept=".zip"
                                        onChange={handleZipImport}
                                        className="hidden"
                                    />
                                </label>

                                {canRevert && (
                                    <button
                                        onClick={handleRevert}
                                        className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-2"
                                    >
                                        <Trash2 size={16} />
                                        Revert Last Import
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TypeManager;
