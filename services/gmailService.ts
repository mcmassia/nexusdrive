import { authService } from './authService';
import { driveService } from './driveService';

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
    body: string; // HTML or plain text
    bodyPlain: string;
    snippet: string;
    attachments: EmailAttachment[];
    labels: string[];
}

/**
 * Gmail Service - Handles email operations
 * Follows the same pattern as calendarService and driveService
 */
class GmailService {
    private baseUrl = 'https://gmail.googleapis.com/gmail/v1';

    /**
     * Get authorization headers with Bearer token
     */
    private getHeaders(accessToken?: string): Record<string, string> {
        const token = accessToken || authService.getAccessToken();
        if (!token) throw new Error('No access token available');
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * List user's Gmail messages with optional query filter
     */
    async listMessages(query: string = '', maxResults: number = 20, pageToken?: string, accessToken?: string): Promise<{ messages: GmailMessage[], nextPageToken?: string }> {
        if (authService.isInDemoMode()) {
            console.log('[GmailService] Demo mode: returning mock emails');
            return { messages: this.getMockEmails(maxResults).map(this.emailDataToGmailMessage), nextPageToken: undefined };
        }

        const token = accessToken || authService.getAccessToken();
        if (!token) throw new Error('No access token available');

        const params = new URLSearchParams({
            maxResults: maxResults.toString(),
            q: query
        });
        if (pageToken) params.append('pageToken', pageToken);

        try {
            const response = await fetch(`${this.baseUrl}/users/me/messages?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.status === 401) {
                // Token expired
                if (!accessToken) { // Only try refresh if using main token
                    const newToken = await authService.requestNewToken();
                    if (newToken) return this.listMessages(query, maxResults, pageToken);
                }
                throw new Error('Token expired');
            }

            if (!response.ok) {
                throw new Error(`Failed to list messages: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.messages || data.messages.length === 0) {
                return { messages: [], nextPageToken: undefined };
            }

            // Fetch details for each message
            // We fetch in batches to avoid overwhelming the browser/network
            const BATCH_SIZE = 5;
            const DELAY_MS = 100;
            const messages: GmailMessage[] = [];

            for (let i = 0; i < data.messages.length; i += BATCH_SIZE) {
                const batch = data.messages.slice(i, i + BATCH_SIZE);

                const batchResults = await Promise.all(
                    batch.map((msg: any) => this.getMessage('me', msg.id, token))
                );

                messages.push(...batchResults.filter((m): m is GmailMessage => m !== null));

                if (i + BATCH_SIZE < data.messages.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                }
            }

            return {
                messages,
                nextPageToken: data.nextPageToken
            };

        } catch (error) {
            console.error('[GmailService] Error listing messages:', error);
            return { messages: [], nextPageToken: undefined };
        }
    }

    /**
     * Get full email details by message ID
     */
    async getMessage(userId: string = 'me', messageId: string, accessToken?: string): Promise<GmailMessage | null> {
        if (authService.isInDemoMode()) {
            const mocks = this.getMockEmails(10);
            const mock = mocks.find(m => m.id === messageId);
            return mock ? this.emailDataToGmailMessage(mock) : null;
        }

        try {
            // Try format=full first to get body
            // If that fails (e.g. scope issues), we might fallback to metadata, but for now let's try full
            // Actually, previous debugging showed format=full might fail with 403 if scopes aren't perfect,
            // but let's assume we have correct scopes now.
            // If not, we can fallback to metadata.

            let response = await fetch(
                `${this.baseUrl}/users/${userId}/messages/${messageId}?format=full`,
                { headers: this.getHeaders(accessToken) }
            );

            if (response.status === 403) {
                // Silently fallback to metadata if full access is denied
                // This is expected for some scopes/accounts
                response = await fetch(
                    `${this.baseUrl}/users/${userId}/messages/${messageId}?format=metadata`,
                    { headers: this.getHeaders(accessToken) }
                );
            }

            if (!response.ok) {
                throw new Error(`Failed to get message: ${response.statusText}`);
            }

            const message: GmailMessage = await response.json();

            // If we only got metadata (no snippet in some cases), try to fill snippet from headers
            if (!message.snippet) {
                const subject = message.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
                message.snippet = subject;
            }

            return message;
        } catch (error) {
            console.error(`[GmailService] Error fetching message ${messageId}:`, error);
            return null;
        }
    }

    /**
     * Download email attachment
     */
    async getAttachment(
        userId: string = 'me',
        messageId: string,
        attachmentId: string,
        accessToken?: string
    ): Promise<Blob | null> {
        if (authService.isInDemoMode()) {
            return new Blob(['Mock attachment content'], { type: 'text/plain' });
        }

        try {
            const response = await fetch(
                `${this.baseUrl}/users/${userId}/messages/${messageId}/attachments/${attachmentId}`,
                { headers: this.getHeaders(accessToken) }
            );

            if (!response.ok) {
                throw new Error(`Failed to get attachment: ${response.statusText}`);
            }

            const data = await response.json();
            const binaryData = this.base64urlDecode(data.data);
            const byteArray = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                byteArray[i] = binaryData.charCodeAt(i);
            }

            return new Blob([byteArray]);
        } catch (error) {
            console.error('[GmailService] Error downloading attachment:', error);
            return null;
        }
    }

    /**
     * Parse Gmail message to EmailData format
     */
    public parseMessage(message: GmailMessage): EmailData {
        const headers = message.payload.headers;
        const getHeader = (name: string) =>
            headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const from = getHeader('From');
        const to = getHeader('To');
        const cc = getHeader('Cc');
        const subject = getHeader('Subject');
        const date = new Date(parseInt(message.internalDate));

        let bodyHtml = '';
        let bodyPlain = '';
        const attachments: EmailAttachment[] = [];

        const extractParts = (parts: any[]) => {
            if (!parts) return;

            parts.forEach(part => {
                if (part.mimeType === 'text/html' && part.body?.data) {
                    bodyHtml = this.base64urlDecode(part.body.data);
                } else if (part.mimeType === 'text/plain' && part.body?.data) {
                    bodyPlain = this.base64urlDecode(part.body.data);
                } else if (part.filename && part.body?.attachmentId) {
                    attachments.push({
                        filename: part.filename,
                        mimeType: part.mimeType,
                        size: part.body.size || 0,
                        attachmentId: part.body.attachmentId
                    });
                } else if (part.parts) {
                    extractParts(part.parts);
                }
            });
        };

        if (message.payload.parts) {
            extractParts(message.payload.parts);
        } else if (message.payload.body?.data) {
            const data = this.base64urlDecode(message.payload.body.data);
            if (message.payload.mimeType === 'text/html') {
                bodyHtml = data;
            } else {
                bodyPlain = data;
            }
        }

        return {
            id: message.id,
            threadId: message.threadId,
            from,
            to,
            cc,
            subject,
            date,
            body: bodyHtml || bodyPlain,
            bodyPlain,
            snippet: message.snippet,
            attachments,
            labels: message.labelIds || []
        };
    }

    private base64urlDecode(str: string): string {
        try {
            let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) {
                base64 += '=';
            }
            const decoded = atob(base64);
            try {
                return decodeURIComponent(escape(decoded));
            } catch {
                return decoded;
            }
        } catch (error) {
            console.error('[GmailService] Error decoding base64url:', error);
            return '';
        }
    }

    private getMockEmails(count: number): EmailData[] {
        const mockEmails: EmailData[] = [];
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            mockEmails.push({
                id: `mock-email-${i}`,
                threadId: `mock-thread-${i}`,
                from: `sender${i}@example.com`,
                to: 'demo@nexusdrive.app',
                subject: `Mock Email ${i + 1}`,
                date: new Date(now - i * 3600000),
                body: `<p>Mock body ${i + 1}</p>`,
                bodyPlain: `Mock body ${i + 1}`,
                snippet: `Mock snippet ${i + 1}`,
                attachments: [],
                labels: ['INBOX']
            });
        }
        return mockEmails;
    }

    /**
     * Trash a message (move to trash)
     */
    async trashMessage(userId: string = 'me', messageId: string, accessToken?: string): Promise<void> {
        if (authService.isInDemoMode()) {
            console.log(`[GmailService] Demo mode: Trashing message ${messageId}`);
            return;
        }

        try {
            const response = await fetch(
                `${this.baseUrl}/users/${userId}/messages/${messageId}/trash`,
                {
                    method: 'POST',
                    headers: this.getHeaders(accessToken)
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to trash message: ${response.statusText}`);
            }
        } catch (error) {
            console.error(`[GmailService] Error trashing message ${messageId}:`, error);
            throw error;
        }
    }

    private emailDataToGmailMessage(data: EmailData): GmailMessage {
        return {
            id: data.id,
            threadId: data.threadId,
            labelIds: data.labels,
            snippet: data.snippet,
            payload: {
                headers: [
                    { name: 'From', value: data.from },
                    { name: 'To', value: data.to },
                    { name: 'Subject', value: data.subject },
                    { name: 'Date', value: data.date.toISOString() }
                ],
                body: { size: data.body.length, data: btoa(data.body) },
                mimeType: 'text/html'
            },
            sizeEstimate: 1000,
            internalDate: data.date.getTime().toString()
        };
    }
}

export const gmailService = new GmailService();
