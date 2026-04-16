import CommonService                                         from '../../services/common-service';
import { BoardConstants, CenterConst, Constants, EventName } from '../../constants/constant';
import * as _                                                from 'lodash';
import ConstColumn                                           from '../../constants/constant-column';
import ConstMessage                                          from '../../constants/constant-message';
import Logger                                                from '../../helper/logger';
import LogService                                            from '../../services/log-service';
import { WeekdayConsts }                                     from '../../constants/constant-weekday';
import TutorAvailableMasterService
                                                             from '../../services/tutors-availability-master/tutor-available-master.service';
import AutomationDataModel                                   from '../../db/models/automation-data.model';
import BlabMondayService                                     from '../blab-monday.service';

export default class RefreshTutorCountService {
  static async RefreshTutorCount(event, isAutomation = false, dbData?: AutomationDataModel) {
    const { boardId, pulseId, pulseName } = event;

    try {
      let logData = {
        board_id      : boardId,
        item_id       : pulseId,
        item_name     : pulseName,
        board_name    : CommonService.getBoardName(boardId),
        event_name    : EventName.TutorCount,
        event_data    : event,
        monday_item_id: 0,
      };
      if (!isAutomation) {
        const { mondayLog } = await LogService.StartLog(logData);
        dbData              = mondayLog;
      }
      if (dbData) dbData.event_status = true;

      await this.UpdateTAMClear(pulseId, false);

      // const TAMItem = await CommonService.post(
      //   await CommonService.replaceQuery(
      //     ConstQuery.GetAnItem,
      //     0,
      //     '',
      //     '',
      //     pulseId,
      //     `(ids: [${ConstColumn.TAM.TutorsAvailable}, ${ConstColumn.TAM.Weekday}, ${ConstColumn.TAM.Session}])`,
      //   ),
      // );

      const TAMItem = await BlabMondayService.GetItemById(pulseId, [ConstColumn.TAM.TutorsAvailable, ConstColumn.TAM.Weekday, ConstColumn.TAM.Session]);

      Logger.log(`TAMItem: ${TAMItem?.name}`);
      let isUpdateDone = false;

      if (TAMItem?.column_values?.length) {
        const tutorAvailable         = _.find(TAMItem.column_values, (s) => s.id === ConstColumn.TAM.TutorsAvailable);
        const tutorAvailableNameList = tutorAvailable?.text?.split(',');
        const tutorAvailableId       = await CommonService.getUserIdFromPeopleColumn(tutorAvailable);
        const weekDayTAM             = _.find(TAMItem.column_values, (s) => s.id === ConstColumn.TAM.Weekday)?.text;
        const sessionTAM             = _.find(TAMItem.column_values, (s) => s.id === ConstColumn.TAM.Session)?.text;
        Logger.log(`tutorAvailableNameList: ${tutorAvailableNameList?.length}`);
        if (tutorAvailableNameList?.length) {
          const listGroupsMS = await CommonService.getBoardListGroups(BoardConstants.MS);
          const groupTitle   = `${weekDayTAM} - ${sessionTAM}`;
          const groupIdMS    = _.find(listGroupsMS, (s) => s.title === groupTitle)?.id;

          let edIdToConnect: number[]        = [];
          let tsqToConnect: number[]         = [];
          let tutorAvailableJC: number       = 0;
          let tutorAvailable210: number      = 0;
          let tutorUnassignedJC: number      = 0;
          let tutorUnassigned210: number     = 0;
          let tutorUnassignedCertJC: number  = 0;
          let tutorUnassignedCert210: number = 0;
          let tutorTestPrepJC: number        = 0;
          let tutorTestPrep210: number       = 0;

          // const queryGetAllActiveED = await CommonService.replaceQuery(
          //   ConstQuery.ItemByColumnValues,
          //   BoardConstants.ED,
          //   ConstColumn.ED.Status,
          //   Constants.ActiveEmployee,
          //   0,
          //   `(ids:[${ConstColumn.ED.MondayUser},${ConstColumn.ED.Position},${ConstColumn.ED.Center},${ConstColumn.ED.SATACT},${ConstColumn.ED.EmployeeId}])`,
          // );
          //
          // const allItemsED = await CommonService.post(queryGetAllActiveED);

          const columnallItemsED         = [
            { column_id: `${ConstColumn.ED.Status}`, column_values: [`${Constants.ActiveEmployee}`] },
          ];
          const specificColumnAllItemsED = [ConstColumn.ED.MondayUser, ConstColumn.ED.Position, ConstColumn.ED.Center, ConstColumn.ED.SATACT, ConstColumn.ED.EmployeeId];
          const allItemsED               = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.ED, columnallItemsED, specificColumnAllItemsED);

          Logger.log(`allItemsED: ${allItemsED?.length}`);
          if (allItemsED?.length) {
            const tutorEDinTAM = _.filter(allItemsED, (item) => {
              const people1 = _.find(item.column_values, { id: ConstColumn.ED.MondayUser });
              const group = item.group?.title;
              if (!people1 || group === Constants.Admin) {
                return false;
              }
              const userId = JSON.parse(people1.value)?.personsAndTeams?.[0]?.id;
              return tutorAvailableId.includes(userId);
            });
            Logger.log(`tutorEDinTAM: ${tutorEDinTAM.length}`);
            if (tutorEDinTAM?.length) {
              edIdToConnect = _.map(tutorEDinTAM, (s) => s.id);
              tutorAvailableJC = _.filter(tutorEDinTAM, (s) => {
                const center = _.find(s.column_values, { id: ConstColumn.ED.Center });
                return center?.text === CenterConst.JC;
              })?.length;
              tutorAvailable210 = _.filter(tutorEDinTAM, (s) => {
                const center = _.find(s.column_values, { id: ConstColumn.ED.Center });
                return center.text === CenterConst.CR210;
              })?.length;
              for (let i = 0; i < tutorEDinTAM.length; i++) {
                const itemED = tutorEDinTAM[i];
                const mondayUserED = _.find(itemED.column_values, (s) => s.id === ConstColumn.ED.MondayUser);
                const employeeId = _.find(itemED.column_values, (s) => s.id === ConstColumn.ED.EmployeeId);
                const userId = mondayUserED ? JSON.parse(mondayUserED.value).personsAndTeams[0].id : -1;
                const employeeName = mondayUserED?.text;
                let isPassed = false;
                let isAssigned = false;
                let isCert = false;
                const center = _.find(itemED.column_values, (s) => s.id === ConstColumn.ED.Center).text;
                Logger.log(`employeeId: ${employeeId}`);
                if (employeeId?.text?.length) {
                  // const queryGetTSQByEmployeeId = await CommonService.replaceQuery(
                  //   ConstQuery.ItemByColumnValues,
                  //   BoardConstants.TSQ,
                  //   ConstColumn.TSQ.EmployeeId,
                  //   employeeId.text,
                  //   0,
                  //   `(ids: [${ConstColumn.TSQ.SATACT}, ${ConstColumn.TSQ.CertificationStatus}])`,
                  // );
                  // const itemTSQ = await CommonService.post(queryGetTSQByEmployeeId);

                  const columnItemTSQ = [{ column_id: `${ConstColumn.TSQ.EmployeeId}`, column_values: [`${employeeId.text}`] }];
                  const specificColumnItemTSQ = [ConstColumn.TSQ.SATACT, ConstColumn.TSQ.CertificationStatus];
                  const itemTSQ = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.TSQ, columnItemTSQ, specificColumnItemTSQ);

                  if (itemTSQ?.[0]?.id) {
                    tsqToConnect.push(itemTSQ[0].id);
                    const _item = _.filter(itemTSQ, (s) => {
                      const _sat = _.find(s.column_values, { id: ConstColumn.TSQ.SATACT });
                      return _sat?.text === Constants.Passed;
                    });
                    isPassed = _item?.length ? true : isPassed;
                    const _itemTestPrep = _.filter(itemTSQ, (s) => {
                      const cert = _.find(s.column_values, { id: ConstColumn.TSQ.CertificationStatus });
                      return cert?.text === Constants.Certified;
                    });
                    isCert = _itemTestPrep?.length ? true : isCert;
                  }
                }
                Logger.log(`userId: ${userId}`);
                if (userId) {
                  // const queryListGroupItemsMS = await CommonService.replaceQuery(
                  //   ConstQuery.GetListGroupItems,
                  //   BoardConstants.MS,
                  //   '',
                  //   '',
                  //   0,
                  //   `(ids: [${ConstColumn.MS.Center}, ${ConstColumn.MS.Tutor}])`,
                  //   '',
                  //   `(ids: [${groupIdMS}])`,
                  // );
                  // const itemMS = await CommonService.post(queryListGroupItemsMS);

                  const itemMS = await BlabMondayService.GetGroupListItem(BoardConstants.MS, [groupIdMS], [ConstColumn.MS.Center, ConstColumn.MS.Tutor]);

                  if (itemMS?.length) {
                    // const items = _.flatMap(itemMS.data.boards, 'groups[0].items');
                    const _item = _.filter(itemMS, (item) => {
                      const peopleColumn = _.find(item.column_values, { id: 'people' });
                      if (peopleColumn && peopleColumn.value) {
                        const personsAndTeams = JSON.parse(peopleColumn.value).personsAndTeams;
                        return _.some(personsAndTeams, { id: userId });
                      }
                    });
                    isAssigned = _item?.length ? true : isAssigned;
                  }
                }
                if (center === CenterConst.CR210) {
                  if (!isAssigned) {
                    tutorUnassigned210 += 1;
                    tutorUnassignedCert210 = isPassed ? tutorUnassignedCert210 + 1 : tutorUnassignedCert210;
                  }
                  tutorTestPrep210 = isCert ? tutorTestPrep210 + 1 : tutorTestPrep210;
                } else if (center === CenterConst.JC) {
                  if (!isAssigned) {
                    tutorUnassignedJC += 1;
                    tutorUnassignedCertJC = isPassed ? tutorUnassignedCertJC + 1 : tutorUnassignedCertJC;
                  }
                  tutorTestPrepJC = isCert ? tutorTestPrepJC + 1 : tutorTestPrepJC;
                }
              }
              edIdToConnect = _.map(edIdToConnect, _.toNumber);
              tsqToConnect = _.map(tsqToConnect, _.toNumber);
              // if (weekDayTAM === WeekdayConsts.Saturday) {
              //   tutorAvailable210 += tutorAvailableJC;
              //   tutorUnassigned210 += tutorUnassignedJC;
              //   tutorUnassignedCert210 += tutorUnassignedCertJC;
              //   tutorTestPrep210 += tutorTestPrepJC;
              //   tutorAvailableJC      = 0;
              //   tutorUnassignedJC     = 0;
              //   tutorUnassignedCertJC = 0;
              //   tutorTestPrepJC       = 0;
              // }
              const TAMColumnValues = {
                connect_boards8: { item_ids: edIdToConnect },
                connect_boards9: { item_ids: tsqToConnect },
                numbers4: tutorAvailableJC,
                numbers1: tutorAvailable210,
                numbers80: tutorUnassignedJC,
                numbers9: tutorUnassigned210,
                numbers96: tutorUnassignedCertJC,
                numbers59: tutorUnassignedCert210,
                numbers7: tutorTestPrepJC,
                numbers0: tutorTestPrep210,
                status62: Constants.Done,
              };

              // const queryUpdateTAMConnectBoard = await CommonService.replaceQuery(
              //   ConstQuery.ChangeMultipleColumnValues,
              //   BoardConstants.TAM,
              //   '',
              //   JSON.stringify(JSON.stringify(TAMColumnValues)),
              //   pulseId,
              // );
              // const result = await CommonService.post(queryUpdateTAMConnectBoard);

              const result = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.TAM, pulseId, TAMColumnValues);

              isUpdateDone = true;
              await LogService.DoneLog({ dbData, result });
            } else {
              await LogService.Log({ message: ConstMessage.NoMatchingTutorED, dbData });
            }
          } else {
            await LogService.Log({ message: ConstMessage.EDNoActiveEmployee, dbData });
          }
        } else {
          await LogService.Log({ message: ConstMessage.NoTutorAvailable, dbData });
        }
      } else {
        await LogService.Log({ message: _.replace(ConstMessage.TAMNotItem, '{0}', pulseId), dbData });
      }
      if (!isUpdateDone) {
        await this.UpdateTAMClear(pulseId);
      }
      return { status: 200, message: Constants.Done };
    } catch (error) {
      if (!isAutomation) await LogService.ExceptionLog({
        dbData,
        error,
        message: `======${EventName.TutorCount} ${pulseId | pulseName} Exception=======`,
      });
      throw error;
    } finally {
      Logger.log(`======END ${EventName.TutorCount} ${pulseId | pulseName}=======`);
    }
  }

  private static async UpdateTAMClear(pulseId: number, isDone = true) {
    let TAMColumnValuesClear: any = {
      connect_boards8: null,
      connect_boards9: null,
      numbers4       : 0,
      numbers1       : 0,
      numbers80      : 0,
      numbers9       : 0,
      numbers96      : 0,
      numbers59      : 0,
      numbers7       : 0,
      numbers0       : 0,
    };
    if (isDone) TAMColumnValuesClear.status62 = Constants.Done;
    // const queryUpdateTAMConnectBoard = await CommonService.replaceQuery(
    //   ConstQuery.ChangeMultipleColumnValues,
    //   BoardConstants.TAM,
    //   '',
    //   JSON.stringify(JSON.stringify(TAMColumnValuesClear)),
    //   pulseId,
    // );
    // await CommonService.post(queryUpdateTAMConnectBoard);

    await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.TAM, pulseId, TAMColumnValuesClear);
  }
}
