<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# NexusDrive - Object-Oriented Knowledge Management on Google Drive

An intelligent, Local-First knowledge management system that stores all your data in Google Drive while providing the experience of modern tools like Capacities.io and Notion.

**Key Features:**
- 🧠 **Knowledge Graph** - Bidirectional links and graph visualization
- 🔒 **Your Data, Your Drive** - Everything lives in your Google Drive
- ⚡ **Local-First** - Instant performance with IndexedDB cache
- 🎯 **Object Types** - Structured data: Pages, People, Meetings, Projects
- 🤖 **AI-Powered** - Semantic search with Gemini AI
- 🌐 **Works Offline** - Full functionality without internet

## Quick Start

### Demo Mode (No Setup Required)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the app:
   ```bash
   npm run dev
   ```

3. Click **"Try Demo Mode"** on the login screen

Demo mode works entirely in-browser with no Google account needed.

### Production Mode with Google Drive

#### Prerequisites
- Google Cloud Project with Drive API enabled
- Google OAuth 2.0 Client ID

#### Setup Steps

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   
2. **Enable APIs**
   - Navigate to "APIs & Services" → "Library"
   - Enable these APIs:
     - Google Drive API
     - Google Docs API

3. **Create OAuth Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173` (or your domain)
   - Copy your **Client ID** (should look like `xxxxx.apps.googleusercontent.com`)

4. **Configure Environment**
   
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local`:
   ```bash
   # Your Google OAuth Client ID
   VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   
   # Your Gemini API key for AI features (optional)
   GEMINI_API_KEY=your-gemini-key-here
   
   # Set to false to use real Google Auth
   VITE_DEMO_MODE=false
   ```

5. **Run the App**
   ```bash
   npm install
   npm run dev
   ```

6. **First Login**
   - Click "Sign in with Google"
   - Grant permissions for Drive access
   - App will create a `/Nexus/` folder in your Google Drive

## Architecture

NexusDrive implements the OOKM-GD architecture:

- **Local Database** (IndexedDB) - Fast, offline-first storage
- **Sync Engine** - Bidirectional sync with Google Drive every 30s
- **Drive Storage** - All objects as native Google Docs with metadata
- **Knowledge Graph** - WebGL-based network visualization

## Development

```bash
npm run dev      # Development server
npm run build    # Production build
npm run preview  # Preview production build
```

## Learn More

- View your app in AI Studio: https://ai.studio/apps/drive/1vfAhDi6AHZzKmYVa-f67kp3ifpIVCDhW
- [Implementation Plan](./implementation_plan.md)

## License

MIT
