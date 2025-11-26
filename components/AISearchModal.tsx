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
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [results, setResults] = useState<NexusObject[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setResponse(null);

    const localResults = await db.vectorSearch(query);
    setResults(localResults);

    const aiAnswer = await geminiService.generateRAGResponse(query, localResults, lang);

    setResponse(aiAnswer);
    setIsLoading(false);
  };

  // Handle clicks on internal links in the AI response
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.tagName === 'A' ? target as HTMLAnchorElement : target.closest('a');

    if (link && link.dataset.objectId) {
      e.preventDefault();
      const obj = results.find(r => r.id === link.dataset.objectId) || { id: link.dataset.objectId } as NexusObject;
      onNavigate(obj);
      onClose();
    }
  };

  // Helper to get color for type
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Page': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Person': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case 'Meeting': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'Project': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-7xl rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 border dark:border-slate-800">

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg text-purple-600 dark:text-purple-400">
            <MessageSquare size={20} />
          </div>
          <form onSubmit={handleSearch} className="flex-1">
            <input
              autoFocus
              className="w-full text-lg outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 bg-transparent"
              placeholder={lang === 'es' ? "Pregunta a NexusAI (ej. '¿Qué discutimos sobre arquitectura?')" : "Ask NexusAI (e.g., 'What did we discuss about architecture?')"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden bg-slate-50/50 dark:bg-black/20 relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 z-10 bg-white/50 dark:bg-black/50 backdrop-blur-sm">
              <Loader2 size={32} className="animate-spin mb-3 text-purple-500" />
              <p>{lang === 'es' ? 'Pensando y buscando en el Gráfico Local...' : 'Thinking & Retrieving from Local Graph...'}</p>
            </div>
          )}

          {!isLoading && !response && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
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
                  className="prose prose-lg dark:prose-invert max-w-none 
                    [&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:no-underline [&_a]:hover:underline [&_a]:cursor-pointer [&_a]:font-medium
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
                        onNavigate(obj);
                        onClose();
                      }}
                      className="text-left bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all group flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between w-full">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold ${getTypeColor(obj.type)}`}>
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
        </div>
      </div>
    </div>
  );
};

export default AISearchModal;