import React, { useState } from 'react';
import { Search, Loader2, MessageSquare, X } from 'lucide-react';
import { db } from '../services/db';
import { geminiService } from '../services/geminiService';
import { NexusObject } from '../types';

interface AISearchModalProps {
  onClose: () => void;
  onNavigate: (obj: NexusObject) => void;
}

const AISearchModal: React.FC<AISearchModalProps> = ({ onClose, onNavigate }) => {
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

    const aiAnswer = await geminiService.generateRAGResponse(query, localResults);
    
    setResponse(aiAnswer);
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 border dark:border-slate-800">
        
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg text-purple-600 dark:text-purple-400">
            <MessageSquare size={20} />
          </div>
          <form onSubmit={handleSearch} className="flex-1">
            <input
              autoFocus
              className="w-full text-lg outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 bg-transparent"
              placeholder="Ask NexusAI (e.g., 'What did we discuss about architecture?')"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-black/20">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Loader2 size={32} className="animate-spin mb-3 text-purple-500" />
              <p>Thinking & Retrieving from Local Graph...</p>
            </div>
          )}

          {!isLoading && response && (
            <div className="space-y-6">
              {/* AI Answer */}
              <div className="bg-white dark:bg-slate-800 p-5 rounded-lg border border-purple-100 dark:border-purple-900/30 shadow-sm">
                <h3 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-2">NexusAI Answer</h3>
                <div className="prose prose-sm dark:prose-invert text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {response}
                </div>
              </div>

              {/* Citations / Sources */}
              {results.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Sources Found ({results.length})</h3>
                  <div className="grid gap-2">
                    {results.map(obj => (
                      <button 
                        key={obj.id}
                        onClick={() => onNavigate(obj)}
                        className="text-left bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all group"
                      >
                        <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">{obj.title}</div>
                        <div className="text-xs text-slate-400 mt-1 flex gap-2">
                          <span className="bg-slate-100 dark:bg-slate-700 px-1.5 rounded">{obj.type}</span>
                          <span>Last modified: {new Date(obj.lastModified).toLocaleDateString()}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isLoading && !response && (
             <div className="text-center text-slate-400 py-10">
                <p>Type a question to search your Knowledge Graph semantically.</p>
                <p className="text-xs mt-2">Powered by Local Vector Search + Gemini 2.5 Flash</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AISearchModal;