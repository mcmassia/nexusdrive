import React, { useState, useEffect } from 'react';
import { TypeSchema, NexusType } from '../types';
import { db } from '../services/db';
import { Settings, Edit2, Plus, Trash2 } from 'lucide-react';
import PropertyEditor from './PropertyEditor';

const TypeManager: React.FC = () => {
    const [schemas, setSchemas] = useState<TypeSchema[]>([]);
    const [editingSchema, setEditingSchema] = useState<TypeSchema | null>(null);
    const [creatingNew, setCreatingNew] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');

    useEffect(() => {
        loadSchemas();
    }, []);

    const loadSchemas = async () => {
        const allSchemas = await db.getAllTypeSchemas();
        setSchemas(allSchemas);
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
        <div className="p-8 max-w-5xl mx-auto">
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

                    return (
                        <div
                            key={schema.type}
                            className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800/50 hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3
                                        className="text-lg font-semibold dark:text-slate-100"
                                        style={{ color: schema.color || '#94a3b8' }}
                                    >
                                        {schema.type}
                                    </h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {schema.properties.length} {schema.properties.length === 1 ? 'property' : 'properties'}
                                        {isBuiltIn && <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(Built-in)</span>}
                                    </p>
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
        </div>
    );
};

export default TypeManager;
