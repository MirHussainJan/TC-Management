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
import ForwardWebhookService from '../forward-webhook.service';
import moment from 'moment';
import SlackService from '../other-business/slack.service';

export default class SHLDeductHoursService {
  static async DeductHours(eventData, isAutomation = false, dbData?: AutomationDataModel) {
    // const {
    //   userId,
    //   originalTriggerUuid,
    //   boardId,
    //   pulseId,
    //   pulseName,
    //   groupId,
    //   groupName,
    //   groupColor,
    //   isTopGroup,
    //   columnValues,
    //   app,
    //   type,
    //   triggerTime,
    //   subscriptionId,
    //   triggerUuid,
    // } = eventData;
    const { boardId, pulseId, pulseName } = eventData;
    const columnId = eventData?.columnId ?? null;

    let logData = {
      board_id: boardId,
      item_id: pulseId,
      item_name: pulseName,
      board_name: CommonService.getBoardName(boardId),
      event_name: EventName.DeductHours,
      event_data: eventData,
      monday_item_id: 0,
    };
    try {
      if (!isAutomation) {
        const { mondayLog } = await LogService.StartLog(logData);
        dbData = mondayLog;
      }

      // Guard against broad "item updated" automations: only process when
      // Attendance is the changed column. If columnId is absent, preserve
      // legacy behavior for manual/internal invocations.
      if (columnId && columnId !== ConstColumn.SHL.Attendance) {
        Logger.log(`Skip ${EventName.DeductHours} for pulse ${pulseId}. Changed column: ${columnId}`);
        await LogService.DoneLog({
          dbData,
          result: { msg: `Skipped - changed column is not attendance (${columnId})` },
        });
        return;
      }

      // let lastStep = dbData?.event_last_step ?? [];
      // let lastStepData: any = dbData?.event_last_step_data ?? {};

      const createdSHL = await BlabMondayService.GetItemById(pulseId);

      Logger.log(`======createdSHL ${JSON.stringify(createdSHL)}======`);
      if (createdSHL?.column_values?.length) {
        const createdSHLColumnValues = createdSHL.column_values;
        if (createdSHLColumnValues?.length) {
          Logger.log(`======createdSHLColumnValues ${JSON.stringify(createdSHLColumnValues)}======`);
          const studentId = _.find(createdSHLColumnValues, (s) => s.id === ConstColumn.SHL.StudentID)?.text;
          const attendance = _.find(createdSHLColumnValues, (s) => s.id === ConstColumn.SHL.Attendance)?.text;
          const accountId = _.find(createdSHLColumnValues, (s) => s.id === ConstColumn.SHL.AccountID)?.text;
          let adjustmentSession = _.find(createdSHLColumnValues, (s) => s.id === ConstColumn.SHL.AdjustmentSession)?.text ?? 0;
          adjustmentSession = _.parseInt(adjustmentSession);
          const itemIdSHL = createdSHL.id;
          let totalSessionCounted;
          if (studentId?.length) {
            Logger.log(`======studentId ${studentId}======`);
            const { total, data } = await SHLDeductHoursService.DeductHoursStudentDatabase(studentId, attendance, dbData);
            totalSessionCounted = total;
            dbData = data;

            // if (!lastStep.includes(Step.One)) {
            //   lastStep.push(Step.One);
            //   lastStepData.one = dbData?.event_last_step_data?.one;
            // }

            // if (!lastStep.includes(Step.Two)) {
              const udSHLResult = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.SHL, itemIdSHL, {
                numbers72: totalSessionCounted,
              });
              // if (udSHLResult?.data?.change_multiple_column_values?.id) {
              //   lastStep.push(Step.Two);
              //   lastStepData.two = null;
              // }
              Logger.log(
                `======Updated SHL: Session number ${totalSessionCounted} | ${udSHLResult?.data?.change_multiple_column_values?.id ? 'Success' : 'Error'}`,
              );
            // }
          }
          if (accountId?.length) {
            Logger.log(`======accountId ${accountId}======`);
            const forbiddenValues = [
              AttendanceConst.NotDefined,
              AttendanceConst.CourtesyExcused,
              AttendanceConst.Unmarked,
              AttendanceConst.Trial,
              AttendanceConst.SideWork,
              AttendanceConst.HourAudit,
              AttendanceConst.HourAdjustment,
            ];
            const containsForbiddenValue = _.some(forbiddenValues, (v) => _.includes(attendance, v));
            if (!containsForbiddenValue) {
              // if (dbData) {
              //   dbData.event_last_step = lastStep;
              //   dbData.event_last_step_data = lastStepData;
              // }
              dbData = await SHLDeductHoursService.DeductHoursFamilyDatabase(accountId, adjustmentSession, createdSHL, dbData);
            }
          }
        }
      }
      await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.SHL, pulseId, {
        status55: Constants.Done,
      });
      await LogService.DoneLog({ dbData, result: null });
    } catch (error) {
      await LogService.ExceptionLog({
        dbData,
        error,
        message: `======${EventName.DeductHours} ${pulseId | pulseName} Exception=======`,
      });
      throw error;
    } finally {
      Logger.log(`======END ${EventName.DeductHours} ${pulseId | pulseName}=======`);
    }
  }

  static async DeductHoursStudentDatabase(studentId: string, attendance: string, dbData): Promise<any> {
    // const querySDByStudentId = await CommonService.replaceQuery(ConstQuery.ItemByColumnValues, BoardConstants.SD, ConstColumn.SD.StudentID, studentId);
    // const itemSD = await CommonService.post(querySDByStudentId);
    // let lastStep = dbData?.event_last_step ?? [];
    // let lastStepData: any = dbData?.event_last_step_data ?? {};

    const itemSD = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.SD, [
      { column_id: `${ConstColumn.SD.StudentID}`, column_values: [`${studentId}`] },
    ]);

    let totalSessionCounted;
    if (itemSD?.length) {
      Logger.log(`======itemSD======`);
      for (let i = 0; i < itemSD.length; i++) {
        const item = itemSD[i];
        const itemId = item?.id;
        let numberOfSessionNum = _.find(item.column_values, (s) => s.id === ConstColumn.SD.NumberOfSession)?.text || 0;
        totalSessionCounted = _.find(item.column_values, (s) => s.id === ConstColumn.SD.TotalSessionsCounted)?.text || numberOfSessionNum || 0;
        totalSessionCounted = _.parseInt(totalSessionCounted) + 1;
        let courtesyExcusedNum = _.find(item.column_values, (s) => s.id === ConstColumn.SD.CourtesyExcusedSessions)?.text || numberOfSessionNum || 0;
        courtesyExcusedNum = _.parseInt(courtesyExcusedNum) + 1;
        let excusedSessionsNum = _.find(item.column_values, (s) => s.id === ConstColumn.SD.ExcusedSessions)?.text || numberOfSessionNum || 0;
        excusedSessionsNum = _.parseInt(excusedSessionsNum) + 1;
        numberOfSessionNum = _.parseInt(numberOfSessionNum) + 1;

        let columnValues: any = {
          numbers85: totalSessionCounted,
        };

        switch (attendance) {
          case AttendanceConst.CourtesyExcused:
            columnValues.numeric8 = courtesyExcusedNum;
            break;
          case AttendanceConst.AbsentExcused:
            columnValues.numeric = excusedSessionsNum;
            break;
          case AttendanceConst.PresentOnTime:
          case AttendanceConst.PresentCameLate:
          case AttendanceConst.AbsentNoNotice:
          case AttendanceConst.AbsentLateNotice:
            columnValues.numbers09 = numberOfSessionNum;
            break;
        }

        // const queryUpdateSD = await CommonService.replaceQuery(
        //   ConstQuery.ChangeMultipleColumnValues,
        //   BoardConstants.SD,
        //   '',
        //   JSON.stringify(JSON.stringify(columnValues)),
        //   itemId,
        // );
        // await CommonService.post(queryUpdateSD);
        // if (!lastStep.includes(Step.One)) {
          const rs = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.SD, itemId, columnValues);

          if (rs?.data?.change_multiple_column_values?.id) {
            // lastStep.push(Step.One);
            // lastStepData.one = totalSessionCounted;
            //Update Session Number in Binder
            //https://us1.make.com/122345/scenarios/1407321/edit

            // await ForwardWebhookService.ForwardWebhook({
            //   destinationURL: 'https://hook.us1.make.com/ga5e7hagjsqhj8pdy5k6ga81eydfhjou',
            //   event         : {
            //     pulseId: rs.data.change_multiple_column_values.id,
            //     value  : {
            //       value: totalSessionCounted,
            //     },
            //   },
            // });
          }
        // } else {
        //   lastStepData.one = totalSessionCounted;
        // }
      }
    }
    // if (dbData) {
    //   dbData.event_last_step = lastStep;
    //   dbData.event_last_step_data = lastStepData;
    // }
    return { total: totalSessionCounted, data: dbData };
  }

  static async DeductHoursFamilyDatabase(accountId: string, adjustmentSessionSHL: number, itemSHL, dbData: any) {
    // let lastStep = dbData?.event_last_step ?? [];
    // let lastStepData = dbData?.event_last_step_data ?? {};
    const itemFD = await BlabMondayService.GetItemsPageByColumnValues(
      BoardConstants.FD,
      [{ column_id: `${ConstColumn.FD.AccountID}`, column_values: [`${accountId}`] }],
      [ConstColumn.FD.HoursRemaining, ConstColumn.FD.TotalHoursPurchased, ConstColumn.FD.HoursUsed],
    );

    if (itemFD?.length) {
      Logger.log(`======itemFD======`);
      for (let i = 0; i < itemFD.length; i++) {
        const item = itemFD[i];
        if (item?.column_values?.length) {
          let hoursRemainingFD = _.find(item.column_values, (s) => s.id === ConstColumn.FD.HoursRemaining)?.text ?? 0;
          hoursRemainingFD = hoursRemainingFD ? hoursRemainingFD : 0;
          const orgHoursRemainingFD = hoursRemainingFD;
          let totalHoursPurchased = _.find(item.column_values, (s) => s.id === ConstColumn.FD.TotalHoursPurchased)?.text ?? 0;
          totalHoursPurchased = totalHoursPurchased?.length > 0 ? totalHoursPurchased : 0;
          hoursRemainingFD = _.parseInt(hoursRemainingFD) + adjustmentSessionSHL;
          // let hoursUsed             = _.parseInt(totalHoursPurchased) - hoursRemainingFD;
          let hoursUsed = _.find(item.column_values, (s) => s.id === ConstColumn.FD.HoursUsed)?.text ?? 0;
          // hoursRemainingFD = hoursRemainingFD < 0 ? 0 : hoursRemainingFD;
          hoursUsed = adjustmentSessionSHL === -1 ? (((totalHoursPurchased - hoursRemainingFD) == hoursUsed) ? hoursUsed++ : totalHoursPurchased - hoursRemainingFD) : hoursUsed;
          if (orgHoursRemainingFD > 1 && hoursRemainingFD == 0) {
            await this.sendNotif0Hour({ itemId: item?.id, itemName: item?.name, shlId: itemSHL?.id, shlName: itemSHL?.name });
          }
          // }

          // if (!lastStep.includes(Step.Three)) {
            const udSHLResult = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.SHL, itemSHL?.id, {
              numbers3: hoursRemainingFD,
            });
            // if (udSHLResult?.data?.change_multiple_column_values?.id) {
            //   lastStep.push(Step.Three);
            //   lastStepData.three = {};
            //   lastStepData.three.hoursRemainingFD = hoursRemainingFD;
            //   lastStepData.three.hoursUsed = hoursUsed;
            // }
          // } else {
          //   lastStepData.three.hoursRemainingFD = hoursRemainingFD;
          //   lastStepData.three.hoursUsed = hoursUsed;
          // }

          
            let fdColumnValues: any = {
              numbers: hoursRemainingFD,
              numbers70: hoursUsed,
            };

            if (hoursRemainingFD <= 40 && hoursRemainingFD > 20) {
              fdColumnValues.color0 = Constants.FortyHours;
            }
            if (hoursRemainingFD <= 20 && hoursRemainingFD > 10) {
              fdColumnValues.color0 = Constants.TwentyHours;
            }
            if (hoursRemainingFD <= 10 && hoursRemainingFD > 5) {
              fdColumnValues.color0 = Constants.TenHours;
            }
            if (hoursRemainingFD <= 5 && hoursRemainingFD > 0) {
              fdColumnValues.color0 = Constants.FifthHours;
            }
            if (hoursRemainingFD <= 0) {
              fdColumnValues.color0 = Constants.NoHoursLeft;
              // fdColumnValues.status4 = Constants.Inactive;
              fdColumnValues.date__1 = moment(new Date()).format('YYYY-MM-DD');
            }

            // const queryUpdateFD = await CommonService.replaceQuery(
            //   ConstQuery.ChangeMultipleColumnValues,
            //   BoardConstants.FD,
            //   '',
            //   JSON.stringify(JSON.stringify(fdColumnValues)),
            //   item?.id,
            // );
            // await CommonService.post(queryUpdateFD);

            const rs: any = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.FD, item?.id, fdColumnValues);
          //   if (rs?.data?.change_multiple_column_values?.id) {
          //     if (!lastStep.includes(Step.Four)) {
          //     lastStep.push(Step.Four);
          //     lastStepData.four = {};
          //     lastStepData.four.hoursRemainingFD = hoursRemainingFD;
          //     lastStepData.four.hoursUsed = hoursUsed;
          //   } else {
          //     lastStepData.four.hoursRemainingFD = hoursRemainingFD;
          //     lastStepData.four.hoursUsed = hoursUsed;
          //   }
          // }
        }
      }
    }

    // if (dbData) {
    //   dbData.event_last_step = lastStep;
    //   dbData.event_last_step_data = lastStepData;
    // }

    return dbData;
  }

  static async sendNotif0Hour(data) {
    const block: any = [];
    block.push(
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Family Remaining Hour = 0',
          emoji: true,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Student Hour Log Session:*<https://tutoringclub-stjohns.monday.com/boards/3617141983/pulses/${data?.shlId}|${data?.shlName}>\n    *Account:* <https://tutoringclub-stjohns.monday.com/boards/3183366173/pulses/${data?.itemId}|${data?.itemName}>\n    Please check in *Activity Log:*\n        ✅ If Hour Remaining change from 1 to 0 -> no issue\n        ❌ If Hour Remaining change from any number > 1 to 0 -> issue`,
          },
        ],
      },
    );

    // await SlackService.sendSlackMessage('<redacted-webhook-url>', { blocks: block });
    const slackWebhookLowHours = process.env.SLACK_WEBHOOK_LOW_HOURS || '';
    if (slackWebhookLowHours) {
      await SlackService.sendSlackMessage(slackWebhookLowHours, { blocks: block });
    }
  }
}
