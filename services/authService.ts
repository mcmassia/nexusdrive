import { UserProfile } from '../types';

declare global {
  interface Window {
    google: any;
  }
}

// CLIENT_ID from environment variables (Vite uses import.meta.env)
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'openid profile email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/calendar';
const FORCE_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

class AuthService {
  private tokenClient: any;
  private user: UserProfile | null = null;
  private isDemoMode: boolean = false;

  init() {
    // Check if demo mode is forced via env var
    if (FORCE_DEMO) {
      this.isDemoMode = true;
      console.warn("NexusDrive: Running in Demo Mode (VITE_DEMO_MODE=true)");
      return;
    }

    // Check if we are using an invalid or missing Client ID
    if (!CLIENT_ID || CLIENT_ID.includes('YOUR_GOOGLE_CLIENT_ID')) {
      this.isDemoMode = true;
      console.warn("NexusDrive: Running in Demo Mode (No valid Client ID provided)");
      return;
    }

    if (typeof window !== 'undefined') {
      // If google script is already loaded
      if (window.google) {
        this.initializeTokenClient();
      } else {
        // Wait for script to load
        console.log('⏳ [Auth] Waiting for Google Identity Services script...');
        const checkGoogle = setInterval(() => {
          if (window.google) {
            clearInterval(checkGoogle);
            this.initializeTokenClient();
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkGoogle);
          if (!this.tokenClient && !this.isDemoMode) {
            console.error('❌ [Auth] Google Identity Services script failed to load');
          }
        }, 5000);
      }
    }
  }

  private initializeTokenClient() {
    try {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse: any) => {
          console.log('✅ [Auth] Received token response:', tokenResponse);
          if (tokenResponse && tokenResponse.access_token) {
            // Store the token immediately
            localStorage.setItem('nexus_token', tokenResponse.access_token);
            console.log('✅ [Auth] Token stored in localStorage');

            // Dispatch event so Drive can re-initialize
            window.dispatchEvent(new CustomEvent('nexus-token-received'));

            this.fetchUserProfile(tokenResponse.access_token);
          } else {
            console.error('❌ [Auth] No access token in response');
            this.mockLogin();
          }
        },
      });
      console.log('✅ [Auth] OAuth client initialized');
    } catch (e) {
      console.error("Failed to init Google Auth, falling back to demo", e);
      this.isDemoMode = true;
    }
  }

  login() {
    if (this.isDemoMode) {
      console.log("Using Mock Login due to missing Client ID configuration.");
      this.mockLogin();
      return;
    }

    if (!this.tokenClient) {
      console.log("Token client not ready, attempting to init...");
      if (window.google) {
        this.initializeTokenClient();
      } else {
        console.error("Google scripts not loaded yet");
        return;
      }
    }

    if (this.tokenClient) {
      // Trigger the real Google Login Popup
      try {
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (error) {
        console.error("Auth request failed", error);
        this.mockLogin();
      }
    }
  }

  logout() {
    this.user = null;
    const token = localStorage.getItem('nexus_token');
    // Revoke token if it was a real one
    if (token && token !== 'mock_token' && window.google) {
      try {
        window.google.accounts.oauth2.revoke(token, () => {
          console.log('Token revoked');
        });
      } catch (e) { console.error(e); }
    }

    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_user');
    window.location.reload();
  }

  // Fetch user info from Google People API or Oauth2 info
  private async fetchUserProfile(accessToken: string) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        const profile: UserProfile = {
          name: data.name,
          email: data.email,
          picture: data.picture,
          accessToken: accessToken
        };
        this.saveSession(profile);
      } else {
        throw new Error('Failed to fetch user profile');
      }
    } catch (error) {
      console.error(error);
      this.mockLogin();
    }
  }

  private mockLogin() {
    const mockProfile: UserProfile = {
      name: "Demo User",
      email: "demo@nexusdrive.app",
      picture: "https://lh3.googleusercontent.com/a/default-user=s96-c",
      accessToken: "mock_token"
    };
    // Simulate network delay for realism
    setTimeout(() => {
      this.saveSession(mockProfile);
    }, 800);
  }

  private saveSession(profile: UserProfile) {
    this.user = profile;
    localStorage.setItem('nexus_user', JSON.stringify(profile));
    localStorage.setItem('nexus_token', profile.accessToken || '');
    // Dispatch a custom event to update React state
    window.dispatchEvent(new CustomEvent('nexus-auth-change', { detail: profile }));
  }

  getUser(): UserProfile | null {
    const stored = localStorage.getItem('nexus_user');
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  }

  isInDemoMode(): boolean {
    return this.isDemoMode;
  }

  getAccessToken(): string | null {
    return localStorage.getItem('nexus_token');
  }

  /**
   * Request a fresh access token (for when the current one expires)
   */
  async requestNewToken(): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.isDemoMode) {
        resolve(null);
        return;
      }

      // If token client is missing, try to init it
      if (!this.tokenClient) {
        if (window.google) {
          console.log('⚠️ [Auth] Token client missing during refresh, re-initializing...');
          this.initializeTokenClient();
        } else {
          console.error('❌ [Auth] Cannot refresh token: Google scripts not loaded');
          resolve(null);
          return;
        }
      }

      if (!this.tokenClient) {
        console.error('❌ [Auth] Failed to initialize token client for refresh');
        resolve(null);
        return;
      }

      // Set up one-time callback for token refresh
      const originalCallback = this.tokenClient.callback;
      this.tokenClient.callback = (response: any) => {
        // Restore original callback immediately
        this.tokenClient.callback = originalCallback;

        if (response && response.access_token) {
          localStorage.setItem('nexus_token', response.access_token);
          console.log('✅ [Auth] Token refreshed successfully');
          resolve(response.access_token);
        } else {
          console.error('❌ [Auth] Failed to refresh token', response);
          resolve(null);
        }
      };

      // Request new token (this may show a popup if needed)
      console.log('🔄 [Auth] Requesting token refresh...');
      this.tokenClient.requestAccessToken({ prompt: '' }); // Try silent refresh first
    });
  }
}

export const authService = new AuthService();