import React, { useState } from 'react';
import { Search, Loader2, MessageSquare, X, Sparkles } from 'lucide-react';
import { db } from '../services/db';
import { geminiService } from '../services/geminiService';
import { NexusObject } from '../types';

interface AISearchModalProps {
  onClose: () => void;
  onNavigate: (obj: NexusObject) => void;
  lang: 'en' | 'es';
}

const AISearchModal: React.FC<AISearchModalProps> = ({ onClose, onNavigate, lang }) => {
  const [mode, setMode] = useState<'search' | 'ai'>('search');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [results, setResults] = useState<NexusObject[]>([]);
  const [searchResults, setSearchResults] = useState<NexusObject[]>([]);
  const [typeColors, setTypeColors] = useState<Record<string, string>>({});

  const [searchTime, setSearchTime] = useState<number | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setResponse(null);
    setSearchTime(null);

    const startTime = performance.now();
    const localResults = await db.vectorSearch(query);
    const endTime = performance.now();
    setSearchTime(endTime - startTime);

    setResults(localResults);

    const aiAnswer = await geminiService.generateRAGResponse(query, localResults, lang);

    setResponse(aiAnswer);
    setIsLoading(false);
  };

  // Load type colors on mount
  React.useEffect(() => {
    const loadColors = async () => {
      const schemas = await db.getAllTypeSchemas();
      const colors: Record<string, string> = {};
      schemas.forEach(schema => {
        if (schema.color) {
          colors[schema.type] = schema.color;
        }
      });
      setTypeColors(colors);
    };
    loadColors();
  }, []);

  // ... (useEffect for colorize)

  // Real-time search effect (only in search mode)
  React.useEffect(() => {
    if (mode === 'search' && query.trim()) {
      const timer = setTimeout(async () => {
        const startTime = performance.now();
        const results = await db.vectorSearch(query);
        const endTime = performance.now();
        setSearchTime(endTime - startTime);
        setSearchResults(results);
      }, 300);
      return () => clearTimeout(timer);
    } else if (mode === 'search' && !query.trim()) {
      setSearchResults([]);
      setSearchTime(null);
    }
  }, [query, mode]);

  // Helper to format time
  const formatTime = (ms: number) => {
    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  };

  // Handle clicks on internal links in the AI response
  const handleContentClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');

    if (link && link.dataset.objectId) {
      e.preventDefault();
      const objectId = link.dataset.objectId;

      // 1. Try to find in current search results
      let obj = results.find(r => r.id === objectId);

      // 2. If not found, try to fetch from DB
      if (!obj) {
        try {
          obj = await db.getObjectById(objectId) || undefined;

          // If still not found, check if it's an email
          if (!obj) {
            const email = await db.getGmailMessageById(objectId);
            if (email) {
              // Open email in Gmail
              const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${objectId}`;
              window.open(gmailUrl, '_blank');
              return;
            }
          }
        } catch (err) {
          console.error("Error fetching object:", err);
        }
      }

      if (obj) {
        if (obj.type === 'Email') {
          const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${obj.id}`;
          window.open(gmailUrl, '_blank');
        } else {
          onNavigate(obj);
          onClose();
        }
      } else {
        console.warn(`Object with ID ${objectId} not found.`);
        // Optional: Show a toast or alert
        // alert(lang === 'es' ? 'Documento no encontrado' : 'Document not found');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-7xl rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 border dark:border-slate-800">

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg text-purple-600 dark:text-purple-400">
              <Search size={20} />
            </div>
            <div className="flex-1 flex gap-2">
              <button
                onClick={() => setMode('search')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'search'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                {lang === 'es' ? '🔍 Buscar Documentos' : '🔍 Search Documents'}
              </button>
              <button
                onClick={() => setMode('ai')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'ai'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                {lang === 'es' ? '🤖 Preguntar a IA' : '🤖 Ask AI'}
              </button>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSearch} className="flex-1">
            <input
              autoFocus
              className="w-full text-lg outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 bg-transparent"
              placeholder={
                mode === 'search'
                  ? (lang === 'es' ? "Buscar en tus documentos..." : "Search in your documents...")
                  : (lang === 'es' ? "Pregunta a NexusAI (presiona Enter)" : "Ask NexusAI (press Enter)")
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden bg-slate-50/50 dark:bg-black/20 relative">
          {/* SEARCH MODE */}
          {mode === 'search' && (
            <div className="h-full overflow-y-auto p-6">
              {!query.trim() && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <Search size={48} className="mb-4 text-slate-300 dark:text-slate-600" />
                  <p className="text-lg">{lang === 'es' ? 'Escribe para buscar en tus documentos' : 'Type to search in your documents'}</p>
                  <p className="text-sm mt-2">{lang === 'es' ? 'Búsqueda en tiempo real' : 'Real-time search'}</p>
                </div>
              )}

              {query.trim() && searchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <p className="text-lg">{lang === 'es' ? 'No se encontraron documentos' : 'No documents found'}</p>
                </div>
              )}

              {query.trim() && searchResults.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <Search size={14} />
                    {lang === 'es' ? `${searchResults.length} Resultados` : `${searchResults.length} Results`}
                    {searchTime && (
                      <span className="ml-2 text-slate-400 font-normal normal-case opacity-75">
                        ({formatTime(searchTime)})
                      </span>
                    )}
                  </h3>

                  <div className="grid gap-3">
                    {searchResults.map(obj => (
                      <button
                        key={obj.id}
                        onClick={() => {
                          if (obj.type === 'Email') {
                            const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${obj.id}`;
                            window.open(gmailUrl, '_blank');
                          } else {
                            onNavigate(obj);
                            onClose();
                          }
                        }}
                        className="text-left bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all group flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between w-full">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold border"
                            style={{
                              backgroundColor: typeColors[obj.type] || '#64748b',
                              color: '#ffffff',
                              borderColor: 'transparent'
                            }}
                          >
                            {obj.type}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(obj.lastModified).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
                          {obj.title}
                        </div>

                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                          {obj.content.replace(/<[^>]*>?/gm, '').substring(0, 150)}...
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI MODE */}
          {mode === 'ai' && (
            <>
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 z-10 bg-white/50 dark:bg-black/50 backdrop-blur-sm">
                  <Loader2 size={32} className="animate-spin mb-3 text-purple-500" />
                  <p>{lang === 'es' ? 'Pensando y buscando en el Gráfico Local...' : 'Thinking & Retrieving from Local Graph...'}</p>
                </div>
              )}

              {!isLoading && !response && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <MessageSquare size={48} className="mb-4 text-purple-300 dark:text-purple-600" />
                  <p className="text-lg">{lang === 'es' ? 'Escribe una pregunta para buscar semánticamente.' : 'Type a question to search your Knowledge Graph semantically.'}</p>
                  <p className="text-xs mt-2">Powered by Local Vector Search + Gemini 2.5 Flash</p>
                </div>
              )}

              {response && (
                <div className="flex h-full">
                  {/* Left Column: AI Answer (60%) */}
                  <div className="w-3/5 p-8 overflow-y-auto border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <h3 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-4 flex items-center gap-2">
                      <Sparkles size={14} />
                      NexusAI Answer
                    </h3>
                    <div
                      id="ai-response-content"
                      className="prose prose-lg dark:prose-invert max-w-none 
                        [&_a]:no-underline [&_a]:hover:underline [&_a]:cursor-pointer [&_a]:font-medium
                        [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-2
                        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
                      "
                      dangerouslySetInnerHTML={{ __html: response }}
                      onClick={handleContentClick}
                    />
                  </div>

                  {/* Right Column: Sources (40%) */}
                  <div className="w-2/5 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-950/30">
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-4 flex items-center gap-2">
                      <Search size={14} />
                      {lang === 'es' ? `Fuentes Encontradas (${results.length})` : `Sources Found (${results.length})`}
                    </h3>

                    <div className="grid gap-3">
                      {results.map(obj => (
                        <button
                          key={obj.id}
                          onClick={() => {
                            if (obj.type === 'Email') {
                              const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${obj.id}`;
                              window.open(gmailUrl, '_blank');
                            } else {
                              onNavigate(obj);
                              onClose();
                            }
                          }}
                          className="text-left bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all group flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between w-full">
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold border"
                              style={{
                                backgroundColor: typeColors[obj.type] || '#64748b',
                                color: '#ffffff',
                                borderColor: 'transparent'
                              }}
                            >
                              {obj.type}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(obj.lastModified).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
                            {obj.title}
                          </div>

                          {/* Preview of content matches */}
                          <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                            {obj.content.replace(/<[^>]*>?/gm, '').substring(0, 150)}...
                          </div>
                        </button>
                      ))}

                      {results.length === 0 && (
                        <div className="text-center py-10 text-slate-400 italic">
                          {lang === 'es' ? 'No se encontraron documentos relevantes.' : 'No relevant documents found.'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div >
  );
};

export default AISearchModal;