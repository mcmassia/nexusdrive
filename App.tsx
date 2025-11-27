import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import GraphVisualization from './components/GraphVisualization';
import Editor from './components/Editor';
import Dashboard from './components/Dashboard';
import DocumentsView from './components/DocumentsView';
import TypeManager from './components/TypeManager';
import TagsManager from './components/TagsManager';
import AISearchModal from './components/AISearchModal';
import CalendarView from './components/CalendarView';
import TasksView from './components/TasksView';
import SettingsView from './components/SettingsView';
import LoginScreen from './components/LoginScreen';
import RightPanel from './components/RightPanel';
import { NexusObject, NexusType, GraphNode, GraphLink, UserProfile, TypeSchema, NexusProperty } from './types';
import { db } from './services/db';
import { authService } from './services/authService';
import { driveService } from './services/driveService';
import { Search, Plus, LogOut, FileText, User, Briefcase, Calendar, Sparkles, RefreshCw, Menu, X } from 'lucide-react';
import { TYPE_CONFIG, TRANSLATIONS } from './constants';
import { NotificationProvider } from './components/NotificationContext';
import { NotificationUI } from './components/NotificationUI';
import { GlobalErrorHandler } from './components/GlobalErrorHandler';
import { ErrorBoundary } from './components/ErrorBoundary';

// Development helper: Expose db and gmailService to window for console testing
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).db = db;
  (window as any).authService = authService;
  import('./services/gmailService').then(module => {
    (window as any).gmailService = module.gmailService;
  });
  console.log('🔧 [Dev] db, authService, and gmailService exposed to window for console testing');
}


const App: React.FC = () => {
  // Auth State
  const [user, setUser] = useState<UserProfile | null>(authService.getUser());

  // App State
  const [currentView, setCurrentView] = useState<'dashboard' | 'graph' | 'documents' | 'calendar' | 'list' | 'settings' | 'tags' | 'tasks'>('dashboard');
  const [filterType, setFilterType] = useState<NexusType | null>(null);
  const [selectedObject, setSelectedObject] = useState<NexusObject | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [tagsSearchQuery, setTagsSearchQuery] = useState<string>('');


  // Language State
  const [lang, setLang] = useState<'en' | 'es'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nexus_lang');
      if (stored === 'en' || stored === 'es') return stored;
    }
    return 'es'; // Default to Spanish
  });

  // Persist Language
  useEffect(() => {
    localStorage.setItem('nexus_lang', lang);
  }, [lang]);

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nexus_theme');
      if (stored) return stored === 'dark';
      return true; // Default to dark
    }
    return true;
  });

  // Data State
  const [objects, setObjects] = useState<NexusObject[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[], links: GraphLink[] }>({ nodes: [], links: [] });
  const [syncing, setSyncing] = useState(false);
  const [documentsTypeFilter, setDocumentsTypeFilter] = useState<string | null>(null);
  const [availableTypes, setAvailableTypes] = useState<TypeSchema[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Listen for auth changes
  useEffect(() => {
    const handleAuthChange = async (e: any) => {
      const newUser = e.detail;
      setUser(newUser);

      if (newUser && !authService.isInDemoMode()) {
        // User logged in with real account - perform initial sync
        console.log('[App] User logged in, starting initial sync from Drive...');
        setSyncing(true);
        try {
          await db.syncFromDrive();
          await loadData(); // Reload data after sync
        } catch (error) {
          console.error('[App] Initial sync failed:', error);
        } finally {
          setSyncing(false);
        }
      } else if (newUser) {
        // Demo mode or just logged in locally
        loadData();
      }
    };

    window.addEventListener('nexus-auth-change', handleAuthChange);
    return () => window.removeEventListener('nexus-auth-change', handleAuthChange);
  }, []);

  // Background Sync Effect
  useEffect(() => {
    let syncInterval: NodeJS.Timeout;

    const setupBackgroundSync = async () => {
      const prefs = await db.getGmailPreferences();

      if (prefs && prefs.autoSync) {
        const frequencyMinutes = prefs.syncFrequency || 60;
        const frequencyMs = frequencyMinutes * 60 * 1000;

        console.log(`[App] Setting up background sync every ${frequencyMinutes} minutes`);

        // Initial sync check (if needed)
        // We could check lastSyncTime here, but for now let's just rely on the interval
        // or maybe run one immediately if it's been too long?

        syncInterval = setInterval(async () => {
          console.log('[App] Running background Gmail sync...');
          try {
            await db.syncGmailMessages();
            // Optional: Refresh UI if needed, but db updates should trigger re-renders if using live queries
            // For now, we might want to reload emails if the user is on the dashboard
            if (currentView === 'dashboard') {
              // We can't easily force reload the EmailsPanel from here without context/events
              // But the next user interaction or auto-refresh in panel will pick it up
            }
          } catch (err) {
            console.error('[App] Background sync failed:', err);
          }
        }, frequencyMs);
      }
    };

    if (user && !authService.isInDemoMode()) {
      setupBackgroundSync();
    }

    return () => {
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [user, currentView]); // Re-run if user changes. currentView added to potentially refresh if needed, though maybe not strictly necessary for the interval setup itself.

  // Handle Dark Mode Class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('nexus_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('nexus_theme', 'light');
    }
  }, [isDarkMode]);

  const loadData = async () => {
    const allObjects = await db.getObjects();
    setObjects(allObjects);
    const graphData = await db.getGraphData();
    setGraphData(graphData);
    const schemas = await db.getAllTypeSchemas();
    setAvailableTypes(schemas);
  };

  const handleSync = async () => {
    if (authService.isInDemoMode()) {
      alert(lang === 'es' ? 'No disponible en modo demo' : 'Not available in demo mode');
      return;
    }

    setSyncing(true);
    try {
      // Pull changes from Drive - call the internal sync
      // We need to expose this as a public method in db.ts
      await db.syncFromDrive();

      // Sync Calendar Events
      await db.syncCalendarEvents();

      // Reload local data
      await loadData();

      alert(lang === 'es' ? '✅ Sincronizado con Drive' : '✅ Synced with Drive');
    } catch (error) {
      console.error('Sync error:', error);
      alert(lang === 'es' ? '❌ Error al sincronizar' : '❌ Sync error');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, currentView]); // Removed selectedObject to prevent unnecessary reloads

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNodeClick = async (nodeId: string) => {
    const obj = objects.find(o => o.id === nodeId);
    if (obj) {
      setSelectedObject(obj);
      setCurrentView('dashboard');
    }
  };

  // Handle tag click - navigate to tags view with filter
  const handleTagClick = (tagName: string) => {
    setTagsSearchQuery(tagName);
    setCurrentView('tags');
    setSelectedObject(null);
  };

  const createNewObject = async (type: NexusType, title: string) => {
    // Load type schema to get default properties
    const schema = await db.getTypeSchema(type);

    // Initialize metadata from schema
    const metadata: NexusProperty[] = schema?.properties.map(prop => ({
      key: prop.key,
      label: prop.label,
      value: prop.defaultValue || (prop.type === 'documents' ? [] : ''),
      type: prop.type,
      allowedTypes: prop.allowedTypes
    })) || [];

    const newObj: NexusObject = {
      id: Date.now().toString(),
      title: title || 'Untitled',
      type,
      content: '',
      metadata,
      lastModified: new Date(),
      tags: []
    };

    await db.saveObject(newObj);
    await loadData();
    setSelectedObject(newObj);
  };

  const handleCreateCustomType = async () => {
    const typeName = prompt("Enter the name of the new Object Type (e.g., 'Idea', 'Book'):");
    if (typeName) {
      await createNewObject(typeName as NexusType, `New ${typeName}`);
    }
    setIsNewMenuOpen(false);
  };

  const t = TRANSLATIONS[lang];

  if (!user) {
    return <LoginScreen lang={lang} setLang={setLang} />;
  }

  const filteredObjects = filterType
    ? objects.filter(o => o.type === filterType)
    : objects;

  const getHeaderTitle = () => {
    if (currentView === 'dashboard') return `${t.welcome}, ${user.name.split(' ')[0]} `;
    if (currentView === 'graph') return t.knowledgeGraph;
    if (currentView === 'tasks') return lang === 'es' ? 'Tareas' : 'Tasks';
    if (currentView === 'calendar') return t.calendar;
    if (filterType) return filterType === NexusType.PAGE ? t.pages : filterType === NexusType.PERSON ? t.people : filterType === NexusType.MEETING ? t.meetings : t.projects;
    return 'All Objects';
  };

  return (
    <ErrorBoundary>
      <NotificationProvider>
        <GlobalErrorHandler />
        <NotificationUI />
        <div className="flex h-screen w-full bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
          <Sidebar
            currentView={currentView}
            onViewChange={setCurrentView}
            onTypeFilter={setFilterType}
            onObjectSelect={setSelectedObject}
            isDarkMode={isDarkMode}
            toggleTheme={() => setIsDarkMode(!isDarkMode)}
            lang={lang}
            setLang={setLang}
            objects={objects}
            availableTypes={availableTypes}
          />

          <div className="flex-1 flex flex-col relative">
            {/* Top Header - Sticky */}
            <header className="sticky top-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 shrink-0 transition-colors z-30">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                {getHeaderTitle()}
                {authService.isInDemoMode() && (
                  <span className="text-xs font-medium px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full border border-amber-300 dark:border-amber-700 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    Demo Mode
                  </span>
                )}
              </h2>
              <div className="flex gap-3 items-center">
                <button
                  onClick={() => {
                    setIsSearchOpen(true);
                    setSelectedObject(null);
                  }}
                  className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                  title={t.searchPlaceholder}
                >
                  <Search size={20} />
                </button>

                {/* NEW BUTTON & MENU */}
                {/* Sync Button */}
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className={`p - 2 rounded - full transition - all ${syncing
                    ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'
                    : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700'
                    } `}
                  title={syncing ? (lang === 'es' ? 'Sincronizando...' : 'Syncing...') : (lang === 'es' ? 'Sincronizar con Drive' : 'Sync with Drive')}
                >
                  <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                </button>

                {/* Create Button */}
                <div className="relative">
                  <button
                    onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                    className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 shadow-md transition-all flex items-center justify-center"
                    title={t.createNew}
                  >
                    <Plus size={20} />
                  </button>

                  {isNewMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsNewMenuOpen(false)}></div>
                      <div className="absolute right-0 top-12 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-20 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {t.createNew}
                        </div>

                        {/* Dynamically render all available types */}
                        {availableTypes.map(schema => {
                          const iconName = TYPE_CONFIG[schema.type as NexusType]?.icon;
                          const Icon = (iconName === 'User' ? User :
                            iconName === 'Calendar' ? Calendar :
                              iconName === 'Briefcase' ? Briefcase :
                                FileText);

                          return (
                            <button
                              key={schema.type}
                              onClick={() => {
                                createNewObject(schema.type as NexusType, '');
                                setIsNewMenuOpen(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-3"
                            >
                              <Icon size={16} style={{ color: TYPE_CONFIG[schema.type as NexusType]?.color || '#6b7280' }} />
                              <span>{schema.type}</span>
                            </button>
                          );
                        })}

                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
                        <button
                          onClick={() => {
                            setCurrentView('settings');
                            setIsNewMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-purple-600 dark:text-purple-400 font-medium flex items-center gap-3"
                        >
                          <Sparkles size={16} />
                          <span>{lang === 'es' ? 'Crear Tipo Personalizado...' : 'Create Custom Type...'}</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* User Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {user.picture ? (
                      <img src={user.picture} alt="User" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                        {user?.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 hidden md:block">{user?.name || 'User'}</span>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 top-12 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-2 z-50">
                      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                        {user.picture ? (
                          <img src={user.picture} alt="User" className="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-700" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                            {user?.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user?.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                        </div>
                      </div>

                      <button
                        onClick={async () => {
                          if (confirm(lang === 'es'
                            ? '¿Limpiar caché local? Esto eliminará todos los datos locales y volverá a sincronizar desde Drive.'
                            : 'Clear local cache? This will delete all local data and resync from Drive.')) {
                            setShowUserMenu(false);
                            setSyncing(true);
                            try {
                              await db.clearCache();
                              await loadData();
                              alert(lang === 'es' ? 'Caché limpiado exitosamente' : 'Cache cleared successfully');
                            } catch (error) {
                              console.error('Failed to clear cache:', error);
                              alert(lang === 'es' ? 'Error al limpiar caché' : 'Failed to clear cache');
                            } finally {
                              setSyncing(false);
                            }
                          }
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                      >
                        <RefreshCw size={16} />
                        {lang === 'es' ? 'Limpiar caché local' : 'Clear local cache'}
                      </button>

                      <button
                        onClick={() => {
                          authService.logout();
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
                      >
                        <LogOut size={16} />
                        {t.logout}
                      </button>
                    </div>
                  )}
                </div>
              </div >
            </header >

            {/* Main Workspace */}
            <main className="flex-1 overflow-hidden relative p-0 bg-slate-100 dark:bg-black/20 flex">

              <div className="flex-1 w-0 relative min-w-0 overflow-hidden">
                {currentView === 'dashboard' && (
                  <Dashboard onNavigate={setSelectedObject} lang={lang} objects={objects} />
                )}

                {
                  currentView === 'graph' && (
                    <GraphVisualization
                      nodes={graphData.nodes}
                      links={graphData.links}
                      onNodeClick={handleNodeClick}
                      isDarkMode={isDarkMode}
                    />
                  )
                }

                {
                  currentView === 'settings' && (
                    <SettingsView lang={lang} />
                  )
                }

                {
                  currentView === 'tags' && (
                    <TagsManager
                      lang={lang}
                      onNavigate={(doc) => {
                        setSelectedObject(doc);
                        setTagsSearchQuery(''); // Clear filter after navigation
                      }}
                      initialSearchQuery={tagsSearchQuery}
                    />
                  )
                }

                {
                  currentView === 'calendar' && (
                    <CalendarView
                      lang={lang}
                      onNavigate={(obj) => {
                        setSelectedObject(obj);
                      }}
                    />
                  )
                }

                {
                  currentView === 'tasks' && (
                    <TasksView
                      lang={lang}
                      onNavigate={(obj) => setSelectedObject(obj)}
                      availableTypes={availableTypes}
                    />
                  )
                }

                {
                  currentView === 'documents' && (
                    <DocumentsView
                      objects={objects}
                      onSelectObject={(obj) => setSelectedObject(obj)}
                      onRefresh={loadData}
                      initialTypeFilter={documentsTypeFilter}
                      lang={lang}
                      availableTypes={availableTypes}
                    />
                  )
                }

                {
                  currentView === 'list' && (
                    /* 95% Width applied here */
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto h-full pb-20 no-scrollbar max-w-[95%] mx-auto w-full">
                      {filteredObjects.map(obj => (
                        <div
                          key={obj.id}
                          onClick={() => setSelectedObject(obj)}
                          className="bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer transition-all flex flex-col h-40"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                              {obj.type}
                            </span>
                            <div style={{ color: TYPE_CONFIG[obj.type as NexusType]?.color || '#999' }}>
                              {(() => {
                                const iconName = TYPE_CONFIG[obj.type as NexusType]?.icon;
                                const Icon = (iconName === 'User' ? User :
                                  iconName === 'Calendar' ? Calendar :
                                    iconName === 'Briefcase' ? Briefcase :
                                      FileText);
                                return <Icon size={16} />;
                              })()}
                            </div>
                          </div>
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2 line-clamp-2">{obj.title}</h3>
                          <div className="mt-auto flex items-center justify-between text-xs text-slate-400">
                            <span>{new Date(obj.lastModified).toLocaleDateString()}</span>
                            {obj.tags.length > 0 && (
                              <div className="flex gap-1">
                                {obj.tags.slice(0, 2).map((tag, i) => (
                                  <span key={i} className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }

                {selectedObject && (
                  <div className="absolute inset-0 z-20 bg-white dark:bg-slate-900">
                    <Editor
                      object={selectedObject}
                      onSave={async (obj) => {
                        await db.saveObject(obj);
                        loadData();
                      }}
                      onClose={() => setSelectedObject(null)}
                      lang={lang}
                      onNavigateToDocuments={(filterType) => {
                        // Navigate to Documents view with type filter
                        setCurrentView('documents');
                        setDocumentsTypeFilter(filterType || null);
                        setSelectedObject(null);
                      }}
                      onTagClick={handleTagClick}
                      onDelete={async (id) => {
                        await db.deleteObject(id);
                        setSelectedObject(null);
                        loadData();
                      }}
                      onNavigate={(obj) => setSelectedObject(obj)}
                    />
                  </div>
                )}
              </div>

              {/* Right Panel - Always Visible */}
              <RightPanel
                objects={objects}
                lang={lang}
                onNavigate={setSelectedObject}
              />
            </main>

            {
              isSearchOpen && (
                <AISearchModal
                  onClose={() => setIsSearchOpen(false)}
                  onNavigate={(obj) => {
                    setSelectedObject(obj);
                    setIsSearchOpen(false);
                  }}
                  lang={lang}
                />
              )
            }
          </div >
        </div >
      </NotificationProvider>
    </ErrorBoundary>
  );
};

export default App;