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
      const contextString = context.map(obj =>
        `ID: ${obj.id}\nTitle: ${obj.title}\nType: ${obj.type}\nContent: ${obj.content}\nMetadata: ${JSON.stringify(obj.metadata)}`
      ).join('\n---\n');

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

      Rules:
      1. In "answerHtml", write the answer naturally.
      2. In "mentions", list every document/person/meeting you referred to in the answer.
      3. The "name" in mentions must match the text in "answerHtml" EXACTLY so I can replace it with a link later.
      4. Do not include <html> or <body> tags.

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


}

export const geminiService = new GeminiService();
