import React from 'react';
import { NexusObject, NexusProperty, TypeSchema } from '../types';


interface MetadataTableProps {
  object: NexusObject;
  onChange: (updatedMetadata: NexusProperty[]) => void;
  onTagRemove?: (tag: string) => void;
  onTagClick?: (tag: string) => void;
  allObjects?: NexusObject[];
  typeSchema?: TypeSchema; // Added typeSchema prop
  onDocumentClick?: (documentId: string) => void; // New prop for document navigation
}

const MetadataTable: React.FC<MetadataTableProps> = ({ object, onChange, onTagRemove, onTagClick, allObjects = [], typeSchema, onDocumentClick }) => { // Destructured onDocumentClick
  const [suggestionBox, setSuggestionBox] = React.useState<{
    visible: boolean;
    top: number;
    left: number;
    filter: string;
    index: number;
  } | null>(null);

  const handleValueChange = (index: number, value: string | string[]) => {
    const newMetadata = [...object.metadata];
    newMetadata[index].value = value;
    onChange(newMetadata);

    // Check for @ mention trigger (for text, document, documents)
    if (typeof value === 'string' && value.endsWith('@')) {
      // Find input element position (simplified for now, just showing below)
      // In a real app we'd use a ref to get exact coordinates
      setSuggestionBox({
        visible: true,
        top: 0, // Position handled by CSS relative to container for now
        left: 0,
        filter: '',
        index
      });
    } else if (suggestionBox && typeof value === 'string') {
      const parts = value.split('@');
      const lastPart = parts[parts.length - 1];
      setSuggestionBox(prev => prev ? { ...prev, filter: lastPart } : null);
    } else {
      setSuggestionBox(null);
    }
  };

  const handleSuggestionSelect = (obj: NexusObject) => {
    if (!suggestionBox) return;

    const newMetadata = [...object.metadata];
    const prop = newMetadata[suggestionBox.index];

    // For document/documents type, save the object ID
    if (prop.type === 'document') {
      prop.value = obj.id;
    } else if (prop.type === 'documents') {
      // Add to array of document IDs
      const currentIds = Array.isArray(prop.value) ? prop.value : [];
      prop.value = [...currentIds, obj.id];
    } else {
      // For other types, remove the @ part and replace with title
      const parts = (prop.value as string).split('@');
      parts.pop(); // Remove the incomplete query
      prop.value = parts.join('@') + obj.title;
    }

    onChange(newMetadata);
    setSuggestionBox(null);
  };

  const renderPropertyInput = (prop: NexusProperty, index: number) => {
    // Get schema definition if available
    const schemaProp = typeSchema?.properties.find(p => p.key === prop.key);
    // Use type from schema if available, otherwise fallback to prop.type
    const effectiveType = schemaProp?.type || prop.type;

    // Helper to render suggestion box
    const renderSuggestions = () => (
      suggestionBox && suggestionBox.index === index && (
        <div className="absolute top-full left-0 z-[100] w-64 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl mt-1">
          {allObjects
            .filter(o => o.title.toLowerCase().includes(suggestionBox.filter.toLowerCase()))
            .slice(0, 5)
            .map(o => (
              <button
                key={o.id}
                onClick={() => handleSuggestionSelect(o)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 truncate border-b border-slate-100 dark:border-slate-700/50 last:border-0"
              >
                {o.title}
              </button>
            ))}
          {allObjects.filter(o => o.title.toLowerCase().includes(suggestionBox.filter.toLowerCase())).length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400 italic">No matches found</div>
          )}
        </div>
      )
    );

    switch (effectiveType) {
      case 'number':
        return (
          <input
            type="number"
            value={prop.value as string}
            onChange={(e) => handleValueChange(index, e.target.value)}
            className="w-full bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200"
            placeholder="0"
          />
        );

      case 'date':
        // Ensure value is YYYY-MM-DD
        // If it's DD/MM/YYYY (from previous manual entry), try to convert
        let dateValue = typeof prop.value === 'string' ? prop.value.split('T')[0] : '';
        if (dateValue && dateValue.includes('/')) {
          const parts = dateValue.split('/');
          if (parts.length === 3) {
            // Assume DD/MM/YYYY -> YYYY-MM-DD
            dateValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }

        return (
          <input
            type="date"
            value={dateValue}
            onChange={(e) => handleValueChange(index, e.target.value)}
            className="w-full bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200"
          />
        );

      case 'multiselect':
        // Get options from schema if available
        const availableOptions = schemaProp?.options || [];

        const rawValue = prop.value || [];
        const selected = Array.isArray(rawValue) ? rawValue : (rawValue as string).split(',').filter(Boolean);

        return (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {selected.map((opt, i) => (
                <span key={i} className="bg-slate-200 dark:bg-slate-700 px-1.5 rounded text-xs flex items-center gap-1">
                  {opt}
                  <button
                    onClick={() => {
                      const newSelected = selected.filter((_, idx) => idx !== i);
                      handleValueChange(index, newSelected);
                    }}
                    className="text-slate-400 hover:text-red-500"
                  >×</button>
                </span>
              ))}
            </div>

            {/* If we have predefined options, show a select/dropdown */}
            {availableOptions.length > 0 ? (
              <select
                className="bg-transparent text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none"
                onChange={(e) => {
                  if (e.target.value && !selected.includes(e.target.value)) {
                    handleValueChange(index, [...selected, e.target.value]);
                    e.target.value = '';
                  }
                }}
                value=""
              >
                <option value="">+ Add option</option>
                {availableOptions.filter(opt => !selected.includes(opt)).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              // Fallback to text input if no options defined
              <input
                type="text"
                placeholder="+ Add custom"
                className="bg-transparent outline-none text-xs min-w-[50px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value.trim();
                    if (val) {
                      handleValueChange(index, [...selected, val]);
                      e.currentTarget.value = '';
                    }
                  }
                }}
              />
            )}
          </div>
        );

      case 'select':
        // Get options from schema if available
        const selectOptions = schemaProp?.options || [];
        return (
          <select
            value={prop.value as string || ''}
            onChange={(e) => handleValueChange(index, e.target.value)}
            className="w-full bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200"
          >
            <option value="">Select...</option>
            {selectOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'document':
      case 'documents':
        const documentIds = Array.isArray(prop.value) ? prop.value : [prop.value].filter(Boolean);
        const linkedDocs = documentIds
          .map(id => allObjects.find(o => o.id === id))
          .filter(Boolean) as NexusObject[];

        return (
          <div className="relative group flex flex-wrap gap-2 items-center">
            {linkedDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                <button
                  onClick={() => onDocumentClick?.(doc.id)}
                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                >
                  {doc.title}
                </button>
                <button
                  onClick={() => {
                    const newMetadata = [...object.metadata];
                    const currentProp = newMetadata[index];
                    if (currentProp.type === 'documents') {
                      // Remove from array
                      currentProp.value = (currentProp.value as string[]).filter(id => id !== doc.id);
                    } else {
                      // Clear single value
                      currentProp.value = '';
                    }
                    onChange(newMetadata);
                  }}
                  className="text-gray-400 hover:text-red-600 text-xs"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
            <input
              type="text"
              value=""
              onChange={(e) => handleValueChange(index, e.target.value)}
              className="flex-1 min-w-[100px] bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200 italic"
              placeholder="Type @ to search..."
            />
            {renderSuggestions()}
          </div>
        );

      default: // text
        return (
          <div className="relative group">
            <input
              type="text"
              value={prop.value as string}
              onChange={(e) => handleValueChange(index, e.target.value)}
              className="w-full bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200"
              placeholder="Empty"
            />
            {renderSuggestions()}
          </div>
        );
    }
  };

  return (
    <div className="mb-6 border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden bg-slate-50 dark:bg-slate-800/50 transition-colors">
      <div className="px-4 py-1 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">
        Google Doc Frontmatter (Metadata Layer)
      </div>
      <table className="w-full text-sm text-left">
        <tbody>
          <tr className="border-b border-slate-200/50 dark:border-slate-700/50">
            <td className="px-4 py-2 w-32 font-medium text-slate-500 dark:text-slate-400">Type</td>
            <td className="px-4 py-2 text-slate-700 dark:text-slate-200 font-semibold bg-white dark:bg-slate-900">{object.type}</td>
          </tr>
          {object.metadata.map((prop, idx) => (
            <tr key={prop.key} className="border-b border-slate-200/50 dark:border-slate-700/50 last:border-0">
              <td className="px-4 py-2 font-medium text-slate-500 dark:text-slate-400">
                {prop.label}
                {prop.type !== 'text' && (
                  <span className="ml-2 text-xs text-slate-400">({prop.type})</span>
                )}
              </td>
              <td className="px-4 py-2 bg-white dark:bg-slate-900 overflow-visible">
                {renderPropertyInput(prop, idx)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="px-4 py-2 font-medium text-slate-500 dark:text-slate-400">Tags</td>
            <td className="px-4 py-2 bg-white dark:bg-slate-900">
              <div className="flex flex-wrap gap-2">
                {object.tags.map(tag => (
                  <span
                    key={tag}
                    onClick={() => onTagClick && onTagClick(tag)}
                    className="px-3 py-1 rounded-full text-white font-semibold text-sm flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: '#10b981' }}
                  >
                    #{tag}
                    {onTagRemove && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent tag click when removing
                          onTagRemove(tag);
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:bg-white/20 rounded px-1 transition-opacity"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <span className="text-slate-300 dark:text-slate-600 text-xs italic ml-2 self-center">
                (Saved in properties)
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default MetadataTable;