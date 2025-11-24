import { NexusType, NexusObject, GraphNode, GraphLink } from './types';

// Types Registry (Simulating types_registry.json)
export const TYPE_CONFIG = {
  [NexusType.PAGE]: { color: '#3b82f6', icon: 'FileText' },
  [NexusType.PERSON]: { color: '#ec4899', icon: 'User' },
  [NexusType.MEETING]: { color: '#f59e0b', icon: 'Calendar' },
  [NexusType.PROJECT]: { color: '#10b981', icon: 'Briefcase' },
};

// Translations
export const TRANSLATIONS = {
  en: {
    home: 'Home',
    graph: 'Graph View',
    calendar: 'Calendar',
    types: 'Object Types',
    syncActive: 'Sync Active',
    settings: 'Settings',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    welcome: 'Welcome back',
    searchPlaceholder: "Search or Ask AI...",
    createNew: "Create New",
    recent: "Recent",
    todayJournal: "Today's Journal",
    saving: "Saving...",
    synced: "Synced",
    close: "Close",
    save: "Save",
    linkedRefs: "Linked References",
    noBacklinks: "No backlinks found.",
    context: "Context",
    created: "Created",
    path: "Path",
    eventsFor: "Events for",
    noEvents: "No events scheduled.",
    loginTitle: "NexusDrive",
    loginSubtitle: "Object-Oriented Knowledge Management",
    localFirst: "Local-First & Private",
    localFirstDesc: "Your data lives in your Drive. We don't store your notes.",
    knowledgeGraph: "Knowledge Graph",
    knowledgeGraphDesc: "Connect thoughts with bidirectional links and AI.",
    signInGoogle: "Sign in with Google",
    pages: "Pages",
    people: "People",
    meetings: "Meetings",
    projects: "Projects",
    createCustom: "Create Custom Type...",
    emptyCalendar: "Nothing here.",
    agenda: "Agenda for"
  },
  es: {
    home: 'Inicio',
    graph: 'Grafo',
    calendar: 'Calendario',
    types: 'Tipos de Objeto',
    syncActive: 'Sincronización Activa',
    settings: 'Ajustes',
    lightMode: 'Modo Claro',
    darkMode: 'Modo Oscuro',
    welcome: 'Bienvenido',
    searchPlaceholder: "Buscar o preguntar a la IA...",
    createNew: "Crear Nuevo",
    recent: "Reciente",
    todayJournal: "Diario de Hoy",
    saving: "Guardando...",
    synced: "Sincronizado",
    close: "Cerrar",
    save: "Guardar",
    linkedRefs: "Referencias Vinculadas",
    noBacklinks: "No se encontraron enlaces.",
    context: "Contexto",
    created: "Creado",
    path: "Ruta",
    eventsFor: "Eventos para",
    noEvents: "No hay eventos programados.",
    loginTitle: "NexusDrive",
    loginSubtitle: "Gestión de Conocimiento Orientada a Objetos",
    localFirst: "Local-First y Privado",
    localFirstDesc: "Tus datos viven en tu Drive. No guardamos tus notas.",
    knowledgeGraph: "Grafo de Conocimiento",
    knowledgeGraphDesc: "Conecta ideas con enlaces bidireccionales e IA.",
    signInGoogle: "Acceder con Google",
    pages: "Páginas",
    people: "Personas",
    meetings: "Reuniones",
    projects: "Proyectos",
    createCustom: "Crear Tipo Personalizado...",
    emptyCalendar: "Nada por aquí.",
    agenda: "Agenda del"
  }
};

// Initial Mock Data to populate the Local DB
export const INITIAL_OBJECTS: NexusObject[] = [
  {
    id: '1',
    title: 'NexusDrive Architecture',
    type: NexusType.PROJECT,
    content: '<p>The architecture focuses on a <strong>Local-First</strong> approach using Google Drive as the storage backend.</p>',
    lastModified: new Date(),
    tags: ['architecture', 'system-design'],
    metadata: [
      { key: 'status', label: 'Status', value: 'Draft', type: 'text' },
      { key: 'owner', label: 'Owner', value: 'Engineering Team', type: 'text' }
    ]
  },
  {
    id: '2',
    title: 'Juan Pérez',
    type: NexusType.PERSON,
    content: '<p>Senior Architect working on the OOKM system.</p>',
    lastModified: new Date(),
    tags: ['team', 'engineering'],
    metadata: [
      { key: 'role', label: 'Role', value: 'Architect', type: 'text' },
      { key: 'email', label: 'Email', value: 'juan.perez@example.com', type: 'text' }
    ]
  },
  {
    id: '3',
    title: 'Weekly Sync - Oct 12',
    type: NexusType.MEETING,
    content: '<p>Discussed the <strong>Frontmatter</strong> implementation strategy.</p>',
    lastModified: new Date(),
    tags: ['weekly', 'sync'],
    metadata: [
      { key: 'date', label: 'Date', value: '2023-10-12', type: 'date' },
      { key: 'attendees', label: 'Attendees', value: '@Juan Pérez', type: 'link' }
    ]
  },
  {
    id: '4',
    title: 'Local-First Philosophy',
    type: NexusType.PAGE,
    content: '<p>Why we need local databases like RxDB or SQLite.</p>',
    lastModified: new Date(),
    tags: ['philosophy'],
    metadata: []
  }
];

export const INITIAL_LINKS: GraphLink[] = [
  { source: '2', target: '1', type: 'owner' },
  { source: '3', target: '1', type: 'relates_to' },
  { source: '3', target: '2', type: 'attendee' },
  { source: '4', target: '1', type: 'concept' }
];