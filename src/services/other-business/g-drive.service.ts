import { google } from 'googleapis';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';

const GDRIVE_FILE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/docs',
  'https://www.googleapis.com/auth/drive.readonly',
];

let authClient: any = null;

/**
 * Authorize and return JWT client
 */
export async function authorize() {
  if (authClient) return authClient;
  const googleAuth = new google.auth.GoogleAuth({
    keyFile: './gapikey.json',
    scopes: GDRIVE_FILE_SCOPES,
  });
  authClient = await googleAuth.getClient();
  return authClient;
}

/**
 * Get Access Token string
 */
export async function getAccessTokenFromAuthorize(): Promise<string> {
  const client = await authorize();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse?.token) {
    throw new Error('Failed to get access token');
  }
  return tokenResponse.token;
}

/**
 * Get Google Drive instance with authenticated client
 */
export async function getDrive() {
  const client = await authorize();
  return google.drive({ version: 'v3', auth: client });
}

export async function getFileInfo(fileId) {
  const drive = await getDrive();
  return drive.files.get({ fileId, fields: '*' });
}

export async function search(query = '') {
  const drive = await getDrive();
  const res = await drive.files.list({
    q: query,
    corpora: 'user',
  });
  return res?.data?.files || null;
}

export async function createFolder(name, parentId) {
  const drive = await getDrive();
  const fileMetadata: any = { name };
  if (parentId) fileMetadata.parents = [parentId]; // <-- Fix key: should be "parents"
  const rs = await drive.files.create({
    requestBody: fileMetadata,
    media: { mimeType: 'application/vnd.google-apps.folder' },
  });
  return rs?.data?.id;
}

export async function deletef(fileId) {
  const drive = await getDrive();
  await drive.files.delete({ fileId });
}

export async function copyFile(fileId, fileName, parentIds, mimeType) {
  const drive = await getDrive();
  const requestBody: any = {
    name: fileName,
    parents: [parentIds],
  };
  if (mimeType) requestBody.mimeType = mimeType;
  const copied = await drive.files.copy({
    fileId,
    requestBody,
    fields: 'id, name, mimeType, webViewLink, webContentLink',
  });
  return copied?.data;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\/\\:\*\?"<>\|]/g, '_');
}

/**
 * Export a sheet to PDF and upload back to Drive in the same folder
 */
export async function exportSingleSheetToPDF(spreadsheetId, sheetId, pdfName) {
  const accessToken = await getAccessTokenFromAuthorize();

  const exportUrl = [
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`,
    `?format=pdf`,
    `&gid=${sheetId}`,
    `&portrait=true`,
    `&gridlines=false`,
    `&ir=false`,
    `&ic=false`,
    `&r1=0`,
    `&c1=0`,
    `&r2=137`,
    `&c2=27`,
  ].join('');

  try {
    const res = await axios.get(exportUrl, {
      responseType: 'stream',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const tempPDFPath = path.join(os.tmpdir(), `${sanitizeFileName(pdfName)}.pdf`);
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(tempPDFPath);
      res.data.pipe(writer);
      writer.on('finish', () => {
        console.log('✅ Exported PDF temp:', tempPDFPath);
        resolve();
      });
      writer.on('error', reject);
    });

    const drive: any = await getDrive();
    const { data: fileMeta } = await drive.files.get({
      fileId: spreadsheetId,
      fields: 'parents',
    });
    const parentFolderId = fileMeta.parents?.[0];

    const { data: uploaded } = await drive.files.create({
      requestBody: {
        name: `${pdfName}.pdf`,
        mimeType: 'application/pdf',
        parents: parentFolderId ? [parentFolderId] : [],
      },
      media: {
        mimeType: 'application/pdf',
        body: fs.createReadStream(tempPDFPath),
      },
      fields: 'id, name, webViewLink, webContentLink',
    });

    console.log('✅ Uploaded PDF to Drive:', uploaded.webViewLink);
    return uploaded.webViewLink;
  } catch (err) {
    console.error('❌ Error exporting sheet to PDF:', err);
    throw err;
  }
}

// const { google } = require('googleapis');
// import axios from 'axios';
// import fs from 'fs';
// import os from 'os';
// import path from 'path';

// const GDRIVE_FILE_SCOPES = [
//   'https://www.googleapis.com/auth/drive',
//   'https://www.googleapis.com/auth/drive.appdata',
//   'https://www.googleapis.com/auth/drive.file',
//   'https://www.googleapis.com/auth/drive.metadata',
//   'https://www.googleapis.com/auth/drive.metadata.readonly',
//   'https://www.googleapis.com/auth/docs',
//   'https://www.googleapis.com/auth/drive.readonly',
// ];

// var driveAuth = null;

// /**
//  * Authorize with service account and get jwt client
//  *
//  */
// export async function authorize() {
//   if (driveAuth) return driveAuth;
//   driveAuth = new google.auth.GoogleAuth({
//     keyFile: './gapikey.json',
//     scopes: GDRIVE_FILE_SCOPES,
//   });
//   return driveAuth;
// }

// export async function getFileInfo(fileId) {
//   authorize();
//   const drive = google.drive({ version: 'v3', auth: driveAuth });
//   return drive.files.get({ fileId, fields: '*' });
// }

// export async function search(query = '') {
//   authorize();
//   const drive = google.drive({ version: 'v3', auth: driveAuth });
//   const res = await drive.files.list({
//     q: query,
//     corpora: 'user',
//   });
//   if (res?.data?.files) {
//     return res?.data?.files;
//   }

//   return null;
// }

// export async function createFolder(name, parentId) {
//   authorize();
//   const drive = google.drive({ version: 'v3', auth: driveAuth });
//   const fileMetadata: any = {
//     name: name,
//   };
//   if (parentId) fileMetadata.parentId = parentId;
//   const rs = await drive.files.create({
//     requestBody: fileMetadata,
//     media: {
//       mimeType: 'application/vnd.google-apps.folder',
//     },
//   });

//   return rs?.data?.id;
// }

// export async function deletef(fileId) {
//   authorize();
//   const drive = google.drive({ version: 'v3', auth: driveAuth });
//   await drive.files.delete({ fileId });
// }
// export async function copyFile(fileId, fileName, parentIds, mimeType) {
//   authorize();
//   const drive = google.drive({ version: 'v3', auth: driveAuth });
//   const requestBody: any = {
//     name: fileName,
//     parents: [parentIds],
//     fields: '*',
//   };
//   if (mimeType) requestBody.mimeType = mimeType;
//   const copied = await drive.files.copy({
//     fileId,
//     requestBody,
//     fields: 'id, name, mimeType, webViewLink, webContentLink', // Yêu cầu các trường bổ sung
//   });
//   return copied?.data;
// }

// export async function exportSheetToPDFAndUploadBack(spreadSheetId, sheetId, pdfName) {
//   authorize();
//   const drive = google.drive({ version: 'v3', auth: driveAuth });

//   // Step 1: Lấy thông tin file gốc (để biết thư mục cha)
//   const fileMeta = await drive.files.get({
//     fileId: sheetId,
//     fields: 'name, parents',
//   });

//   const parentFolderId = fileMeta.data.parents?.[0];
//   const tempPDFPath = path.join(os.tmpdir(), `${sanitizeFileName(pdfName)}.pdf`);

//   // Step 2: Export PDF ra tạm (local)
//   const exportRes = await drive.files.export(
//     {
//       fileId: sheetId,
//       mimeType: 'application/pdf',
//     },
//     { responseType: 'stream' },
//   );

//   const writer = fs.createWriteStream(tempPDFPath);
//   await new Promise((resolve, reject) => {
//     exportRes.data.pipe(writer).on('finish', resolve).on('error', reject);
//   });

//   // Step 3: Upload PDF ngược lại lên cùng thư mục
//   const pdfFile = await drive.files.create({
//     requestBody: {
//       name: `${pdfName}.pdf`,
//       mimeType: 'application/pdf',
//       parents: parentFolderId ? [parentFolderId] : [],
//     },
//     media: {
//       mimeType: 'application/pdf',
//       body: fs.createReadStream(tempPDFPath),
//     },
//     fields: 'id, name, webViewLink',
//   });

//   console.log('✅ PDF uploaded to Drive:', pdfFile.data.webViewLink);
//   return pdfFile.data;
// }
// function sanitizeFileName(name: string): string {
//   return name.replace(/[\/\\:\*\?"<>\|]/g, '_');
// }
// /**
//  * Export một sheet (với gid = sheetId) từ spreadsheetId thành PDF,
//  * chỉ lấy vùng A1:AB138, rồi upload trở lại Drive vào cùng folder.
//  *
//  * @param {string} spreadsheetId ID của Google Spreadsheet
//  * @param {number|string} sheetId GID của sheet cần export
//  * @param {string} pdfName Tên file PDF (không gồm .pdf)
//  * @returns {Promise<string|undefined>} URL xem file PDF trên Drive
//  */
// export async function exportSingleSheetToPDF(spreadsheetId, sheetId, pdfName) {
//   // 1) Lấy access token để gọi export URL
//   const accessToken = await getAccessTokenFromAuthorize();

//   // 2) Thiết lập crop vùng A1:AB138
//   const r1 = 0; // row index bắt đầu (0-based) → dòng 1
//   const c1 = 0; // column index bắt đầu → cột A
//   const r2 = 137; // row index kết thúc → dòng 138 (0-based)
//   const c2 = 27; // column index kết thúc → cột AB (0-based)

//   // 3) Xây URL export với các tham số crop và format PDF
//   const exportUrl = [
//     `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`,
//     `?format=pdf`,
//     `&gid=${sheetId}`,
//     `&portrait=true`,
//     `&gridlines=false`,
//     `&ir=false`, // không in header row lặp
//     `&ic=false`, // không in header col lặp
//     `&r1=${r1}`,
//     `&c1=${c1}`,
//     `&r2=${r2}`,
//     `&c2=${c2}`,
//   ].join('');

//   try {
//     // 4) Gọi Google export API để stream PDF về
//     const res = await axios.get(exportUrl, {
//       responseType: 'stream',
//       headers: { Authorization: `Bearer ${accessToken}` },
//     });

//     // 5) Ghi PDF tạm vào thư mục temp
//     const tempPDFPath = path.join(os.tmpdir(), `${sanitizeFileName(pdfName)}.pdf`);
//     await new Promise<void>((resolve, reject) => {
//       const writer = fs.createWriteStream(tempPDFPath);
//       res.data.pipe(writer);
//       writer.on('finish', () => {
//         console.log('✅ Đã export PDF tạm:', tempPDFPath);
//         resolve();
//       });
//       writer.on('error', reject);
//     });

//     // 6) Lấy thông tin thư mục cha (parent) của spreadsheet gốc
//     const drive = google.drive({ version: 'v3', auth: await authorize() });
//     const { data: fileMeta } = await drive.files.get({
//       fileId: spreadsheetId,
//       fields: 'parents',
//     });
//     const parentFolderId = fileMeta.parents?.[0];

//     // 7) Upload file PDF lên Drive vào đúng folder cha
//     const { data: uploaded } = await drive.files.create({
//       requestBody: {
//         name: `${pdfName}.pdf`,
//         mimeType: 'application/pdf',
//         parents: parentFolderId ? [parentFolderId] : [],
//       },
//       media: {
//         mimeType: 'application/pdf',
//         body: fs.createReadStream(tempPDFPath),
//       },
//       fields: 'id, name, webViewLink, webContentLink',
//     });

//     console.log('✅ Uploaded PDF to Drive:', uploaded.webViewLink);
//     return uploaded.webViewLink;
//   } catch (err) {
//     console.error('❌ Error exporting sheet to PDF:', err);
//     throw err;
//   }
// }
// // export async function exportSingleSheetToPDF(spreadsheetId, sheetId, pdfName) {
// //   const accessToken = await getAccessTokenFromAuthorize();

// //   const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&gid=${sheetId}&portrait=false&gridlines=false`;

// //   try {
// //     const res = await axios.get(exportUrl, {
// //       responseType: 'stream',
// //       headers: {
// //         Authorization: `Bearer ${accessToken}`,
// //       },
// //     });

// //     const tempPDFPath = path.join(os.tmpdir(), `${sanitizeFileName(pdfName)}.pdf`);
// //     const writer = fs.createWriteStream(tempPDFPath);
// //     new Promise<void>((resolve, reject) => {
// //       res.data.pipe(writer);
// //       writer.on('finish', () => {
// //         console.log('✅ Exported specific sheet to PDF temp:', tempPDFPath);
// //         resolve();
// //       });
// //       writer.on('error', reject);
// //     });

// //     // Step 2: Lấy thông tin thư mục của file gốc
// //     const drive = google.drive({ version: 'v3', auth: await authorize() });
// //     const fileMeta = await drive.files.get({
// //       fileId: spreadsheetId,
// //       fields: 'parents',
// //     });

// //     const parentFolderId = fileMeta.data.parents?.[0];

// //     // Step 3: Upload file PDF lên lại Drive
// //     const uploaded = await drive.files.create({
// //       requestBody: {
// //         name: `${pdfName}.pdf`,
// //         mimeType: 'application/pdf',
// //         parents: parentFolderId ? [parentFolderId] : [],
// //       },
// //       media: {
// //         mimeType: 'application/pdf',
// //         body: fs.createReadStream(tempPDFPath),
// //       },
// //       fields: 'id, name, webViewLink, webContentLink',
// //     });

// //     console.log('✅ Uploaded PDF to Drive:', uploaded.data.webViewLink);
// //     return uploaded?.data?.webViewLink;
// //   } catch (err) {
// //     console.error('Error exporting sheet to PDF:', err);
// //   }
// // }

// async function getAccessTokenFromAuthorize(): Promise<string> {
//   const googleAuth: any = await authorize();
//   const authClient = await googleAuth.getClient();
//   const tokenResponse = await authClient.getAccessToken();
//   return tokenResponse?.token!;
// }
