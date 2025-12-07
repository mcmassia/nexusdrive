import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { NexusObject, NexusProperty, TypeSchema, NexusType } from '../types';

interface MetadataTableProps {
  object: NexusObject;
  onChange: (updatedMetadata: NexusProperty[]) => void;
  onTagRemove?: (tag: string) => void;
  onTagClick?: (tag: string) => void;
  allObjects?: NexusObject[];
  typeSchema?: TypeSchema;
  availableSchemas?: TypeSchema[];
  onDocumentClick?: (documentId: string) => void;
  availableTags?: string[]; // List of all available tags for autocomplete
  lang: 'en' | 'es';
}

const normalizeText = (text: string) => {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

interface TagsInputProps {
  value: string | string[];
  onChange: (value: string[]) => void;
  availableTags: string[];
}

const TagsInput: React.FC<TagsInputProps> = ({ value, onChange, availableTags }) => {
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  const rawTags = value || [];
  const selectedTags = Array.isArray(rawTags) ? rawTags : (rawTags as string).split(',').filter(Boolean);

  // Filter suggestions based on input
  const filteredTags = availableTags
    .filter(t => !selectedTags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase().replace(/^#/, '')))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-2 relative">
      <div className="flex flex-wrap gap-2">
        {selectedTags.map((tag, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded-full text-xs font-semibold text-white flex items-center gap-1"
            style={{ backgroundColor: '#10b981' }} // Use default tag color or lookup
          >
            #{tag.replace(/^#/, '')}
            <button
              onClick={() => {
                const newSelected = selectedTags.filter((_, idx) => idx !== i);
                onChange(newSelected);
              }}
              className="hover:bg-white/20 rounded-full w-4 h-4 flex items-center justify-center -mr-1"
            >×</button>
          </span>
        ))}

        <div className="relative">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              setShowTagSuggestions(true);
            }}
            onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = tagInput.trim().replace(/^#/, '');
                if (val && !selectedTags.includes(val)) {
                  onChange([...selectedTags, val]);
                  setTagInput('');
                  setShowTagSuggestions(false);
                }
              } else if (e.key === 'Backspace' && !tagInput && selectedTags.length > 0) {
                const newSelected = selectedTags.slice(0, -1);
                onChange(newSelected);
              }
            }}
            placeholder="+ #tag"
            className="bg-transparent outline-none text-xs min-w-[60px] h-6 focus:border-b focus:border-blue-500 transition-colors"
          />

          {showTagSuggestions && tagInput && filteredTags.length > 0 && (
            <div className="absolute top-full left-0 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg mt-1 w-40 max-h-40 overflow-y-auto">
              {filteredTags.map(tag => (
                <button
                  key={tag}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent blur
                    onChange([...selectedTags, tag]);
                    setTagInput('');
                    setShowTagSuggestions(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MetadataTable: React.FC<MetadataTableProps> = ({ object, onChange, onTagRemove, onTagClick, allObjects = [], typeSchema, availableSchemas = [], onDocumentClick, availableTags = [], lang }) => {
  const [suggestionBox, setSuggestionBox] = useState<{
    visible: boolean;
    top: number;
    left: number;
    width: number;
    filter: string;
    index: number;
  } | null>(null);

  // Local state to track search input values for document/documents types
  const [searchInputs, setSearchInputs] = useState<{ [key: number]: string }>({});
  // Local state for optimistically created objects (to display them before parent refresh)
  const [createdObjects, setCreatedObjects] = useState<NexusObject[]>([]);

  const suggestionRef = useRef<HTMLDivElement>(null);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setSuggestionBox(null);
      }
    };

    if (suggestionBox?.visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [suggestionBox]);

  const handleSearchChange = (index: number, value: string, targetElement: HTMLElement) => {
    // Update local search state
    setSearchInputs(prev => ({ ...prev, [index]: value }));

    // Check for @ mention trigger
    if (value.includes('@')) {
      const parts = value.split('@');
      const lastPart = parts[parts.length - 1];

      const rect = targetElement.getBoundingClientRect();
      setSuggestionBox({
        visible: true,
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        filter: lastPart,
        index
      });
    } else {
      setSuggestionBox(null);
    }
  };

  const handleValueChange = (index: number, value: string | string[]) => {
    const newMetadata = [...object.metadata];
    newMetadata[index].value = value;
    onChange(newMetadata);
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
      // For other types (if we support @ there), replace with title
      // This part might need adjustment if we use local search state for them too, 
      // but for now document/documents are the main focus.
      const parts = (prop.value as string).split('@');
      parts.pop();
      prop.value = parts.join('@') + obj.title;
    }

    onChange(newMetadata);

    // Clear search input and close box
    setSearchInputs(prev => ({ ...prev, [suggestionBox.index]: '' }));
    setSuggestionBox(null);
  };

  const handleCreateDocument = async (type: NexusType, title: string) => {
    if (!suggestionBox) return;

    // 1. Create the new object
    const newObj: NexusObject = {
      id: Date.now().toString(),
      title: title,
      type: type,
      content: '',
      metadata: [], // Should ideally load default schema, but empty is safe for now
      lastModified: new Date(),
      tags: []
    };

    // Load schema to populate default metadata if possible (async operation inside sync flow is tricky here without refactor, 
    // but we can try to get it from availableSchemas if it has default values, or just leave empty for now)
    // For a robust implementation, we might want to call a service that handles this, but we'll stick to basic creation.

    // We need to save it to DB
    // Import db service dynamically or pass it as prop? 
    // The component doesn't import db. It receives objects. 
    // We need a prop for onObjectCreate or similar if we want to be pure, 
    // OR we can import db here since we are in a "smart" component.
    // Looking at imports, db is not imported. Let's import it.
    // Wait, we can't easily add imports with replace_file_content if we don't target the top.
    // Let's assume we will add the import in a separate step or use a prop if available.
    // Actually, `Sidebar` imports `db`. `Dashboard` imports `db`. `App` imports `db`.
    // This component `MetadataTable` seems to be presentational but `allObjects` suggests it has data.
    // Looking at imports, db is not imported. Let's check imports again. Line 1-3. No db.
    // We should probably pass `onCreateDocument` prop from parent (Editor.tsx).
    // BUT, for now, to avoid refactoring parents, I will add `import { db } from '../services/db';` to the top in a separate step.

    // For this step, I will assume `db` is available or I will add it.
    // Let's write the logic assuming `db` will be imported.

    // Optimistic update: Add to local createdObjects so it can be found by renderPropertyInput
    setCreatedObjects(prev => [...prev, newObj]);

    await import('../services/db').then(m => m.db.saveObject(newObj));

    // 2. Link it
    handleSuggestionSelect(newObj);
  };

  const renderSuggestions = () => {
    if (!suggestionBox || !suggestionBox.visible) return null;

    const normalizedFilter = normalizeText(suggestionBox.filter);
    // Include createdObjects in the search pool
    const pool = [...allObjects, ...createdObjects];
    // Deduplicate by ID just in case
    const uniquePool = Array.from(new Map(pool.map(item => [item.id, item])).values());

    const filteredObjects = uniquePool
      .filter(o => normalizeText(o.title).includes(normalizedFilter))
      .slice(0, 10);

    // Check for @Type/Title syntax
    const match = suggestionBox.filter.match(/^@?([a-zA-Z0-9]+)\/(.+)$/);
    let createOption = null;

    if (match) {
      const typeName = match[1];
      const title = match[2];
      // Check if type is valid
      const isValidType = availableSchemas.some(s => s.type.toLowerCase() === typeName.toLowerCase());

      if (isValidType) {
        // Find exact case for type
        const schema = availableSchemas.find(s => s.type.toLowerCase() === typeName.toLowerCase());
        if (schema) {
          createOption = { type: schema.type as NexusType, title };
        }
      }
    } else if (filteredObjects.length === 0 && suggestionBox.filter.length > 0) {
      // Fallback: Allow creating a generic Note or Page if no match? 
      // Or maybe just show "No matches".
      // The user specifically asked for @Type/Title syntax.
      // But also "if the document does not exist, have the option to create it".
      // If they just type "Sevilla" and it doesn't exist, maybe we shouldn't guess the type.
      // So we strictly follow the syntax for creation OR if they are in a specific typed field?
      // The field itself might have `allowedTypes`.

      const prop = object.metadata[suggestionBox.index];
      if (prop.allowedTypes && prop.allowedTypes.length === 1) {
        // If field only allows one type, we can offer to create that type
        createOption = { type: prop.allowedTypes[0], title: suggestionBox.filter };
      }
    }

    return createPortal(
      <div
        ref={suggestionRef}
        style={{
          top: suggestionBox.top,
          left: suggestionBox.left,
          minWidth: Math.max(200, suggestionBox.width)
        }}
        className="fixed z-[9999] max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl mt-1 animate-in fade-in zoom-in-95 duration-100"
      >
        {createOption && (
          <button
            onClick={() => handleCreateDocument(createOption.type, createOption.title)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 truncate border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-3 font-medium"
          >
            <span className="text-lg">✨</span>
            <span>
              {lang === 'es' ? 'Crear' : 'Create'} <strong>{createOption.type}</strong>: {createOption.title}
            </span>
          </button>
        )}

        {filteredObjects.map(o => {
          const schema = availableSchemas.find(s => s.type === o.type);
          const typeColor = schema?.color || '#64748b';

          return (
            <button
              key={o.id}
              onClick={() => handleSuggestionSelect(o)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 truncate border-b border-slate-100 dark:border-slate-700/50 last:border-0 flex items-center gap-3"
            >
              <span
                className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded shrink-0 border border-transparent text-white shadow-sm"
                style={{ backgroundColor: typeColor }}
              >
                {o.type}
              </span>
              <span className="truncate font-medium">{o.title}</span>
            </button>
          );
        })}
        {filteredObjects.length === 0 && !createOption && (
          <div className="px-3 py-2 text-xs text-slate-400 italic">No matches found</div>
        )}
      </div>,
      document.body
    );
  };

  const renderPropertyInput = (prop: NexusProperty, index: number) => {
    // Get schema definition if available
    const schemaProp = typeSchema?.properties.find(p => p.key === prop.key);
    // Use type from schema if available, otherwise fallback to prop.type
    const effectiveType = schemaProp?.type || prop.type;

    switch (effectiveType) {
      case 'number':
        return (
          <input
            type="number"
            value={(prop.value as string) || ''}
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
        const availableOptions = (schemaProp?.options || []).sort();

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
              <div className="flex gap-2">
                <select
                  className="bg-transparent text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none max-w-[150px]"
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
                {/* Allow adding custom option even if list exists */}
                <input
                  type="text"
                  placeholder="+ New"
                  className="bg-transparent outline-none text-xs border-b border-transparent hover:border-slate-300 focus:border-blue-500 w-20 transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = e.currentTarget.value.trim();
                      if (val && !selected.includes(val)) {
                        handleValueChange(index, [...selected, val]);
                        e.currentTarget.value = '';
                      }
                    }
                  }}
                />
              </div>
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
        const selectOptions = (schemaProp?.options || []).sort();
        return (
          <div className="flex gap-2 items-center">
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
            {/* Allow adding custom option */}
            <input
              type="text"
              placeholder="+ New"
              className="bg-transparent outline-none text-xs border-b border-transparent hover:border-slate-300 focus:border-blue-500 w-20 transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = e.currentTarget.value.trim();
                  if (val) {
                    handleValueChange(index, val);
                    e.currentTarget.value = '';
                  }
                }
              }}
            />
          </div>
        );

      case 'document':
      case 'documents':
        const documentIds = Array.isArray(prop.value) ? prop.value : [prop.value].filter(Boolean);
        // Look in both allObjects (from props) and createdObjects (local optimistic)
        const allKnownObjects = [...allObjects, ...createdObjects];
        const linkedDocs = documentIds
          .map(id => allKnownObjects.find(o => o.id === id))
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
              value={searchInputs[index] || ''}
              onChange={(e) => handleSearchChange(index, e.target.value, e.currentTarget)}
              className="flex-1 min-w-[100px] bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200 italic"
              placeholder="Type @ to search..."
            />
          </div>
        );

      case 'url':
        return (
          <div className="flex gap-2">
            <input
              type="text"
              value={(prop.value as string) || ''}
              onChange={(e) => handleValueChange(index, e.target.value)}
              className="flex-1 bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200"
              placeholder="https://..."
            />
            {prop.value && (
              <a
                href={prop.value as string}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-2 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs flex items-center"
              >
                Open ↗
              </a>
            )}
          </div>
        );

      case 'image':
        return (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={(prop.value as string) || ''}
                onChange={(e) => handleValueChange(index, e.target.value)}
                className="flex-1 bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200"
                placeholder="Image URL..."
              />
              {prop.value && (
                <a
                  href={prop.value as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-2 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs flex items-center"
                >
                  Open ↗
                </a>
              )}
            </div>
            {prop.value && (
              <div className="relative w-full h-32 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden border border-slate-200 dark:border-slate-700">
                <img
                  src={prop.value as string}
                  alt={prop.label}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>
        );

      case 'email':
        return (
          <div className="flex gap-2">
            <input
              type="email"
              value={(prop.value as string) || ''}
              onChange={(e) => handleValueChange(index, e.target.value)}
              className="flex-1 bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200"
              placeholder="example@email.com"
            />
            {prop.value && (
              <a
                href={`mailto:${prop.value}`}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-2 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs flex items-center"
              >
                Email ✉
              </a>
            )}
          </div>
        );

      case 'phone':
        return (
          <div className="flex gap-2">
            <input
              type="tel"
              value={(prop.value as string) || ''}
              onChange={(e) => handleValueChange(index, e.target.value)}
              className="flex-1 bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200"
              placeholder="+1 234 567 890"
            />
            {prop.value && (
              <a
                href={`tel:${prop.value}`}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-2 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs flex items-center"
              >
                Call 📞
              </a>
            )}
          </div>
        );

      case 'rating':
        return (
          <div className="flex gap-1 items-center h-full">
            {[1, 2, 3, 4, 5].map((star) => {
              const currentRating = parseInt(prop.value as string || '0', 10);
              const isFilled = star <= currentRating;

              return (
                <button
                  key={star}
                  onClick={() => handleValueChange(index, star.toString())}
                  className={`p-0.5 rounded transition-transform hover:scale-110 focus:outline-none ${isFilled
                    ? 'text-yellow-400 dark:text-yellow-400'
                    : 'text-slate-300 dark:text-slate-600 hover:text-yellow-200 dark:hover:text-yellow-900'
                    }`}
                  title={`${star} Star${star > 1 ? 's' : ''}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={isFilled ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth={isFilled ? "0" : "2"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-star"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              );
            })}
            {prop.value && prop.value !== '0' && (
              <button
                onClick={() => handleValueChange(index, '0')}
                className="ml-2 text-xs text-slate-400 hover:text-red-500 opacity-50 hover:opacity-100"
                title="Clear rating"
              >
                Clear
              </button>
            )}
          </div>
        );

      case 'tags':
        return (
          <TagsInput
            value={prop.value}
            onChange={(val) => handleValueChange(index, val)}
            availableTags={availableTags}
          />
        );

      case 'checkbox':
        return (
          <div className="flex items-center h-full">
            <input
              type="checkbox"
              checked={prop.value === 'true'}
              onChange={(e) => handleValueChange(index, e.target.checked ? 'true' : 'false')}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
        );

      default: // text
        const isUrl = typeof prop.value === 'string' && (prop.value.startsWith('http://') || prop.value.startsWith('https://'));

        return (
          <div className="relative group flex gap-2">
            <input
              type="text"
              value={(prop.value as string) || ''}
              onChange={(e) => handleValueChange(index, e.target.value)}
              onClick={(e) => {
                if (isUrl && (e.metaKey || e.ctrlKey)) {
                  window.open(prop.value as string, '_blank');
                }
              }}
              className={`w-full bg-transparent outline-none focus:text-blue-600 dark:focus:text-blue-400 text-slate-800 dark:text-slate-200 ${isUrl ? 'hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer' : ''}`}
              placeholder="Empty"
              title={isUrl ? "Cmd+Click to open link" : ""}
            />
            {isUrl && (
              <a
                href={prop.value as string}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-2 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs flex items-center shrink-0"
              >
                Open ↗
              </a>
            )}
            {!isUrl && renderSuggestions()}
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
          <tr className="border-b border-slate-200/50 dark:border-slate-700/50">
            <td className="px-4 py-2 font-medium text-slate-500 dark:text-slate-400">
              {lang === 'es' ? 'Última Modificación' : 'Last Modified'}
            </td>
            <td className="px-4 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 text-xs">
              {new Date(object.lastModified).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
              })}
            </td>
          </tr>
          {object.metadata?.map((prop, idx) => (
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
                {object.tags?.map(tag => (
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
      {renderSuggestions()}
    </div>
  );
};

export default MetadataTable;