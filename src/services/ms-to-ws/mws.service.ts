import CommonService from '../../services/common-service';
import { BoardConstants, Constants, EventName } from '../../constants/constant';
import * as _ from 'lodash';
import { isBefore, isAfter, parseISO, isEqual } from 'date-fns';
import ConstColumn from '../../constants/constant-column';
import ConstMessage from '../../constants/constant-message';
import Logger from '../../helper/logger';
import LogService from '../../services/log-service';
import AutomationDataModel from '../../db/models/automation-data.model';
import BlabMondayService from '../blab-monday.service';

export default class MWSService {
  static async MWS34MSToWSSync(event, isAutomation = false, dbData?: AutomationDataModel) {
    const { boardId, pulseId, pulseName, columnId, columnTitle, value } = event;
    let logData = {
      board_id: boardId,
      item_id: pulseId,
      item_name: pulseName,
      board_name: CommonService.getBoardName(boardId),
      event_name: EventName.MWSMSToWS,
      event_data: event,
      monday_item_id: 0,
    };

    try {
      Logger.log(`======START ${EventName.MWSMSToWS} ${pulseId | pulseName}=======`);
      if (!isAutomation) {
        const { mondayLog } = await LogService.StartLog(logData);
        dbData = mondayLog;
      }
      if (dbData) dbData.event_status = true;
      let result: any = null;
      const itemMS = await BlabMondayService.GetItemById(pulseId);
      Logger.log(`======itemMS ${itemMS}=======`);
      if (itemMS?.id) {
        const tutor = itemMS?.column_values?.find((col) => col.id === ConstColumn.MS.Tutor);
        const tutorText = tutor?.text;
        const userName = tutorText?.length ? tutorText.split(',')?.[0] : 'OVERFLOW';
        const sesssionId = itemMS?.column_values?.find((col) => col.id === ConstColumn.MS.SessionId)?.text;
        const preferredTutor = itemMS?.column_values?.find((col) => col.id === ConstColumn.MS.PreferredTutor);
        const notWithTutor = itemMS?.column_values?.find((col) => col.id === ConstColumn.MS.NotWithTutor);

        const tutorPAT = tutor?.value?.length ? JSON.parse(tutor.value)?.personsAndTeams : null;
        const preferredTutorPAT = preferredTutor?.value?.length ? JSON.parse(preferredTutor.value)?.personsAndTeams : null;
        const notWithTutorPAT = notWithTutor?.value?.length ? JSON.parse(notWithTutor.value)?.personsAndTeams : null;

        const itemsWS = await BlabMondayService.GetItemsPageByColumnValues(
          BoardConstants.WS,
          [{ column_id: `${ConstColumn.WS.SessionId}`, column_values: `${sesssionId}` }],
          [ConstColumn.WS.TutorUnassigned, ConstColumn.WS.TutorsOff, ConstColumn.WS.OverrideEESchedule],
        );

        Logger.log(`======itemsWS ${itemsWS?.length}=======`);
        if (itemsWS?.length) {
          for (let i = 0; i < itemsWS.length; i++) {
            const ws = itemsWS[i];
            const overrideEESchedule = this.getValue(ws, ConstColumn.WS.OverrideEESchedule);
            const tutorsOff = ws.column_values.find((col) => col.id === ConstColumn.WS.TutorsOff)?.display_value;
            const columnValues = {
              [ConstColumn.WS.Subject]: this.getValue(itemMS, ConstColumn.MS.Subject),
              [ConstColumn.WS.Session]: this.getValue(itemMS, ConstColumn.MS.Session),
              [ConstColumn.WS.Weekday]: this.getValue(itemMS, ConstColumn.MS.Weekday),
              [ConstColumn.WS.Center]: this.getValue(itemMS, ConstColumn.MS.Center),
              [ConstColumn.WS.Grade]: this.getValue(itemMS, ConstColumn.MS.Grade),
              [ConstColumn.WS.PreferredTutor]: preferredTutorPAT?.length ? { personsAndTeams: preferredTutorPAT } : null,
              [ConstColumn.WS.NotWithTutor]: notWithTutorPAT?.length ? { personsAndTeams: notWithTutorPAT } : null,
              [ConstColumn.WS.DoNotSeatWith]: this.getValue(itemMS, ConstColumn.MS.DoNotSeatWith),
            };
            columnValues[ConstColumn.WS.Tutors] = null;
            if (tutorPAT?.length || overrideEESchedule === 'Enable') {
              columnValues[ConstColumn.WS.Tutors] = { personsAndTeams: tutorPAT };
            }
            if (tutorsOff.includes(userName) && overrideEESchedule !== 'Enable') {
              columnValues[ConstColumn.WS.TutorAvailability] = Constants.NotAvailable;
            }

            Logger.log(`======ChangeMultipleColumnValues ${JSON.stringify(columnValues)}=======`);

            const rs = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.WS, ws.id, columnValues);
            if (rs?.data?.change_multiple_column_values?.id) {
              Logger.log(`======Update MS ${itemMS?.id} to WS item ${ws.id} Success=======`);
              result = {
                msg: `Update MS ${itemMS?.id} to WS item ${ws.id} Success`,
              };
            }
          }
        } else {
          result = {
            msg: 'Can not find WS item',
          };
        }

        if (columnId === ConstColumn.MS.Tutor && userName !== 'OVERFLOW') {
          Logger.log(`======columnId ${columnId} - userName ${userName}=======`);
          const tutorAvailable = itemMS.column_values.find((col) => col.id === ConstColumn.MS.TutorAvailable)?.display_value;
          const leadershipAvailable = itemMS.column_values.find((col) => col.id === ConstColumn.MS.LeadershipAvailable)?.display_value;
          const weekDay = this.getValue(itemMS, ConstColumn.MS.Weekday);
          const session = this.getValue(itemMS, ConstColumn.MS.Session);
          const itemED = await BlabMondayService.GetItemsPageByColumnValues(
            BoardConstants.ED,
            [{ column_id: `${ConstColumn.ED.MondayUser}`, column_values: `${userName}` }],
            [ConstColumn.ED.Position],
          );
          const columnValueMS = {
            [ConstColumn.MS.TutorAvailability]: 'Not Available',
          };
          if (tutorAvailable?.includes(userName) || (leadershipAvailable?.length && tutorAvailable?.length)) {
            columnValueMS[ConstColumn.MS.TutorAvailability] = 'Clear';
          }
          if (!leadershipAvailable?.length || !tutorAvailable?.length) {
            columnValueMS[ConstColumn.MS.TutorAvailability] = 'Not Available';
          }
          if (!tutorAvailable?.includes(userName) && leadershipAvailable?.length && tutorAvailable?.length) {
            const position = itemED?.[0]?.column_values?.[0]?.text;
            if (position?.includes('Tutor') || !itemED?.length) {
              columnValueMS[ConstColumn.MS.TutorAvailability] = 'Not Available';
            }
            if (itemED?.length && leadershipAvailable?.length) {
              columnValueMS[ConstColumn.MS.TutorAvailability] = 'Clear';
            }
          }

          const rsUpdateMS = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.MS, itemMS.id, columnValueMS);
          const itemsTAM = await BlabMondayService.GetItemsPageByColumnValues(
            BoardConstants.TAM,
            [
              { column_id: `${ConstColumn.TAM.Weekday}`, column_values: `${weekDay}` },
              { column_id: `${ConstColumn.TAM.Session}`, column_values: `${session}` },
            ],
            [ConstColumn.TAM.TutorsAvailable],
          );
          const tutorAvailableTAMValue = itemsTAM?.[0]?.column_values?.[0]?.value?.length ? JSON.parse(itemsTAM?.[0]?.column_values?.[0]?.value) : null;
          const flatMapTutorAvailableTAM = tutorAvailableTAMValue?.personsAndTeams?.flatMap((p) => p.id);
          if (flatMapTutorAvailableTAM?.length) {
            const itemWSbyTAM = await BlabMondayService.GetItemsPageByColumnValues(
              BoardConstants.WS,
              [
                { column_id: `${ConstColumn.WS.Weekday}`, column_values: `${weekDay}` },
                { column_id: `${ConstColumn.WS.Session}`, column_values: `${session}` },
              ],
              [ConstColumn.WS.Tutors],
            );
            const itemWSbyTAMFiltered = itemWSbyTAM?.filter((s) => s.column_values?.[0]?.text?.length > 0 && !s.name?.includes('SIDE WORK'));

            if (itemWSbyTAMFiltered?.length) {
              let idNotAssign = [...flatMapTutorAvailableTAM];
              for (let i = 0; i < itemWSbyTAMFiltered.length; i++) {
                const ws = itemWSbyTAMFiltered[i];
                const _ws = ws.column_values?.[0]?.value?.length ? JSON.parse(ws.column_values?.[0]?.value) : null;
                const flatMapWsPAT = _ws?.personsAndTeams?.flatMap((p) => p.id);
                idNotAssign = this.removeCommonIds(idNotAssign, flatMapWsPAT);
              }

              const rsUpdateTAM = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.TAM, itemsTAM?.[0]?.id, {
                [ConstColumn.TAM.TutorNotAssigned]: idNotAssign?.length ? { personsAndTeams: this.toPersonAndTeam(idNotAssign) } : null,
              });
            }
          }
        }
      } else {
        result = {
          msg: 'Can not find MS item',
        };
      }
      await LogService.DoneLog({ dbData, result });
      return { status: 200, message: Constants.Done };
    } catch (error) {
      if (!isAutomation)
        await LogService.ExceptionLog({
          dbData,
          error,
          message: `======${EventName.MWSMSToWS} ${pulseId | pulseName} Exception=======`,
        });
      return { status: 500, message: error };
    } finally {
      Logger.log(`======END ${EventName.MWSMSToWS} ${pulseId | pulseName}=======`);
    }
  }

  static getValue(item, id, isValue = false) {
    return item?.column_values?.find((col) => col.id === id)?.[isValue ? 'value' : 'text'];
  }
  static removeCommonIds(flatMapTutorAvailableTAM, patWS) {
    return flatMapTutorAvailableTAM?.filter((id) => !patWS.includes(id));
  }

  static toPersonAndTeam(pat) {
    let arr: any = [];
    for (let i = 0; i < pat?.length; i++) {
      const element = pat[i];
      arr.push({
        id: element,
        kind: 'person',
      });
    }
    return arr;
  }
}
