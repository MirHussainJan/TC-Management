import { BoardConstants, Constants, EventName } from '../../constants/constant';
import CommonService from '../common-service';
import LogService from '../log-service';
import ConstColumn from '../../constants/constant-column';
import AttendanceConst from '../../constants/constant-attendance';
import * as _ from 'lodash';
import Logger from '../../helper/logger';
import AutomationDataModel from '../../db/models/automation-data.model';
import BlabMondayService from '../blab-monday.service';
import ConstMessage from '../../constants/constant-message';
import moment from 'moment';

export default class SHLAuditedRemainingHourService {
  static async Run(eventData: any, isAutomation = false, dbData?: AutomationDataModel) {
    const { boardId, pulseId, pulseName } = eventData;

    let logData = {
      board_id: boardId,
      item_id: pulseId,
      item_name: pulseName,
      board_name: CommonService.getBoardName(boardId),
      event_name: EventName.AuditedRemainingHour,
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
        const itemFamilyDatabase = await BlabMondayService.GetItemById(pulseId);
        if (itemFamilyDatabase?.id > 0) {
          // const isActiveFamily = _.some(itemFamilyDatabase.column_values, {
          //   id: ConstColumn.FD.FamilyStatus,
          //   text: Constants.Active,
          // });
          const accountID = _.filter(itemFamilyDatabase.column_values, { id: `${ConstColumn.FD.AccountID}` })?.[0]?.text;
          const hourRemaining = _.filter(itemFamilyDatabase.column_values, { id: `${ConstColumn.FD.HoursRemaining}` })?.[0]?.text;
          const familySHLBoardId = _.filter(itemFamilyDatabase.column_values, { id: `${ConstColumn.FD.FamilySHLBoardId}` })?.[0]?.text;
          // if (isActiveFamily && accountID?.length) {
          if (accountID?.length) {
            /*const columnsSHL = [
             { column_id: `${ConstColumn.SHL.AccountID}`, column_values: [`${accountID}`] },
             { column_id: `${ConstColumn.SHL.AdjustmentSession}`, column_values: ['-1'] },
             ];*/
            const columnsSHL = [
              {
                column_id: `${ConstColumn.SHL.AccountID}`,
                column_values: [`${accountID}`],
              },
            ];
            const specificColumnSHL = [ConstColumn.SHL.AdjustmentSession, ConstColumn.SHL.Attendance];

            let allSHLItems: any = [];
            //Get from Family SHL board
            allSHLItems = await BlabMondayService.GetItemsPageByColumnValues(familySHLBoardId, columnsSHL, specificColumnSHL);

            if (allSHLItems?.length) {
              // const filteredAllSHLItems = _.filter(allSHLItems, (s) => s.column_values?.[0]?.text === '-1');
              const filteredAllSHLItems = _.filter(allSHLItems, (s: any) => {
                return s.column_values.some((columnsSHL: any) => {
                  return (
                    columnsSHL.id === ConstColumn.SHL.Attendance &&
                    (columnsSHL.text === AttendanceConst.PresentOnTime ||
                      columnsSHL.text === AttendanceConst.PresentCameLate ||
                      columnsSHL.text === AttendanceConst.AbsentNoNotice ||
                      columnsSHL.text === AttendanceConst.AbsentLateNotice)
                  );
                });
              });
              const filteredAuditedHourSHL = _.filter(allSHLItems, (s: any) => {
                return s.column_values.some((columnsSHL: any) => {
                  return columnsSHL.id === ConstColumn.SHL.Attendance && columnsSHL.text === AttendanceConst.HourAudit;
                });
              });
              if (filteredAllSHLItems?.length || filteredAuditedHourSHL?.length) {
                const totalHoursPurchasedFD = _.filter(itemFamilyDatabase.column_values, { id: `${ConstColumn.FD.TotalHoursPurchased}` })?.[0]?.text;
                const auditedValues = _.map(filteredAuditedHourSHL, (item: any) => {
                  const numbersColumn = _.find(item.column_values, { id: ConstColumn.SHL.AdjustmentSession });
                  return numbersColumn?.text?.length ? numbersColumn.text : null;
                });
                const totalAudited = _.sumBy(auditedValues, (value: any) => parseInt(value, 10)) ?? 0;
                const usedHours = filteredAllSHLItems?.length - totalAudited;
                const auditedHoursFD = (totalHoursPurchasedFD && !isNaN(totalHoursPurchasedFD) ? totalHoursPurchasedFD : 0) - usedHours;
                const match = hourRemaining == auditedHoursFD ? 'Hours match' : "Hours don't match";
                const today = moment().format('YYYY-MM-DD');
                const columnValues = {
                  numbers54: auditedHoursFD,
                  numbers35: usedHours,
                  status_18: match,
                  date0: today,
                };
                await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.FD, pulseId, columnValues);
              } else {
                result = {
                  msg: ConstMessage.NoItemByAccountID.replace('{0}', CommonService.getBoardName(BoardConstants.SHL)).replace('{1}', accountID),
                };
              }
            } else {
              result = {
                msg: ConstMessage.NoItemByAccountID.replace('{0}', CommonService.getBoardName(BoardConstants.SHL)).replace('{1}', accountID),
              };
            }
          } else {
            // result = !isActiveFamily
            //   ? { msg: ConstMessage.AccountNotActive }
            //   : !accountID?.length
            //     ? { msg: ConstMessage.AccountIDNull.replace('{0}', pulseId) }
            //     : null;
            result = !accountID?.length ? { msg: ConstMessage.AccountIDNull.replace('{0}', pulseId) } : null;
          }
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
}
