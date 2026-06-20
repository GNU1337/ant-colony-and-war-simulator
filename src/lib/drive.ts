import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request necessary Google Drive scopes
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

// Initialize Auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Start Google sign in
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google access token');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Auth Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Get current token
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Sign out
export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// --- Google Drive Helper Functions ---

const FOLDER_NAME = 'Ant Colony Wargame';

// Search or create a dedicated folder in the user's Google Drive
export const getOrCreateWargameFolder = async (token: string): Promise<string> => {
  try {
    // 1. Search for existing folder
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!searchRes.ok) {
      throw new Error(`Search folder failed: ${searchRes.statusText}`);
    }
    
    const searchResult = await searchRes.json();
    if (searchResult.files && searchResult.files.length > 0) {
      return searchResult.files[0].id;
    }

    // 2. Folder does not exist, create it
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (!createRes.ok) {
      throw new Error(`Folder creation failed: ${createRes.statusText}`);
    }

    const newFolder = await createRes.json();
    return newFolder.id;
  } catch (err) {
    console.error('getOrCreateWargameFolder error:', err);
    throw err;
  }
};

// List files inside our dedicated folder
export const listWargameFiles = async (token: string): Promise<DriveFile[]> => {
  try {
    const folderId = await getOrCreateWargameFolder(token);
    
    // List all non-trashed files with folder as parent
    const q = `'${folderId}' in parents and trashed = false`;
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size)`;
    
    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`Listing files failed: ${res.statusText}`);
    }

    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.error('listWargameFiles error:', err);
    throw err;
  }
};

// Save an Ant Colony Report (Markdown format) to Google Drive
export const saveReportFileToDrive = async (
  token: string,
  fileName: string,
  content: string
): Promise<string> => {
  try {
    const folderId = await getOrCreateWargameFolder(token);

    // Check if file already exists with this exact name to prevent duplicate files
    const q = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;
    const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`;
    const checkRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    let fileId: string | null = null;
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.files && checkData.files.length > 0) {
        fileId = checkData.files[0].id;
      }
    }

    if (fileId) {
      // Overwrite content
      const patchUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/markdown'
        },
        body: content
      });
      if (!patchRes.ok) throw new Error(`Overwriting report failed: ${patchRes.statusText}`);
      return fileId;
    } else {
      // Create new file
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: fileName,
          mimeType: 'text/markdown',
          parents: [folderId]
        })
      });

      if (!createRes.ok) throw new Error(`Report creation failed: ${createRes.statusText}`);
      const newFile = await createRes.json();
      
      // Upload media
      const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${newFile.id}?uploadType=media`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/markdown'
        },
        body: content
      });
      if (!uploadRes.ok) throw new Error(`Uploading report content failed: ${uploadRes.statusText}`);
      return newFile.id;
    }
  } catch (err) {
    console.error('saveReportFileToDrive error:', err);
    throw err;
  }
};

// Save a Game Simulation State (JSON format) to Google Drive
export const saveStateFileToDrive = async (
  token: string,
  fileName: string,
  state: any
): Promise<string> => {
  try {
    const folderId = await getOrCreateWargameFolder(token);
    const contentString = JSON.stringify(state);

    // Check if filename already exists
    const q = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;
    const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`;
    const checkRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    let fileId: string | null = null;
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.files && checkData.files.length > 0) {
        fileId = checkData.files[0].id;
      }
    }

    if (fileId) {
      // Overwrite content
      const patchUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: contentString
      });
      if (!patchRes.ok) throw new Error(`Overwriting state failed: ${patchRes.statusText}`);
      return fileId;
    } else {
      // Create new file
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: fileName,
          mimeType: 'application/json',
          parents: [folderId]
        })
      });

      if (!createRes.ok) throw new Error(`Simulation state creation failed: ${createRes.statusText}`);
      const newFile = await createRes.json();

      // Upload media
      const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${newFile.id}?uploadType=media`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: contentString
      });
      if (!uploadRes.ok) throw new Error(`Uploading state content failed: ${uploadRes.statusText}`);
      return newFile.id;
    }
  } catch (err) {
    console.error('saveStateFileToDrive error:', err);
    throw err;
  }
};

// Load a Game Simulation State file content
export const loadWargameStateFile = async (token: string, fileId: string): Promise<any> => {
  try {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`File download failed: ${res.statusText}`);
    }

    return await res.json();
  } catch (err) {
    console.error('loadWargameStateFile error:', err);
    throw err;
  }
};

// Load any text/markdown file content
export const loadWargameTextFile = async (token: string, fileId: string): Promise<string> => {
  try {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`File download failed: ${res.statusText}`);
    }

    return await res.text();
  } catch (err) {
    console.error('loadWargameTextFile error:', err);
    throw err;
  }
};

// Delete/Trash a file in Drive
export const deleteWargameFile = async (token: string, fileId: string): Promise<void> => {
  try {
    // Delete permanently or trash
    const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`File deletion failed: ${res.statusText}`);
    }
  } catch (err) {
    console.error('deleteWargameFile error:', err);
    throw err;
  }
};
