import { authService } from './authService';

export interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    start: {
        dateTime?: string;
        date?: string; // For all-day events
        timeZone?: string;
    };
    end: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };
    attendees?: { email: string; displayName?: string; responseStatus?: string }[];
    htmlLink?: string;
    colorId?: string;
    // Enhanced fields
    calendarId?: string;
    backgroundColor?: string;
    foregroundColor?: string;
}

class CalendarService {
    private getHeaders() {
        const token = authService.getAccessToken();
        if (!token) throw new Error('No access token available');
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }

    /**
   * List all available calendars with colors
   */
    async listCalendars(): Promise<{ id: string; summary: string; primary?: boolean; backgroundColor?: string; foregroundColor?: string }[]> {
        if (authService.isInDemoMode()) {
            return [
                { id: 'primary', summary: 'Personal', primary: true, backgroundColor: '#4285F4', foregroundColor: '#ffffff' },
                { id: 'work', summary: 'Work', backgroundColor: '#E67C73', foregroundColor: '#ffffff' }
            ];
        }

        try {
            const response = await fetch(
                'https://www.googleapis.com/calendar/v3/users/me/calendarList',
                { headers: this.getHeaders() }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch calendars: ${response.statusText}`);
            }

            const data = await response.json();
            return data.items.map((item: any) => ({
                id: item.id,
                summary: item.summary,
                primary: item.primary,
                backgroundColor: item.backgroundColor,
                foregroundColor: item.foregroundColor
            }));
        } catch (error) {
            console.error('Error listing calendars:', error);
            return [];
        }
    }

    /**
     * List upcoming events from specified calendars
     */
    async listEvents(timeMin?: string, timeMax?: string, calendars: { id: string; backgroundColor?: string; foregroundColor?: string }[] = [{ id: 'primary' }]): Promise<CalendarEvent[]> {
        if (authService.isInDemoMode()) {
            console.log('Mocking listEvents in demo mode');
            return [];
        }

        try {
            const allEvents: CalendarEvent[] = [];

            for (const cal of calendars) {
                const params = new URLSearchParams({
                    singleEvents: 'true',
                    orderBy: 'startTime',
                });

                if (timeMin) params.append('timeMin', timeMin);
                if (timeMax) params.append('timeMax', timeMax);

                const response = await fetch(
                    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params.toString()}`,
                    { headers: this.getHeaders() }
                );

                if (response.ok) {
                    const data = await response.json();
                    const events = data.items || [];
                    // Attach calendar metadata to each event
                    const enrichedEvents = events.map((e: any) => ({
                        ...e,
                        calendarId: cal.id,
                        backgroundColor: cal.backgroundColor,
                        foregroundColor: cal.foregroundColor
                    }));
                    allEvents.push(...enrichedEvents);
                } else {
                    console.warn(`Failed to fetch events for calendar ${cal.id}: ${response.statusText}`);
                }
            }

            return allEvents;
        } catch (error) {
            console.error('Error listing calendar events:', error);
            if (error instanceof Error && error.message.includes('403')) {
                alert('Access denied to Google Calendar. Please Log Out and Log In again to grant permissions.');
            }
            return [];
        }
    }

    /**
   * Create a new event in the primary calendar
   */
    async createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent | null> {
        if (authService.isInDemoMode()) {
            console.log('Mocking createEvent:', event);
            return { ...event, id: `mock-event-${Date.now()}` } as CalendarEvent;
        }

        try {
            const response = await fetch(
                'https://www.googleapis.com/calendar/v3/calendars/primary/events',
                {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify(event),
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to create event: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error creating calendar event:', error);
            return null;
        }
    }

    /**
     * Update an existing event
     */
    async updateEvent(eventId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent | null> {
        if (authService.isInDemoMode()) {
            console.log('Mocking updateEvent:', eventId, event);
            return { ...event, id: eventId } as CalendarEvent;
        }

        try {
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
                {
                    method: 'PATCH', // Use PATCH for partial updates
                    headers: this.getHeaders(),
                    body: JSON.stringify(event),
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to update event: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating calendar event:', error);
            return null;
        }
    }
}

export const calendarService = new CalendarService();
