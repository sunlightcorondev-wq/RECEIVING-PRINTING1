import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut as firebaseSignOut, 
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Official Workspace Scopes requested & configured for Google Sheets
export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// In-memory token cache (NEVER stored in localStorage or sessionStorage per security guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Google Auth Provider setup with configured scopes
function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach(scope => provider.addScope(scope));
  provider.setCustomParameters({
    prompt: 'consent'
  });
  return provider;
}

/**
 * Sign in with Google Popup and obtain access token with Google Sheets scopes
 */
export async function signInWithGoogle(): Promise<{ user: User; token: string }> {
  isSigningIn = true;
  try {
    const provider = createGoogleProvider();
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || null;

    if (!accessToken) {
      throw new Error('Google Sign-In succeeded but no OAuth access token was returned.');
    }

    cachedAccessToken = accessToken;
    return {
      user: result.user,
      token: accessToken
    };
  } finally {
    isSigningIn = false;
  }
}

/**
 * Sign out from Google Auth and clear in-memory token cache
 */
export async function signOutGoogle(): Promise<void> {
  cachedAccessToken = null;
  await firebaseSignOut(auth);
}

/**
 * Retrieve cached in-memory access token, or prompt sign-in if expired/missing
 */
export async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  // If user is logged in but token was lost from memory (e.g. page reload), re-authenticate silently or prompt
  if (auth.currentUser && !isSigningIn) {
    try {
      const { token } = await signInWithGoogle();
      return token;
    } catch (err) {
      console.warn('Could not refresh Google OAuth access token:', err);
      return null;
    }
  }

  return null;
}

/**
 * Subscribe to Auth state changes and track the in-memory access token
 */
export function subscribeAuth(
  callback: (user: User | null, token: string | null) => void
): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      cachedAccessToken = null;
      callback(null, null);
    } else {
      callback(user, cachedAccessToken);
    }
  });
}
