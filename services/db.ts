import { openDB, DBSchema, IDBPDatabase, deleteDB } from 'idb';
import { NexusObject, NexusType, GraphNode, GraphLink, TypeSchema, PropertyDefinition, BacklinkContext, MentionContext, TagConfig, EmailData, GmailPreferences } from '../types';
import { INITIAL_OBJECTS, INITIAL_LINKS } from '../constants';
import { driveService } from './driveService';
import { authService } from './authService';
import { calendarService } from './calendarService';

// IndexedDB Schema
interface NexusDB extends DBSchema {
  objects: {
    key: string;
    value: NexusObject & { driveFileId?: string };
    indexes: { 'by-type': NexusType; 'by-date': Date; 'by-drive-id': string };
  };
  links: {
    key: string;
    value: { id: string; source: string; target: string; type: string };
  };
  sync_metadata: {
    key: string;
    value: { key: string; value: any };
  };
  typeSchemas: {
    key: string;
    value: TypeSchema;
  };
  tagConfigs: {
    key: string;
    value: TagConfig;
  };
  calendar_events: {
    key: string;
    value: any; // Storing raw event data
  };
  calendar_preferences: {
    key: string;
    value: { id: string; calendars: { id: string; backgroundColor?: string; foregroundColor?: string }[] };
  };
  gmail_messages: {
    key: string; // message ID
    value: {
      id: string;
      from: string;
      to: string;
      cc?: string;
      subject: string;
      date: Date;
      snippet: string;
      body: string; // HTML or plain text body
      bodyPlain: string;
      hasAttachments: boolean;
      labels: string[];
    };
    indexes: { 'by-date': Date; 'by-sender': string };
  };
  gmail_preferences: {
    key: string; // 'default'
    value: GmailPreferences;
  };
}

/**
 * Enhanced Local Database with IndexedDB persistence and Drive sync
 * Implements the "Capa de Sincronización e Inteligencia" from NexusDrive spec
 */
class LocalDatabase {
  private db: IDBPDatabase<NexusDB> | null = null;
  private syncInterval: number | null = null;
  private isInitialized = false;

  constructor() {
    this.init();

    // Re-initialize Drive when token is received after initial load
    if (typeof window !== 'undefined') {
      window.addEventListener('nexus-token-received', () => {
        console.log('🔄 [LocalDB] Token received, re-initializing Drive...');
        this.startSyncLoop().catch(err =>
          console.error('[LocalDB] Failed to re-initialize sync:', err)
        );
      });
    }
  }

  private async init() {
    try {
      // Open IndexedDB
      this.db = await openDB<NexusDB>('nexus-db', 7, {
        upgrade(db, oldVersion, newVersion, transaction) {
          console.log(`[LocalDB] Upgrading database from version ${oldVersion} to ${newVersion}`);

          // Objects store
          if (!db.objectStoreNames.contains('objects')) {
            const objectStore = db.createObjectStore('objects', { keyPath: 'id' });
            objectStore.createIndex('by-type', 'type');
            objectStore.createIndex('by-date', 'lastModified');
            objectStore.createIndex('by-drive-id', 'driveFileId');
          } else {
            // Upgrade existing store
            const objectStore = transaction.objectStore('objects');
            if (!objectStore.indexNames.contains('by-drive-id')) {
              objectStore.createIndex('by-drive-id', 'driveFileId');
              console.log('[LocalDB] Created by-drive-id index');
            }
          }

          // Links store
          if (!db.objectStoreNames.contains('links')) {
            db.createObjectStore('links', { keyPath: 'id' });
          }

          // Sync metadata store
          if (!db.objectStoreNames.contains('sync_metadata')) {
            db.createObjectStore('sync_metadata', { keyPath: 'key' });
          }

          // NEW in v2: Type schemas store
          if (!db.objectStoreNames.contains('typeSchemas')) {
            db.createObjectStore('typeSchemas', { keyPath: 'type' });
            console.log('[LocalDB] Created typeSchemas store');
          }

          // NEW in v2.1: Tag configs store
          if (!db.objectStoreNames.contains('tagConfigs')) {
            db.createObjectStore('tagConfigs', { keyPath: 'name' });
            console.log('[LocalDB] Created tagConfigs store');
          }

          // NEW in v2.2: Calendar stores
          if (!db.objectStoreNames.contains('calendar_events')) {
            db.createObjectStore('calendar_events', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('calendar_preferences')) {
            db.createObjectStore('calendar_preferences', { keyPath: 'id' });
          }

          // NEW in v2.3: Gmail stores
          if (!db.objectStoreNames.contains('gmail_messages')) {
            const gmailStore = db.createObjectStore('gmail_messages', { keyPath: 'id' });
            gmailStore.createIndex('by-date', 'date');
            gmailStore.createIndex('by-sender', 'from');
            console.log('[LocalDB] Created gmail_messages store');
          }
          if (!db.objectStoreNames.contains('gmail_preferences')) {
            db.createObjectStore('gmail_preferences', { keyPath: 'id' });
            console.log('[LocalDB] Created gmail_preferences store');
          }
        },
      });

      // Load initial data ONLY if database is empty AND in demo mode
      const count = await this.db.count('objects');
      if (count === 0 && authService.isInDemoMode()) {
        console.log('[LocalDB] Loading initial demo data (demo mode)');
        await this.loadInitialData();
      } else if (count === 0) {
        console.log('[LocalDB] Database empty but user is authenticated - waiting for Drive sync');
      }

      this.isInitialized = true;
      console.log('[LocalDB] Initialized with IndexedDB');

      // Initialize default type schemas
      await this.initializeDefaultSchemas();

      // Start sync loop if not in demo mode
      if (!authService.isInDemoMode()) {
        await this.startSyncLoop();
      }
    } catch (error) {
      console.error('[LocalDB] Failed to initialize IndexedDB:', error);
      // Fallback to in-memory storage (current implementation)
      this.isInitialized = false;
    }
  }

  private async loadInitialData() {
    if (!this.db) return;

    const tx = this.db.transaction(['objects', 'links'], 'readwrite');

    for (const obj of INITIAL_OBJECTS) {
      await tx.objectStore('objects').add(obj);
    }

    for (const link of INITIAL_LINKS) {
      await tx.objectStore('links').add({
        ...link,
        id: `${link.source}-${link.target}`,
        source: link.source as string,
        target: link.target as string
      });
    }

    await tx.done;
  }

  /**
   * Start background sync loop with Drive
   */
  private async startSyncLoop() {
    console.log('🔍 [LocalDB] Starting sync loop...');
    console.log('🔍 [LocalDB] Is demo mode?', authService.isInDemoMode());
    console.log('🔍 [LocalDB] Has token?', !!authService.getAccessToken());
    console.log('🔍 [LocalDB] Token value:', authService.getAccessToken()?.substring(0, 20) + '...');

    try {
      // Initialize Drive service
      console.log('🔍 [LocalDB] Calling driveService.initialize()...');
      await driveService.initialize();

      // Initial sync from Drive to Local
      await this.syncFromDrive();

      // DISABLED: Automatic sync every 30 seconds
      // This was causing conflicts where Drive changes would overwrite user edits
      // Sync now only happens on manual save
      /*
      this.syncInterval = window.setInterval(() => {
        this.syncFromDrive().catch(err =>
          console.error('[LocalDB] Sync error:', err)
        );
      }, 30000);
      */

      console.log('[LocalDB] Sync initialization complete (automatic sync disabled)');
    } catch (error) {
      console.error('[LocalDB] Failed to start sync:', error);
      console.warn('[LocalDB] Will operate in local-only mode until Drive is available');
      // Don't throw - allow app to work in local-only mode
    }
  }

  /**
   * Sync objects from Drive to local IndexedDB
   * Public method to allow manual sync from UI
   */
  async syncFromDrive() {
    if (!this.db || authService.isInDemoMode()) return;

    try {
      const changes = await driveService.fetchChanges();

      for (const change of changes.changes) {
        if (change.removed) {
          // File was deleted in Drive
          // Use the index to find the local object by Drive ID
          const localObj = await this.db.getFromIndex('objects', 'by-drive-id', change.fileId);

          if (localObj) {
            await this.db.delete('objects', localObj.id);
            console.log(`[LocalDB] Removed object ${localObj.id} (Drive ID: ${change.fileId})`);
          } else {
            console.log(`[LocalDB] Could not find local object for deleted Drive file ${change.fileId}`);
          }
        } else if (change.file) {
          // Skip folders - don't sync them
          if (change.file.mimeType === 'application/vnd.google-apps.folder') {
            console.log(`[LocalDB] Skipping folder: ${change.file.name}`);
            continue;
          }

          // File was created or updated
          const obj = await driveService.readObject(change.fileId);
          if (obj) {
            // Check if we already have this object to preserve any local-only state if needed
            // For now, Drive wins
            await this.db.put('objects', { ...obj, driveFileId: change.fileId });
            console.log(`[LocalDB] Synced object ${obj.id} from Drive`);
          }
        }
      }
    } catch (error) {
      console.error('[LocalDB] Sync from Drive failed:', error);
    }
  }

  /**
   * Sync Calendar Events
   * Fetches events from Google Calendar and stores them in calendar_events store
   */
  async syncCalendarEvents() {
    if (!this.db || authService.isInDemoMode()) return;

    try {
      console.log('📅 [LocalDB] Syncing Calendar events...');

      // Get selected calendars with colors
      const prefs = await this.getCalendarPreferences();
      const selectedCalendars = prefs.calendars.length > 0 ? prefs.calendars : [{ id: 'primary' }];

      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(); // Previous month
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString(); // Next 3 months

      const events = await calendarService.listEvents(timeMin, timeMax, selectedCalendars);

      const tx = this.db.transaction('calendar_events', 'readwrite');
      const store = tx.objectStore('calendar_events');

      // Optional: Clear existing events to remove deleted ones? 
      // Ideally we should match IDs, but for now let's just clear all and re-add to ensure deleted events are gone.
      await store.clear();

      for (const event of events) {
        if (event.id) {
          await store.put(event);
        }
      }

      await tx.done;
      console.log(`📅 [LocalDB] Synced ${events.length} calendar events`);

    } catch (error) {
      console.error('[LocalDB] Calendar sync failed:', error);
    }
  }

  async getCalendarPreferences(): Promise<{ id: string; calendars: { id: string; backgroundColor?: string; foregroundColor?: string }[] }> {
    if (!this.db) return { id: 'default', calendars: [{ id: 'primary' }] };
    const prefs = await this.db.get('calendar_preferences', 'default') as any;

    // Migration: handle old format if necessary
    if (prefs && prefs.selectedCalendars) {
      // Convert old format to new
      return {
        id: 'default',
        calendars: (prefs.selectedCalendars as string[]).map(id => ({ id }))
      };
    }

    return prefs || { id: 'default', calendars: [{ id: 'primary' }] };
  }

  async saveCalendarPreferences(calendars: { id: string; backgroundColor?: string; foregroundColor?: string }[]): Promise<void> {
    if (!this.db) return;
    // Ensure we are saving in the new format
    await this.db.put('calendar_preferences', { id: 'default', calendars });
  }

  async getCalendarEvents(start?: Date, end?: Date): Promise<any[]> {
    if (!this.db) return [];
    const events = await this.db.getAll('calendar_events');
    // Filter in memory for now
    if (start && end) {
      return events.filter(e => {
        const eventStart = new Date(e.start.dateTime || e.start.date);
        return eventStart >= start && eventStart <= end;
      });
    }
    return events;
  }

  /**
   * Get all objects
   */
  async getObjects(): Promise<NexusObject[]> {
    if (!this.db) {
      // Fallback to in-memory for demo mode
      return [...INITIAL_OBJECTS];
    }

    try {
      const objects = await this.db.getAll('objects');
      return objects.map(obj => {
        const { driveFileId, ...nexusObj } = obj;
        return nexusObj;
      });
    } catch (error) {
      console.error('[LocalDB] Failed to get objects:', error);
      return [];
    }
  }

  async getObjectById(id: string): Promise<NexusObject | null> {
    if (!this.db) {
      console.warn('[LocalDB] Database not initialized');
      return null;
    }

    try {
      const obj = await this.db.get('objects', id);
      if (obj) {
        console.log(`[LocalDB] getObjectById(${id}):`, {
          title: obj.title,
          driveFileId: obj.driveFileId,
          hasProperty: obj.hasOwnProperty('driveFileId'),
          keys: Object.keys(obj)
        });
      }
      return obj || null;
    } catch (error) {
      console.error(`[LocalDB] Error getting object ${id}:`, error);
      return null;
    }
  }

  async getGraphData(): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
    const objects = await this.getObjects();
    const nodes: GraphNode[] = objects.map(obj => ({
      id: obj.id,
      title: obj.title,
      type: obj.type,
      group: obj.type,
      val: 5
    }));

    // Extract links from mentions and tags
    const links: GraphLink[] = [];
    const nodeIds = new Set(nodes.map(n => n.id)); // Valid node IDs

    for (const obj of objects) {
      // Parse content for mentions (data-object-id)
      const mentionRegex = /data-object-id="([^"]+)"/g;
      let match;
      while ((match = mentionRegex.exec(obj.content)) !== null) {
        const targetId = match[1];
        // Only add link if both source and target nodes exist
        if (nodeIds.has(targetId)) {
          links.push({
            source: obj.id,
            target: targetId,
            type: 'mention'
          });
        }
      }

      // Also check for old-style data-id links
      const linkRegex = /data-id="([^"]+)"/g;
      while ((match = linkRegex.exec(obj.content)) !== null) {
        const targetId = match[1];
        if (nodeIds.has(targetId)) {
          links.push({
            source: obj.id,
            target: targetId,
            type: 'link'
          });
        }
      }

      // Extract links from metadata properties (document and documents types)
      for (const prop of (obj.metadata || [])) {
        if (prop.type === 'document' && typeof prop.value === 'string' && prop.value) {
          // Single document reference
          if (nodeIds.has(prop.value)) {
            links.push({
              source: obj.id,
              target: prop.value,
              type: 'property'
            });
          }
        } else if (prop.type === 'documents' && Array.isArray(prop.value)) {
          // Multiple document references
          for (const targetId of prop.value) {
            if (typeof targetId === 'string' && nodeIds.has(targetId)) {
              links.push({
                source: obj.id,
                target: targetId,
                type: 'property'
              });
            }
          }
        }
      }
    } // This brace was missing, closing the 'for (const obj of objects)' loop.

    console.log(`[LocalDB] Graph: ${nodes.length} nodes, ${links.length} valid links`);
    return { nodes, links };
  }

  async getBacklinksWithContext(targetDocId: string): Promise<BacklinkContext[]> {
    const allDocs = await this.getObjects();
    const backlinks: BacklinkContext[] = [];

    for (const doc of allDocs) {
      if (doc.id === targetDocId) continue;

      // Parse HTML content to find mentions
      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(doc.content, 'text/html');

      // Find all mentions of the target document
      const mentions = htmlDoc.querySelectorAll(`[data-object-id="${targetDocId}"]`);

      if (mentions.length > 0) {
        const contexts: MentionContext[] = [];

        mentions.forEach((mention, index) => {
          // Get parent block (paragraph, list item, div, heading)
          let block = mention.closest('p, li, div[class*="block"], h1, h2, h3, h4, h5, h6');

          // If no specific block found, try to get a reasonable text context
          if (!block) {
            block = mention.parentElement;
          }

          if (block) {
            let contextText = block.textContent || '';

            // Clean up extra whitespace
            contextText = contextText.replace(/\s+/g, ' ').trim();

            // Limit context length to avoid very long blocks
            if (contextText.length > 300) {
              // Try to find mention position and show context around it
              const mentionText = mention.textContent || '';
              const mentionPos = contextText.indexOf(mentionText);

              if (mentionPos !== -1) {
                // Show 100 chars before and after mention
                const start = Math.max(0, mentionPos - 100);
                const end = Math.min(contextText.length, mentionPos + mentionText.length + 100);
                contextText = (start > 0 ? '...' : '') + contextText.slice(start, end) + (end < contextText.length ? '...' : '');
              } else {
                contextText = contextText.slice(0, 300) + '...';
              }
            }

            contexts.push({
              contextText,
              mentionPosition: index,
              blockId: block.id || undefined,
              timestamp: new Date()
            });
          }
        });

        if (contexts.length > 0) {
          backlinks.push({
            sourceDocId: doc.id,
            sourceDocTitle: doc.title,
            sourceDocType: doc.type,
            sourceDocDate: doc.lastModified,
            mentionContexts: contexts
          });
        }
      }
    }

    // Sort by date (most recent first)
    backlinks.sort((a, b) => new Date(b.sourceDocDate).getTime() - new Date(a.sourceDocDate).getTime());

    console.log(`[LocalDB] Found ${backlinks.length} documents with ${backlinks.reduce((sum, b) => sum + b.mentionContexts.length, 0)} mentions of doc ${targetDocId}`);
    return backlinks;
  }

  /**
   * Save object (with Drive sync if enabled)
   */
  async saveObject(updatedObject: NexusObject): Promise<void> {
    if (!this.db) {
      // Demo mode: just log
      console.log(`📝[LocalDB] Demo mode: Object ${updatedObject.id} saved(in -memory only)`);
      return;
    }

    try {
      // Get existing object to check if it has a Drive file ID
      const existing = await this.db.get('objects', updatedObject.id);
      const driveFileId = existing?.driveFileId;

      // Save to local DB
      await this.db.put('objects', { ...updatedObject, driveFileId });
      console.log(`✅[LocalDB] Object "${updatedObject.title}" saved locally`);

      // Sync to Drive if not in demo mode
      if (!authService.isInDemoMode()) {
        console.log(`🔄[LocalDB] Syncing "${updatedObject.title}" to Drive...`);

        // Google Calendar Sync (Export)
        if (updatedObject.type === NexusType.MEETING) {
          const dateProp = updatedObject.metadata.find(m => m.key === 'date');
          const eventIdProp = updatedObject.metadata.find(m => m.key === 'googleEventId');

          if (dateProp && dateProp.value) {
            const startTime = new Date(dateProp.value as string);
            const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour duration

            const eventData = {
              summary: updatedObject.title,
              description: updatedObject.content.replace(/<[^>]*>/g, ''), // Strip HTML for description
              start: { dateTime: startTime.toISOString() },
              end: { dateTime: endTime.toISOString() }
            };

            if (eventIdProp && eventIdProp.value) {
              // Update existing event
              console.log(`📅 [LocalDB] Updating Calendar event ${eventIdProp.value}...`);
              await calendarService.updateEvent(eventIdProp.value as string, eventData);
            } else {
              // Create new event
              console.log(`📅 [LocalDB] Creating new Calendar event...`);
              const newEvent = await calendarService.createEvent(eventData);
              if (newEvent && newEvent.id) {
                // Update local object with new Event ID (without triggering another save loop if possible)
                // We have to save again to persist the ID
                updatedObject.metadata.push({
                  key: 'googleEventId',
                  label: 'Google Event ID',
                  value: newEvent.id,
                  type: 'text'
                });
                // Update the object in DB directly to avoid infinite recursion of saveObject
                await this.db.put('objects', { ...updatedObject, driveFileId });
                console.log(`✅ [LocalDB] Linked to new Calendar Event ID: ${newEvent.id}`);
              }
            }
          }
        }

        try {
          if (driveFileId) {
            // Update existing file in Drive
            console.log(`📤[LocalDB] Updating existing Drive file ${driveFileId}...`);
            await driveService.updateObject(driveFileId, updatedObject);
            console.log(`✅[LocalDB] Updated in Drive successfully`);
          } else {
            // Create new file in Drive
            console.log(`📤[LocalDB] Creating new file in Drive...`);
            const newFileId = await driveService.createObject(updatedObject);
            console.log(`📝[LocalDB] Received Drive file ID: ${newFileId}`);

            // Update local DB with Drive file ID
            const objWithDriveId = { ...updatedObject, driveFileId: newFileId };
            await this.db.put('objects', objWithDriveId);
            console.log(`✅[LocalDB] Created in Drive with ID: ${newFileId}`);
            console.log(`📊[LocalDB] Saved object with driveFileId:`, objWithDriveId.driveFileId);
            console.log(`🎉[LocalDB] Object synced! Check your Google Drive > Nexus folder`);
          }
        } catch (driveError) {
          console.error('❌ [LocalDB] Failed to sync to Drive:', driveError);
          if (driveError instanceof Error) {
            console.error('Drive error details:', driveError.message);
          }
          // Continue - object is saved locally at least
        }
      }
    } catch (error) {
      console.error('❌ [LocalDB] Failed to save object:', error);
      throw error;
    }
  }

  async deleteObject(id: string): Promise<void> {
    if (!this.db) {
      console.log(`🗑️[LocalDB] Demo mode: Cannot delete object ${id} (in -memory only)`);
      throw new Error('Cannot delete in demo mode');
    }

    try {
      // Get the object first to get Drive file ID
      const obj = await this.db.get('objects', id);

      if (!obj) {
        throw new Error('Object not found');
      }

      // Delete from local DB first
      await this.db.delete('objects', id);
      console.log(`✅[LocalDB] Object "${obj.title}" deleted locally`);

      // Delete from Drive if synced
      if (!authService.isInDemoMode() && obj.driveFileId) {
        console.log(`🗑️[LocalDB] Deleting from Drive(ID: ${obj.driveFileId})...`);
        try {
          // Check if it's a system folder - DON'T DELETE
          const fileInfo = await driveService.getFileInfo(obj.driveFileId);
          if (fileInfo?.mimeType === 'application/vnd.google-apps.folder') {
            console.warn(`[LocalDB] Prevented deletion of system folder: ${fileInfo.name} `);
            return; // Don't delete folders
          }

          await driveService.deleteObject(obj.driveFileId);
          console.log(`✅[LocalDB] Deleted from Drive successfully`);
        } catch (driveError) {
          console.error('❌ [LocalDB] Failed to delete from Drive:', driveError);
          // Already deleted locally, so just log the error
        }
      }
    } catch (error) {
      console.error('❌ [LocalDB] Failed to delete object:', error);
      throw error;
    }
  }

  /**
   * Vector search (simulated for now)
   */
  async vectorSearch(query: string): Promise<NexusObject[]> {
    const objects = await this.getObjects();
    const emails = await this.getGmailMessages(100); // Limit to recent emails for performance

    // Map emails to NexusObject structure
    const emailObjects: NexusObject[] = emails.map(email => ({
      id: email.id,
      title: email.subject || 'No Subject',
      type: NexusType.EMAIL,
      content: email.bodyPlain || email.snippet || '',
      lastModified: email.date,
      tags: ['email'],
      metadata: [
        { key: 'from', label: 'From', value: email.from, type: 'text' },
        { key: 'to', label: 'To', value: email.to, type: 'text' }
      ]
    }));

    const allItems = [...objects, ...emailObjects];

    // Normalize query: remove accents/diacritics and lowercase
    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const normalizedQuery = normalize(query);

    return allItems.filter(obj => {
      const title = normalize(obj.title);
      const content = normalize(obj.content);
      // Check title, content, and tags
      return title.includes(normalizedQuery) ||
        content.includes(normalizedQuery) ||
        obj.tags?.some(t => normalize(t).includes(normalizedQuery));
    });
  }

  // Dashboard methods
  async getRecents(limit: number = 5, excludeId?: string): Promise<NexusObject[]> {
    const objects = await this.getObjects();
    return objects
      .filter(o => o.id !== excludeId)
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, limit);
  }

  async getUpcomingMeetings(): Promise<NexusObject[]> {
    const objects = await this.getObjects();
    return objects
      .filter(o => o.type === NexusType.MEETING)
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 5);
  }

  async getOrCreateDailyNote(): Promise<NexusObject> {
    const today = new Date().toISOString().split('T')[0];
    const id = `daily - ${today} `;

    let note = await this.getObjectById(id);

    if (!note) {
      note = {
        id: id,
        title: `Daily Note: ${today} `,
        type: NexusType.PAGE,
        content: `< h1 > Daily Log: ${today} </h1><p>What's on your mind today? Type @ to link ideas or # to tag.</p > `,
        lastModified: new Date(),
        tags: ['daily-journal'],
        metadata: [
          { key: 'date', label: 'Date', value: today, type: 'date' }
        ]
      };
      await this.saveObject(note);
    }
    return note;
  }

  // Helper to normalize date strings to YYYY-MM-DD
  private normalizeDate(dateStr: string): string | null {
    if (!dateStr) return null;
    try {
      // Check for DD/MM/YYYY format (common in Spanish locale)
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          return `${year}-${month}-${day}`;
        }
      }
      // Try standard Date parsing (handles ISO strings, etc.)
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  // Sidebar calendar methods
  async getActiveDates(): Promise<string[]> {
    const objects = await this.getObjects();
    const dates = new Set<string>();

    objects.forEach(obj => {
      obj.metadata?.forEach(meta => {
        if (meta.type === 'date' && meta.value) {
          const normalized = this.normalizeDate(meta.value as string);
          if (normalized) {
            dates.add(normalized);
          }
        }
      });
    });
    return Array.from(dates);
  }

  async getObjectsByDate(dateStr: string): Promise<NexusObject[]> {
    const objects = await this.getObjects();
    return objects.filter(obj => {
      return obj.metadata?.some(m => {
        if (m.type === 'date' && m.value) {
          const normalized = this.normalizeDate(m.value as string);
          return normalized === dateStr;
        }
        return false;
      });
    });
  }

  async getAllTags(): Promise<string[]> {
    const objects = await this.getObjects();
    const tags = new Set<string>();
    objects.forEach(obj => {
      obj.tags?.forEach(t => tags.add(t));
    });
    return Array.from(tags);
  }

  /**
   * Clear all local data and reinitialize
   */
  async clearCache(): Promise<void> {
    if (!this.db) {
      console.log('[LocalDB] No database to clear (demo mode)');
      return;
    }

    try {
      console.log('[LocalDB] Clearing local cache...');

      // Close the database
      this.db.close();

      // Delete the database
      await deleteDB('nexusDB');

      console.log('✅ [LocalDB] Cache cleared successfully');

      // Reinitialize
      this.db = null;
      await this.init();

      console.log('✅ [LocalDB] Database reinitialized');
    } catch (error) {
      console.error('❌ [LocalDB] Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Cleanup on app shutdown
   */
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.db?.close();
    console.log('[LocalDB] Closed');
  }
  /**
   * TYPE SCHEMA METHODS
   */
  async getTypeSchema(type: string): Promise<TypeSchema | null> {
    if (!this.db) return null;
    try {
      const schema = await this.db.get('typeSchemas', type);
      return schema || null;
    } catch (error) {
      console.error('[LocalDB] Failed to get type schema:', error);
      return null;
    }
  }

  async saveTypeSchema(schema: TypeSchema): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.put('typeSchemas', schema);
      console.log(`[LocalDB] Saved schema for type: ${schema.type} `);
    } catch (error) {
      console.error('[LocalDB] Failed to save type schema:', error);
      throw error;
    }
  }

  async getAllTypeSchemas(): Promise<TypeSchema[]> {
    if (!this.db) return [];
    try {
      return await this.db.getAll('typeSchemas');
    } catch (error) {
      console.error('[LocalDB] Failed to get all type schemas:', error);
      return [];
    }
  }

  async deleteTypeSchema(type: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.delete('typeSchemas', type);
      console.log(`[LocalDB] Deleted schema for type: ${type} `);
    } catch (error) {
      console.error('[LocalDB] Failed to delete type schema:', error);
      throw error;
    }
  }

  // ==================== TAG CONFIGURATION METHODS ====================

  async getTagConfig(name: string): Promise<TagConfig | undefined> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.get('tagConfigs', name);
  }

  async getAllTagConfigs(): Promise<TagConfig[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAll('tagConfigs');
  }

  async saveTagConfig(config: TagConfig): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.put('tagConfigs', config);
  }

  async deleteTagConfig(name: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.delete('tagConfigs', name);
  }

  // Get statistics for all tags
  async getTagStats(): Promise<Map<string, number>> {
    const objects = await this.getObjects();
    const stats = new Map<string, number>();

    objects.forEach(obj => {
      obj.tags.forEach(tag => {
        stats.set(tag, (stats.get(tag) || 0) + 1);
      });
    });

    return stats;
  }

  // Get all documents that use a specific tag
  async getDocumentsByTag(tagName: string): Promise<NexusObject[]> {
    const objects = await this.getObjects();
    return objects.filter(obj => obj.tags.includes(tagName));
  }

  // Rename a tag across all documents
  async renameTag(oldName: string, newName: string): Promise<void> {
    const objects = await this.getObjects();
    const affectedObjects = objects.filter(obj => obj.tags.includes(oldName));

    for (const obj of affectedObjects) {
      obj.tags = obj.tags.map(tag => tag === oldName ? newName : tag);
      await this.saveObject(obj);
    }

    // Update tag config if exists
    const oldConfig = await this.getTagConfig(oldName);
    if (oldConfig) {
      const newConfig: TagConfig = {
        ...oldConfig,
        name: newName,
        lastModified: new Date()
      };
      await this.saveTagConfig(newConfig);
      await this.deleteTagConfig(oldName);
    }
  }

  // Merge multiple tags into one
  async mergeTags(sourceTags: string[], targetTag: string): Promise<void> {
    const objects = await this.getObjects();

    for (const obj of objects) {
      const hasAnySource = sourceTags.some(tag => obj.tags.includes(tag));
      if (hasAnySource) {
        // Remove all source tags and add target tag
        obj.tags = obj.tags.filter(tag => !sourceTags.includes(tag));
        if (!obj.tags.includes(targetTag)) {
          obj.tags.push(targetTag);
        }
        await this.saveObject(obj);
      }
    }

    // Delete source tag configs
    for (const sourceTag of sourceTags) {
      await this.deleteTagConfig(sourceTag);
    }
  }

  // Delete a tag from all documents
  async deleteTagFromAllDocs(tagName: string): Promise<void> {
    const objects = await this.getObjects();
    const affectedObjects = objects.filter(obj => obj.tags.includes(tagName));

    for (const obj of affectedObjects) {
      obj.tags = obj.tags.filter(tag => tag !== tagName);
      await this.saveObject(obj);
    }

    // Delete tag config
    await this.deleteTagConfig(tagName);
  }

  async initializeDefaultSchemas(): Promise<void> {
    const defaultSchemas: TypeSchema[] = [
      {
        type: NexusType.PERSON,
        properties: [
          { key: 'fullName', label: 'Full Name', type: 'text', required: true },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'birthdate', label: 'Birth Date', type: 'date' }
        ]
      },
      {
        type: NexusType.MEETING,
        properties: [
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'location', label: 'Location', type: 'text' },
          { key: 'attendees', label: 'Attendees', type: 'documents', allowedTypes: [NexusType.PERSON] }
        ]
      },
      {
        type: NexusType.PROJECT,
        properties: [
          { key: 'status', label: 'Status', type: 'text', defaultValue: 'Planning' },
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'endDate', label: 'End Date', type: 'date' },
          { key: 'owner', label: 'Owner', type: 'document', allowedTypes: [NexusType.PERSON] },
          { key: 'budget', label: 'Budget', type: 'number' }
        ]
      },
      {
        type: NexusType.PAGE,
        properties: []
      }
    ];

    for (const schema of defaultSchemas) {
      const existing = await this.getTypeSchema(schema.type);
      if (!existing) {
        await this.saveTypeSchema(schema);
      }
    }

    console.log('[LocalDB] Initialized default type schemas');
  }

  /**
   * GMAIL METHODS
   */

  /**
   * Sync Gmail messages from Gmail API to local IndexedDB
   */
  async syncGmailMessages(): Promise<void> {
    if (!this.db || authService.isInDemoMode()) {
      console.log('[LocalDB] Skipping Gmail sync (demo mode or no DB)');
      return;
    }

    try {
      console.log('📧 [LocalDB] Syncing Gmail messages...');

      // Dynamically import gmailService to avoid circular dependency
      const { gmailService } = await import('./gmailService');

      // Get preferences for query and connected accounts
      const prefs = await this.getGmailPreferences();
      const query = prefs?.syncQuery || '';
      const limit = 20; // Sync last 20 messages per account

      // 1. Fetch from Primary Account
      let allMessages: any[] = [];
      try {
        const primaryResult = await gmailService.listMessages(query, limit);
        allMessages = [...primaryResult.messages];
      } catch (e) {
        console.error('[LocalDB] Error syncing primary account:', e);
      }

      // 2. Fetch from Connected Accounts
      if (prefs?.connectedAccounts) {
        for (const account of prefs.connectedAccounts) {
          try {
            console.log(`[LocalDB] Syncing secondary account: ${account.email}`);
            const token = account.accessToken?.trim();

            // Debug scopes for this account
            await authService.debugToken(token);

            const result = await gmailService.listMessages(query, limit, undefined, token);
            allMessages = [...allMessages, ...result.messages];
          } catch (e) {
            console.error(`[LocalDB] Error syncing account ${account.email}:`, e);
          }
        }
      }

      if (allMessages.length === 0) {
        console.log('[LocalDB] No messages found to sync');
        return;
      }

      const tx = this.db.transaction('gmail_messages', 'readwrite');
      const store = tx.objectStore('gmail_messages');

      for (const msg of allMessages) {
        const parsed = gmailService.parseMessage(msg);

        const storeItem: GmailMessageStore = {
          id: parsed.id,
          from: parsed.from,
          to: parsed.to,
          cc: parsed.cc,
          subject: parsed.subject,
          date: parsed.date,
          snippet: parsed.snippet,
          body: parsed.body,
          bodyPlain: parsed.bodyPlain,
          labels: parsed.labels,
          hasAttachments: parsed.attachments.length > 0
        };

        await store.put(storeItem);
      }
      await tx.done;
      console.log(`[LocalDB] Synced ${allMessages.length} messages total`);
    } catch (error) {
      console.error('Error syncing Gmail messages:', error);
    }
  }

  /**
   * Get Gmail messages from local cache
   */
  async getGmailMessages(limit: number = 10): Promise<any[]> {
    if (!this.db) return [];

    try {
      const messages = await this.db.getAll('gmail_messages');
      return messages
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('[LocalDB] Failed to get Gmail messages:', error);
      return [];
    }
  }

  /**
   * Get a single Gmail message by ID
   */
  async getGmailMessageById(messageId: string): Promise<any | null> {
    if (!this.db) return null;

    try {
      const message = await this.db.get('gmail_messages', messageId);
      return message || null;
    } catch (error) {
      console.error('[LocalDB] Failed to get Gmail message:', error);
      return null;
    }
  }

  /**
   * Delete a Gmail message by ID
   */
  async deleteGmailMessage(id: string): Promise<void> {
    if (!this.db) return;
    await this.db.delete('gmail_messages', id);
    console.log(`🗑️ [LocalDB] Deleted Gmail message ${id}`);
  }

  /**
   * Get Gmail preferences
   */
  async getGmailPreferences(): Promise<GmailPreferences | null> {
    if (!this.db) {
      return {
        id: 'default',
        selectedAccounts: [],
        syncQuery: '', // Empty query to avoid 403 errors
        lastSyncTime: undefined
      };
    }

    try {
      const prefs = await this.db.get('gmail_preferences', 'default');
      return prefs || {
        id: 'default',
        selectedAccounts: [],
        syncQuery: '', // Empty query to avoid 403 errors
        lastSyncTime: undefined
      };
    } catch (error) {
      console.error('[LocalDB] Failed to get Gmail preferences:', error);
      return {
        id: 'default',
        selectedAccounts: [],
        syncQuery: '', // Empty query to avoid 403 errors
        lastSyncTime: undefined
      };
    }
  }

  /**
   * Save Gmail preferences
   */
  async saveGmailPreferences(prefs: GmailPreferences): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.put('gmail_preferences', { ...prefs, id: 'default' });
      console.log('[LocalDB] Saved Gmail preferences');
    } catch (error) {
      console.error('[LocalDB] Failed to save Gmail preferences:', error);
    }
  }

  async createDocumentFromEmail(emailId: string, type: string): Promise<string> {
    const message = await this.getGmailMessageById(emailId);
    if (!message) throw new Error('Email not found');

    const now = new Date();

    const docId = crypto.randomUUID();

    // Extract content from the stored message object
    const subject = message.subject || 'Untitled Email';
    const from = message.from || 'Unknown';
    const date = message.date ? new Date(message.date).toLocaleString() : '';

    // Use the passed type directly as NexusType (casting as it can be a custom string)
    const nexusType = type as NexusType;

    // Create HTML content
    let htmlContent = `<h1>${subject}</h1>`;
    htmlContent += `<p style="color: gray;">From: ${from} | Date: ${date}</p>`;
    htmlContent += `<hr />`;

    // Add email content
    // Prefer HTML body if available and safe, otherwise plain text
    if (message.body) {
      htmlContent += message.body;
    } else if (message.bodyPlain) {
      const paragraphs = message.bodyPlain.split(/\n\s*\n/);
      paragraphs.forEach((p: string) => {
        if (p.trim()) {
          htmlContent += `<p>${p.trim()}</p>`;
        }
      });
    } else {
      htmlContent += `<p>${message.snippet || 'No content'}</p>`;
    }

    const newDoc: NexusObject = {
      id: docId,
      title: subject,
      type: nexusType,
      content: htmlContent,
      lastModified: now,
      tags: ['email-import'],
      metadata: []
    };

    await this.saveObject(newDoc);
    return docId;
  }
}

export const db = new LocalDatabase();