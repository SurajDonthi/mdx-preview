import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  User,
  signOut,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable local persistence for auth state
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Firebase setPersistence error:', err);
});

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

let cachedAccessToken: string | null = localStorage.getItem('google_access_token');

/**
 * Initializes Firebase Auth state listener
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken) {
        cachedAccessToken = localStorage.getItem('google_access_token');
      }
      const token = cachedAccessToken || '';
      if (onAuthSuccess) onAuthSuccess(user, token);
    } else {
      cachedAccessToken = null;
      localStorage.removeItem('google_access_token');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Trigger Google Popup Sign-In to obtain Drive token
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google Drive access token');
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem('google_access_token', cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    if (error?.code === 'auth/network-request-failed') {
      throw new Error('Network request failed. Please check your internet connection or browser security settings.');
    } else if (error?.code === 'auth/popup-blocked') {
      throw new Error('Sign-in popup was blocked by your browser. Please allow popups for this site.');
    } else if (error?.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in popup was closed before completing authentication.');
    }
    throw error;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken || localStorage.getItem('google_access_token');
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  localStorage.removeItem('google_access_token');
};
