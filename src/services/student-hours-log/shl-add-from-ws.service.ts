import { BoardConstants, Constants, EventName } from '../../constants/constant';
import CommonService from '../common-service';
import LogService from '../log-service';
import ConstColumn from '../../constants/constant-column';
import AttendanceConst from '../../constants/constant-attendance';
import * as _ from 'lodash';
import Logger from '../../helper/logger';
import AutomationDataModel from '../../db/models/automation-data.model';
import BlabMondayService from '../blab-monday.service';
import Step from '../../constants/constant-step';
import moment from 'moment';
import ConstMessage from '../../constants/constant-message';
import ForwardWebhookService from '../forward-webhook.service';

export default class SHLAddFromWSService {
  static async AddFromWS(eventData, isAutomation = false, dbData?: AutomationDataModel) {
    const { boardId, pulseId, pulseName } = eventData;

    let logData = {
      board_id: BoardConstants.WS,
      item_id: pulseId,
      item_name: pulseName,
      board_name: CommonService.getBoardName(BoardConstants.WS),
      event_name: EventName.AddFromWS,
      event_data: eventData,
      monday_item_id: 0,
    };

    try {
      if (!isAutomation) {
        const { mondayLog } = await LogService.StartLog(logData);
        dbData = mondayLog;
      }
      let result: any = null;
      if (pulseId) {
        const itemWS = await BlabMondayService.GetItemById(pulseId);
        if (itemWS?.id > 0) {
          // const isActiveFamily = _.some(itemFamilyDatabase.column_values, {
          //   id: ConstColumn.FD.FamilyStatus,
          //   text: Constants.Active,
          // });
          const triggerStatus = _.filter(itemWS.column_values, { id: ConstColumn.WS.TriggerStatus })?.[0]?.text;
          if (triggerStatus == Constants.AddedToSHL) {
            await LogService.DoneLog({ dbData, result: result });
            return;
          }
          const date = this.getColumnValuesById(itemWS, ConstColumn.WS.DateOfSession, 0);
          const session = this.getColumnValuesById(itemWS, ConstColumn.WS.Session, 0);
          const weekday = this.getColumnValuesById(itemWS, ConstColumn.WS.Weekday, 0);
          const center = this.getColumnValuesById(itemWS, ConstColumn.WS.Center, 0);
          const subject = this.getColumnValuesById(itemWS, ConstColumn.WS.Subject, 0);
          const accountId = this.getColumnValuesById(itemWS, ConstColumn.WS.AccountId, 0);
          const studentId = this.getColumnValuesById(itemWS, ConstColumn.WS.StudentId, 0);
          const adjustmentSession = this.getColumnValuesById(itemWS, ConstColumn.WS.AdjustmentSession, 0);
          const attendance = this.getColumnValuesById(itemWS, ConstColumn.WS.Attendance, 0);
          const sessionId = this.getColumnValuesById(itemWS, ConstColumn.WS.SessionId, 0);
          const studentName = itemWS?.name?.split(' | ')?.[itemWS?.name?.split(' | ')?.length - 1];
          const thirdPartyFunding = this.getColumnValuesById(itemWS, ConstColumn.WS.ThirdPartyFunding, 2);
          const grade = this.getColumnValuesById(itemWS, ConstColumn.WS.Grade, 0);
          const _tutor = this.getColumnValuesById(itemWS, ConstColumn.WS.Tutors, 1);
          const ratios = this.getColumnValuesById(itemWS, ConstColumn.WS.Ratios, 2);
          const tutor = _tutor?.length ? JSON.parse(_tutor) : null;
          const tutorToAdd = tutor?.personsAndTeams;
          const itemValues = {
            date4: date,
            status: session,
            status1: weekday,
            status7: center,
            status4: subject,
            text7: accountId,
            text1: studentId,
            numbers: adjustmentSession,
            status30: attendance,
            text4: sessionId,
            status6__1: thirdPartyFunding,
            text: studentName,
            dropdown1: grade,
            color_mkpwqadr: ratios,
          };
          if (tutorToAdd?.length) {
            itemValues['people'] = { personsAndTeams: tutorToAdd };
          }
          const created = await BlabMondayService.CreateItemWithValues(BoardConstants.SHL, itemWS?.name, itemValues);
          if (!created || created <= 0) {
            result = { error_message: ConstMessage.CreateItemFailed.replace('{0}', itemWS?.name).replace('{1}', itemWS?.id) };
            return;
          }

          if (accountId?.length) {
            const columnsSHL = [
              {
                column_id: `${ConstColumn.FD.AccountID}`,
                column_values: [`${accountId}`],
              },
            ];
            const specificColumnSHL = [ConstColumn.FD.HoursRemaining];
            //Update hours remaining from FD to SHL
            const itemFD = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.FD, columnsSHL, specificColumnSHL);
            if (itemFD?.length) {
              const hourRemaining = itemFD[0]?.column_values?.[0]?.text;
              const columnValuesToUpdate = { numbers3: hourRemaining };
              await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.SHL, created, columnValuesToUpdate);
            } else {
              result = {
                msg: ConstMessage.NoItemByAccountID.replace('{0}', CommonService.getBoardName(BoardConstants.FD)).replace('{1}', accountId),
              };
            }
          } else {
            result = !accountId?.length ? { msg: ConstMessage.AccountIDNull.replace('{0}', pulseId) } : null;
          }

          //Create update from WS to SHL
          for (let iws = 0; iws < itemWS?.updates?.length; iws++) {
            const element = itemWS.updates[iws];
            const message = `${element?.body}\n\nCreated at: ${moment(element?.updated_at).format('DD MMM, YYYY HH:mm')}`;
            await BlabMondayService.CreateUpdate(created, message);
          }

          //Update WS
          const columnValuesWS = {
            status82: Constants.AddedToSHL,
            status14: Constants.Done,
          };
          await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.WS, itemWS.id, columnValuesWS);

          //SHL: Add to Family SHL
          ForwardWebhookService.ForwardWebhook({ destinationURL: 'https://tcapp.b-lab.app/shl-add-to-family-shl', event: { pulseId: created } });
        } else {
          result = { msg: ConstMessage.ItemNotFound.replace('{0}', pulseId) };
        }
      } else {
        result = { msg: ConstMessage.PulseIdNull };
      }
      // if(result?.msg?.length) await BlabMondayService.ChangeSimpleColumnValue(BoardConstants.FD, pulseId, ConstColumn.FD.AuditHourLog, Constants.Done);
      await LogService.DoneLog({ dbData, result: result });
    } catch (error) {
      if (!isAutomation)
        await LogService.ExceptionLog({
          dbData,
          error,
          message: `======${EventName.AuditedRemainingHour} ${pulseId | pulseName} Exception=======`,
        });
      throw error;
    } finally {
      Logger.log(`======END ${EventName.AuditedRemainingHour} ${pulseId | pulseName}=======`);
    }
  }

  private static getColumnValuesById(source, id, getValueType = 0) {
    const rs = source?.column_values?.filter((s) => s.id === id)?.[0];
    return (getValueType === 0 ? rs?.text || null : getValueType === 1 ? rs?.value || null : getValueType === 2 ? rs?.display_value || null : null) || null;
  }
}
