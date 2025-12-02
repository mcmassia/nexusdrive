import { SimulationNodeDatum, SimulationLinkDatum } from 'd3';

export enum NexusType {
  PAGE = 'Page',
  PERSON = 'Person',
  MEETING = 'Meeting',
  PROJECT = 'Project',
  NOTE = 'Note',
  EMAIL = 'Email',
  DAILY_NOTE = 'Daily note'
}

export interface NexusProperty {
  key: string;
  label: string;
  value: string | string[]; // string[] for document lists or multiselect
  type: 'text' | 'number' | 'date' | 'document' | 'documents' | 'multiselect' | 'select' | 'url' | 'email' | 'phone' | 'checkbox' | 'image';
  allowedTypes?: NexusType[]; // For document/documents type
  options?: string[]; // For multiselect/select type
}

export interface BacklinkContext {
  sourceDocId: string;
  sourceDocTitle: string;
  sourceDocType: string;
  sourceDocDate: Date;
  mentionContexts: MentionContext[];
}

export interface MentionContext {
  contextText: string;
  mentionPosition: number;
  blockId?: string;
  timestamp: Date;
}

export interface TagConfig {
  name: string;           // Tag name (without #)
  color: string;          // Hex color
  description?: string;   // Optional description
  created: Date;          // When first used
  lastModified: Date;     // Last update
}

// Configuration for object types

export type PropertyType = 'text' | 'number' | 'date' | 'document' | 'documents' | 'multiselect' | 'select' | 'url' | 'email' | 'phone' | 'checkbox' | 'image';

export interface PropertyDefinition {
  key: string;
  label: string;
  type: PropertyType;
  required?: boolean;
  defaultValue?: string;
  allowedTypes?: NexusType[]; // For document/documents type
  options?: string[]; // For multiselect type
}

export interface Template {
  id: string;
  name: string;
  content: string; // HTML
  isDefault: boolean;
}

export interface TypeSchema {
  type: NexusType | string; // Built-in or custom type
  properties: PropertyDefinition[];
  icon?: string;
  color?: string;
  templates?: Template[];
}

export interface NexusTask {
  id: string;
  content: string;
  completed: boolean;
  createdAt: Date;
  documentId: string;
}

export interface NexusObject {
  id: string;
  title: string;
  type: NexusType;
  content: string; // HTML content
  lastModified: Date;
  tags: string[];
  metadata: NexusProperty[];
  driveFileId?: string; // Google Drive file ID for linking
  driveWebViewLink?: string; // Direct link to open in Drive
  extractedTasks?: NexusTask[];
  pinned?: boolean;
  aliases?: string[]; // Alternative names/terms for this document
}

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  type: NexusType;
  val: number; // size
  // Explicit properties for d3 simulation to avoid TS errors
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string; // e.g., "mentions", "attendee"
}

export interface SearchResult {
  item: NexusObject;
  score: number;
  matches: string[];
}

export interface UserProfile {
  name: string;
  email: string;
  picture: string;
  accessToken?: string;
}

// Gmail API Types
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: {
      size: number;
      data?: string;
    };
    parts?: Array<{
      partId: string;
      mimeType: string;
      filename: string;
      headers: Array<{ name: string; value: string }>;
      body: {
        size: number;
        attachmentId?: string;
        data?: string;
      };
      parts?: any[];
    }>;
    mimeType: string;
  };
  sizeEstimate: number;
  internalDate: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface EmailData {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: Date;
  body: string;
  bodyPlain: string;
  snippet: string;
  attachments: EmailAttachment[];
  labels: string[];
}

export interface GmailPreferences {
  connectedAccounts: {
    email: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }[];
  syncQuery?: string; // e.g. "label:inbox"
  lastSync?: Date;
  autoSync?: boolean;
  syncFrequency?: number; // in minutes
}

export interface AppPreferences {
  appliedImprovements: string[]; // IDs of applied improvements
  rejectedImprovements: string[]; // IDs of rejected improvements
  enabledImprovements?: string[]; // IDs of currently active improvements (subset of applied)
}

export interface ConnectedAccount {
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  lastSync?: Date;
  // Advanced Config
  syncLabels?: string[]; // e.g., ['INBOX', 'IMPORTANT']
  syncFrequency?: number; // in minutes
  autoSync?: boolean;
  filterSender?: string;
  filterAfterDate?: Date;
}

export interface SearchFilters {
  query: string;
  dateRange?: { start: Date; end: Date };
  types?: NexusType[]; // e.g. ['Meeting', 'Email']
  tags?: string[]; // e.g. ['smx', 'urgent']
  keywords?: string[];
  entities?: string[]; // People, Projects
  source?: 'all' | 'documents' | 'email' | 'calendar';
}

// User preferences and settings
export interface Preferences {
  language?: string;
  theme?: string;
  currentUser?: {
    personDocumentId: string; // ID of the Persona document representing current user
    name: string;             // Display name
  };
}