import React, { useState, useEffect } from 'react';
import { PropertyDefinition, PropertyType, NexusType, TypeSchema } from '../types';
import { Plus, X, ChevronDown, CheckSquare, Square, ArrowUp, ArrowDown } from 'lucide-react';

interface PropertyEditorProps {
    schema: TypeSchema;
    onSave: (schema: TypeSchema) => void;
    onCancel: () => void;
    allTypes: string[];
}

const PropertyEditor: React.FC<PropertyEditorProps> = ({ schema, onSave, onCancel, allTypes }) => {
    const [editedSchema, setEditedSchema] = useState<TypeSchema>(schema);
    const [newPropertyKey, setNewPropertyKey] = useState('');

    const propertyTypes: PropertyType[] = ['text', 'number', 'date', 'document', 'documents', 'multiselect', 'select', 'url', 'email', 'phone', 'checkbox', 'image'];

    const addProperty = () => {
        if (!newPropertyKey.trim()) return;

        const newProp: PropertyDefinition = {
            key: newPropertyKey.toLowerCase().replace(/\s+/g, '_'),
            label: newPropertyKey,
            type: 'text',
            required: false,
            options: []
        };

        setEditedSchema({
            ...editedSchema,
            properties: [...editedSchema.properties, newProp]
        });
        setNewPropertyKey('');
    };

    const updateProperty = (index: number, updates: Partial<PropertyDefinition>) => {
        const newProperties = [...editedSchema.properties];
        newProperties[index] = { ...newProperties[index], ...updates };

        if ((newProperties[index].type === 'select' || newProperties[index].type === 'multiselect') && !newProperties[index].options) {
            newProperties[index].options = [];
        }

        setEditedSchema({ ...editedSchema, properties: newProperties });
    };

    const deleteProperty = (index: number) => {
        setEditedSchema({
            ...editedSchema,
            properties: editedSchema.properties.filter((_, i) => i !== index)
        });
    };

    const moveProperty = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === editedSchema.properties.length - 1) return;

        const newProperties = [...editedSchema.properties];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        [newProperties[index], newProperties[targetIndex]] = [newProperties[targetIndex], newProperties[index]];

        setEditedSchema({ ...editedSchema, properties: newProperties });
    };

    const toggleAllowedType = (propIndex: number, type: string) => {
        const prop = editedSchema.properties[propIndex];
        const current = (prop.allowedTypes as string[]) || [];
        const updated = current.includes(type)
            ? current.filter(t => t !== type)
            : [...current, type];

        updateProperty(propIndex, { allowedTypes: updated.length > 0 ? updated as NexusType[] : undefined });
    };

    const toggleAllAllowedTypes = (propIndex: number) => {
        const prop = editedSchema.properties[propIndex];
        const current = (prop.allowedTypes as string[]) || [];

        if (current.length === allTypes.length) {
            // Deselect all
            updateProperty(propIndex, { allowedTypes: [] });
        } else {
            // Select all
            updateProperty(propIndex, { allowedTypes: allTypes as NexusType[] });
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col h-full max-h-[85vh] w-full max-w-6xl mx-auto overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                        Edit Type: {editedSchema.type}
                        <input
                            type="color"
                            value={editedSchema.color || '#3b82f6'}
                            onChange={(e) => setEditedSchema({ ...editedSchema, color: e.target.value })}
                            className="h-6 w-8 cursor-pointer rounded border border-slate-300 dark:border-slate-600 p-0 overflow-hidden"
                            title="Change Type Color"
                        />
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Configure properties and behavior for this object type
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(editedSchema)}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm transition-colors font-medium"
                    >
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Content - Table Layout */}
            <div className="flex-1 overflow-y-auto p-0">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900/80 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-10"></th>
                            <th className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-48">Label</th>
                            <th className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">Type</th>
                            <th className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24 text-center">Required</th>
                            <th className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Configuration</th>
                            <th className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {editedSchema.properties.map((prop, index) => (
                            <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 group transition-colors">
                                <td className="px-2 py-2 align-top text-center">
                                    <div className="flex flex-col gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => moveProperty(index, 'up')}
                                            disabled={index === 0}
                                            className="text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400"
                                            title="Move Up"
                                        >
                                            <ArrowUp size={14} />
                                        </button>
                                        <button
                                            onClick={() => moveProperty(index, 'down')}
                                            disabled={index === editedSchema.properties.length - 1}
                                            className="text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400"
                                            title="Move Down"
                                        >
                                            <ArrowDown size={14} />
                                        </button>
                                    </div>
                                </td>
                                <td className="px-4 py-2 align-top">
                                    <input
                                        type="text"
                                        value={prop.label}
                                        onChange={(e) => updateProperty(index, { label: e.target.value })}
                                        className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 rounded text-sm transition-all"
                                    />
                                </td>
                                <td className="px-4 py-2 align-top">
                                    <select
                                        value={prop.type}
                                        onChange={(e) => updateProperty(index, { type: e.target.value as PropertyType })}
                                        className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 rounded text-sm cursor-pointer transition-all"
                                    >
                                        {propertyTypes.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-4 py-2 align-top text-center">
                                    <input
                                        type="checkbox"
                                        checked={prop.required || false}
                                        onChange={(e) => updateProperty(index, { required: e.target.checked })}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer mt-1.5"
                                    />
                                </td>
                                <td className="px-4 py-2 align-top">
                                    {/* Configuration based on type */}
                                    <div className="space-y-2">
                                        {(prop.type === 'text' || prop.type === 'number' || prop.type === 'url' || prop.type === 'email' || prop.type === 'phone' || prop.type === 'image') && (
                                            <input
                                                type={prop.type === 'number' ? 'number' : 'text'}
                                                value={prop.defaultValue || ''}
                                                onChange={(e) => updateProperty(index, { defaultValue: e.target.value })}
                                                className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-xs placeholder-slate-400"
                                                placeholder={prop.type === 'image' ? "Default Image URL (optional)" : "Default value (optional)"}
                                            />
                                        )}

                                        {prop.type === 'checkbox' && (
                                            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={prop.defaultValue === 'true'}
                                                    onChange={(e) => updateProperty(index, { defaultValue: e.target.checked ? 'true' : 'false' })}
                                                    className="rounded border-slate-300 text-blue-600"
                                                />
                                                Default Checked
                                            </label>
                                        )}

                                        {(prop.type === 'document' || prop.type === 'documents') && (
                                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700 p-2">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Allowed Types</span>
                                                    <button
                                                        onClick={() => toggleAllAllowedTypes(index)}
                                                        className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
                                                    >
                                                        {(prop.allowedTypes?.length === allTypes.length) ? 'Deselect All' : 'Select All'}
                                                    </button>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                                                    {allTypes.map(type => (
                                                        <label
                                                            key={type}
                                                            className={`
                                                                flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] cursor-pointer border transition-colors
                                                                ${(prop.allowedTypes || []).includes(type as NexusType)
                                                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}
                                                            `}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={(prop.allowedTypes || []).includes(type as NexusType)}
                                                                onChange={() => toggleAllowedType(index, type)}
                                                                className="hidden"
                                                            />
                                                            {(prop.allowedTypes || []).includes(type as NexusType) ? <CheckSquare size={10} /> : <Square size={10} />}
                                                            {type}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {(prop.type === 'multiselect' || prop.type === 'select') && (
                                            <div className="space-y-1">
                                                <div className="flex flex-wrap gap-1">
                                                    {(prop.options || []).sort().map((opt, i) => (
                                                        <span key={i} className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                                                            {opt}
                                                            <button
                                                                onClick={() => {
                                                                    const newOptions = (prop.options || []).filter((o) => o !== opt);
                                                                    updateProperty(index, { options: newOptions });
                                                                }}
                                                                className="text-slate-400 hover:text-red-500"
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Add option (Enter)..."
                                                    className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-xs"
                                                    onKeyPress={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const val = e.currentTarget.value.trim();
                                                            if (val) {
                                                                const currentOptions = prop.options || [];
                                                                const newOptions = val.split(',').map(v => v.trim()).filter(Boolean);
                                                                const uniqueOptions = newOptions.filter(opt => !currentOptions.includes(opt));
                                                                if (uniqueOptions.length > 0) {
                                                                    const updatedOptions = [...currentOptions, ...uniqueOptions].sort();
                                                                    updateProperty(index, { options: updatedOptions });
                                                                }
                                                                e.currentTarget.value = '';
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-2 align-top text-right">
                                    <button
                                        onClick={() => deleteProperty(index)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                                        title="Delete property"
                                    >
                                        <X size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer - Add Property */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex gap-2 max-w-md">
                    <input
                        type="text"
                        value={newPropertyKey}
                        onChange={(e) => setNewPropertyKey(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addProperty()}
                        placeholder="New property name..."
                        className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-sm shadow-sm"
                    />
                    <button
                        onClick={addProperty}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors text-sm font-medium"
                    >
                        <Plus size={16} />
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PropertyEditor;
