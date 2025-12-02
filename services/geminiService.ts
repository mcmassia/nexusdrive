import { GoogleGenAI } from "@google/genai";
import { NexusObject } from '../types';

// NOTE: In a real environment, this comes from process.env.VITE_GEMINI_API_KEY
// The user needs to set VITE_GEMINI_API_KEY in their .env file
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private isConfigured: boolean = false;

  constructor() {
    // Only initialize if we have a valid API key
    if (API_KEY && API_KEY.length > 0 && !API_KEY.startsWith('DEMO')) {
      try {
        this.ai = new GoogleGenAI({ apiKey: API_KEY });
        this.isConfigured = true;
      } catch (error) {
        console.warn('[GeminiService] Failed to initialize:', error);
        this.isConfigured = false;
      }
    } else {
      console.warn('[GeminiService] No valid API key found. AI features will be disabled.');
      this.isConfigured = false;
    }
  }

  async generateRAGResponse(query: string, context: NexusObject[], lang: 'en' | 'es' = 'en'): Promise<string> {
    if (API_KEY === 'DEMO_KEY') {
      // Simulation for UI demo purposes when no key is present
      await new Promise(resolve => setTimeout(resolve, 1500));
      const intro = lang === 'es'
        ? `Basado en tus notas, esto es lo que encontré sobre "${query}":`
        : `Based on your notes, here is what I found regarding "${query}":`;

      const list = context.map(c =>
        `<li><strong><a data-object-id="${c.id}" data-object-type="${c.type}" class="nexus-mention">${c.title}</a></strong>: ${c.content.replace(/<[^>]*>?/gm, '').substring(0, 100)}...</li>`
      ).join('');

      return `<p>${intro}</p><ul>${list}</ul><p>${lang === 'es' ? 'Esta información fue sintetizada de' : 'This information was synthesized from'} ${context.length} ${lang === 'es' ? 'objetos relevantes' : 'relevant objects'}.</p>`;
    }

    try {
      // 1. Prepare Context from retrieved objects
      // Limit to top 30 documents to avoid token limits
      const limitedContext = context.slice(0, 30);

      const contextString = limitedContext.map(obj => {
        let taskContext = '';
        if (obj.extractedTasks && obj.extractedTasks.length > 0) {
          taskContext = `\nTasks:\n${obj.extractedTasks.map(t => `- [${t.completed ? 'x' : ' '}] ${t.content}`).join('\n')}`;
        }
        // Truncate content to avoid huge payloads
        const truncatedContent = obj.content.length > 1500 ? obj.content.substring(0, 1500) + '...' : obj.content;
        return `ID: ${obj.id}\nTitle: ${obj.title}\nType: ${obj.type}\nContent: ${truncatedContent}\nMetadata: ${JSON.stringify(obj.metadata)}${taskContext}`;
      }).join('\n---\n');

      const languageInstruction = lang === 'es' ? 'Respond in Spanish.' : 'Respond in English.';

      const prompt = `You are a helpful knowledge assistant named NexusAI. 
      Use the following context from the user's personal knowledge base to answer their question.
      
      ${languageInstruction}
      
      IMPORTANT: Return the response in strict JSON format with the following structure:
      {
        "answerHtml": "The answer in HTML format (use <p>, <ul>, <li>, <h3>). Do NOT create links/anchors in this HTML, just use plain text for names.",
        "mentions": [
          { "id": "ID_FROM_CONTEXT", "name": "EXACT_NAME_IN_TEXT", "type": "TYPE_FROM_CONTEXT" }
        ]
      }

      CRITICAL RULES FOR LISTING RESULTS:
      
      1. **When the user asks for MULTIPLE items** (plural queries like "organizations", "meetings", "documents", "all X with Y"):
         - You MUST list EVERY SINGLE matching item from the context
         - Use an unordered list (<ul><li>...</li></ul>) format
         - DO NOT summarize, DO NOT pick just one, DO NOT say "there are X items"
         - Example: If context has 9 organizations with tag #smx, your answer MUST list all 9, like:
           "<p>Las organizaciones con #smx son:</p><ul><li>Org 1</li><li>Org 2</li><li>Org 3</li>...<li>Org 9</li></ul>"
      
      2. **When the user asks for a SINGULAR item** (e.g., "the organization named X", "who is Y"):
         - Respond with just that specific item
      
      3. For "tasks", "todos", or "pending items":
         - LIST the actual checklist items found in the context (marked with 'Tasks:' or checkboxes)
         - Do NOT describe how the system works
      
      4. In "mentions", list every document/person/meeting you referred to in the answer
      
      5. The "name" in mentions must match the text in "answerHtml" EXACTLY
      
      6. Do not include <html> or <body> tags
      
      Context:
      ${contextString}
      
      User Question: ${query}`;

      // 2. Call Gemini with JSON instruction
      if (!this.ai) {
        throw new Error("Gemini API not initialized. Check VITE_GEMINI_API_KEY.");
      }

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text;
      if (!text) throw new Error('Empty response from AI');

      const data = JSON.parse(text);
      let finalHtml = data.answerHtml;

      // 3. Post-process: Inject links
      // Sort mentions by name length (descending) to avoid partial replacements
      const sortedMentions = (data.mentions || []).sort((a: any, b: any) => b.name.length - a.name.length);

      for (const mention of sortedMentions) {
        // Create a regex that matches the name but not inside existing tags
        // This is a simple replacement; for production, a DOM parser is safer but this suffices for now
        const link = `<a data-object-id="${mention.id}" data-object-type="${mention.type}" class="nexus-mention">${mention.name}</a>`;
        finalHtml = finalHtml.replace(new RegExp(mention.name, 'g'), link);
      }

      return finalHtml;
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      const msg = error.message || String(error);

      // Handle Quota Exceeded
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        return lang === 'es'
          ? 'Has alcanzado el límite de cuota de la API de Gemini. Por favor, verifica tu plan de facturación o intenta más tarde.'
          : 'You have exceeded your Gemini API quota. Please check your billing plan or try again later.';
      }

      return lang === 'es'
        ? `Error conectando con NexusAI: ${msg}`
        : `Error connecting to NexusAI: ${msg}`;
    }
  }

  async autoTagContent(content: string): Promise<string[]> {
    if (API_KEY === 'DEMO_KEY') {
      return ['suggested-tag-1', 'ai-generated'];
    }
    if (!this.isConfigured || !this.ai) {
      console.warn('[GeminiService] API not configured. Skipping auto-tag.');
      alert('Gemini API not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
      return [];
    }

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze the following text and suggest 3-5 relevant kebab-case tags. Return ONLY a JSON array of strings. Text: ${content}`,
        config: {
          responseMimeType: "application/json"
        }
      });
      const text = response.text;
      if (!text) return [];
      return JSON.parse(text);
    } catch (e) {
      console.error("Auto-tagging error", e);
      alert('Error calling Gemini API. Please check your API key is valid.');
      return [];
    }
  }


  async extractSearchFilters(query: string): Promise<any> {
    if (!this.isConfigured || !this.ai) {
      return { query };
    }

    try {
      const prompt = `
      Analyze the following user query and extract structured search filters.
      Return ONLY a JSON object with this structure:
      {
        "query": "The core semantic search query (remove date/type keywords)",
        "dateRange": { "start": "ISO_DATE_STRING", "end": "ISO_DATE_STRING" } (only if SPECIFIC dates are mentioned. Ignore vague terms like 'recent', 'latest', 'last few months'),
        "types": ["Page", "Reunión", "Meeting", "Email", "Person", "Daily note", "Task", "Organization", "Organización"] (extract any specific type mentioned. Map 'reuniones' -> 'Reunión', 'Meeting', 'Daily note'. Map 'organizaciones' -> 'Organization', 'Organización'),
        "tags": ["tag1", "tag2"] (extract hashtags or explicit tag references, e.g. '#smx' -> 'smx', 'etiqueta smx' -> 'smx'),
        "keywords": ["keyword1", "keyword2"] (extract specific entities or topics as individual words, avoid long phrases),
        "entities": ["Person Name", "Project Name"]
      }
      
      User Query: "${query}"
      Current Date: ${new Date().toISOString()}
      `;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text;
      if (!text) return { query };

      const filters = JSON.parse(text);

      // Post-process dates to Date objects
      if (filters.dateRange) {
        if (filters.dateRange.start) filters.dateRange.start = new Date(filters.dateRange.start);
        if (filters.dateRange.end) filters.dateRange.end = new Date(filters.dateRange.end);
      }

      return filters;
    } catch (error) {
      console.error("Error extracting filters:", error);
      return { query };
    }
  }

  /**
   * NEW: Analyze and Respond (AI-First Architecture)
   * Takes query + all candidates and asks AI to filter, analyze, and respond
   */
  async analyzeAndRespond(query: string, candidates: any[], lang: 'en' | 'es' = 'en'): Promise<{
    summary: string;
    relevantItemIds: number[];
    extractedData?: {
      count?: number;
      participants?: string[];
      dateRange?: { start: string; end: string };
      keyPoints?: string[];
    };
    answerHtml: string;
  }> {
    if (API_KEY === 'DEMO_KEY' || !this.ai) {
      // Demo fallback
      return {
        summary: lang === 'es'
          ? `Encontré ${candidates.length} documentos relacionados con "${query}".`
          : `Found ${candidates.length} documents related to "${query}".`,
        relevantItemIds: candidates.map((_, i) => i),
        answerHtml: `<p>${lang === 'es' ? 'Resultados encontrados' : 'Results found'}: ${candidates.length}</p>`
      };
    }

    try {
      const languageInstruction = lang === 'es' ? 'Respond in Spanish.' : 'Respond in English.';

      const candidatesString = candidates.map((c, i) => {
        let itemStr = `[${i}] Source: ${c.source} | Type: ${c.type} | Title: ${c.title}`;
        // Reduce content length for efficiency with large datasets
        const contentPreview = c.content.substring(0, 200);
        itemStr += `\nContent: ${contentPreview}${c.content.length > 200 ? '...' : ''}`;
        if (c.tags && c.tags.length > 0) {
          itemStr += `\nTags: ${c.tags.join(', ')}`;
        }
        if (c.extractedTasks && c.extractedTasks.length > 0) {
          // Only show task count and first few tasks
          const taskPreviews = c.extractedTasks.slice(0, 3).map((t: any) => `[${t.completed ? 'x' : ' '}] ${t.content.substring(0, 50)}`);
          itemStr += `\nTasks (${c.extractedTasks.length}): ${taskPreviews.join('; ')}${c.extractedTasks.length > 3 ? '...' : ''}`;
        }
        if (c.metadata && c.metadata.length > 0) {
          // Reduce metadata for efficiency
          itemStr += `\nMetadata: ${JSON.stringify(c.metadata).substring(0, 100)}`;
        }
        return itemStr;
      }).join('\n---\n');

      const prompt = `You are analyzing a user's query against their knowledge base.

${languageInstruction}

IMPORTANT CONTEXT:
- Current Date: ${new Date().toISOString().split('T')[0]} (${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})
- Current Week: Week of ${new Date().toLocaleDateString('es-ES', { month: 'long', day: 'numeric' })}

User Query: "${query}"

Available Information (${candidates.length} items):
${candidatesString}

Task:
1. Identify which items from the list above are RELEVANT to the user's query
2. Extract and synthesize the requested information
3. Return a structured response

CRITICAL FILTERING RULES:

**Tags** (e.g., "#smx", "etiqueta #smx"):
- If query mentions a tag (with # or "etiqueta"), ONLY select items that have that EXACT tag
- Compare tags case-insensitively (e.g., "smx" matches "#smx" or "#SMX")
- Example: "organizaciones con #smx" → select items where Type contains "organi" AND Tags contains "smx"

**Types** (e.g., "organizaciones", "meetings", "reuniones"):
- Match by document Type field
- Common mappings:
  * "organizaciones"/"organization" → Type: "Organización" or "Organization"
  * "reuniones"/"meetings" → Type: "Meeting" or "Reunión" or source: "calendar"
  * "tareas"/"tasks"/"pendientes" → Items with Tasks field populated
  * "eventos"/"events" → source: "calendar" or Type: "Meeting"

**Tasks** (e.g., "tareas pendientes", "open tasks"):
- If query asks for tasks, look at the "Tasks:" field in items
- Only select items that HAVE tasks in their Tasks field
- If asking for "pending"/"pendientes", select uncompleted tasks (marked with [ ])

**Calendar Events** (e.g., "eventos esta semana", "meetings this week", "eventos hoy"):
- If query asks for events/meetings with time references, select items with source: "calendar"
- Use the current date above to calculate relative time periods:
  * "esta semana"/"this week" = current week (Monday to Sunday)
  * "hoy"/"today" = current date only
  * "mañana"/"tomorrow" = current date + 1 day
  * "próxima semana"/"next week" = following week
- Look at the Metadata date field and parse the ISO date string to compare
- ONLY select events that fall within the calculated date range

**Count Queries**:
- If user asks "cuántas"/"how many", set extractedData.count to the number of relevant items

IMPORTANT OUTPUT RULES:
- If the user asks for MULTIPLE items (plural query), list ALL relevant items in answerHtml using <ul><li>
- If NO items match the criteria, say so explicitly (don't try to find something loosely related)
- answerHtml should be in proper HTML with <p>, <ul>, <li> tags
- Do NOT create links in the HTML, just use plain text for names

Return JSON with this EXACT structure:
{
  "summary": "One sentence summary of what you found",
  "relevantItemIds": [0, 2, 5, ...], // Array of indices of relevant items from the list above
  "extractedData": {
    "count": number or undefined (if user asked for a count),
    "participants": ["person1", "person2"] or undefined (if user asked for people),
    "dateRange": { "start": "date", "end": "date" } or undefined (if analyzing time period),
    "keyPoints": ["point1", "point2"] or undefined (important findings)
  },
  "answerHtml": "The full answer in HTML format. If listing multiple items, use <ul><li>Item 1</li><li>Item 2</li>...</ul>"
}
`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text;
      if (!text) throw new Error('Empty response from AI');

      const data = JSON.parse(text);

      // Validate response structure
      if (!data.summary || !data.relevantItemIds || !data.answerHtml) {
        throw new Error('Invalid response structure from AI');
      }

      return data;

    } catch (error: any) {
      console.error('[GeminiService] analyzeAndRespond error:', error);

      // Fallback response
      return {
        summary: lang === 'es'
          ? `Error al analizar la consulta: ${error.message}`
          : `Error analyzing query: ${error.message}`,
        relevantItemIds: [],
        answerHtml: `<p>${lang === 'es' ? 'Error:' : 'Error:'} ${error.message}</p>`
      };
    }
  }
}

export const geminiService = new GeminiService();
