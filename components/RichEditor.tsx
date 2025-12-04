import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Heading1, Heading2, Heading3, Quote, Code, Link, Hash, AlignLeft, AlignCenter, AlignRight, AlignJustify, Palette, Type, Table, Undo, Redo, Image as ImageIcon, Trash2, Maximize2, Minimize2, ChevronRight, Minus, Sparkles, X } from 'lucide-react';
import { db } from '../services/db';
import { NexusObject, NexusType, TagConfig } from '../types';
import { useSettings } from './SettingsContext';

interface RichEditorProps {
  initialContent: string;
  onChange: (html: string) => void;
  onMentionClick?: (objectId: string) => void;
  onTagClick?: (tagName: string) => void;
  allObjects?: NexusObject[];
  className?: string;
  style?: React.CSSProperties;
}

const RichEditor: React.FC<RichEditorProps> = ({ initialContent, onChange, onMentionClick, onTagClick, allObjects, className = '', style = {} }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);

  // Settings
  const { isFeatureEnabled } = useSettings();

  // Menu State
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuType, setMenuType] = useState<'mention' | 'tag' | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [query, setQuery] = useState('');

  const [mentionResults, setMentionResults] = useState<NexusObject[]>([]);
  const [tagResults, setTagResults] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [imageMenuPos, setImageMenuPos] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isUserEditing, setIsUserEditing] = useState(false);
  const [tagConfigs, setTagConfigs] = useState<Map<string, TagConfig>>(new Map());

  // Debounce helper
  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };



  // Link Modal State
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [savedSelection, setSavedSelection] = useState<Range | null>(null);

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

  // Load tag configurations on mount
  useEffect(() => {
    const loadTagConfigs = async () => {
      const configs = await db.getAllTagConfigs();
      const configMap = new Map<string, TagConfig>();
      configs.forEach(config => configMap.set(config.name, config));
      setTagConfigs(configMap);
    };
    loadTagConfigs();
  }, []);

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
          // Parse type from query early to show correct type in label
          let displayType = 'Page';
          const separator = query.includes('/') ? '/' : (query.includes(':') ? ':' : null);

          if (separator) {
            const [typeString] = query.split(separator);
            const typeMap: Record<string, string> = {
              'page': 'Page',
              'person': 'Persona',
              'persona': 'Persona',
              'meeting': 'Reunion',
              'reunión': 'Reunion',
              'reunion': 'Reunion',
              'reuniones': 'Reunion',
              'cita': 'Cita',
              'citas': 'Cita',
              'project': 'Proyecto',
              'projects': 'Proyecto',
              'proyecto': 'Proyecto',
              'proyectos': 'Proyecto'
            };
            displayType = typeMap[typeString.toLowerCase()] || typeString;
          }

          const createOption: NexusObject = {
            id: '__CREATE_NEW__',
            title: query,
            type: displayType as NexusType,
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

        // If no matches and user has typed something, add option to create new tag
        if (filtered.length === 0 && query.trim()) {
          setTagResults([query.trim()]);
        } else if (query.trim() && !filtered.includes(query.trim())) {
          // If exact match doesn't exist, add it as first option
          setTagResults([query.trim(), ...filtered]);
        } else {
          setTagResults(filtered);
        }
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
    } else {
      // Handle Tab for Indentation
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          execCommand('outdent');
        } else {
          execCommand('indent');
        }
      }

      // Handle Link (Cmd+K)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation(); // Prevent global search
        insertLink();
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
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    // Save the position before modification
    let insertPosition = range.startOffset;
    let parentNode = textNode.parentNode;

    // Remove the @ and query text
    if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
      const text = textNode.textContent;
      const lastAt = text.lastIndexOf('@');
      if (lastAt !== -1) {
        // Remove from @ to cursor
        const beforeAt = text.substring(0, lastAt);
        const afterCursor = text.substring(range.startOffset);
        textNode.textContent = beforeAt + afterCursor;
        insertPosition = lastAt;
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
          'person': 'Persona' as NexusType,
          'persona': 'Persona' as NexusType,
          'meeting': 'Reunion' as NexusType,
          'reunión': 'Reunion' as NexusType,
          'reunion': 'Reunion' as NexusType,
          'reuniones': 'Reunion' as NexusType,
          'cita': 'Cita' as NexusType,
          'citas': 'Cita' as NexusType,
          'project': 'Proyecto' as NexusType,
          'projects': 'Proyecto' as NexusType,
          'proyecto': 'Proyecto' as NexusType,
          'proyectos': 'Proyecto' as NexusType
        };

        objectType = typeMap[typeString.toLowerCase()] || NexusType.PAGE;
      }

      // Load type schema to get default properties
      const schema = await db.getTypeSchema(objectType);
      const metadata = schema?.properties.map(prop => ({
        key: prop.key,
        label: prop.label,
        value: prop.defaultValue || (prop.type === 'documents' ? [] : ''),
        type: prop.type,
        allowedTypes: prop.allowedTypes
      })) || [];

      // Create new object
      const newObj: NexusObject = {
        id: Date.now().toString(),
        title: objectTitle,
        type: objectType,
        content: '',
        lastModified: new Date(),
        tags: [],
        metadata
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
      const schemas = await db.getAllTypeSchemas();
      const schema = schemas.find(s => s.type === obj.type);
      if (schema?.color) {
        color = schema.color;
      }
    } catch (e) {
      console.warn('Could not fetch schema color for type:', obj.type);
    }

    mention.style.cssText = `color: ${color}; text-decoration: underline; cursor: pointer; font-weight: 500;`;

    mention.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent opening in Drive
      e.stopPropagation();
      if (onMentionClick) {
        onMentionClick(obj.id);
      }
    });

    // Create a new range at the correct insertion point
    const newRange = document.createRange();
    if (textNode.nodeType === Node.TEXT_NODE) {
      newRange.setStart(textNode, insertPosition);
      newRange.setEnd(textNode, insertPosition);
    } else {
      // Fallback if not a text node
      newRange.selectNodeContents(textNode);
      newRange.collapse(false);
    }

    // Insert mention at the correct position
    newRange.insertNode(mention);

    // Add a space after the mention
    const space = document.createTextNode('\u00A0');
    newRange.setStartAfter(mention);
    newRange.insertNode(space);

    // Place cursor after the space
    newRange.setStartAfter(space);
    newRange.collapse(true);

    selection.removeAllRanges();
    selection.addRange(newRange);

    setMenuOpen(false);

    if (editorRef.current) {
      editorRef.current.focus();
      onChange(editorRef.current.innerHTML);
    }
  };

  const insertTag = (tag: string) => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    // Save the position before modification
    let insertPosition = range.startOffset;

    // Remove the # and query text
    if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
      const text = textNode.textContent;
      const lastHash = text.lastIndexOf('#');
      if (lastHash !== -1) {
        // Remove from # to cursor
        const beforeHash = text.substring(0, lastHash);
        const afterCursor = text.substring(range.startOffset);
        textNode.textContent = beforeHash + afterCursor;
        insertPosition = lastHash;
      }
    }

    // Create tag element
    const tagElement = document.createElement('span');
    tagElement.contentEditable = 'false';
    tagElement.className = 'nexus-tag';
    tagElement.textContent = `#${tag}`;

    // Get color from tag config or use default
    const config = tagConfigs.get(tag);
    const tagColor = config?.color || '#10b981'; // Default green

    tagElement.style.cssText = `background: ${tagColor}; color: white; padding: 2px 6px; border-radius: 4px; cursor: pointer; margin: 0 2px;`;


    // Create a new range at the correct insertion point
    const newRange = document.createRange();
    if (textNode.nodeType === Node.TEXT_NODE) {
      newRange.setStart(textNode, insertPosition);
      newRange.setEnd(textNode, insertPosition);
    } else {
      // Fallback if not a text node
      newRange.selectNodeContents(textNode);
      newRange.collapse(false);
    }

    // Insert tag at the correct position
    newRange.insertNode(tagElement);

    // Add a space after the tag
    const space = document.createTextNode('\u00A0');
    newRange.setStartAfter(tagElement);
    newRange.insertNode(space);

    // Place cursor after the space
    newRange.setStartAfter(space);
    newRange.collapse(true);

    selection.removeAllRanges();
    selection.addRange(newRange);

    setMenuOpen(false);

    if (editorRef.current) {
      editorRef.current.focus();
      onChange(editorRef.current.innerHTML);
    }
  };

  const insertToggle = () => {
    const details = document.createElement('details');
    details.className = 'nexus-toggle mb-4 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden group';

    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer p-2 bg-slate-50 dark:bg-slate-800/50 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors list-none flex items-center gap-2 text-slate-800 dark:text-slate-200 select-none';
    summary.innerHTML = '<span class="toggle-icon transition-transform duration-200 inline-block">▶</span> Toggle Title';

    const content = document.createElement('div');
    content.className = 'p-4 bg-white dark:bg-transparent border-t border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';
    content.innerHTML = '<p>Toggle content...</p>';

    details.appendChild(summary);
    details.appendChild(content);

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.insertNode(details);

      // Add a paragraph after to allow continuing typing
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      range.setStartAfter(details);
      range.insertNode(p);

      range.collapse(false);
      triggerChange();
    }
  };

  const insertHorizontalRule = () => {
    execCommand('insertHorizontalRule');
  };

  const insertLink = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      setSavedSelection(selection.getRangeAt(0));
      setLinkUrl('');
      setLinkModalOpen(true);
    }
  };

  const confirmLink = () => {
    if (savedSelection) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedSelection);

      if (linkUrl) {
        execCommand('createLink', linkUrl);
      }

      setLinkModalOpen(false);
      setSavedSelection(null);
    }
  };

  // Process Content: Resolve Assets, Hydrate Links, Colorize Mentions
  useEffect(() => {
    const processContent = async () => {
      if (!editorRef.current) return;

      // 1. Resolve Asset URLs (Images)
      const images = editorRef.current.querySelectorAll('img');
      images.forEach(async (img) => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('asset://')) {
          const assetId = src.replace('asset://', '');
          try {
            const asset = await db.getAsset(assetId);
            if (asset) {
              const url = URL.createObjectURL(asset.blob);
              img.src = url;
              (img as any)._blobUrl = url;
            }
          } catch (error) {
            console.error(`Failed to load asset ${assetId}:`, error);
          }
        }
      });

      // 2. Hydrate Drive Links to Mentions
      if (allObjects && allObjects.length > 0) {
        const links = editorRef.current.querySelectorAll('a');
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.includes('docs.google.com/document/d/')) {
            // Check if already hydrated
            if (link.classList.contains('nexus-mention')) return;

            const match = href.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (match && match[1]) {
              const driveId = match[1];
              const obj = allObjects.find(o => o.driveFileId === driveId);

              if (obj) {
                // Upgrade to mention
                link.classList.add('nexus-mention');
                link.dataset.objectId = obj.id;
                link.dataset.objectType = obj.type;
                // We keep the href as is for fallback, but click handler will intercept
              }
            }
          }
        });
      }

      // 3. Colorize Mentions (including newly hydrated ones)
      const schemas = await db.getAllTypeSchemas();
      if (!editorRef.current) return;

      const schemaMap = new Map(schemas.map(s => [s.type, s.color]));
      const mentions = editorRef.current.querySelectorAll('.nexus-mention');

      mentions.forEach(mention => {
        const type = (mention as HTMLElement).dataset.objectType;
        if (type && schemaMap.has(type)) {
          const color = schemaMap.get(type) || '#3b82f6';
          (mention as HTMLElement).style.color = color;
          (mention as HTMLElement).style.textDecoration = 'underline';
          (mention as HTMLElement).style.cursor = 'pointer';
          (mention as HTMLElement).style.fontWeight = '500';
        }
      });
    };

    processContent();

    // Cleanup function
    return () => {
      if (editorRef.current) {
        const images = editorRef.current.querySelectorAll('img');
        images.forEach((img) => {
          const url = (img as any)._blobUrl;
          if (url) {
            URL.revokeObjectURL(url);
          }
        });
      }
    };
  }, [initialContent, isUserEditing, allObjects]);

  // Intercept all link clicks (generic)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');

      if (anchor) {
        const href = anchor.getAttribute('href');
        if (!href) return;

        // Check if it's a Drive link
        if (href.includes('docs.google.com/document/d/')) {
          const match = href.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (match && match[1]) {
            const driveId = match[1];
            // Find object with this Drive ID
            const obj = allObjects?.find(o => o.driveFileId === driveId);
            if (obj && onMentionClick) {
              e.preventDefault();
              e.stopPropagation();
              onMentionClick(obj.id);
              return;
            }
          }
        }

        // Check if it's an internal anchor link
        if (href.startsWith('#nexus-id-')) {
          const id = href.replace('#nexus-id-', '');
          if (onMentionClick) {
            e.preventDefault();
            e.stopPropagation();
            onMentionClick(id);
            return;
          }
        }
      }
    };

    editor.addEventListener('click', handleLinkClick);
    return () => editor.removeEventListener('click', handleLinkClick);
  }, [allObjects, onMentionClick]);

  const triggerChange = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    setIsUserEditing(true);
    triggerChange(); // Capture normal typing

    if (editorRef.current) {
      // scanForLinks(range.startContainer); // Removed auto-scan
    }

    // Reset user editing flag after a delay
    setTimeout(() => {
      setIsUserEditing(false);
    }, 1000);

    // Check for @ or # triggers
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
      const text = textNode.textContent;
      const cursorPos = range.startOffset;

      // Debugging
      // console.log('handleInput:', {text, cursorPos, charCode: text.charCodeAt(cursorPos - 1) });

      // Check if we just typed a space (normal space 32 or nbsp 160)
      const isSpace = /\s|\u00A0/.test(text.charAt(cursorPos - 1));

      if (isSpace && cursorPos > 0) {
        const lineText = text.substring(0, cursorPos - 1); // Text before the space
        // console.log('LineText:', lineText);

        // Headers
        if (lineText === '#') {
          execCommand('formatBlock', '<h1>');
          const newRange = document.createRange();
          newRange.selectNodeContents(textNode);
          newRange.deleteContents();
          setMenuOpen(false);
          triggerChange(); // Save change
          return;
        }
        if (lineText === '##') {
          execCommand('formatBlock', '<h2>');
          const newRange = document.createRange();
          newRange.selectNodeContents(textNode);
          newRange.deleteContents();
          setMenuOpen(false);
          triggerChange();
          return;
        }
        if (lineText === '###') {
          execCommand('formatBlock', '<h3>');
          const newRange = document.createRange();
          newRange.selectNodeContents(textNode);
          newRange.deleteContents();
          setMenuOpen(false);
          triggerChange();
          return;
        }

        // Unordered List
        if (lineText === '*' || lineText === '-') {
          // Delete the trigger text first
          const rangeToDelete = document.createRange();
          rangeToDelete.setStart(textNode, cursorPos - 2); // "- " is 2 chars
          rangeToDelete.setEnd(textNode, cursorPos);
          rangeToDelete.deleteContents();

          execCommand('insertUnorderedList');
          triggerChange();
          return;
        }

        // Ordered List
        if (lineText === '1.') {
          // Delete the trigger text first
          const rangeToDelete = document.createRange();
          rangeToDelete.setStart(textNode, cursorPos - 3); // "1. " is 3 chars
          rangeToDelete.setEnd(textNode, cursorPos);
          rangeToDelete.deleteContents();

          execCommand('insertOrderedList');
          triggerChange();
          return;
        }

        // Blockquote
        if (lineText === '>') {
          // Delete the trigger text first
          const rangeToDelete = document.createRange();
          rangeToDelete.setStart(textNode, cursorPos - 2); // "> " is 2 chars
          rangeToDelete.setEnd(textNode, cursorPos);
          rangeToDelete.deleteContents();

          execCommand('formatBlock', '<blockquote>');
          triggerChange();
          return;
        }

        // Code Block
        if (lineText === '```') {
          execCommand('formatBlock', '<pre>');
          const newRange = document.createRange();
          newRange.selectNodeContents(textNode);
          newRange.deleteContents();
          setMenuOpen(false);
          triggerChange();
          return;
        }

        // Task List: TD (case insensitive)
        if (lineText.toLowerCase() === 'td') {
          console.log('Detected Task Trigger (TD)');

          // Create the visual task tag
          const taskTag = document.createElement('span');
          taskTag.contentEditable = 'false';
          taskTag.className = 'nexus-task-tag task mr-2 cursor-pointer select-none px-2 py-0.5 rounded text-xs font-bold bg-red-500 text-white';
          taskTag.textContent = 'TAREA';
          taskTag.dataset.status = 'todo';

          // Delete the TD text and the space
          const rangeToDelete = document.createRange();
          rangeToDelete.setStart(textNode, cursorPos - 3); // TD + space
          rangeToDelete.setEnd(textNode, cursorPos);
          rangeToDelete.deleteContents();

          range.insertNode(taskTag);

          // Move cursor after
          range.setStartAfter(taskTag);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          triggerChange(); // Save change
          return;
        }

        // Visual Checkbox: []
        if (lineText === '[]') {
          console.log('Detected Checkbox Trigger');
          // Insert checkbox
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'nexus-checkbox mr-2 cursor-pointer';

          // Delete the [] text and the space
          const rangeToDelete = document.createRange();
          rangeToDelete.setStart(textNode, cursorPos - 3); // [] + space
          rangeToDelete.setEnd(textNode, cursorPos);
          rangeToDelete.deleteContents();

          range.insertNode(checkbox);

          // Move cursor after
          range.setStartAfter(checkbox);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          triggerChange();
          return;
        }

        // Inline Markdown: Bold (**text**)
        const boldMatch = lineText.match(/\*\*(.*?)\*\*$/);
        if (boldMatch) {
          const matchText = boldMatch[1];
          const matchLength = boldMatch[0].length;

          const rangeToDelete = document.createRange();
          rangeToDelete.setStart(textNode, cursorPos - 1 - matchLength);
          rangeToDelete.setEnd(textNode, cursorPos - 1);
          rangeToDelete.deleteContents();

          const boldSpan = document.createElement('b');
          boldSpan.textContent = matchText;

          const insertRange = document.createRange();
          insertRange.setStart(textNode, cursorPos - 1 - matchLength);
          insertRange.collapse(true);
          insertRange.insertNode(boldSpan);

          const newRange = document.createRange();
          newRange.setStartAfter(boldSpan);
          newRange.collapse(true);

          if (boldSpan.nextSibling) {
            newRange.setStart(boldSpan.nextSibling, 1);
            newRange.collapse(true);
          }

          selection.removeAllRanges();
          selection.addRange(newRange);
          triggerChange(); // Save change
          return;
        }

        // Inline Markdown: Italic (*text*)
        const italicMatch = lineText.match(/\*(.*?)\*$/);
        if (italicMatch) {
          const matchText = italicMatch[1];
          const matchLength = italicMatch[0].length;

          const rangeToDelete = document.createRange();
          rangeToDelete.setStart(textNode, cursorPos - 1 - matchLength);
          rangeToDelete.setEnd(textNode, cursorPos - 1);
          rangeToDelete.deleteContents();

          const italicSpan = document.createElement('i');
          italicSpan.textContent = matchText;

          const insertRange = document.createRange();
          insertRange.setStart(textNode, cursorPos - 1 - matchLength);
          insertRange.collapse(true);
          insertRange.insertNode(italicSpan);

          const newRange = document.createRange();
          if (italicSpan.nextSibling) {
            newRange.setStart(italicSpan.nextSibling, 1);
            newRange.collapse(true);
          }

          selection.removeAllRanges();
          selection.addRange(newRange);
          triggerChange(); // Save change
          return;
        }
      }

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

    // Handle Visual Task Tag Click
    if (target.classList.contains('nexus-task-tag')) {
      e.preventDefault();
      e.stopPropagation();

      const isTodo = target.classList.contains('task');

      if (isTodo) {
        // Switch to DONE
        target.classList.remove('task', 'bg-red-500');
        target.classList.add('done', 'bg-green-700');
        target.textContent = 'REALIZADO';
        target.dataset.status = 'done';
      } else {
        // Switch to TODO
        target.classList.remove('done', 'bg-green-700');
        target.classList.add('task', 'bg-red-500');
        target.textContent = 'TAREA';
        target.dataset.status = 'todo';
      }

      // Trigger change to save state
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
      return;
    }

    // Handle Checkbox Click (Task or Visual)
    if (target.tagName === 'INPUT' && (target.classList.contains('nexus-task') || target.classList.contains('nexus-checkbox'))) {
      // We need to manually update the 'checked' attribute in the DOM
      // because React/contentEditable doesn't sync attribute changes automatically for innerHTML
      const input = target as HTMLInputElement;
      const isTask = target.classList.contains('nexus-task');

      if (input.checked) {
        input.setAttribute('checked', 'true');

        // If it's a system task, append completion timestamp
        if (isTask) {
          const now = new Date();
          const timestamp = ` (realizada ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')})`;

          // Create a span for the timestamp
          const span = document.createElement('span');
          span.className = 'text-slate-400 text-xs ml-2 nexus-completion-date';
          span.textContent = timestamp;
          span.contentEditable = 'false'; // Prevent editing the timestamp

          // Insert after the task text
          // We need to find the end of the task text.
          // The structure is: <input> Task Text <br> or <block>
          // We can insert it after the next text node?

          if (input.nextSibling) {
            // Insert after the immediate next sibling (which is usually the text node)
            // But wait, if we uncheck, we need to remove it.
            // Let's look for an existing completion date span first.
            let next = input.nextSibling;
            while (next) {
              if (next.nodeType === Node.ELEMENT_NODE && (next as HTMLElement).classList.contains('nexus-completion-date')) {
                // Already has date, update it? Or leave it?
                // Let's leave it if it exists, or update it.
                next.textContent = timestamp;
                return;
              }
              // Stop if we hit a block element
              if (next.nodeType === Node.ELEMENT_NODE && ['DIV', 'P', 'BR'].includes((next as HTMLElement).tagName)) {
                break;
              }
              next = next.nextSibling;
            }

            // If not found, insert after the text node following the input
            if (input.nextSibling.nodeType === Node.TEXT_NODE) {
              input.parentNode?.insertBefore(span, input.nextSibling.nextSibling);
            } else {
              input.parentNode?.insertBefore(span, input.nextSibling);
            }
          }
        }
      } else {
        input.removeAttribute('checked');

        // If it's a system task, remove completion timestamp
        if (isTask) {
          let next = input.nextSibling;
          while (next) {
            if (next.nodeType === Node.ELEMENT_NODE && (next as HTMLElement).classList.contains('nexus-completion-date')) {
              next.parentNode?.removeChild(next);
              break;
            }
            if (next.nodeType === Node.ELEMENT_NODE && ['DIV', 'P', 'BR'].includes((next as HTMLElement).tagName)) {
              break;
            }
            next = next.nextSibling;
          }
        }
      }

      // Trigger change to save
      triggerChange();
      return;
    }

    // Handle Image Selection
    if (target.tagName === 'IMG') {
      setSelectedImage(target as HTMLImageElement);
      const rect = target.getBoundingClientRect();
      setImageMenuPos({ top: rect.top + window.scrollY, left: rect.left + window.scrollX });
      e.stopPropagation();
      return;
    } else {
      setSelectedImage(null);
    }

    // Handle Mentions
    if (target.classList.contains('nexus-mention') || target.closest('.nexus-mention')) {
      const mention = target.classList.contains('nexus-mention') ? target : target.closest('.nexus-mention') as HTMLElement;
      const objectId = mention.dataset.objectId;
      if (objectId && onMentionClick) {
        e.preventDefault();
        e.stopPropagation();
        onMentionClick(objectId);
      }
    }

    // Handle Tags
    if (target.classList.contains('nexus-tag') || target.closest('.nexus-tag')) {
      const tagEl = target.classList.contains('nexus-tag') ? target : target.closest('.nexus-tag') as HTMLElement;
      const tagText = tagEl.textContent?.replace('#', '').trim();
      if (tagText && onTagClick) {
        e.preventDefault();
        e.stopPropagation();
        onTagClick(tagText);
      }
    }

    // Handle External Links
    const link = target.tagName === 'A' ? target as HTMLAnchorElement : target.closest('a');
    if (link && !link.classList.contains('nexus-mention') && link.href) {
      // It's a standard link (external)
      if (e.metaKey || e.ctrlKey || !isUserEditing) {
        e.preventDefault();
        e.stopPropagation();
        window.open(link.href, '_blank');
      }
    }
  };

  const handleImageAction = (action: 'resize-up' | 'resize-down' | 'delete' | 'copy') => {
    if (!selectedImage) return;

    if (action === 'delete') {
      selectedImage.remove();
      setSelectedImage(null);
    } else if (action === 'resize-up') {
      const currentWidth = selectedImage.width;
      selectedImage.style.width = `${currentWidth * 1.2}px`;
    } else if (action === 'resize-down') {
      const currentWidth = selectedImage.width;
      selectedImage.style.width = `${currentWidth * 0.8}px`;
    } else if (action === 'copy') {
      // Create a temporary canvas to copy image data
      const canvas = document.createElement('canvas');
      canvas.width = selectedImage.naturalWidth;
      canvas.height = selectedImage.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(selectedImage, 0, 0);
      canvas.toBlob(blob => {
        if (blob) {
          const item = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([item]);
          alert('Image copied to clipboard');
        }
      });
    }

    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 flex flex-wrap gap-1">
        <button onClick={() => execCommand('undo')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Undo">
          <Undo size={18} />
        </button>
        <button onClick={() => execCommand('redo')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Redo">
          <Redo size={18} />
        </button>

        <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

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
        <button onClick={() => execCommand('formatBlock', '<p>')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Normal Text">
          <Type size={18} />
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

        <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

        <button onClick={insertLink} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Insert Link (Cmd+K)">
          <Link size={18} />
        </button>
        <button onClick={insertToggle} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Insert Toggle Section">
          <ChevronRight size={18} />
        </button>
        <button onClick={insertHorizontalRule} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Horizontal Rule">
          <Minus size={18} />
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
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {obj.type}
                  </div>
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

      {/* Image Context Menu */}
      {selectedImage && (
        <div
          className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg flex p-1"
          style={{ top: imageMenuPos.top - 50, left: imageMenuPos.left }}
        >
          <button onClick={() => handleImageAction('resize-up')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Enlarge">
            <Maximize2 size={16} />
          </button>
          <button onClick={() => handleImageAction('resize-down')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Shrink">
            <Minimize2 size={16} />
          </button>
          <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
          <button onClick={() => handleImageAction('copy')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Copy">
            <ImageIcon size={16} />
          </button>
          <button onClick={() => handleImageAction('delete')} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded" title="Delete">
            <Trash2 size={16} />
          </button>
        </div>
      )}
      {/* Link Modal */}
      {linkModalOpen && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 p-4 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 flex gap-2 items-center min-w-[300px]">
          <input
            autoFocus
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmLink();
              if (e.key === 'Escape') {
                setLinkModalOpen(false);
                setSavedSelection(null);
              }
            }}
            placeholder="https://example.com"
            className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={confirmLink}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {/* Editor Styles */}
      <style>{`
        details.nexus-toggle[open] > summary > .toggle-icon {
          transform: rotate(90deg);
        }
        details.nexus-toggle > summary::-webkit-details-marker {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default RichEditor;