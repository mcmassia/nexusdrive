import React, { useRef, useEffect, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Heading1, Heading2, Heading3, Quote, Code, Link, Hash, AlignLeft, AlignCenter, AlignRight, AlignJustify, Palette, Type, Table } from 'lucide-react';
import { db } from '../services/db';
import { NexusObject, NexusType } from '../types';

interface RichEditorProps {
  initialContent: string;
  onChange: (html: string) => void;
  onMentionClick?: (objectId: string) => void;
  allObjects?: NexusObject[];
  className?: string;
  style?: React.CSSProperties;
}

const RichEditor: React.FC<RichEditorProps> = ({ initialContent, onChange, onMentionClick, allObjects, className = '', style = {} }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);

  // Menu State
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuType, setMenuType] = useState<'mention' | 'tag' | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [query, setQuery] = useState('');

  const [mentionResults, setMentionResults] = useState<NexusObject[]>([]);
  const [tagResults, setTagResults] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isUserEditing, setIsUserEditing] = useState(false);

  // Parse natural date expressions
  const parseDateExpression = (expr: string): NexusObject | null => {
    const today = new Date();
    let targetDate: Date | null = null;
    let title = '';

    const lowerExpr = expr.toLowerCase().trim();

    switch (lowerExpr) {
      case 'today':
      case 'hoy':
        targetDate = today;
        title = `Daily Note: ${targetDate.toISOString().split('T')[0]}`;
        break;
      case 'yesterday':
      case 'ayer':
        targetDate = new Date(today);
        targetDate.setDate(today.getDate() - 1);
        title = `Daily Note: ${targetDate.toISOString().split('T')[0]}`;
        break;
      case 'tomorrow':
      case 'mañana':
        targetDate = new Date(today);
        targetDate.setDate(today.getDate() + 1);
        title = `Daily Note: ${targetDate.toISOString().split('T')[0]}`;
        break;
      case 'anteayer':
        targetDate = new Date(today);
        targetDate.setDate(today.getDate() - 2);
        title = `Daily Note: ${targetDate.toISOString().split('T')[0]}`;
        break;
      case 'pasado mañana':
        targetDate = new Date(today);
        targetDate.setDate(today.getDate() + 2);
        title = `Daily Note: ${targetDate.toISOString().split('T')[0]}`;
        break;
    }

    if (targetDate) {
      return {
        id: `daily-${targetDate.toISOString().split('T')[0]}`,
        title,
        type: NexusType.PAGE,
        content: `<h1>Daily Log: ${targetDate.toISOString().split('T')[0]}</h1><p>What's on your mind today?</p>`,
        lastModified: targetDate,
        tags: ['daily-journal'],
        metadata: [{ key: 'date', label: 'Date', value: targetDate.toISOString().split('T')[0], type: 'date' }]
      };
    }

    return null;
  };

  // Only update content if significantly different AND user is not actively editing
  useEffect(() => {
    if (isUserEditing) {
      return;
    }

    if (editorRef.current && initialContent && editorRef.current.innerHTML !== initialContent) {
      const currentLength = editorRef.current.innerHTML.length;
      const newLength = initialContent.length;

      if (currentLength === 0 || Math.abs(currentLength - newLength) > 100) {
        editorRef.current.innerHTML = initialContent;
      }
    }
  }, [initialContent, isUserEditing]);

  // Autocomplete searches
  useEffect(() => {
    if (!menuOpen || !query) return;

    if (menuType === 'mention') {
      const fetchResults = async () => {
        // Use prop if available, otherwise fetch from db
        const objectsToSearch = allObjects || await db.getObjects();

        const lowerQuery = query.toLowerCase();

        // Check for date expressions first
        const dateObj = parseDateExpression(query);
        if (dateObj) {
          setMentionResults([dateObj]);
          return;
        }

        // Regular search
        const filtered = objectsToSearch.filter(obj =>
          obj.title.toLowerCase().includes(lowerQuery)
        ).slice(0, 5);

        // Add "Create new" option if no results
        if (filtered.length === 0 && query.trim()) {
          const createOption: NexusObject = {
            id: '__CREATE_NEW__',
            title: query,
            type: NexusType.PAGE,
            content: '',
            lastModified: new Date(),
            tags: [],
            metadata: []
          };
          setMentionResults([createOption]);
        } else {
          setMentionResults(filtered);
        }
      };
      fetchResults();
    } else if (menuType === 'tag') {
      const fetchTags = async () => {
        const objs = await db.getObjects();
        const allTags = new Set<string>();
        objs.forEach(obj => obj.tags.forEach(tag => allTags.add(tag)));

        const filtered = Array.from(allTags).filter(tag =>
          tag.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);
        setTagResults(filtered);
      };
      fetchTags();
    }
  }, [menuOpen, query, menuType, allObjects]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (menuOpen) {
      const resultsLen = menuType === 'mention' ? mentionResults.length : tagResults.length;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % resultsLen);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + resultsLen) % resultsLen);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (menuType === 'mention') {
          const obj = mentionResults[selectedIndex];
          if (obj) insertMention(obj);
        } else if (menuType === 'tag') {
          const tag = tagResults[selectedIndex];
          if (tag) insertTag(tag);
        }
      } else if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    }
  };

  const getCaretPosition = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY + 20,
        left: rect.left + window.scrollX
      };
    }
    return { top: 0, left: 0 };
  };

  const insertMention = async (obj: NexusObject) => {
    const selection = window.getSelection();
    if (!selection) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    // Remove the @ and query text
    if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
      const text = textNode.textContent;
      const lastAt = text.lastIndexOf('@');
      if (lastAt !== -1) {
        textNode.textContent = text.substring(0, lastAt);
        const newRange = document.createRange();
        newRange.setStart(textNode, textNode.textContent.length);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    }

    // Handle creating new object if it doesn't exist
    if (obj.id === '__CREATE_NEW__') {
      // Parse type from query (e.g., "@meeting:title" or "@project:name" or "@persona/name")
      let objectTitle = obj.title;
      let objectType = NexusType.PAGE;

      // Support both : and / as separators
      const separator = objectTitle.includes('/') ? '/' : (objectTitle.includes(':') ? ':' : null);

      if (separator) {
        const [typeString, ...titleParts] = objectTitle.split(separator);
        objectTitle = titleParts.join(separator).trim();

        const typeMap: Record<string, NexusType> = {
          'page': NexusType.PAGE,
          'person': NexusType.PERSON,
          'persona': NexusType.PERSON,
          'meeting': NexusType.MEETING,
          'reunión': NexusType.MEETING,
          'reuniones': NexusType.MEETING,
          'projects': NexusType.PROJECT,
          'project': NexusType.PROJECT,
          'proyectos': NexusType.PROJECT
        };

        objectType = typeMap[typeString.toLowerCase()] || NexusType.PAGE;
      }

      // Create new object
      const newObj: NexusObject = {
        id: Date.now().toString(),
        title: objectTitle,
        type: objectType,
        content: '',
        lastModified: new Date(),
        tags: [],
        metadata: []
      };

      await db.saveObject(newObj);
      obj = newObj;
    }

    // Create mention element
    const mention = document.createElement('a');
    mention.contentEditable = 'false';
    mention.className = 'nexus-mention';
    mention.dataset.objectId = obj.id;
    mention.dataset.objectType = obj.type;

    // Use Drive URL if available, otherwise use local anchor
    if (obj.driveFileId) {
      mention.href = `https://docs.google.com/document/d/${obj.driveFileId}/edit`;
      mention.target = '_blank'; // Open in new tab for Drive links
    } else {
      mention.href = `#nexus-id-${obj.id}`;
    }

    // Display only the title, without @ prefix
    mention.textContent = obj.title;

    // Get color from type schema
    let color = '#3b82f6'; // default blue
    try {
      const schema = await db.getTypeSchema(obj.type);
      if (schema?.color) {
        color = schema.color;
      }
    } catch (e) {
      console.warn('Could not fetch schema color for type:', obj.type);
    }

    mention.style.cssText = `color: ${color}; text-decoration: underline; cursor: pointer; font-weight: 500;`;

    mention.addEventListener('click', () => {
      if (onMentionClick) {
        onMentionClick(obj.id);
      }
    });

    range.insertNode(mention);
    range.setStartAfter(mention);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    // Add a space after
    const space = document.createTextNode('\u00A0');
    range.insertNode(space);
    range.setStartAfter(space);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    setMenuOpen(false);

    if (editorRef.current) {
      editorRef.current.focus();
      onChange(editorRef.current.innerHTML);
    }
  };

  const insertTag = (tag: string) => {
    const selection = window.getSelection();
    if (!selection) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    // Remove the # and query text
    if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
      const text = textNode.textContent;
      const lastHash = text.lastIndexOf('#');
      if (lastHash !== -1) {
        textNode.textContent = text.substring(0, lastHash);
        const newRange = document.createRange();
        newRange.setStart(textNode, textNode.textContent.length);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    }

    // Create tag element
    const tagElement = document.createElement('span');
    tagElement.contentEditable = 'false';
    tagElement.className = 'nexus-tag';
    tagElement.textContent = `#${tag}`;
    tagElement.style.cssText = 'background: rgb(16, 185, 129); color: white; padding: 2px 6px; border-radius: 4px; cursor: pointer; margin: 0 2px;';

    range.insertNode(tagElement);
    range.setStartAfter(tagElement);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    // Add a space after
    const space = document.createTextNode('\u00A0');
    range.insertNode(space);
    range.setStartAfter(space);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    setMenuOpen(false);

    if (editorRef.current) {
      editorRef.current.focus();
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    setIsUserEditing(true);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }

    // Reset user editing flag after a delay
    setTimeout(() => {
      setIsUserEditing(false);
    }, 1000);

    // Check for @ or # triggers
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
      const text = textNode.textContent;
      const cursorPos = range.startOffset;

      // Look for @ or # before cursor
      const beforeCursor = text.substring(0, cursorPos);
      const lastAt = beforeCursor.lastIndexOf('@');
      const lastHash = beforeCursor.lastIndexOf('#');
      const lastNewline = beforeCursor.lastIndexOf('\n');

      // For mentions (@), allow spaces - only close on newline
      if (lastAt > lastNewline && lastAt !== -1) {
        // @ mention - allow spaces in query
        const searchQuery = beforeCursor.substring(lastAt + 1);
        setQuery(searchQuery);
        setMenuType('mention');
        setMenuPosition(getCaretPosition());
        setMenuOpen(true);
        setSelectedIndex(0);
      } else if (lastHash > lastNewline && lastHash !== -1) {
        // # tag - also allow spaces for consistency
        const searchQuery = beforeCursor.substring(lastHash + 1);
        setQuery(searchQuery);
        setMenuType('tag');
        setMenuPosition(getCaretPosition());
        setMenuOpen(true);
        setSelectedIndex(0);
      } else {
        setMenuOpen(false);
      }
    }
  };

  const execCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('nexus-mention') || target.closest('.nexus-mention')) {
      const mention = target.classList.contains('nexus-mention') ? target : target.closest('.nexus-mention') as HTMLElement;
      const objectId = mention.dataset.objectId;
      if (objectId && onMentionClick) {
        // Prevent editor from focusing/placing cursor if we're just navigating
        e.preventDefault();
        e.stopPropagation();
        onMentionClick(objectId);
      }
    }
  };

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 flex flex-wrap gap-1">
        <button onClick={() => execCommand('bold')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Bold">
          <Bold size={18} />
        </button>
        <button onClick={() => execCommand('italic')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Italic">
          <Italic size={18} />
        </button>
        <button onClick={() => execCommand('underline')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Underline">
          <Underline size={18} />
        </button>
        <button onClick={() => execCommand('strikeThrough')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Strikethrough">
          <Strikethrough size={18} />
        </button>

        <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

        <button onClick={() => execCommand('formatBlock', '<h1>')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Heading 1">
          <Heading1 size={18} />
        </button>
        <button onClick={() => execCommand('formatBlock', '<h2>')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Heading 2">
          <Heading2 size={18} />
        </button>
        <button onClick={() => execCommand('formatBlock', '<h3>')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Heading 3">
          <Heading3 size={18} />
        </button>

        <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

        <button onClick={() => execCommand('insertUnorderedList')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Bullet List">
          <List size={18} />
        </button>
        <button onClick={() => execCommand('insertOrderedList')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Numbered List">
          <ListOrdered size={18} />
        </button>

        <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

        <button onClick={() => execCommand('formatBlock', '<blockquote>')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Quote">
          <Quote size={18} />
        </button>
        <button onClick={() => execCommand('formatBlock', '<pre>')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Code Block">
          <Code size={18} />
        </button>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        className={`min-h-[500px] p-6 outline-none prose prose-slate max-w-none ${className}`}
        style={{
          ...style,
          color: 'inherit'
        }}
        suppressContentEditableWarning
      />

      {/* Autocomplete Menu */}
      {menuOpen && (
        <div
          className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden"
          style={{ top: menuPosition.top, left: menuPosition.left, maxWidth: '300px' }}
        >
          {menuType === 'mention' ? (
            mentionResults.length > 0 ? (
              mentionResults.map((obj, idx) => (
                <button
                  key={obj.id}
                  onClick={() => insertMention(obj)}
                  className={`w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 ${idx === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                >
                  <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                    {obj.id === '__CREATE_NEW__' ? `Create: ${obj.title}` : obj.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{obj.type}</div>
                </button>
              ))
            ) : <div className="p-2 text-xs text-slate-400 italic text-center">Type to search</div>
          ) : (
            tagResults.length > 0 ? (
              tagResults.map((tag, idx) => (
                <button
                  key={tag}
                  onClick={() => insertTag(tag)}
                  className={`w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 ${idx === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                >
                  <span className="truncate">#{tag}</span>
                </button>
              ))
            ) : <div className="p-2 text-xs text-slate-400 italic text-center">Type to create tag</div>
          )}
        </div>
      )}
    </div>
  );
};

export default RichEditor;