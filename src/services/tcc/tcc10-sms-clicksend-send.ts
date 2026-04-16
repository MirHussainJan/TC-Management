import axios from 'axios';
import { BoardConstants, Constants, EventName } from '../../constants/constant';
import ConstColumn from '../../constants/constant-column';
import AutomationDataModel from '../../db/models/automation-data.model';
import Logger from '../../helper/logger';
import CommonService from '../../services/common-service';
import LogService from '../../services/log-service';
import BlabMondayService from '../blab-monday.service';
import * as clicksendService from '../other-business/clicksend.service';
import SlackService from '../other-business/slack.service';
import * as fs from 'fs';

export default class TCC10SMSClicksendSend {
  static async tcc10SMSClicksendSend(event, isAutomation = false, dbData?: AutomationDataModel) {
    const { boardId, pulseId, pulseName, columnId, type, textBody } = event;
    let logData = {
      board_id: boardId,
      item_id: pulseId,
      item_name: pulseName?.length ? pulseName : 'Send SMS',
      board_name: CommonService.getBoardName(boardId),
      event_name: EventName.TCC10SMSClicksendSend,
      event_data: event,
      monday_item_id: 0,
    };

    try {
      Logger.log(`======START ${EventName.TCC10SMSClicksendSend} ${pulseId || pulseName}=======`);

      if (!isAutomation) {
        const { mondayLog } = await LogService.StartLog(logData);
        dbData = mondayLog;
      }
      if (dbData) dbData.event_status = true;

      let result: any = null;

      // Kiểm tra xem SMS có được bật hay không
      const smsEnableDisable = await BlabMondayService.GetItemById(6981423576, [ConstColumn.TCCom.SMSSending]);
      const smsSetting = smsEnableDisable?.column_values?.[0]?.text;
      Logger.log(`======smsEnableDisable ${smsSetting}=======`);
      if (smsSetting && smsSetting === 'Disable') {
        result = { msg: 'SMS is disabled' };
        Logger.log(`======SMS is disabled=======`);
        await LogService.DoneLog({ dbData, result });
        return { status: 200, message: Constants.Done };
      }

      // Lấy thông tin itemTCCom và các giá trị cần thiết
      let itemTCCom = await BlabMondayService.GetItemById(pulseId);
      let clicksendId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClicksendId);
      let clickSendGroupId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClickSendGroupId);
      let phone = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.Phone);
      let smsStatus = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.SMSStatus);
      let contactId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ContactId);
      logData.item_name = itemTCCom?.name;
      // Nếu có clicksendId và clickSendGroupId thì lấy thông tin contact
      if (clicksendId && clickSendGroupId) {
        const clicksendContact = await clicksendService.getSpecificContact(clickSendGroupId, clicksendId);
        if (!clicksendContact?.contact_id) {
          result = { msg: 'clicksendContact null' };
          Logger.log(`======clicksendContact null=======`);
          await LogService.DoneLog({ dbData, result });
          return { status: 200, message: Constants.Done };
        }
      } else if (phone?.replace('+', '')?.length) {
        // Nếu chỉ có phone, cập nhật trạng thái và đợi 30s để đồng bộ thông tin
        await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.UpdateToClicksend, 'Start');
        await new Promise<void>((resolve) => {
          setTimeout(async () => {
            itemTCCom = await BlabMondayService.GetItemById(pulseId);
            clicksendId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClicksendId);
            clickSendGroupId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClickSendGroupId);
            phone = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.Phone);
            smsStatus = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.SMSStatus);
            contactId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ContactId);
            resolve();
          }, 30000);
        });
      }

      // Nếu contactId bắt đầu bằng 'A-' thì lấy danh sách học sinh liên quan
      let allStudents;
      if (contactId && contactId.startsWith('A-')) {
        const rules = [
          {
            column_id: ConstColumn.SD.AccountID,
            compare_value: [contactId],
            operator: 'any_of',
          },
          {
            column_id: ConstColumn.SD.Status,
            compare_value: ['Active'],
            operator: 'contains_terms',
          },
        ];
        const itemSD = await BlabMondayService.getBoardItems(
          BoardConstants.SD,
          rules,
          ['any_of', 'contains_terms'],
          [ConstColumn.SD.StudentID, ConstColumn.SD.Center],
        );
        allStudents =
          itemSD
            ?.map((item) => {
              const center = this.getColumnValuesById(item, ConstColumn.SD.Center);
              return `<https://tutoringclub-stjohns.monday.com/boards/3288941979/views/82004885/pulses/${item.id}|${item.name}> - ${center}`;
            })
            .join('\n') || null;
      }

      // Nếu có số điện thoại, thực hiện gửi SMS/MMS
      if (phone?.replace('+', '')?.length) {
        // Gửi Custom SMS nếu columnId là SendCustomSMSClickSend
        if (columnId === ConstColumn.TCCom.SendCustomSMSClickSend) {
          // Nếu SMS status là 'OPTED OUT' thì cập nhật và thông báo lỗi
          if (smsStatus === 'OPTED OUT') {
            result = { msg: 'OPTED OUT' };
            Logger.log(`======OPTED OUT=======`);
            await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Opted Out');
            await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: SMS user must text START to receive your text!');
            await SlackService.tcc10(1, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents });
            await LogService.DoneLog({ dbData, result });
            return { status: 200, message: Constants.Done };
          }
          Logger.log(`======SendCustomSMSClickSend=======`);
          try {
            const smsCustomMessage = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.SMSCustomMessage);
            const response = await clicksendService.sendSMS(phone, smsCustomMessage?.trim());
            if (response) {
              Logger.log(`======sendSMS ${JSON.stringify(response)}=======`);
              result = { msg: `SMS smsCustomMessage sent to ${phone}` };
              const _columnValuesSent = {
                [ConstColumn.TCCom.SendCustomSMSClickSend]: 'Done',
                [ConstColumn.TCCom.SlackNotif]: 'Yes',
                [ConstColumn.TCCom.SMSTemplateClicksend]: 'RESET',
              };
              await BlabMondayService.ChangeMultipleColumnValues(boardId, pulseId, _columnValuesSent);
              await BlabMondayService.CreateUpdate(pulseId, `CUSTOM SMS: ${smsCustomMessage}`);
              await SlackService.tcc10(3, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: smsCustomMessage });
            } else {
              Logger.log(`======sendSMS SMS not sent=======`);
              result = { msg: 'SMS not sent' };
              await BlabMondayService.CreateUpdate(pulseId, 'CUSTOM SMS: ❌ Delivery Error');
              await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Error - Not Sent');
              await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: 'Internal error', detail: '' });
            }
          } catch (err) {
            Logger.log(`======SendCustomSMSClickSend exception ${err.message}=======`);
            await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: Phone number not correct');
            await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Error - Not Sent');
            await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: err?.message, detail: '' });
          }
        }

        // Gửi SMS/MMS theo loại create_update nếu textBody không bắt đầu bằng "Email sent:"
        if (type === 'create_update' && !textBody.startsWith('Email sent:')) {
          Logger.log(`======create_update=======`);
          if (!event.replyId && (textBody.startsWith('SMS') || textBody.startsWith('TEMPLATE SMS:') || textBody.startsWith('CALENDAR SMS:'))) {
            // Nếu SMS status là 'OPTED OUT' thì cập nhật và thông báo lỗi
            if (smsStatus === 'OPTED OUT') {
              result = { msg: 'OPTED OUT' };
              Logger.log(`======OPTED OUT=======`);
              await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Opted Out');
              await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: SMS user must text START to receive your text!');
              await SlackService.tcc10(1, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents });
              await LogService.DoneLog({ dbData, result });
              return { status: 200, message: Constants.Done };
            }
            let isMMS = false;
            let mmsMediaFileUrl = '';

            // Xử lý assets cho MMS nếu có
            const assets = await BlabMondayService.getAssetsByUpdateId(event.updateId);
            if (assets?.length) {
              isMMS = true;
              for (const element of assets) {
                if (element?.name && (element.name.endsWith('.jpeg') || element.name.endsWith('.png') || element.name.endsWith('.bmp'))) {
                  Logger.log(`======Processing asset ${element.name}=======`);
                  const fileBase64 = await this.downloadFileToBase64(element.public_url);
                  const rsUpload = await clicksendService.uploadMediaFile(fileBase64);
                  if (rsUpload?._url?.length) {
                    mmsMediaFileUrl = rsUpload._url;
                    Logger.log(`======Asset ${element.name} uploaded, URL: ${mmsMediaFileUrl}=======`);
                    break; // Giả sử chỉ cần 1 file hợp lệ cho MMS
                  }
                }
              }
            }

            // Xử lý nội dung tin nhắn SMS/MMS
            const lastBody = textBody.replace('TEMPLATE SMS:', '').replace('CALENDAR SMS:', '').replace('RE:', '').replace('SMS:', '').trim();
            let isSent = false;
            try {
              if (isMMS && mmsMediaFileUrl.length) {
                const response = await clicksendService.sendMMS(phone, lastBody, mmsMediaFileUrl);
                if (response) {
                  Logger.log(`======sendMMS ${JSON.stringify(response)}=======`);
                  result = { msg: `MMS sent to ${phone}` };
                  isSent = true;
                } else {
                  Logger.log(`======sendMMS MMS not sent}=======`);
                  result = { msg: 'MMS not sent' };
                }
              } else {
                const response = await clicksendService.sendSMS(phone, lastBody);
                if (response) {
                  Logger.log(`======sendSMS ${JSON.stringify(response)}=======`);
                  result = { msg: `SMS sent to ${phone}` };
                  isSent = true;
                } else {
                  Logger.log(`======sendSMS SMS not sent}=======`);
                  result = { msg: 'SMS not sent' };
                }
              }
            } catch (err) {
              Logger.log(`======create_update exception ${err.message}=======`);
              await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: Phone number not correct');
              await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: err?.message, detail: '' });
            } finally {
              if (isSent) {
                await SlackService.tcc10(4, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: lastBody });
              } else {
                await BlabMondayService.CreateUpdate(pulseId, '❌ Delivery Error');
                await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: 'Internal error', detail: '' });
                if (
                  textBody.toLowerCase().includes('summer tutoring schedule') ||
                  textBody.toLowerCase().includes('use this link to change') ||
                  textBody.toLowerCase().includes('back to school tutoring schedule') ||
                  textBody.toLowerCase().includes('set up an update meeting')
                ) {
                  const emailTemplate = textBody.toLowerCase().includes('summer tutoring schedule')
                    ? 'Summer Schedule Request'
                    : textBody.toLowerCase().includes('use this link to change')
                    ? 'Change Request'
                    : textBody.toLowerCase().includes('back to school tutoring schedule')
                    ? 'Back to School Schedule Request'
                    : textBody.toLowerCase().includes('set up an update meeting')
                    ? 'Update Meeting Request'
                    : '';

                  Logger.log(`======emailTemplate ${emailTemplate}}=======`);
                  const _columnValuesSent = {
                    [ConstColumn.TCCom.SMSURL]: 'Undeliverable',
                    [ConstColumn.TCCom.EmailTemplate]: emailTemplate,
                  };
                  await BlabMondayService.ChangeMultipleColumnValues(boardId, pulseId, _columnValuesSent);
                }
              }
            }
          } else {
            Logger.log(
              `======No run !event.replyId && (textBody.startsWith('SMS') || textBody.startsWith('TEMPLATE SMS:') || textBody.startsWith('CALENDAR SMS:'))=======`,
            );
          }
        }
      } else {
        Logger.log(`======phone null ${phone}=======`);
      }
      await LogService.DoneLog({ dbData, result });
      return { status: 200, message: Constants.Done };
    } catch (error) {
      Logger.log(`======exception ${error.message}=======`);
      if (!isAutomation)
        await LogService.ExceptionLog({
          dbData,
          error,
          message: `======${EventName.TCC10SMSClicksendSend} ${pulseId || pulseName} Exception=======`,
        });
      return { status: 500, message: error };
    } finally {
      Logger.log(`======END ${EventName.TCC10SMSClicksendSend} ${pulseId || pulseName}=======`);
    }
  }

  // static async tcc10SMSClicksendSend(event, isAutomation = false, dbData?: AutomationDataModel) {
  //   const { boardId, pulseId, pulseName, columnId, type, textBody } = event;
  //   let logData = {
  //     board_id: boardId,
  //     item_id: pulseId,
  //     item_name: pulseName,
  //     board_name: CommonService.getBoardName(boardId),
  //     event_name: EventName.TCC10SMSClicksendSend,
  //     event_data: event,
  //     monday_item_id: 0,
  //   };

  //   try {
  //     Logger.log(`======START ${EventName.TCC10SMSClicksendSend} ${pulseId | pulseName}=======`);
  //     //TODO
  //     // if (!isAutomation) {
  //     //   const { mondayLog } = await LogService.StartLog(logData);
  //     //   dbData = mondayLog;
  //     // }
  //     // if (dbData) dbData.event_status = true;
  //     let result: any = null;
  //     const smsEnableDisable = await BlabMondayService.GetItemById(6981423576, [ConstColumn.TCCom.SMSSending]);
  //     const smsSetting = smsEnableDisable?.column_values?.[0]?.text;
  //     Logger.log(`======smsEnableDisable ${smsSetting}=======`);
  //     if (smsSetting && smsSetting === 'Disable') {
  //       result = { msg: 'SMS is disabled' };
  //       Logger.log(`======SMS is disabled=======`);
  //       //TODO: LogService.DoneLog({ dbData, result });
  //       return { status: 200, message: Constants.Done };
  //     }
  //     // Lấy thông tin itemTCCom và các giá trị cần thiết
  //     let itemTCCom = await BlabMondayService.GetItemById(pulseId, [], false, true);
  //     let clicksendId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClicksendId);
  //     let clickSendGroupId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClickSendGroupId);
  //     let phone = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.Phone);
  //     let smsStatus = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.SMSStatus);
  //     let contactId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ContactId);

  //     // Nếu có clicksendId và clickSendGroupId thì lấy thông tin contact
  //     if (clicksendId && clickSendGroupId) {
  //       const clicksendContact = await clicksendService.getSpecificContact(clickSendGroupId, clicksendId);
  //       if (!clicksendContact?.contact_id) {
  //         result = { msg: 'clicksendContact null' };
  //         Logger.log(`======clicksendContact null=======`);
  //         //TODO: LogService.DoneLog({ dbData, result });
  //         return { status: 200, message: Constants.Done };
  //       }
  //     } else if (phone?.replace('+', '')?.length) {
  //       // Nếu chỉ có phone, cập nhật trạng thái và đợi 30s để đồng bộ thông tin
  //       await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.UpdateToClicksend, 'Start');
  //       await new Promise<void>((resolve) => {
  //         setTimeout(async () => {
  //           itemTCCom = await BlabMondayService.GetItemById(pulseId, [], false, true);
  //           clicksendId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClicksendId);
  //           clickSendGroupId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClickSendGroupId);
  //           phone = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.Phone);
  //           smsStatus = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.SMSStatus);
  //           contactId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ContactId);
  //           resolve();
  //         }, 30000);
  //       });
  //     }

  //     // Nếu contactId bắt đầu bằng 'A-' thì lấy danh sách học sinh liên quan
  //     let allStudents;
  //     if (contactId && contactId.startsWith('A-')) {
  //       const rules = [
  //         {
  //           column_id: ConstColumn.SD.AccountID,
  //           compare_value: [contactId],
  //           operator: 'any_of',
  //         },
  //         {
  //           column_id: ConstColumn.SD.Status,
  //           compare_value: ['Active'],
  //           operator: 'contains_terms',
  //         },
  //       ];
  //       const itemSD = await BlabMondayService.getBoardItems(
  //         BoardConstants.SD,
  //         rules,
  //         ['any_of', 'contains_terms'],
  //         [ConstColumn.SD.StudentID, ConstColumn.SD.Center],
  //       );
  //       allStudents =
  //         itemSD
  //           ?.map((item) => {
  //             const center = this.getColumnValuesById(item, ConstColumn.SD.Center);
  //             return `<https://tutoringclub-stjohns.monday.com/boards/3288941979/views/82004885/pulses/${item.id}|${item.name}> - ${center}`;
  //           })
  //           .join('\n') || null;
  //     }

  //     // Nếu SMS status là 'OPTED OUT' thì cập nhật và thông báo lỗi
  //     if (smsStatus === 'OPTED OUT') {
  //       result = { msg: 'OPTED OUT' };
  //       Logger.log(`======OPTED OUT=======`);
  //       await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Opted Out');
  //       await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: SMS user must text START to receive your text!');
  //       await SlackService.tcc10(1, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents });
  //       //TODO: LogService.DoneLog({ dbData, result });
  //       return { status: 200, message: Constants.Done };
  //     }

  //     // Nếu có số điện thoại, thực hiện gửi SMS/MMS
  //     if (phone?.replace('+', '')?.length) {
  //       // Gửi Custom SMS nếu columnId là SendCustomSMSClickSend
  //       if (columnId === ConstColumn.TCCom.SendCustomSMSClickSend) {
  //         try {
  //           const smsCustomMessage = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.SMSCustomMessage);
  //           const response = await clicksendService.sendSMS(phone, smsCustomMessage?.trim());
  //           if (response) {
  //             result = { msg: `SMS sent to ${phone}: ${smsCustomMessage}` };
  //             const _columnValuesSent = {
  //               [ConstColumn.TCCom.SendCustomSMSClickSend]: 'Done',
  //               [ConstColumn.TCCom.SlackNotif]: 'Yes',
  //               [ConstColumn.TCCom.SMSTemplateClicksend]: 'RESET',
  //             };
  //             await BlabMondayService.ChangeMultipleColumnValues(boardId, pulseId, _columnValuesSent);
  //             await BlabMondayService.CreateUpdate(pulseId, `CUSTOM SMS: ${smsCustomMessage}`);
  //             await SlackService.tcc10(3, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: smsCustomMessage });
  //           } else {
  //             result = { msg: 'SMS not sent' };
  //             await BlabMondayService.CreateUpdate(pulseId, 'CUSTOM SMS: ❌ Delivery Error');
  //             await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Error - Not Sent');
  //             await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: 'Internal error', detail: '' });
  //           }
  //         } catch (err) {
  //           await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: Phone number not correct');
  //           await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Error - Not Sent');
  //           await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: err?.message, detail: '' });
  //         }
  //       }

  //       // Gửi SMS/MMS theo loại create_update nếu textBody không bắt đầu bằng "Email sent:"
  //       if (type === 'create_update' && !textBody.startsWith('Email sent:')) {
  //         if (!event.replyId && (textBody.startsWith('SMS') || textBody.startsWith('TEMPLATE SMS:') || textBody.startsWith('CALENDAR SMS:'))) {
  //           let isMMS = false;
  //           let mmsMediaFileUrl = '';

  //           // Xử lý assets cho MMS nếu có
  //           if (itemTCCom?.updates?.assets?.length) {
  //             isMMS = true;
  //             for (const element of itemTCCom.updates.assets) {
  //               if (element?.name && (element.name.endsWith('.jpeg') || element.name.endsWith('.png') || element.name.endsWith('.bmp'))) {
  //                 Logger.log(`======Processing asset ${element.name}=======`);
  //                 const fileBase64 = await this.downloadFileToBase64(element.public_url);
  //                 const rsUpload = await clicksendService.uploadMediaFile(fileBase64);
  //                 if (rsUpload?.body?.data?.url?.length) {
  //                   mmsMediaFileUrl = rsUpload.body.data.url;
  //                   Logger.log(`======Asset ${element.name} uploaded, URL: ${mmsMediaFileUrl}=======`);
  //                   break; // Giả sử chỉ cần 1 file hợp lệ cho MMS
  //                 }
  //               }
  //             }
  //           }

  //           // Xử lý nội dung tin nhắn SMS/MMS
  //           const lastBody = textBody.replace('SMS:', '').replace('TEMPLATE SMS:', '').replace('CALENDAR SMS:', '').replace('RE:', '').trim();
  //           let isSent = false;
  //           try {
  //             if (isMMS && mmsMediaFileUrl.length) {
  //               const response = await clicksendService.sendMMS(phone, lastBody, mmsMediaFileUrl);
  //               if (response) {
  //                 result = { msg: `SMS sent to ${phone}: ${lastBody}` };
  //                 isSent = true;
  //               } else {
  //                 result = { msg: 'MMS not sent' };
  //               }
  //             } else {
  //               const response = await clicksendService.sendSMS(phone, lastBody);
  //               if (response) {
  //                 result = { msg: `SMS sent to ${phone}: ${lastBody}` };
  //                 isSent = true;
  //               } else {
  //                 result = { msg: 'SMS not sent' };
  //               }
  //             }
  //           } catch (err) {
  //             await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: Phone number not correct');
  //             await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: err?.message, detail: '' });
  //           } finally {
  //             if (isSent) {
  //               await SlackService.tcc10(4, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: lastBody });
  //             } else {
  //               await BlabMondayService.CreateUpdate(pulseId, '❌ Delivery Error');
  //               await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: 'Internal error', detail: '' });
  //               if (
  //                 textBody.toLowerCase().includes('summer tutoring schedule') ||
  //                 textBody.toLowerCase().includes('use this link to change') ||
  //                 textBody.toLowerCase().includes('back to school tutoring schedule') ||
  //                 textBody.toLowerCase().includes('set up an update meeting')
  //               ) {
  //                 const emailTemplate = textBody.toLowerCase().includes('summer tutoring schedule')
  //                   ? 'Summer Schedule Request'
  //                   : textBody.toLowerCase().includes('use this link to change')
  //                   ? 'Change Request'
  //                   : textBody.toLowerCase().includes('back to school tutoring schedule')
  //                   ? 'Back to School Schedule Request'
  //                   : textBody.toLowerCase().includes('set up an update meeting')
  //                   ? 'Update Meeting Request'
  //                   : '';

  //                 const _columnValuesSent = {
  //                   [ConstColumn.TCCom.SMSURL]: 'Undeliverable',
  //                   [ConstColumn.TCCom.EmailTemplate]: emailTemplate,
  //                 };
  //                 await BlabMondayService.ChangeMultipleColumnValues(boardId, pulseId, _columnValuesSent);
  //               }
  //             }
  //           }
  //         }
  //       } else {
  //         result = { msg: 'SMS is disabled' };
  //       }

  //       // Logger.log(`======smsEnableDisable ${smsEnableDisable?.column_values?.[0]?.text}=======`);
  //       // if (!smsEnableDisable?.column_values?.[0]?.text?.length || smsEnableDisable?.column_values?.[0]?.text !== 'Disable') {
  //       //   let itemTCCom = await BlabMondayService.GetItemById(pulseId, [], false, true);
  //       //   let clicksendId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClicksendId);
  //       //   let clickSendGroupId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClickSendGroupId);
  //       //   let phone = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.Phone);
  //       //   let smsStatus = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.SMSStatus);
  //       //   let contactId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ContactId);
  //       //   let clicksendContact;

  //       //   // Nếu có clicksendId và clickSendGroupId thì lấy thông tin contact
  //       //   if (clicksendId && clickSendGroupId) {
  //       //     clicksendContact = await clicksendService.getSpecificContact(clickSendGroupId, clicksendId);
  //       //     if (!clicksendContact?.contact_id) {
  //       //       result = {
  //       //         msg: 'clicksendContact null',
  //       //       };
  //       //       Logger.log(`======clicksendContact null=======`);

  //       //       //TODO: await LogService.DoneLog({ dbData, result });
  //       //       return { status: 200, message: Constants.Done };
  //       //     }
  //       //   } else if (phone?.replace('+', '')?.length) {
  //       //     await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.UpdateToClicksend, 'Start');
  //       //     await new Promise<void>((resolve) => {
  //       //       setTimeout(async () => {
  //       //         itemTCCom = await BlabMondayService.GetItemById(pulseId, [], false, true);
  //       //         clicksendId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClicksendId);
  //       //         clickSendGroupId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ClickSendGroupId);
  //       //         phone = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.Phone);
  //       //         smsStatus = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.SMSStatus);
  //       //         contactId = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.ContactId);
  //       //         resolve();
  //       //       }, 30000);
  //       //     });
  //       //   }
  //       //   let allStudents;
  //       //   if (contactId.startsWith('A-')) {
  //       //     const rules = [
  //       //       {
  //       //         column_id: ConstColumn.SD.AccountID,
  //       //         compare_value: [contactId],
  //       //         operator: 'any_of',
  //       //       },
  //       //       {
  //       //         column_id: ConstColumn.SD.Status,
  //       //         compare_value: ['Active'],
  //       //         operator: 'contains_terms',
  //       //       },
  //       //     ];
  //       //     const itemSD = await BlabMondayService.getBoardItems(
  //       //       BoardConstants.SD,
  //       //       rules,
  //       //       ['any_of', 'contains_terms'],
  //       //       [ConstColumn.SD.StudentID, ConstColumn.SD.Center],
  //       //     );

  //       //     allStudents =
  //       //       itemSD
  //       //         ?.map((item) => {
  //       //           const center = this.getColumnValuesById(item, ConstColumn.SD.Center);
  //       //           return `<https://tutoringclub-stjohns.monday.com/boards/3288941979/views/82004885/pulses/${item.id}|${item.name}> - ${center}`;
  //       //         })
  //       //         .join('\n') ?? null;
  //       //   }

  //       //   if (smsStatus === 'OPTED OUT') {
  //       //     result = {
  //       //       msg: 'OPTED OUT',
  //       //     };
  //       //     Logger.log(`======OPTED OUT=======`);
  //       //     await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Opted Out');
  //       //     await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: SMS user must text START to receive your text!');

  //       //     await SlackService.tcc10(1, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents });

  //       //     await LogService.DoneLog({ dbData, result });
  //       //     return { status: 200, message: Constants.Done };
  //       //   }
  //       //   if (phone?.replace('+', '')?.length) {
  //       //     if (columnId === ConstColumn.TCCom.SendCustomSMSClickSend) {
  //       //       try {
  //       //         const smsCustomMessage = this.getColumnValuesById(itemTCCom, ConstColumn.TCCom.SMSCustomMessage);
  //       //         const response = await clicksendService.sendSMS(phone, smsCustomMessage?.trim());
  //       //         if (response) {
  //       //           result = {
  //       //             msg: `SMS sent to ${phone}: ${smsCustomMessage}`,
  //       //           };
  //       //           const _columnValuesSent = {
  //       //             [ConstColumn.TCCom.SendCustomSMSClickSend]: 'Done',
  //       //             [ConstColumn.TCCom.SlackNotif]: 'Yes',
  //       //             [ConstColumn.TCCom.SMSTemplateClicksend]: 'RESET',
  //       //           };
  //       //           await BlabMondayService.ChangeMultipleColumnValues(boardId, pulseId, _columnValuesSent);
  //       //           await BlabMondayService.CreateUpdate(pulseId, `CUSTOM SMS: ${smsCustomMessage}`);
  //       //           await SlackService.tcc10(3, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: smsCustomMessage });
  //       //         } else {
  //       //           result = {
  //       //             msg: 'SMS not sent',
  //       //           };
  //       //           await BlabMondayService.CreateUpdate(pulseId, 'CUSTOM SMS: ❌ Delivery Error');
  //       //           await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Error - Not Sent');
  //       //           await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: 'Internal error', detail: '' });
  //       //         }
  //       //       } catch (err) {
  //       //         await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: Phone number not correct');
  //       //         await BlabMondayService.ChangeSimpleColumnValue(boardId, pulseId, ConstColumn.TCCom.SendCustomSMSClickSend, 'Error - Not Sent');
  //       //         await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: err?.message, detail: '' });
  //       //       }
  //       //     }
  //       //     if (type == 'create_update' && textBody?.startsWith !== 'Email sent:') {
  //       //       if (!event.replyId && (textBody.startsWith('SMS') || textBody.startsWith('TEMPLATE SMS:') || textBody.startsWith('CALENDAR SMS:'))) {
  //       //         let isMMS = false;
  //       //         let mmsMediaFileUrl = '';
  //       //         if (itemTCCom?.updates?.assets?.length) {
  //       //           isMMS = true;
  //       //           itemTCCom.updates.assets.forEach(async (element) => {
  //       //             if (element?.name?.endsWith('.jpeg') || element?.name?.endsWith('.png') || element?.name?.endsWith('.bmp')) {
  //       //               const file = await this.downloadFileToBase64(itemTCCom.updates.assets.public_url);
  //       //               const rsUpload = await clicksendService.uploadMediaFile(file);
  //       //               mmsMediaFileUrl = rsUpload?.body?.data?.url?.length ? rsUpload?.body?.data?.url : mmsMediaFileUrl;
  //       //             }
  //       //           });
  //       //         }
  //       //         const lastBody = textBody.replace('SMS:', '').replace('TEMPLATE SMS:', '').replace('CALENDAR SMS:', '').replace('RE:', '')?.trim();
  //       //         let isSent = false;
  //       //         try {
  //       //           if (isMMS && mmsMediaFileUrl.length) {
  //       //             const response = await clicksendService.sendMMS(phone, lastBody, mmsMediaFileUrl);
  //       //             if (response) {
  //       //               result = {
  //       //                 msg: `SMS sent to ${phone}: ${lastBody}`,
  //       //               };
  //       //               isSent = true;
  //       //             } else {
  //       //               result = {
  //       //                 msg: 'MMS not sent',
  //       //               };
  //       //             }
  //       //           } else {
  //       //             const response = await clicksendService.sendSMS(phone, lastBody);
  //       //             if (response) {
  //       //               result = {
  //       //                 msg: `SMS sent to ${phone}: ${lastBody}`,
  //       //               };
  //       //               isSent = true;
  //       //             } else {
  //       //               result = {
  //       //                 msg: 'SMS not sent',
  //       //               };
  //       //             }
  //       //           }
  //       //         } catch (err) {
  //       //           await BlabMondayService.CreateUpdate(pulseId, '⛔️ ERROR: Phone number not correct');
  //       //           await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: err?.message, detail: '' });
  //       //         } finally {
  //       //           if (isSent) {
  //       //             await SlackService.tcc10(4, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: lastBody });
  //       //           } else {
  //       //             await BlabMondayService.CreateUpdate(pulseId, '❌ Delivery Error');
  //       //             await SlackService.tcc10(2, { id: itemTCCom.id, name: itemTCCom.name, contactId, allStudents, message: 'Internal error', detail: '' });
  //       //             if (
  //       //               textBody?.toLowerCase()?.includes('summer tutoring schedule') ||
  //       //               textBody?.toLowerCase()?.includes('use this link to change') ||
  //       //               textBody?.toLowerCase()?.includes('back to school tutoring schedule') ||
  //       //               textBody?.toLowerCase()?.includes('set up an update meeting')
  //       //             ) {
  //       //               const emailTemplate = textBody?.toLowerCase()?.includes('summer tutoring schedule')
  //       //                 ? 'Summer Schedule Request'
  //       //                 : textBody?.toLowerCase()?.includes('use this link to change')
  //       //                 ? 'Change Request'
  //       //                 : textBody?.toLowerCase()?.includes('back to school tutoring schedule')
  //       //                 ? 'Back to School Schedule Request'
  //       //                 : textBody?.toLowerCase()?.includes('set up an update meeting')
  //       //                 ? 'Update Meeting Request'
  //       //                 : '';

  //       //               const _columnValuesSent = {
  //       //                 [ConstColumn.TCCom.SMSURL]: 'Undeliverable',
  //       //                 [ConstColumn.TCCom.EmailTemplate]: emailTemplate,
  //       //               };
  //       //               await BlabMondayService.ChangeMultipleColumnValues(boardId, pulseId, _columnValuesSent);
  //       //             }
  //       //           }
  //       //         }
  //       //       }
  //       //     }
  //       //   } else {
  //       //     result = {
  //       //       msg: 'SMS is disabled',
  //       //     };
  //       //   }
  //       //   //TODO
  //       //   // await LogService.DoneLog({ dbData, result });
  //       //   return { status: 200, message: Constants.Done };
  //       // }
  //       //TODO
  //       // await LogService.DoneLog({ dbData, result });
  //       return { status: 200, message: Constants.Done };
  //     }
  //   } catch (error) {
  //     if (!isAutomation)
  //       await LogService.ExceptionLog({
  //         dbData,
  //         error,
  //         message: `======${EventName.MWSMSToWS} ${pulseId | pulseName} Exception=======`,
  //       });
  //     return { status: 500, message: error };
  //   } finally {
  //     Logger.log(`======END ${EventName.MWSMSToWS} ${pulseId | pulseName}=======`);
  //   }
  // }

  private static getColumnValuesById(source, id, getValueType = 0) {
    const rs = source?.column_values?.filter((s) => s.id === id)?.[0];
    return (getValueType === 0 ? rs?.text || null : getValueType === 1 ? rs?.value || null : getValueType === 2 ? rs?.display_value || null : null) || null;
  }

  /**
   * Hàm download file từ URL và trả về nội dung file dưới dạng base64.
   * @param fileUrl URL của file cần download
   * @returns Promise<string> nội dung file ở dạng base64
   */
  private static async downloadFileToBase64(fileUrl: string): Promise<string> {
    // Sử dụng responseType 'arraybuffer' để nhận dữ liệu dạng binary
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    // Chuyển đổi dữ liệu sang Buffer rồi convert sang base64
    return Buffer.from(response.data, 'binary').toString('base64');
  }
}
