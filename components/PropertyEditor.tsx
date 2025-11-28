import React, { useState } from 'react';
import { PropertyDefinition, PropertyType, NexusType, TypeSchema, Template } from '../types';
import { Plus, X, ChevronDown, CheckSquare, Square, ArrowUp, ArrowDown, FileText, LayoutTemplate, Check, Trash2, Edit2 } from 'lucide-react';
import RichEditor from './RichEditor';

interface PropertyEditorProps {
    schema: TypeSchema;
    onSave: (schema: TypeSchema) => void;
    onCancel: () => void;
    allTypes: string[];
}

const PropertyEditor: React.FC<PropertyEditorProps> = ({ schema, onSave, onCancel, allTypes }) => {
    const [editedSchema, setEditedSchema] = useState<TypeSchema>(schema);
    const [activeTab, setActiveTab] = useState<'properties' | 'templates'>('properties');

    // Properties State
    const [newPropertyKey, setNewPropertyKey] = useState('');

    // Templates State
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

    const propertyTypes: PropertyType[] = ['text', 'number', 'date', 'document', 'documents', 'multiselect', 'select', 'url', 'email', 'phone', 'checkbox', 'image'];

    // --- Properties Logic ---

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
            updateProperty(propIndex, { allowedTypes: [] });
        } else {
            updateProperty(propIndex, { allowedTypes: allTypes as NexusType[] });
        }
    };

    // --- Templates Logic ---

    const handleCreateTemplate = () => {
        const newTemplate: Template = {
            id: Date.now().toString(),
            name: 'New Template',
            content: '<p>Start writing your template...</p>',
            isDefault: false
        };
        setEditingTemplate(newTemplate);
        setIsCreatingTemplate(true);
    };

    const handleSaveTemplate = () => {
        if (!editingTemplate) return;

        const currentTemplates = editedSchema.templates || [];
        let newTemplates;

        if (isCreatingTemplate) {
            newTemplates = [...currentTemplates, editingTemplate];
        } else {
            newTemplates = currentTemplates.map(t => t.id === editingTemplate.id ? editingTemplate : t);
        }

        // If this is the first template, make it default automatically? Maybe not.
        // If this is set as default, unset others
        if (editingTemplate.isDefault) {
            newTemplates = newTemplates.map(t => ({
                ...t,
                isDefault: t.id === editingTemplate.id
            }));
        }

        setEditedSchema({ ...editedSchema, templates: newTemplates });
        setEditingTemplate(null);
        setIsCreatingTemplate(false);
    };

    const handleDeleteTemplate = (id: string) => {
        if (!window.confirm('Are you sure you want to delete this template?')) return;
        setEditedSchema({
            ...editedSchema,
            templates: (editedSchema.templates || []).filter(t => t.id !== id)
        });
    };

    const handleSetDefaultTemplate = (id: string) => {
        const newTemplates = (editedSchema.templates || []).map(t => ({
            ...t,
            isDefault: t.id === id
        }));
        setEditedSchema({ ...editedSchema, templates: newTemplates });
    };

    // --- Render ---

    if (editingTemplate) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col h-full max-h-[85vh] w-full max-w-6xl mx-auto overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-4 flex-1">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                            {isCreatingTemplate ? 'Create Template' : 'Edit Template'}
                        </h2>
                        <input
                            type="text"
                            value={editingTemplate.name}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none w-64"
                            placeholder="Template Name"
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={editingTemplate.isDefault}
                                onChange={(e) => setEditingTemplate({ ...editingTemplate, isDefault: e.target.checked })}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            Set as Default
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setEditingTemplate(null); setIsCreatingTemplate(false); }}
                            className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveTemplate}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm transition-colors font-medium"
                        >
                            Save Template
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
                    <RichEditor
                        initialContent={editingTemplate.content}
                        onChange={(html) => setEditingTemplate({ ...editingTemplate, content: html })}
                        className="min-h-full"
                    />
                </div>
            </div>
        );
    }

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
                        Configure properties and templates for this object type
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
                        Save All Changes
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <button
                    onClick={() => setActiveTab('properties')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'properties'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                >
                    <FileText size={16} />
                    Properties
                </button>
                <button
                    onClick={() => setActiveTab('templates')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'templates'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                >
                    <LayoutTemplate size={16} />
                    Templates
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-0">
                {activeTab === 'properties' ? (
                    <>
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

                        {/* Add Property Footer */}
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
                    </>
                ) : (
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Create New Card */}
                            <button
                                onClick={handleCreateTemplate}
                                className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
                            >
                                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full mb-3 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                                    <Plus size={24} className="text-slate-400 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400" />
                                </div>
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">Create New Template</span>
                            </button>

                            {/* Template Cards */}
                            {(editedSchema.templates || []).map((template) => (
                                <div key={template.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow relative group">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate pr-8">{template.name}</h3>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => setEditingTemplate(template)}
                                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                                title="Edit"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTemplate(template.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 h-12 overflow-hidden relative">
                                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white dark:to-slate-800 opacity-50"></div>
                                        {template.content.replace(/<[^>]*>/g, '').substring(0, 100)}...
                                    </div>

                                    <div className="flex items-center justify-between mt-auto">
                                        <button
                                            onClick={() => handleSetDefaultTemplate(template.id)}
                                            className={`text-xs flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors ${template.isDefault
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium'
                                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                                                }`}
                                        >
                                            {template.isDefault ? <Check size={12} /> : null}
                                            {template.isDefault ? 'Default Template' : 'Set as Default'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PropertyEditor;
