import { SimulationNodeDatum, SimulationLinkDatum } from 'd3';

export enum NexusType {
  PAGE = 'Page',
  PERSON = 'Person',
  MEETING = 'Meeting',
  PROJECT = 'Project'
}

export interface NexusProperty {
  key: string;
  label: string;
  value: string | string[]; // string[] for document lists or multiselect
  type: 'text' | 'number' | 'date' | 'document' | 'documents' | 'multiselect' | 'select';
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

// Configuration for object types

export type PropertyType = 'text' | 'number' | 'date' | 'document' | 'documents' | 'multiselect' | 'select';

export interface PropertyDefinition {
  key: string;
  label: string;
  type: PropertyType;
  required?: boolean;
  defaultValue?: string;
  allowedTypes?: NexusType[]; // For document/documents type
  options?: string[]; // For multiselect type
}

export interface TypeSchema {
  type: NexusType | string; // Built-in or custom type
  properties: PropertyDefinition[];
  icon?: string;
  color?: string;
}

export interface NexusObject {
  id: string;
  title: string;
  type: NexusType;
  content: string; // HTML content
  metadata: NexusProperty[];
  lastModified: Date;
  tags: string[];
  driveFileId?: string; // Google Drive file ID for linking
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