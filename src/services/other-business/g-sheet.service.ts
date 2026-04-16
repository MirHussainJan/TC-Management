const { google } = require('googleapis');

const GDRIVE_SHEET_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

var sheetAuth = null;

export async function authorize() {
  if (sheetAuth) return sheetAuth;
  sheetAuth = new google.auth.GoogleAuth({
    keyFile: './gapikey.json',
    scopes: GDRIVE_SHEET_SCOPES,
  });
  return sheetAuth;
}
export async function updateMultipleRange(spreadSheetId, data) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const rs = await gSheet.spreadsheets.values.batchUpdate({
    spreadsheetId: spreadSheetId,
    requestBody: {
      // valueInputOption: 'RAW',
      valueInputOption: 'USER_ENTERED', // Sử dụng định dạng USER_ENTERED.
      data,
    },
  });

  return rs;
}

export async function changeSheetDeleteSheetByName(spreadSheetId, fromName, toName, deleteName) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const info = await gSheet.spreadsheets.get({
    spreadsheetId: spreadSheetId,
  });
  const sheetIdToChange = info?.data?.sheets?.filter((s) => s.properties?.title === fromName)?.[0]?.properties?.sheetId;
  const sheetIdToDelete = info?.data?.sheets?.filter((s) => s.properties?.title === deleteName)?.[0]?.properties?.sheetId;
  const requests: any = [];
  if (sheetIdToDelete) requests.push({ deleteSheet: { sheetId: sheetIdToDelete } });
  if (sheetIdToChange)
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: sheetIdToChange,
          title: toName,
        },
        fields: 'title',
      },
    });
  const rs = await updateSpreadSheet(spreadSheetId, {
    requests,
  });

  return sheetIdToChange;
}

export async function getAllSheet(spreadSheetId) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const rs = await gSheet.spreadsheets.get({
    spreadsheetId: spreadSheetId,
  });

  return rs?.data?.sheets;
}

export async function changeSheetName(spreadSheetId, sheetId, toName) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const rs = await gSheet.spreadsheets.batchUpdate({
    spreadsheetId: spreadSheetId,
    resource: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: Number(sheetId), // Ép kiểu
              title: toName,
            },
            fields: 'title',
          },
        },
      ],
    },
  });
  // const rs = await gSheet.spreadsheets.batchUpdate({
  //   spreadsheetId: spreadSheetId,
  //   requestBody: {
  //     requests: [
  //       {
  //         updateSheetProperties: {
  //           properties: {
  //             sheetId,
  //             title: toName,
  //           },
  //           fields: 'title',
  //         },
  //       },
  //     ],
  //   },
  // });

  return rs;
}

export async function getSheetIdByName(sourceSpreadSheetId, name) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const info = await gSheet.spreadsheets.get({
    spreadsheetId: sourceSpreadSheetId,
  });

  const sheetId = info?.data?.sheets?.filter((s) => s.properties?.title === name)?.[0]?.properties?.sheetId;
  return sheetId;
}

export async function copySheet(sourceSpreadSheetId, sourceSheetId, destSpreadSheetId) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const rs = await gSheet.spreadsheets.sheets.copyTo({
    spreadsheetId: sourceSpreadSheetId,
    sheetId: sourceSheetId,
    requestBody: {
      destinationSpreadsheetId: destSpreadSheetId,
    },
  });

  return rs;
}

export async function updateSpreadSheet(spreadSheetId, data) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const rs = await gSheet.spreadsheets.batchUpdate({
    spreadsheetId: spreadSheetId,
    requestBody: data,
  });

  return rs;
}

export async function updateSpreadSheetUserEnter(spreadSheetId, data) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const rs = await gSheet.spreadsheets.values.batchUpdate({
    spreadsheetId: spreadSheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED', // Sử dụng định dạng USER_ENTERED.
      data: data,
    },
  });

  return rs;
}

export async function searchWithQuery(spreadSheetId, sheetName, string, startRange = 'A5', outputRange = 'A30') {
  authorize(); // Gọi hàm authorize() để xác thực (nếu cần).
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });

  // Bước 1: Đặt QUERY trong phạm vi tùy chỉnh, bắt đầu từ `startRange`
  // const formula = `=QUERY('${sheetName}'!${startRange}:${outputRange}, "${query}")`;
  // outputRange = `${sheetName}!${outputRange}`; // Đặt tên sheet cho outputRange.
  // await gSheet.spreadsheets.values.update({
  //   spreadsheetId: spreadSheetId,
  //   range: outputRange, // Ô để đặt công thức QUERY.
  //   valueInputOption: 'USER_ENTERED',
  //   requestBody: {
  //     values: [[formula]], // Công thức QUERY được chèn vào đây.
  //   },
  // });

  // Bước 2: Đọc kết quả từ outputRange
  const rs = await gSheet.spreadsheets.values.get({
    spreadsheetId: spreadSheetId,
    range: `${sheetName}!${startRange}:${outputRange}`, // Đọc kết quả từ đây.
  });

  return rs?.data?.values?.some((s) => s[0] === string); // Trả về mảng chứa các hàng kết quả.
}

export async function addRow(spreadSheetId, sheetName, rowData) {
  authorize(); // Gọi hàm xác thực trước khi sử dụng API.

  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });

  const result = await gSheet.spreadsheets.values.append({
    spreadsheetId: spreadSheetId,
    range: `${sheetName}!A1`, // Thêm vào từ cột A, tiếp tục ở cuối bảng.
    valueInputOption: 'USER_ENTERED', // Dữ liệu sẽ được thêm với định dạng người dùng nhập.
    insertDataOption: 'INSERT_ROWS', // Chèn hàng mới thay vì ghi đè dữ liệu hiện có.
    requestBody: {
      values: rowData, // Dữ liệu cho một hàng. Ví dụ: ['Name', 'Age', 'Country'].
    },
  });

  return result.data;
}

export async function deleteSheetByName(spreadSheetId, deleteName) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const info = await gSheet.spreadsheets.get({
    spreadsheetId: spreadSheetId,
  });
  const sheetIdToDelete = info?.data?.sheets?.filter((s) => s.properties?.title === deleteName)?.[0]?.properties?.sheetId;
  const requests: any = [];
  if (sheetIdToDelete) requests.push({ deleteSheet: { sheetId: sheetIdToDelete } });
  const rs = await updateSpreadSheet(spreadSheetId, {
    requests,
  });

  return rs;
}

export async function deleteSheetById(spreadSheetId, sheetId) {
  authorize();
  const gSheet = google.sheets({ version: 'v4', auth: sheetAuth });
  const requests: any = [{ deleteSheet: { sheetId: sheetId } }];
  const rs = await updateSpreadSheet(spreadSheetId, {
    requests,
  });

  return rs;
}
