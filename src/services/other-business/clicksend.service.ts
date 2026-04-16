let clicksendApiCache: any | null | undefined;

function getClicksendApi() {
  if (clicksendApiCache !== undefined) {
    return clicksendApiCache;
  }
  try {
    // Lazy-load so app startup does not crash when clicksend package is broken/missing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    clicksendApiCache = require('clicksend/api');
  } catch (error) {
    console.error(`[Clicksend] SDK load failed: ${error?.message || error}`);
    clicksendApiCache = null;
  }
  return clicksendApiCache;
}

export async function getSpecificContact(listId, contactId) {
  try {
    const api = getClicksendApi();
    if (!api) return null;
    var contactApi = new api.ContactApi(process.env.CLICKSEND_USER ?? '', process.env.CLICKSEND_API_KEY ?? '');
    const response = await contactApi.listsContactsByListIdAndContactIdGet(listId, contactId);

    return response?.body?.data;
  } catch (err) {
    return null;
  }
}

export async function sendSMS(to, body) {
  try {
    const api = getClicksendApi();
    if (!api) return false;
    var smsApi = new api.SMSApi(process.env.CLICKSEND_USER ?? '', process.env.CLICKSEND_API_KEY ?? '');

    var smsMessage = new api.SmsMessage();

    smsMessage.source = 'sdk';
    smsMessage.to = to;
    smsMessage.body = body;

    var smsCollection = new api.SmsMessageCollection();

    smsCollection.messages = [smsMessage];

    const response = await smsApi.smsSendPost(smsCollection);
    return response?.body?.data?.total_count > 0 ? true : false;
  } catch (err) {
    return false;
  }
}

export async function sendMMS(to, body, mediaUrl) {
  try {
    const api = getClicksendApi();
    if (!api) return false;
    const mmsApi = new api.MMSApi(process.env.CLICKSEND_USER ?? '', process.env.CLICKSEND_API_KEY ?? '');

    let mmsMessage = new api.MmsMessage();

    mmsMessage.to = to;
    mmsMessage.body = body;
    mmsMessage.source = 'sdk';
    mmsMessage.subject = body;
    mmsMessage.from = '+18883035959';

    let mmsMessages = new api.MmsMessageCollection();

    mmsMessages.mediaFile = mediaUrl;
    mmsMessages.messages = [mmsMessage];

    const rs = await mmsApi.mmsSendPost(mmsMessages);
    // mmsApi
    //   .mmsSendPost(mmsMessages)
    //   .then(function (response) {
    //     console.log(response.body);
    //   })
    //   .catch(function (err) {
    //     console.error(err.body);
    //   });
    return rs?.body?.data?.total_count > 0 ? true : false;
  } catch (err) {
    return false;
  }
}

// convert: fax, mms, post, postcard, csv
export async function uploadMediaFile(base64Content: string, convert = 'mms') {
  try {
    const api = getClicksendApi();
    if (!api) return null;
    var uploadApi = new api.UploadApi(process.env.CLICKSEND_USER ?? '', process.env.CLICKSEND_API_KEY ?? '');

    var uploadFile = new api.UploadFile();

    uploadFile.content = base64Content;

    const response = await uploadApi.uploadsPost(uploadFile, convert);
    return response?.body?.data;
  } catch (err) {
    return null;
  }
}

// export async function createContact(listId, phone) {
//   var contactApi = new api.ContactApi(process.env.CLICKSEND_USER ?? '', process.env.CLICKSEND_API_KEY ?? '');

//   var contact = new api.Contact();

//   contact.phoneNumber = phone;
//   contact.custom1 = 'custom1';
//   contact.email = 'xxx@gmail.com';
//   contact.faxNumber = '+16783270696';
//   contact.firstName = 'firstName';
//   contact.addressLine1 = 'addressLine1';
//   contact.addressLine2 = 'addressLine2';
//   contact.addressCity = 'addressCity';
//   contact.addressState = 'addressState';
//   contact.addressPostalCode = 'addressPostalCode';
//   contact.addressCountry = 'country';
//   contact.organizationName = 'organizationName';
//   contact.custom2 = 'custom2';
//   contact.custom3 = 'custom3';
//   contact.custom4 = 'custom4';
//   contact.lastName = 'lastname';

//   var listId = 185161;

//   contactApi
//     .listsContactsByListIdPost(contact, listId)
//     .then(function (response) {
//       console.log(response.body);
//     })
//     .catch(function (err) {
//       console.error(err.body);
//     });
// }
