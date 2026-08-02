export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

const DRIVE_FOLDER_NAME = 'MDX Studio Documents';

/**
 * Searches or creates a dedicated app folder in Google Drive
 */
async function getOrCreateAppFolder(token: string): Promise<string | null> {
  try {
    // 1. Search for existing folder
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(
      DRIVE_FOLDER_NAME
    )}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`;
    
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // 2. Create folder if not found
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createRes.ok) return null;
    const createData = await createRes.json();
    return createData.id;
  } catch (err) {
    console.warn('Error fetching or creating Drive folder:', err);
    return null;
  }
}

/**
 * List MDX and Markdown files stored in Google Drive
 */
export async function listDriveFiles(token: string): Promise<DriveFile[]> {
  try {
    const folderId = await getOrCreateAppFolder(token);

    const fetchedFilesMap = new Map<string, DriveFile>();

    // 1. Fetch files inside the MDX Studio Documents folder if it exists
    if (folderId) {
      const folderQuery = `'${folderId}' in parents and trashed=false`;
      const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        folderQuery
      )}&fields=files(id, name, mimeType, modifiedTime, size)&orderBy=modifiedTime desc&pageSize=50`;

      const folderRes = await fetch(folderUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (folderRes.status === 401 || folderRes.status === 403) {
        throw new Error('TOKEN_EXPIRED: Your Google Drive session has expired. Please re-authenticate.');
      }

      if (folderRes.ok) {
        const folderData = await folderRes.json();
        if (folderData.files) {
          folderData.files.forEach((f: DriveFile) => fetchedFilesMap.set(f.id, f));
        }
      }
    }

    // 2. Also fetch all non-folder files accessible to this app
    const generalQuery = "trashed=false and mimeType != 'application/vnd.google-apps.folder'";
    const generalUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      generalQuery
    )}&fields=files(id, name, mimeType, modifiedTime, size)&orderBy=modifiedTime desc&pageSize=50`;

    const generalRes = await fetch(generalUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (generalRes.status === 401 || generalRes.status === 403) {
      throw new Error('TOKEN_EXPIRED: Your Google Drive session has expired. Please re-authenticate.');
    }

    if (generalRes.ok) {
      const generalData = await generalRes.json();
      if (generalData.files) {
        generalData.files.forEach((f: DriveFile) => fetchedFilesMap.set(f.id, f));
      }
    }

    const fileList = Array.from(fetchedFilesMap.values());
    fileList.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
    return fileList;
  } catch (err: any) {
    if (err.message && err.message.startsWith('TOKEN_EXPIRED')) {
      throw err;
    }
    console.error('Error in listDriveFiles:', err);
    throw new Error(err.message || 'Failed to list files from Google Drive');
  }
}

/**
 * Read the string content of a file from Google Drive
 */
export async function downloadDriveFile(token: string, fileId: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('TOKEN_EXPIRED: Your Google Drive session has expired. Please re-authenticate.');
    }
    throw new Error(`Failed to download file from Google Drive (${response.status})`);
  }

  return await response.text();
}

/**
 * Save or update an MDX file in Google Drive
 */
export async function saveFileToDrive(
  token: string,
  fileName: string,
  content: string,
  existingFileId?: string | null
): Promise<DriveFile> {
  // Ensure file extension is .mdx
  const cleanName = fileName.endsWith('.mdx') || fileName.endsWith('.md') ? fileName : `${fileName}.mdx`;

  if (existingFileId) {
    // UPDATE EXISTING FILE CONTENT
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`;
    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/markdown; charset=UTF-8',
      },
      body: content,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('TOKEN_EXPIRED: Your Google Drive session has expired. Please re-authenticate.');
      }
      throw new Error(`Failed to update file in Google Drive (${response.status})`);
    }

    const updatedData = await response.json();
    return {
      id: updatedData.id,
      name: cleanName,
      mimeType: 'text/markdown',
      modifiedTime: new Date().toISOString(),
    };
  } else {
    // CREATE NEW FILE in App Folder
    const folderId = await getOrCreateAppFolder(token);

    const metadata: Record<string, any> = {
      name: cleanName,
      mimeType: 'text/markdown',
    };

    if (folderId) {
      metadata.parents = [folderId];
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/markdown; charset=UTF-8\r\n\r\n' +
      content +
      closeDelimiter;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('TOKEN_EXPIRED: Your Google Drive session has expired. Please re-authenticate.');
      }
      const errText = await response.text();
      throw new Error(`Failed to create file in Google Drive (${response.status}): ${errText}`);
    }

    return await response.json();
  }
}
