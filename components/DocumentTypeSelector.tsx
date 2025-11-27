import React, { useEffect, useState } from 'react';
import { FileText, Briefcase, Calendar, CheckSquare, X, User, Sparkles } from 'lucide-react';
import { db } from '../services/db';
import { TypeSchema, NexusType } from '../types';
import { TYPE_CONFIG } from '../constants';

export type DocumentType = string;

interface DocumentTypeSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (type: DocumentType) => void;
    lang: 'en' | 'es';
    triggerRect?: DOMRect | null; // Position to render relative to the trigger button
}

const DocumentTypeSelector: React.FC<DocumentTypeSelectorProps> = ({
    isOpen,
    onClose,
    onSelect,
    lang,
    triggerRect
}) => {
    const [availableTypes, setAvailableTypes] = useState<TypeSchema[]>([]);

    useEffect(() => {
        if (isOpen) {
            db.getAllTypeSchemas().then(schemas => setAvailableTypes(schemas));
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Helper to get icon and color
    const getTypeConfig = (type: string) => {
        const config = TYPE_CONFIG[type as NexusType];
        if (config) return config;

        // Default for custom types
        return {
            icon: 'FileText',
            color: '#64748b', // slate-500
            label: type
        };
    };

    const getIcon = (iconName: string) => {
        switch (iconName) {
            case 'Briefcase': return Briefcase;
            case 'Calendar': return Calendar;
            case 'User': return User;
            case 'CheckSquare': return CheckSquare;
            default: return FileText;
        }
    };

    // Calculate position if triggerRect is provided, otherwise center
    const style: React.CSSProperties = triggerRect ? {
        position: 'absolute',
        top: `${triggerRect.bottom + 8}px`,
        left: `${triggerRect.left - 200}px`, // Align somewhat to the left of the button
        zIndex: 50
    } : {};

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/20 z-40"
                onClick={onClose}
            />

            {/* Popover */}
            <div
                className={`
                    ${triggerRect ? 'fixed' : 'fixed inset-0 flex items-center justify-center pointer-events-none'}
                    z-50
                `}
                style={triggerRect ? style : undefined}
            >
                <div
                    className={`
                        bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700
                        w-72 overflow-hidden pointer-events-auto
                        ${!triggerRect && 'm-4'}
                    `}
                >
                    <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {lang === 'es' ? 'Crear como...' : 'Create as...'}
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="p-2 max-h-80 overflow-y-auto">
                        {availableTypes.map((schema) => {
                            const config = getTypeConfig(schema.type);
                            const Icon = getIcon(config.icon);

                            return (
                                <button
                                    key={schema.type}
                                    onClick={() => onSelect(schema.type)}
                                    className="w-full flex items-start gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left group"
                                >
                                    <div
                                        className="p-2 rounded-md bg-slate-100 dark:bg-slate-800"
                                        style={{ color: config.color }}
                                    >
                                        <Icon size={18} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {schema.type}
                                        </div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">
                                            {lang === 'es' ? 'Crear nuevo ' + schema.type : 'Create new ' + schema.type}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
};

export default DocumentTypeSelector;
