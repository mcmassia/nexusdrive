import { UserProfile, ConnectedAccount } from '../types';

declare global {
  interface Window {
    google: any;
  }
}

// CLIENT_ID from environment variables (Vite uses import.meta.env)
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'openid profile email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.metadata';
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
        console.log('🔓 [Auth] Revoking OAuth token...');
        window.google.accounts.oauth2.revoke(token, () => {
          console.log('✅ [Auth] Token revoked successfully');
        });
      } catch (e) {
        console.error('❌ [Auth] Failed to revoke token:', e);
      }
    }

    // Clear all auth data
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_user');

    console.log('🔄 [Auth] Reloading page to complete logout...');

    // Force reload after small delay to ensure revocation completes
    setTimeout(() => {
      window.location.reload();
    }, 500);
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

  /**
   * Force complete re-authentication (useful when scopes change)
   * This revokes the current token and forces a new consent screen
   */
  forceReauth() {
    console.log('🔄 [Auth] Forcing complete re-authentication...');

    const token = localStorage.getItem('nexus_token');
    if (token && token !== 'mock_token' && window.google) {
      try {
        // Revoke existing token
        window.google.accounts.oauth2.revoke(token, () => {
          console.log('✅ [Auth] Token revoked');
        });
      } catch (e) {
        console.error('❌ [Auth] Revoke failed:', e);
      }
    }

    // Clear all local data
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_user');
    this.user = null;

    // Wait a bit for revocation to complete, then trigger new login
    setTimeout(() => {
      console.log('🔐 [Auth] Requesting new authentication with updated scopes...');
      if (this.tokenClient) {
        // Force consent screen with prompt: 'consent'
        this.tokenClient.requestAccessToken({
          prompt: 'consent' // Force consent screen even if previously granted
        });
      } else {
        console.error('❌ [Auth] TokenClient not available');
        window.location.reload();
      }
    }, 1000);
  }

  /**
   * Debug: Check what scopes the current token has
   */
  async debugToken(tokenToCheck?: string): Promise<void> {
    const token = tokenToCheck || localStorage.getItem('nexus_token');
    if (!token || token === 'mock_token') {
      console.log('❌ No valid token found');
      return;
    }

    try {
      console.log('🔍 [Auth] Checking token scopes...');
      const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
      const data = await response.json();

      if (!response.ok) {
        console.error('❌ [Auth] Token check failed:', data);
        if (data.error === 'invalid_token') {
          console.warn('⚠️ [Auth] Token is invalid or expired.');
        }
        return;
      }

      if (!data.scope) {
        console.error('❌ [Auth] Token info response missing scope:', data);
        return;
      }

      console.log('✅ [Auth] Token info:');
      console.log('  Email:', data.email);
      console.log('  Expires in:', data.expires_in, 'seconds');
      console.log('  Scopes granted:');

      const scopes = data.scope.split(' ');
      scopes.forEach((scope: string) => {
        const hasGmail = scope.includes('gmail');
        console.log(`    ${hasGmail ? '✅' : '  '} ${scope}`);
      });

      // Check specifically for Gmail scopes
      const hasGmailReadonly = scopes.some((s: string) => s.includes('gmail.readonly'));
      const hasGmailModify = scopes.some((s: string) => s.includes('gmail.modify'));
      const hasGmailMetadata = scopes.some((s: string) => s.includes('gmail.metadata'));

      console.log('\n📧 Gmail scopes status:');
      console.log('  gmail.readonly:', hasGmailReadonly ? '✅ GRANTED' : '❌ MISSING');
      console.log('  gmail.modify:', hasGmailModify ? '✅ GRANTED' : '❌ MISSING');
      console.log('  gmail.metadata:', hasGmailMetadata ? '✅ GRANTED' : '❌ MISSING');

      if (!hasGmailReadonly && !hasGmailModify && !hasGmailMetadata) {
        console.error('\n❌ NO GMAIL SCOPES FOUND!');
        console.error('The token does not have Gmail permissions.');
        console.error('This means the OAuth consent screen is NOT showing Gmail scopes.');
      }

      return data;
    } catch (error) {
      console.error('❌ [Auth] Failed to check token:', error);
    }
  }
  /**
   * Add a secondary Google account
   * Triggers OAuth flow with prompt='select_account'
   * Returns the new account details without logging out the current user
   */
  async addAccount(): Promise<ConnectedAccount | null> {
    return new Promise((resolve) => {
      if (this.isDemoMode) {
        // Return a mock secondary account
        resolve({
          email: 'secondary.demo@example.com',
          name: 'Secondary Demo User',
          picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
          accessToken: 'mock_secondary_token'
        });
        return;
      }

      if (!this.tokenClient) {
        if (window.google) {
          this.initializeTokenClient();
        } else {
          console.error('❌ [Auth] Google scripts not loaded');
          resolve(null);
          return;
        }
      }

      if (!this.tokenClient) {
        console.error('❌ [Auth] Failed to initialize token client');
        resolve(null);
        return;
      }

      // Save original callback
      const originalCallback = this.tokenClient.callback;

      // Set temporary callback for this specific request
      this.tokenClient.callback = async (response: any) => {
        // Restore original callback
        this.tokenClient.callback = originalCallback;

        if (response && response.access_token) {
          console.log('✅ [Auth] Secondary account token received');

          // Verify scopes
          const hasScopes = await this.verifyScopes(response.access_token);
          if (!hasScopes) {
            alert('Error: Debes conceder permisos de lectura de Gmail para conectar la cuenta.');
            resolve(null);
            return;
          }

          try {
            // Fetch profile for this new token
            const profileResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` },
            });

            if (profileResp.ok) {
              const data = await profileResp.json();
              const newAccount: ConnectedAccount = {
                name: data.name,
                email: data.email,
                picture: data.picture,
                accessToken: response.access_token
              };
              resolve(newAccount);
            } else {
              console.error('❌ [Auth] Failed to fetch profile for new account');
              resolve(null);
            }
          } catch (error) {
            console.error('❌ [Auth] Error fetching secondary profile:', error);
            resolve(null);
          }
        } else {
          console.error('❌ [Auth] No token received for secondary account');
          resolve(null);
        }
      };

      // Request new token with select_account prompt
      console.log('🔄 [Auth] Requesting secondary account...');
      this.tokenClient.requestAccessToken({ prompt: 'select_account', hint: '' });
    });
  }

  /**
   * Refresh token for a specific secondary account
   * Tries silent refresh first, then falls back to prompt if needed (or returns null if silent only)
   */
  async refreshSecondaryToken(email: string, silent: boolean = true): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.isDemoMode) {
        resolve('mock_refreshed_token');
        return;
      }

      if (!this.tokenClient) {
        if (window.google) {
          this.initializeTokenClient();
        } else {
          resolve(null);
          return;
        }
      }

      if (!this.tokenClient) {
        resolve(null);
        return;
      }

      // Save original callback
      const originalCallback = this.tokenClient.callback;

      // Set temporary callback
      this.tokenClient.callback = (response: any) => {
        this.tokenClient.callback = originalCallback;

        if (response && response.access_token) {
          console.log(`✅ [Auth] Token refreshed for ${email}`);
          resolve(response.access_token);
        } else {
          console.warn(`⚠️ [Auth] Failed to refresh token for ${email}`, response);
          resolve(null);
        }
      };

      // Request token
      console.log(`🔄 [Auth] Refreshing token for ${email} (silent: ${silent})...`);
      this.tokenClient.requestAccessToken({
        prompt: silent ? '' : 'consent',
        hint: email
      });
    });
  }

  private async verifyScopes(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
      if (!response.ok) return false;

      const data = await response.json();
      const scopes = data.scope.split(' ');
      return scopes.some((s: string) => s.includes('gmail.readonly'));
    } catch {
      return false;
    }
  }
}


export const authService = new AuthService();