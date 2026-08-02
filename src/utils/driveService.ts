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
  const query = "trashed=false and (name contains '.mdx' or name contains '.md' or mimeType='text/plain' or mimeType='text/markdown')";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id, name, mimeType, modifiedTime, size)&orderBy=modifiedTime desc&pageSize=50`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.files || [];
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
      const errText = await response.text();
      throw new Error(`Failed to create file in Google Drive (${response.status}): ${errText}`);
    }

    return await response.json();
  }
}
