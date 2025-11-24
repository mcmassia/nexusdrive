import React, { useState } from 'react';
import { PropertyDefinition, PropertyType, NexusType, TypeSchema } from '../types';
import { Plus, X, ChevronDown } from 'lucide-react';

interface PropertyEditorProps {
    schema: TypeSchema;
    onSave: (schema: TypeSchema) => void;
    onCancel: () => void;
}

const PropertyEditor: React.FC<PropertyEditorProps> = ({ schema, onSave, onCancel }) => {
    const [editedSchema, setEditedSchema] = useState<TypeSchema>(schema);
    const [newPropertyKey, setNewPropertyKey] = useState('');

    const propertyTypes: PropertyType[] = ['text', 'number', 'date', 'document', 'documents', 'multiselect', 'select'];
    const availableTypes = Object.values(NexusType);

    const addProperty = () => {
        if (!newPropertyKey.trim()) return;

        const newProp: PropertyDefinition = {
            key: newPropertyKey.toLowerCase().replace(/\s+/g, '_'),
            label: newPropertyKey,
            type: 'text',
            required: false,
            options: [] // Initialize empty options array for all properties
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

        // Ensure options array exists for select and multiselect types
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

    const toggleAllowedType = (propIndex: number, type: NexusType) => {
        const prop = editedSchema.properties[propIndex];
        const current = prop.allowedTypes || [];
        const updated = current.includes(type)
            ? current.filter(t => t !== type)
            : [...current, type];

        updateProperty(propIndex, { allowedTypes: updated.length > 0 ? updated : undefined });
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6 max-w-3xl mx-auto">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                    Edit Type: {editedSchema.type}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Define custom properties for this type
                </p>

                {/* Type Color */}
                <div className="mt-4">
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                        Type Color
                    </label>
                    <input
                        type="color"
                        value={editedSchema.color || '#3b82f6'}
                        onChange={(e) => setEditedSchema({ ...editedSchema, color: e.target.value })}
                        className="h-10 w-20 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
                    />
                </div>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {editedSchema.properties.map((prop, index) => (
                    <div
                        key={index}
                        className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50"
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-3">
                                {/* Label */}
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                        Label
                                    </label>
                                    <input
                                        type="text"
                                        value={prop.label}
                                        onChange={(e) => updateProperty(index, { label: e.target.value })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-sm"
                                    />
                                </div>

                                {/* Type & Required */}
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                            Type
                                        </label>
                                        <select
                                            value={prop.type}
                                            onChange={(e) => updateProperty(index, { type: e.target.value as PropertyType })}
                                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-sm"
                                        >
                                            {propertyTypes.map(type => (
                                                <option key={type} value={type}>{type}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex items-end">
                                        <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={prop.required || false}
                                                onChange={(e) => updateProperty(index, { required: e.target.checked })}
                                                className="rounded"
                                            />
                                            <span className="text-sm text-slate-600 dark:text-slate-400">Required</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Default Value */}
                                {(prop.type === 'text' || prop.type === 'number') && (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                            Default Value
                                        </label>
                                        <input
                                            type={prop.type === 'number' ? 'number' : 'text'}
                                            value={prop.defaultValue || ''}
                                            onChange={(e) => updateProperty(index, { defaultValue: e.target.value })}
                                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-sm"
                                            placeholder="Optional"
                                        />
                                    </div>
                                )}

                                {/* Allowed Types (for document/documents) */}
                                {(prop.type === 'document' || prop.type === 'documents') && (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                                            Allowed Types
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {availableTypes.map(type => (
                                                <label
                                                    key={type}
                                                    className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={(prop.allowedTypes || []).includes(type)}
                                                        onChange={() => toggleAllowedType(index, type)}
                                                        className="rounded"
                                                    />
                                                    <span className="text-sm">{type}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Options (for multiselect or select) */}
                                {(prop.type === 'multiselect' || prop.type === 'select') && (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                                            Options
                                        </label>
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {(prop.options || []).map((opt, i) => (
                                                <span key={i} className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded text-xs flex items-center gap-1">
                                                    {opt}
                                                    <button
                                                        onClick={() => {
                                                            const newOptions = (prop.options || []).filter((_, idx) => idx !== i);
                                                            updateProperty(index, { options: newOptions });
                                                        }}
                                                        className="text-slate-500 hover:text-red-500"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Add option... (press Enter or use commas)"
                                                className="flex-1 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-sm"
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const val = e.currentTarget.value.trim();
                                                        if (val) {
                                                            const currentOptions = prop.options || [];
                                                            // Split by comma and trim each value
                                                            const newOptions = val.split(',').map(v => v.trim()).filter(Boolean);
                                                            const uniqueOptions = newOptions.filter(opt => !currentOptions.includes(opt));

                                                            if (uniqueOptions.length > 0) {
                                                                updateProperty(index, { options: [...currentOptions, ...uniqueOptions] });
                                                            }
                                                            e.currentTarget.value = '';
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Delete Button */}
                            <button
                                onClick={() => deleteProperty(index)}
                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                title="Delete property"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Property */}
            <div className="mt-4 flex gap-2">
                <input
                    type="text"
                    value={newPropertyKey}
                    onChange={(e) => setNewPropertyKey(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addProperty()}
                    placeholder="New property name..."
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-sm"
                />
                <button
                    onClick={addProperty}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                    <Plus size={18} />
                    Add Property
                </button>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={() => onSave(editedSchema)}
                    className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                >
                    Save Schema
                </button>
            </div>
        </div>
    );
};

export default PropertyEditor;
