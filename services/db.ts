import { openDB, DBSchema, IDBPDatabase, deleteDB } from 'idb';
import { NexusObject, NexusTask, NexusType, GraphNode, GraphLink, TypeSchema, PropertyDefinition, BacklinkContext, MentionContext, TagConfig, EmailData, Template, AppPreferences, GmailPreferences, ConnectedAccount, Preferences } from '../types';
import { INITIAL_OBJECTS, INITIAL_LINKS } from '../constants';
import { driveService } from './driveService';
import { authService } from './authService';
import { calendarService } from './calendarService';
import { vectorService } from './vectorService';
import { firebaseService } from './firebase';



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
      owner?: string;
    };
    indexes: { 'by-date': Date; 'by-sender': string };
  };
  gmail_preferences: {
    key: string; // 'default'
    value: GmailPreferences & { id: string };
  };
  app_preferences: {
    key: string; // 'default'
    value: AppPreferences;
  };
  preferences: {
    key: string;
    value: Preferences;
  };
  embeddings: {
    key: string; // object ID
    value: { id: string; vector: number[] };
  };
  assets: {
    key: string; // asset ID (filename)
    value: {
      id: string;
      blob: Blob;
      mimeType: string;
      originalName: string;
      driveLink?: string;
      driveId?: string;
      isPublic?: boolean;
    };
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
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();

    // Re-initialize Drive when token is received after initial load
    if (typeof window !== 'undefined') {
      // Expose DB for debugging/migration
      (window as any).nexusDB = this;

      window.addEventListener('nexus-token-received', () => {
        console.log('🔄 [LocalDB] Token received, re-initializing Drive...');
        this.startSyncLoop().catch(err =>
          console.error('[LocalDB] Failed to re-initialize sync:', err)
        );
      });

      // Listen for Firebase updates
      window.addEventListener('nexus-firebase-schemas', (e: any) => {
        this.updateSchemasFromFirebase(e.detail);
      });
      window.addEventListener('nexus-firebase-tags', (e: any) => {
        this.updateTagsFromFirebase(e.detail);
      });
      window.addEventListener('nexus-firebase-docs', (e: any) => {
        this.updateDocsFromFirebase(e.detail);
      });
    }
  }

  async waitForInit() {
    await this.initPromise;
  }

  private async init() {
    try {
      // Open IndexedDB
      this.db = await openDB<NexusDB>('nexus-db', 11, { // Bump version to 11 for preferences store
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
          // NEW in v2.4: Vector Embeddings store
          if (!db.objectStoreNames.contains('embeddings')) {
            db.createObjectStore('embeddings', { keyPath: 'id' });
            console.log('[LocalDB] Created embeddings store');
          }
          // NEW in v2.5: App preferences store
          if (!db.objectStoreNames.contains('app_preferences')) {
            db.createObjectStore('app_preferences', { keyPath: 'id' });
            console.log('[LocalDB] Created app_preferences store');
          }
          // NEW in v2.6: Assets store (for images/attachments)
          if (!db.objectStoreNames.contains('assets')) {
            db.createObjectStore('assets', { keyPath: 'id' });
            console.log('[LocalDB] Created assets store');
          }
          // NEW in v11: User preferences store
          if (!db.objectStoreNames.contains('preferences')) {
            db.createObjectStore('preferences', { keyPath: 'key' });
            console.log('[LocalDB] Created preferences store for user context');
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

      // Check if it's a migration/object store error
      if (error instanceof Error &&
        (error.message.includes('object store') ||
          error.message.includes('VersionError') ||
          error.message.includes('InvalidStateError'))) {
        console.error('[LocalDB] Database migration error detected. Flagging for reset.');
        // Set flag in localStorage for App.tsx to show recovery UI
        localStorage.setItem('nexus_db_error', JSON.stringify({
          type: 'migration_error',
          message: error.message,
          timestamp: Date.now()
        }));
      }

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
      // Check if we have any local objects - if not, do a full sync
      const localCount = await this.db.count('objects');
      console.log(`[LocalDB] Local objects count: ${localCount}`);

      if (localCount === 0) {
        console.log('[LocalDB] No local objects found - performing FULL SYNC');
        const result = await driveService.fullSyncFromDrive();
        console.log(`[LocalDB] Full sync result: ${result.imported} imported, ${result.errors} errors`);
        return;
      }

      // Otherwise, do incremental sync
      console.log('[LocalDB] Performing incremental sync...');
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
   * Sync objects from Local to Drive (Upload new files)
   */
  async syncToDrive() {
    if (!this.db || authService.isInDemoMode()) return;

    try {
      const objects = await this.getObjects();
      const unsynced = objects.filter(obj => !obj.driveFileId);

      if (unsynced.length === 0) {
        console.log('[LocalDB] No local files to upload to Drive');
        return;
      }

      console.log(`[LocalDB] Found ${unsynced.length} local files to upload to Drive`);

      for (const obj of unsynced) {
        try {
          console.log(`[LocalDB] Uploading ${obj.title} to Drive...`);
          const result = await driveService.createObject(obj);

          if (result && result.id) {
            // Update local object with new Drive ID and Link
            const updated = {
              ...obj,
              driveFileId: result.id,
              driveWebViewLink: result.webViewLink
            };
            await this.db.put('objects', updated);
            console.log(`[LocalDB] Uploaded ${obj.title} -> ${result.id}`);
          }
        } catch (err) {
          console.error(`[LocalDB] Failed to upload ${obj.title}:`, err);
        }
      }
    } catch (error) {
      console.error('[LocalDB] Sync to Drive failed:', error);
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
      const gmailPrefs = await this.getGmailPreferences();

      const selectedCalendars = prefs.calendars.length > 0 ? prefs.calendars : [{ id: 'primary' }];

      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(); // Previous month
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString(); // Next 3 months

      let allEvents: any[] = [];
      const primaryEmail = authService.getUser()?.email;

      // Group calendars by ownerEmail
      // If ownerEmail is missing (legacy), assume primary if not found in secondary accounts
      const calendarsByAccount: Record<string, typeof selectedCalendars> = {};

      // Initialize with primary
      if (primaryEmail) {
        calendarsByAccount[primaryEmail] = [];
      }

      for (const cal of selectedCalendars) {
        const owner = (cal as any).ownerEmail || primaryEmail;
        if (owner) {
          if (!calendarsByAccount[owner]) calendarsByAccount[owner] = [];
          calendarsByAccount[owner].push(cal);
        }
      }

      // 1. Sync Primary Account
      if (primaryEmail && calendarsByAccount[primaryEmail]?.length > 0) {
        try {
          const primaryEvents = await calendarService.listEvents(timeMin, timeMax, calendarsByAccount[primaryEmail]);
          // Inject account email and calendar summary
          const enrichedPrimary = primaryEvents.map(e => {
            const cal = calendarsByAccount[primaryEmail].find(c => c.id === e.calendarId);
            return {
              ...e,
              accountEmail: primaryEmail,
              calendarSummary: cal?.summary || 'Primary'
            };
          });
          allEvents = [...allEvents, ...enrichedPrimary];
        } catch (e) {
          console.error('[LocalDB] Error syncing primary calendar:', e);
        }
      }

      // 2. Sync Secondary Accounts
      if (gmailPrefs?.connectedAccounts) {
        for (const account of gmailPrefs.connectedAccounts) {
          const accountCalendars = calendarsByAccount[account.email];
          if (accountCalendars && accountCalendars.length > 0 && account.accessToken) {
            try {
              console.log(`[LocalDB] Syncing calendar for ${account.email}`);
              const accountEvents = await calendarService.listEvents(timeMin, timeMax, accountCalendars, account.accessToken);
              // Inject account email and calendar summary
              const enrichedAccount = accountEvents.map(e => {
                const cal = accountCalendars.find(c => c.id === e.calendarId);
                return {
                  ...e,
                  accountEmail: account.email,
                  calendarSummary: cal?.summary || 'Calendar'
                };
              });
              allEvents = [...allEvents, ...enrichedAccount];
            } catch (err: any) {
              console.error(`[LocalDB] Error syncing calendar for ${account.email}:`, err);
              // Handle token refresh if needed (similar to Gmail sync)
              if (err.message?.includes('401') || err.message === 'Token expired') {
                // Attempt refresh logic here if desired, or rely on Gmail sync to refresh it
                console.warn(`[LocalDB] Token might be expired for ${account.email}`);
              }
            }
          }
        }
      }

      const tx = this.db.transaction('calendar_events', 'readwrite');
      const store = tx.objectStore('calendar_events');

      // Optional: Clear existing events to remove deleted ones? 
      // Ideally we should match IDs, but for now let's just clear all and re-add to ensure deleted events are gone.
      await store.clear();

      for (const event of allEvents) {
        if (event.id) {
          await store.put(event);
        }
      }

      await tx.done;
      console.log(`📅 [LocalDB] Synced ${allEvents.length} calendar events total`);

    } catch (error) {
      console.error('[LocalDB] Calendar sync failed:', error);
    }
  }

  async getCalendarPreferences(): Promise<{ id: string; calendars: { id: string; summary?: string; backgroundColor?: string; foregroundColor?: string }[] }> {
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
        let eventStart: Date;
        if (e.start.dateTime) {
          // Event with specific time
          eventStart = new Date(e.start.dateTime);
        } else {
          // All-day event - parse in LOCAL timezone to avoid UTC offset issues
          const dateParts = e.start.date.split('-');
          eventStart = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        }
        return eventStart >= start && eventStart <= end;
      });
    }
    return events;
  }

  /**
   * Get all objects
   */
  async getObjects(): Promise<NexusObject[]> {
    if (!this.db) return [];

    try {
      console.log(`[LocalDB] Retrieving all objects from DB...`);
      const objects = await this.db.getAll('objects');
      console.log(`[LocalDB] Retrieved ${objects.length} objects.`);
      return objects;
    } catch (error) {
      console.error('[LocalDB] Error retrieving objects:', error);
      return [];
    }
  }

  /**
   * Clear all objects from IndexedDB
   * Used for forcing a full sync
   */
  async clearAllObjects(): Promise<void> {
    if (!this.db) return;

    try {
      console.log('[LocalDB] Clearing all objects...');
      await this.db.clear('objects');
      console.log('[LocalDB] All objects cleared successfully');
    } catch (error) {
      console.error('[LocalDB] Error clearing objects:', error);
      throw error;
    }
  }

  async getObjectById(id: string, skipLazyLoad: boolean = false): Promise<NexusObject | null> {
    if (!this.db) {
      console.warn('[LocalDB] Database not initialized');
      return null;
    }

    try {
      const obj = await this.db.get('objects', id);
      if (obj) {
        // Check if it's a stub or missing content
        if ((obj.isStub || !obj.content) && obj.driveFileId && !authService.isInDemoMode() && !skipLazyLoad) {
          console.log(`📥 [LocalDB] Lazy loading content for ${obj.title} from Drive...`);
          console.trace(`[LocalDB] Lazy load triggered by:`); // Added trace
          try {
            const driveObj = await driveService.readObject(obj.driveFileId);
            if (driveObj) {
              // Merge drive content with local metadata (local metadata might be newer from Firebase)
              const merged = { ...obj, ...driveObj, isStub: false };
              await this.db.put('objects', merged);
              console.log(`✅ [LocalDB] Lazy loaded and cached: ${obj.title}`);
              return merged;
            }
          } catch (err) {
            console.error(`❌ [LocalDB] Failed to lazy load ${id}:`, err);
            // Return stub if fetch fails, UI should handle it
          }
        }

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

  /**
   * Ensure the local object is fresh by comparing modifiedTime with Drive
   * Returns the updated object if a newer version was found, otherwise the local object.
   */
  async ensureFreshness(id: string): Promise<NexusObject | null> {
    const localObj = await this.getObjectById(id, true);
    if (!localObj || !localObj.driveFileId || authService.isInDemoMode()) {
      return localObj;
    }

    try {
      const fileInfo = await driveService.getFileInfo(localObj.driveFileId);
      if (fileInfo) {
        const driveModified = new Date(fileInfo.modifiedTime).getTime();
        const localModified = new Date(localObj.lastModified).getTime();

        // 5 seconds grace period to prevent loop on just-saved files
        // If Drive is significantly newer (someone else edited it, or edited on another device)
        if (driveModified > localModified + 5000) {
          console.log(`[LocalDB] 🔄 Freshness check: Drive version is newer for "${localObj.title}". Downloading...`);
          console.log(`[LocalDB] Local: ${localObj.lastModified} vs Drive: ${fileInfo.modifiedTime}`);

          const updatedObj = await driveService.readObject(localObj.driveFileId);
          if (updatedObj) {
            // Preserve local ID but take content from Drive
            const merged: NexusObject = {
              ...updatedObj,
              id: localObj.id,
              driveFileId: localObj.driveFileId,
              driveWebViewLink: fileInfo.id ? `https://docs.google.com/document/d/${fileInfo.id}/edit` : undefined
            };

            // Direct PUT to avoid triggering sync loop
            if (this.db) {
              await this.db.put('objects', merged);
              console.log(`[LocalDB] ✅ Freshness check: Updated local cache for "${merged.title}"`);
              return merged;
            }
          }
        } else {
          console.log(`[LocalDB] Freshness check: Local version is up to date for "${localObj.title}".`);
        }
      }
    } catch (e) {
      console.error('[LocalDB] Freshness check failed:', e);
    }

    return localObj;
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

      const contexts: MentionContext[] = [];

      // 1. Parse HTML content to find mentions (ONLY if content exists and not stub)
      if (doc.content && !doc.isStub) {
        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(doc.content, 'text/html');

        // Find all mentions of the target document
        const mentions = htmlDoc.querySelectorAll(`[data-object-id="${targetDocId}"]`);

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
      }

      // 2. Check Metadata Properties for links
      if (doc.metadata) {
        doc.metadata.forEach(prop => {
          let isMatch = false;

          if (prop.type === 'document' && prop.value === targetDocId) {
            isMatch = true;
          } else if (prop.type === 'documents' && Array.isArray(prop.value) && prop.value.includes(targetDocId)) {
            isMatch = true;
          }

          if (isMatch) {
            contexts.push({
              contextText: `Linked via property: ${prop.label}`,
              mentionPosition: 0,
              timestamp: new Date()
            });
          }
        });
      }

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

    // Sort by date (most recent first)
    backlinks.sort((a, b) => new Date(b.sourceDocDate).getTime() - new Date(a.sourceDocDate).getTime());

    console.log(`[LocalDB] Found ${backlinks.length} documents with ${backlinks.reduce((sum, b) => sum + b.mentionContexts.length, 0)} mentions of doc ${targetDocId}`);
    return backlinks;
  }

  /**
   * Save object (with Drive sync if enabled)
   */
  async saveObject(updatedObject: NexusObject): Promise<NexusObject> {
    if (!this.db) {
      // Demo mode: just log
      console.log(`📝[LocalDB] Demo mode: Object ${updatedObject.id} saved(in -memory only)`);
      return updatedObject;
    }

    try {
      // Get existing object to check if it has a Drive file ID
      const existing = await this.db.get('objects', updatedObject.id);
      let driveFileId = existing?.driveFileId;

      // Save to local DB
      await this.db.put('objects', { ...updatedObject, driveFileId });
      console.log(`✅[LocalDB] Object "${updatedObject.title}" saved locally`);

      // Generate and save embedding
      try {
        const textToEmbed = `${updatedObject.title} ${updatedObject.content} ${updatedObject.tags?.join(' ') || ''}`;
        const vector = await vectorService.embed(textToEmbed);
        if (vector) {
          await this.db.put('embeddings', { id: updatedObject.id, vector });
          console.log(`🧠[LocalDB] Embedding generated for "${updatedObject.title}"`);
        }
      } catch (err) {
        console.error('[LocalDB] Failed to generate embedding:', err);
      }

      // Sync to Firebase (Metadata only)
      try {
        await firebaseService.saveDocumentMetadata(updatedObject);
      } catch (err) {
        console.error('[LocalDB] Failed to sync to Firebase:', err);
      }

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
              end: { dateTime: endTime.toISOString() },
            };

            try {
              if (eventIdProp && eventIdProp.value) {
                // Update existing event
                await calendarService.updateEvent(eventIdProp.value as string, eventData);
                console.log('📅 [LocalDB] Updated Google Calendar event');
              } else {
                // Create new event
                // Check if createEvent takes 1 or 2 args. Based on error, it takes 1.
                // Assuming signature is createEvent(eventData)
                const newEvent = await calendarService.createEvent(eventData);
                if (newEvent.id) {
                  // Update object with event ID
                  updatedObject.metadata = updatedObject.metadata.map(m =>
                    m.key === 'googleEventId' ? { ...m, value: newEvent.id } : m
                  );
                  if (!updatedObject.metadata.find(m => m.key === 'googleEventId')) {
                    updatedObject.metadata.push({
                      key: 'googleEventId',
                      value: newEvent.id,
                      type: 'text',
                      label: 'Google Event ID'
                    });
                  }
                  // Save again to persist ID
                  await this.db.put('objects', updatedObject);
                }
                console.log('📅 [LocalDB] Created Google Calendar event');
              }
            } catch (calErr) {
              console.error('📅 [LocalDB] Calendar sync failed:', calErr);
            }
          }
        }

        // Drive Sync
        try {
          if (updatedObject.driveFileId) {
            await driveService.updateObject(updatedObject.driveFileId, updatedObject);
            console.log(`✅[LocalDB] Updated in Drive: ${updatedObject.driveFileId}`);
          } else {
            const result = await driveService.createObject(updatedObject);
            if (result && result.id) {
              // Update local DB with Drive file ID and Link
              const objWithDriveId = {
                ...updatedObject,
                driveFileId: result.id,
                driveWebViewLink: result.webViewLink
              };

              await this.db.put('objects', objWithDriveId);

              // Update Firebase with the new Drive ID
              await firebaseService.saveDocumentMetadata(objWithDriveId);

              console.log(`✅[LocalDB] Created in Drive: ${result.id}`);
              return objWithDriveId;
            }
          }
        } catch (driveErr) {
          console.error('❌[LocalDB] Drive sync failed:', driveErr);
        }
      }

      return updatedObject;
    } catch (error) {
      console.error('[LocalDB] Save object failed:', error);
      throw error;
    }
  }

  async saveAsset(id: string, blob: Blob, originalName: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.put('assets', {
        id,
        blob,
        mimeType: blob.type,
        originalName
      });
      console.log(`✅[LocalDB] Asset saved: ${id}`);
    } catch (error) {
      console.error(`❌[LocalDB] Failed to save asset ${id}: `, error);
    }
  }

  async getAsset(id: string): Promise<{ blob: Blob, mimeType: string, driveLink?: string, driveId?: string, isPublic?: boolean } | null> {
    if (!this.db) return null;
    try {
      const asset = await this.db.get('assets', id);
      return asset ? {
        blob: asset.blob,
        mimeType: asset.mimeType,
        driveLink: asset.driveLink,
        driveId: asset.driveId,
        isPublic: asset.isPublic
      } : null;
    } catch (error) {
      console.error(`❌ [LocalDB] Failed to get asset ${id}:`, error);
      return null;
    }
  }

  async updateAsset(id: string, updates: Partial<{ driveLink: string, driveId: string, isPublic: boolean }>): Promise<void> {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('assets', 'readwrite');
      const store = tx.objectStore('assets');
      const asset = await store.get(id);
      if (asset) {
        Object.assign(asset, updates);
        await store.put(asset);
      }
      await tx.done;
    } catch (error) {
      console.error(`❌ [LocalDB] Failed to update asset ${id}:`, error);
    }
  }

  async deleteObject(id: string): Promise<void> {
    if (!this.db) {
      console.log(`🗑️[LocalDB] Demo mode: Cannot delete object ${id}(in -memory only)`);
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
   * Improved to use keyword matching instead of strict substring
   */
  // Helper for normalization
  private normalize(str: string): string {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  async vectorSearch(query: string): Promise<NexusObject[]> {
    if (!this.db) return [];

    try {
      console.log(`🔍[LocalDB] Starting hybrid search for: "${query}"`);
      const normalizedQuery = this.normalize(query);
      const resultsMap = new Map<string, NexusObject>();
      const scoresMap = new Map<string, number>();

      // --- 1. Keyword Search (Exact & Token Matches) ---
      const allObjects = await this.getObjects();
      const tokens = normalizedQuery.split(/\s+/).filter(t => t.length > 2); // Split into tokens > 2 chars

      const keywordMatches = allObjects.filter(obj => {
        const title = this.normalize(obj.title);
        const content = this.normalize(obj.content);
        const tags = obj.tags?.map(t => this.normalize(t)) || [];

        // 1. Exact phrase match (High priority)
        if (title.includes(normalizedQuery) || content.includes(normalizedQuery)) return true;

        // 2. Token match (OR logic with scoring)
        if (tokens.length > 0) {
          const text = title + ' ' + content + ' ' + tags.join(' ');
          let matchCount = 0;
          tokens.forEach(token => {
            if (text.includes(token)) matchCount++;
          });

          // If at least one token matches, include it (but score depends on how many matched)
          if (matchCount > 0) {
            // Boost score based on percentage of tokens matched
            const matchScore = (matchCount / tokens.length) * 0.5;
            // Store this score to be added later if it's also a vector match, 
            // or just use it as base score if we want keyword-only matches to appear.
            // For now, let's return true to include it in keywordMatches.
            return true;
          }
        }

        return false;
      });

      console.log(`🔍[LocalDB] Found ${keywordMatches.length} keyword matches`);

      // Add keyword matches to results with a base score
      keywordMatches.forEach(obj => {
        resultsMap.set(obj.id, obj);
        // Recalculate score for map
        const title = this.normalize(obj.title);
        const content = this.normalize(obj.content);
        const tags = obj.tags?.map(t => this.normalize(t)) || [];
        const text = title + ' ' + content + ' ' + tags.join(' ');

        let score = 0.3; // Base score for any match

        // Exact phrase bonus
        if (title.includes(normalizedQuery) || content.includes(normalizedQuery)) {
          score = 0.8;
        } else if (tokens.length > 0) {
          // Token match score
          let matchCount = 0;
          tokens.forEach(token => {
            if (text.includes(token)) matchCount++;
          });
          score = 0.3 + (matchCount / tokens.length) * 0.4;
        }

        scoresMap.set(obj.id, score);
      });

      // --- 2. Vector Search (Semantic Matches) ---
      try {
        // Only run vector search if query is long enough (performance optimization)
        if (query.length > 2) {
          const queryVector = await vectorService.embed(query);

          if (queryVector) {
            const allEmbeddings = await this.db.getAll('embeddings');
            console.log(`🔍[LocalDB] Found ${allEmbeddings.length} embeddings to compare`);

            allEmbeddings.forEach(item => {
              const similarity = vectorService.cosineSimilarity(queryVector, item.vector);

              // Increased threshold to 0.55 to be extremely strict
              // This ensures only very relevant semantic matches appear
              if (similarity > 0.55) {
                console.log(`[LocalDB] Vector match: ${item.id} score = ${similarity.toFixed(3)} `);
                // If object already found by keyword, boost its score
                if (scoresMap.has(item.id)) {
                  const currentScore = scoresMap.get(item.id) || 0;
                  scoresMap.set(item.id, currentScore + similarity);
                } else {
                  scoresMap.set(item.id, similarity);
                }
              }
            });
          }
        }
      } catch (vectorErr) {
        console.warn('[LocalDB] Vector search failed, relying on keywords:', vectorErr);
      }

      // --- 3. Merge and Sort ---
      // Get all IDs with scores, sorted by score desc
      const sortedIds = Array.from(scoresMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0])
        .slice(0, 20); // Top 20

      // Fetch missing objects
      for (const id of sortedIds) {
        if (!resultsMap.has(id)) {
          const obj = await this.getObjectById(id);
          if (obj) {
            resultsMap.set(id, obj);
          }
        }
      }

      // Construct final result list in order
      const finalResults: NexusObject[] = [];
      for (const id of sortedIds) {
        const obj = resultsMap.get(id);
        if (obj) finalResults.push(obj);
      }

      // --- 4. Email Search (Keyword fallback) ---
      try {
        const emails = await this.getGmailMessages(50);
        const emailResults = emails.filter(email => {
          const subject = this.normalize(email.subject || '');
          const snippet = this.normalize(email.snippet || '');
          const from = this.normalize(email.from || '');

          return subject.includes(normalizedQuery) ||
            snippet.includes(normalizedQuery) ||
            from.includes(normalizedQuery);
        }).map(email => ({
          id: email.id,
          title: email.subject || 'No Subject',
          type: NexusType.EMAIL,
          content: email.snippet || '',
          lastModified: email.date,
          tags: ['email'],
          metadata: [
            { key: 'from', label: 'From', value: email.from, type: 'text' as const }
          ]
        }));

        finalResults.push(...emailResults);
      } catch (emailErr) {
        console.warn('[LocalDB] Failed to search emails:', emailErr);
      }

      return finalResults;

    } catch (error) {
      console.error('[LocalDB] Search failed:', error);
      return [];
    }
  }

  /**
   * Advanced Search with Filters (Natural Language Query Support)
   */
  async advancedSearch(filters: import('../types').SearchFilters): Promise<NexusObject[]> {
    if (!this.db) return [];

    try {
      console.log('🔍 [LocalDB] Advanced Search Filters:', filters);
      const results: NexusObject[] = [];
      const { query, dateRange, types, keywords, entities, source } = filters;

      // Helper to check date range
      const isInRange = (date: Date | string) => {
        if (!dateRange) return true;
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);

        // If dates are invalid, ignore the filter
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return true;

        const d = new Date(date);
        return d >= start && d <= end;
      };

      // --- 1. DOCUMENTS ---
      if (!source || source === 'all' || source === 'documents') {
        let docs: NexusObject[] = [];

        // Check if we are looking for TASKS specifically
        const isTaskSearch = types && types.includes('Task' as any);

        // Check if we have specific filters that require scanning all objects (Types or Tags)
        // If the user asks for specific Types or Tags, we shouldn't rely on vector search recall.
        const hasSpecificFilters = (types && types.length > 0) || (filters.tags && filters.tags.length > 0);

        // If query exists AND we don't have specific filters, use vector search for relevance
        // If we HAVE specific filters (Task, Type, Tag), we fetch ALL objects to ensure we don't miss anything 
        // that matches the filter but not the vector query.
        if (query && query.length > 2 && !isTaskSearch && !hasSpecificFilters) {
          docs = await this.vectorSearch(query);
        } else {
          // Otherwise get all objects (needed for Task/Type/Tag search or empty query)
          docs = await this.getObjects();
        }

        // Apply Filters
        docs = docs.filter(doc => {
          // DEBUG: Log the filters keys to see if 'types' is present
          // console.log('[LocalDB] Filters keys:', Object.keys(filters));
          // console.log('[LocalDB] Types filter:', types);
          // console.log('[LocalDB] Tags filter:', filters.tags);

          // Type Filter
          if (types && types.length > 0) {
            const hasTaskFilter = types.includes('Task' as any);
            const otherTypes = types.filter(t => t !== 'Task' as any);

            let typeMatch = false;
            // Match standard and dynamic types (case-insensitive and accent-insensitive)
            if (otherTypes.length > 0) {
              const normalize = (str: string) => str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const normalizedDocType = normalize(doc.type);

              // console.log(`[LocalDB] Checking doc "${doc.title}" (type: ${doc.type}, normalized: ${normalizedDocType}) against filters: ${otherTypes.join(', ')}`);

              if (otherTypes.some(t => {
                // 1. Exact match (original strings)
                if (t === doc.type) return true;

                const normalizedFilter = normalize(t);
                // 2. Exact match (normalized)
                if (normalizedFilter === normalizedDocType) return true;

                // 3. Fuzzy match for English/Spanish suffix (tion/cion)
                // e.g. "organization" vs "organizacion"
                const docRoot = normalizedDocType.replace(/t?ion$/, "").replace(/c?ion$/, "");
                const filterRoot = normalizedFilter.replace(/t?ion$/, "").replace(/c?ion$/, "");

                return docRoot === filterRoot && docRoot.length > 3; // Ensure root is long enough
              })) {
                typeMatch = true;
                // console.log(`[LocalDB] ✓ "${doc.title}" matches type filter`);
              }
            }
            // Match Task type
            if (hasTaskFilter && doc.extractedTasks && doc.extractedTasks.length > 0) {
              // Optional: Check if tasks match query status (active/pending)
              const lowerQuery = (query || '').toLowerCase();
              if (lowerQuery.includes('active') || lowerQuery.includes('pending') || lowerQuery.includes('activas') || lowerQuery.includes('pendientes')) {
                if (doc.extractedTasks.some(t => !t.completed)) typeMatch = true;
              } else {
                typeMatch = true;
              }
            }

            if (!typeMatch) {
              // console.log(`[LocalDB] ✗ Filtering out "${doc.title}" (type: ${doc.type}) - doesn't match ${types.join(', ')}`);
              return false;
            }
          }
          // Date Filter
          if (!isInRange(doc.lastModified)) return false;

          // Tag Filter
          if (filters.tags && filters.tags.length > 0) {
            const docTags = doc.tags?.map(t => t.toLowerCase().replace('#', '')) || [];
            const searchTags = filters.tags.map(t => t.toLowerCase().replace('#', ''));
            if (!searchTags.some(st => docTags.includes(st))) return false;
          }

          // Entity/Keyword Filter (Simple inclusion check)
          if (keywords && keywords.length > 0) {
            const content = (doc.title + ' ' + doc.content).toLowerCase();
            if (!keywords.some(k => content.includes(k.toLowerCase()))) return false;
          }

          return true;
        });

        results.push(...docs);
      }

      // --- 2. EMAILS ---
      if (!source || source === 'all' || source === 'email') {
        // We can reuse getGmailMessages but we might need more than 10
        // For now, let's fetch a larger batch or all cached
        const allEmails = await this.db.getAll('gmail_messages');

        const emailResults = allEmails.filter(email => {
          // Date Filter
          if (!isInRange(email.date)) return false;

          // Query/Keyword Filter
          if (query || (keywords && keywords.length > 0)) {
            const text = (email.subject + ' ' + email.snippet + ' ' + email.bodyPlain).toLowerCase();
            const q = (query || '').toLowerCase();

            // Match query OR keywords
            const matchesQuery = q ? text.includes(q) : true;
            const matchesKeywords = keywords ? keywords.some(k => text.includes(k.toLowerCase())) : true;

            return matchesQuery && matchesKeywords;
          }

          return true;
        }).map(email => ({
          id: email.id,
          title: email.subject || 'No Subject',
          type: NexusType.EMAIL,
          content: email.snippet || '',
          lastModified: email.date,
          tags: ['email'],
          metadata: [
            { key: 'from', label: 'From', value: email.from, type: 'text' as const },
            { key: 'date', label: 'Date', value: email.date.toISOString(), type: 'date' as const }
          ]
        }));

        results.push(...emailResults);
      }

      // --- 3. CALENDAR ---
      if (!source || source === 'all' || source === 'calendar') {
        const allEvents = await this.db.getAll('calendar_events');

        const eventResults = allEvents.filter(event => {
          const start = event.start.dateTime || event.start.date;

          // Date Filter
          if (!isInRange(start)) return false;

          // Query/Keyword Filter
          if (query || (keywords && keywords.length > 0)) {
            const text = (event.summary + ' ' + (event.description || '')).toLowerCase();
            const q = (query || '').toLowerCase();

            const matchesQuery = q ? text.includes(q) : true;
            const matchesKeywords = keywords ? keywords.some(k => text.includes(k.toLowerCase())) : true;

            return matchesQuery && matchesKeywords;
          }

          return true;
        }).map(event => ({
          id: event.id,
          title: event.summary || 'Untitled Event',
          type: NexusType.MEETING,
          content: event.description || '',
          lastModified: new Date(event.start.dateTime || event.start.date),
          tags: ['calendar', 'meeting'],
          metadata: [
            { key: 'date', label: 'Date', value: event.start.dateTime || event.start.date, type: 'date' as const },
            { key: 'location', label: 'Location', value: event.location, type: 'text' as const }
          ]
        }));

        results.push(...eventResults);
      }

      console.log(`🔍 [LocalDB] Advanced Search found ${results.length} items`);

      // Fallback: If no results found with strict filters, try relaxed search
      if (results.length === 0 && query && query.length > 2) {
        console.log('⚠️ [LocalDB] No results with strict filters. Attempting relaxed search...');

        // Relaxed: Ignore Date and Type, just use Vector + Keywords
        const relaxedDocs = await this.vectorSearch(query);
        const uniqueIds = new Set<string>();

        relaxedDocs.forEach(doc => {
          if (!uniqueIds.has(doc.id)) {
            uniqueIds.add(doc.id);
            results.push(doc);
          }
        });

        // Also check emails/calendar with just keywords
        if (keywords && keywords.length > 0) {
          // ... (Simplified keyword search for emails/calendar could go here, 
          // but for now let's just return vector results to avoid noise)
        }
      }

      return results.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    } catch (error) {
      console.error('[LocalDB] Advanced search failed:', error);
      return [];
    }
  }

  /**
   * Multi-Source Search (New AI-First Architecture)
   * UPDATED: Fetches ALL data sources and lets AI do the filtering
   * This ensures we don't miss exact matches (tags, types, tasks)
   */
  async multiSourceSearch(query: string, limit: number = 200): Promise<Array<{
    id: string;
    title: string;
    type: string;
    content: string;
    lastModified: Date;
    tags?: string[];
    metadata?: any[];
    source: 'document' | 'email' | 'calendar';
    extractedTasks?: any[];
  }>> {
    if (!this.db) return [];

    try {
      console.log(`🔍[LocalDB] Multi-source search for: "${query}" (full retrieval mode)`);
      const results: Array<any> = [];

      // 1. ALL Documents (with tasks)
      const allDocs = await this.getObjects();
      console.log(`[LocalDB] DEBUG: Total documents in DB: ${allDocs.length}`);

      // Debug: Check organizations with #smx tag
      const orgsWithSmx = allDocs.filter(d =>
        (d.type.toLowerCase().includes('organiz') || d.type.toLowerCase().includes('organiz')) &&
        d.tags?.some(t => t.toLowerCase().includes('smx'))
      );
      console.log(`[LocalDB] DEBUG: Organizations with #smx tag: ${orgsWithSmx.length}`, orgsWithSmx.map(o => o.title));

      // Debug: Check documents with tasks
      const docsWithTasks = allDocs.filter(d => d.extractedTasks && d.extractedTasks.length > 0);
      console.log(`[LocalDB] DEBUG: Documents with tasks: ${docsWithTasks.length}`, docsWithTasks.map(d => ({ title: d.title, taskCount: d.extractedTasks.length })));

      // Debug: Check documents with type Reunion/Meeting
      const reunionDocs = allDocs.filter(d =>
        d.type.toLowerCase().includes('reunion') ||
        d.type.toLowerCase().includes('meeting')
      );
      console.log(`[LocalDB] DEBUG: Documents with type Reunion/Meeting: ${reunionDocs.length}`);
      if (reunionDocs.length > 0) {
        console.log('[LocalDB] DEBUG: Reunion/Meeting docs:', reunionDocs.map(d => ({
          title: d.title,
          type: d.type,
          hasAlbertoMassia: d.content.toLowerCase().includes('alberto massia') ||
            JSON.stringify(d.metadata).toLowerCase().includes('alberto massia')
        })));
      }


      const docResults = allDocs.map(d => {
        // Resolve document references in metadata to titles
        const enrichedMetadata = d.metadata?.map(m => {
          if (m.type === 'documents' && Array.isArray(m.value)) {
            // Resolve document IDs to titles
            const titles = m.value
              .map((id: string) => {
                const doc = allDocs.find(d => d.id === id);
                return doc ? doc.title : null;
              })
              .filter(Boolean);

            return {
              ...m,
              value: titles // Replace IDs with titles
            };
          }
          return m;
        }) || [];

        return {
          ...d,
          metadata: enrichedMetadata,
          source: 'document' as const
        };
      });


      // Debug: Check if Reunion docs have Alberto Massia AFTER enrichment
      const enrichedReunionDocs = docResults.filter(d =>
        d.type.toLowerCase().includes('reunion') ||
        d.type.toLowerCase().includes('meeting')
      );
      if (enrichedReunionDocs.length > 0) {
        console.log('[LocalDB] DEBUG: Reunion docs AFTER enrichment (first 3):');
        enrichedReunionDocs.slice(0, 3).forEach(d => {
          console.log(`  - ${d.title}:`);
          console.log(`    Type: ${d.type}`);
          console.log(`    Has Alberto Massia in enriched content: ${d.content.toLowerCase().includes('alberto massia')}`);
          console.log(`    Content preview: ${d.content.substring(0, 300)}...`);
        });
      }

      results.push(...docResults);
      console.log(`📄 Loaded ${docResults.length} documents`);

      // 2. ALL Emails (up to 50)
      const emails = await this.getGmailMessages(50);
      const emailResults = emails.map(email => ({
        id: email.id,
        title: email.subject || 'No Subject',
        type: 'Email',
        content: email.bodyPlain || email.snippet || '',
        lastModified: email.date,
        tags: ['email'],
        metadata: [
          { key: 'from', label: 'From', value: email.from, type: 'text' as const },
          { key: 'to', label: 'To', value: email.to, type: 'text' as const }
        ],
        source: 'email' as const
      }));
      results.push(...emailResults);
      console.log(`📧 Loaded ${emailResults.length} emails`);

      // 3. ALL Calendar Events
      const allEvents = await this.db.getAll('calendar_events');
      console.log(`[LocalDB] DEBUG: Calendar events in DB: ${allEvents.length}`);
      if (allEvents.length > 0) {
        console.log(`[LocalDB] DEBUG: Sample calendar event:`, allEvents[0]);
      }

      const eventResults = allEvents.map(event => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        type: 'Calendar Event', // Changed from 'Meeting' to distinguish from document type
        content: event.description || '',
        lastModified: new Date(event.start.dateTime || event.start.date),
        tags: ['calendar'],
        metadata: [
          { key: 'calendarName', label: 'Calendar', value: event.calendarSummary || event.organizer?.email || 'Calendar', type: 'text' as const },
          { key: 'calendarColor', label: 'Color', value: event.backgroundColor || event.colorId || '#4285f4', type: 'text' as const },
          { key: 'date', label: 'Date', value: event.start.dateTime || event.start.date, type: 'date' as const },
          { key: 'location', label: 'Location', value: event.location || '', type: 'text' as const },
          { key: 'attendees', label: 'Attendees', value: event.attendees?.map((a: any) => a.email).join(', ') || '', type: 'text' as const }
        ],
        source: 'calendar' as const,
        // Add calendar-specific properties for UI rendering
        calendarColor: event.backgroundColor || event.colorId || '#4285f4',
        calendarName: event.calendarSummary || event.organizer?.email || 'Calendar'
      }));
      results.push(...eventResults);
      console.log(`📅 Loaded ${eventResults.length} calendar events`);

      console.log(`✅[LocalDB] Multi-source search loaded ${results.length} total items (letting AI filter)`);
      console.log(`[LocalDB] DEBUG: Result breakdown - Docs: ${docResults.length}, Emails: ${emailResults.length}, Calendar: ${eventResults.length}`);

      // Return ALL results - AI will do the filtering
      // Note: We don't limit here because the AI needs to see all candidates
      return results;

    } catch (error) {
      console.error('[LocalDB] Multi-source search failed:', error);
      return [];
    }
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
          return `${year} -${month} -${day} `;
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
    // Check if any schemas exist first
    const existingSchemas = await this.getAllTypeSchemas();
    if (existingSchemas.length > 0) {
      return;
    }

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
      await this.saveTypeSchema(schema);
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
      const primaryToken = authService.getAccessToken();
      const primaryEmail = authService.getUser()?.email;

      try {
        const primaryResult = await gmailService.listMessages(query, limit);
        // Add owner info to messages
        const primaryMsgs = primaryResult.messages.map(m => ({ ...m, _owner: primaryEmail, _token: primaryToken }));
        allMessages = [...primaryMsgs];
      } catch (e) {
        console.error('[LocalDB] Error syncing primary account:', e);
      }

      // 2. Fetch from Connected Accounts
      if (prefs?.connectedAccounts) {
        for (const account of prefs.connectedAccounts) {
          try {
            console.log(`[LocalDB] Syncing secondary account: ${account.email} `);
            let token = account.accessToken?.trim();

            // Debug scopes for this account
            // await authService.debugToken(token);

            try {
              const result = await gmailService.listMessages(query, limit, undefined, token);
              const accountMsgs = result.messages.map(m => ({ ...m, _owner: account.email, _token: token }));
              allMessages = [...allMessages, ...accountMsgs];
            } catch (err: any) {
              if (err.message === 'Token expired' || err.message.includes('401')) {
                console.log(`[LocalDB] Token expired for ${account.email}, attempting refresh...`);
                const newToken = await authService.refreshSecondaryToken(account.email, true); // Try silent first

                if (newToken) {
                  console.log(`[LocalDB] Refresh successful for ${account.email}, retrying sync...`);
                  // Update token in DB
                  account.accessToken = newToken;
                  account.accessToken = newToken;

                  // Save updated prefs
                  // We need to update the specific account in the array
                  const accountIndex = prefs.connectedAccounts.findIndex(a => a.email === account.email);
                  if (accountIndex !== -1) {
                    prefs.connectedAccounts[accountIndex] = account;
                    await this.saveGmailPreferences(prefs);
                  }

                  // Retry sync with new token
                  const result = await gmailService.listMessages(query, limit, undefined, newToken);
                  const accountMsgs = result.messages.map(m => ({ ...m, _owner: account.email, _token: newToken }));
                  allMessages = [...allMessages, ...accountMsgs];
                } else {
                  console.error(`[LocalDB] Failed to refresh token for ${account.email}`);
                  // Notify user to reconnect
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('nexus-notify', {
                      detail: {
                        type: 'error',
                        message: 'Gmail Sync Error',
                        description: `Could not refresh token for ${account.email}.Please reconnect in Settings.`,
                        duration: 10000 // 10 seconds
                      }
                    }));
                  }
                }
              } else {
                throw err;
              }
            }
          } catch (e) {
            console.error(`[LocalDB] Error syncing account ${account.email}: `, e);
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

        // Define the store item type inline to avoid lint errors
        const storeItem = {
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
          hasAttachments: parsed.attachments.length > 0,
          owner: msg._owner // Save owner email
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
   * Delete a Gmail message by ID (Local AND Server)
   */
  async deleteGmailMessage(id: string): Promise<void> {
    if (!this.db) return;

    try {
      // 1. Get message to find owner
      const message = await this.db.get('gmail_messages', id);
      if (!message) {
        console.warn(`[LocalDB] Message ${id} not found locally, skipping server delete `);
        return;
      }

      // 2. Find correct token
      let token = authService.getAccessToken(); // Default to primary
      const ownerEmail = (message as any).owner;

      if (ownerEmail) {
        const user = authService.getUser();
        if (user?.email === ownerEmail) {
          // It's primary
          token = authService.getAccessToken();
        } else {
          // Check secondary accounts
          const prefs = await this.getGmailPreferences();
          const account = prefs?.connectedAccounts?.find(a => a.email === ownerEmail);
          if (account?.accessToken) {
            token = account.accessToken;
          }
        }
      }

      // 3. Delete from Server (Trash)
      // Dynamically import to avoid circular dependency
      const { gmailService } = await import('./gmailService');

      console.log(`🗑️[LocalDB] Trashing message ${id} on server(Owner: ${ownerEmail || 'unknown'})...`);
      try {
        await gmailService.trashMessage('me', id, token || undefined);
        console.log(`✅[LocalDB] Message ${id} trashed on server`);
      } catch (serverError) {
        console.error(`❌[LocalDB] Failed to trash on server: `, serverError);
        // Continue to delete locally so UI updates, but warn user?
        // For now, we assume if it fails it might be already deleted or network issue.
        // We still delete locally to satisfy the user's immediate request.
      }

      // 4. Delete Locally
      await this.db.delete('gmail_messages', id);
      console.log(`🗑️[LocalDB] Deleted Gmail message ${id} locally`);

    } catch (error) {
      console.error('Error deleting Gmail message:', error);
      throw error;
    }
  }

  /**
   * Get Gmail preferences
   */
  async getGmailPreferences(): Promise<GmailPreferences | null> {
    if (!this.db) {
      return {
        connectedAccounts: [],
        syncQuery: '', // Empty query to avoid 403 errors
        lastSync: undefined
      };
    }

    try {
      const prefs = await this.db.get('gmail_preferences', 'default');
      return prefs || {
        connectedAccounts: [],
        syncQuery: '', // Empty query to avoid 403 errors
        lastSync: undefined
      };
    } catch (error) {
      console.error('[LocalDB] Failed to get Gmail preferences:', error);
      return {
        connectedAccounts: [],
        syncQuery: '', // Empty query to avoid 403 errors
        lastSync: undefined
      };
    }
  }

  /**
   * Save Gmail preferences
   */
  async saveGmailPreferences(prefs: GmailPreferences): Promise<void> {
    if (!this.db) return;

    try {
      // Ensure 'id' is present for the store keyPath
      await this.db.put('gmail_preferences', { id: 'default', ...prefs } as GmailPreferences & { id: string });
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
    let htmlContent = `< h1 > ${subject} </h1>`;
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

  // App Preferences Methods
  async getAppPreferences(): Promise<AppPreferences> {
    if (!this.db) return { appliedImprovements: [], rejectedImprovements: [] };
    const stored = await this.db.get('preferences', 'app');
    // Extract preferences, removing the 'key' field added for storage
    if (stored) {
      const { key, ...prefs } = stored as any;
      return prefs as AppPreferences;
    }
    return { appliedImprovements: [], rejectedImprovements: [] };
  }

  async saveAppPreferences(prefs: AppPreferences): Promise<void> {
    if (!this.db) return;
    // The 'preferences' store uses keyPath: 'key', so we must include key in the object
    await this.db.put('preferences', { key: 'app', ...prefs } as any);
  }

  async getPreferences(): Promise<Preferences> {
    if (!this.db) return {};
    const stored = await this.db.get('preferences', 'general');
    // Extract preferences, removing the 'key' field added for storage
    if (stored) {
      const { key, ...prefs } = stored as any;
      return prefs;
    }
    return {};
  }

  async savePreferences(prefs: Preferences): Promise<void> {
    if (!this.db) return;
    await this.db.put('preferences', { key: 'general', ...prefs } as any);
  }

  // --- Firebase Sync Handlers ---

  private async updateSchemasFromFirebase(schemas: TypeSchema[]) {
    if (!this.db) return;
    const tx = this.db.transaction('typeSchemas', 'readwrite');
    for (const schema of schemas) {
      await tx.store.put(schema);
    }
    await tx.done;
    console.log(`🔥 [LocalDB] Updated ${schemas.length} schemas from Firebase`);
  }

  private async updateTagsFromFirebase(tags: TagConfig[]) {
    if (!this.db) return;
    const tx = this.db.transaction('tagConfigs', 'readwrite');
    for (const tag of tags) {
      await tx.store.put(tag);
    }
    await tx.done;
    console.log(`🔥 [LocalDB] Updated ${tags.length} tag configs from Firebase`);
  }

  private async updateDocsFromFirebase(docs: Partial<NexusObject>[]) {
    if (!this.db) return;
    const tx = this.db.transaction('objects', 'readwrite');

    for (const docMeta of docs) {
      if (!docMeta.id) continue;

      const existing = await tx.store.get(docMeta.id);

      if (existing) {
        // Update metadata but preserve content if we have it
        // Only update if Firebase version is newer (using lastModified)
        const remoteDate = new Date(docMeta.lastModified || 0);
        const localDate = new Date(existing.lastModified || 0);

        if (remoteDate > localDate) {
          await tx.store.put({
            ...existing,
            ...docMeta,
            content: existing.content // Keep local content until we fetch from Drive
          });
        }
      } else {
        // Create stub
        await tx.store.put({
          ...docMeta,
          content: '', // Empty content indicates it needs fetching
          isStub: true // Flag to indicate it's a metadata-only stub
        } as NexusObject);
      }
    }
    await tx.done;
    console.log(`🔥 [LocalDB] Processed ${docs.length} document updates from Firebase`);
  }

  /**
   * Force push all local data to Firebase (Migration)
   */
  async forcePushToFirebase() {
    if (!this.db) return;

    try {
      console.log('🚀 [LocalDB] Starting manual push to Firebase...');

      // Gather all data
      const objects = await this.getObjects();
      const schemas = await this.db.getAll('typeSchemas');
      const tags = await this.db.getAll('tagConfigs');

      // Send to Firebase
      await firebaseService.syncAllToFirebase(objects, schemas, tags);

      console.log('✅ [LocalDB] Manual push complete');
    } catch (error) {
      console.error('❌ [LocalDB] Failed to push to Firebase:', error);
    }
  }
}

export const db = new LocalDatabase();