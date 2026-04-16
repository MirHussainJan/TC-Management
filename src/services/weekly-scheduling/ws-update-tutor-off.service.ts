import CommonService                            from '../../services/common-service';
import { BoardConstants, Constants, EventName } from '../../constants/constant';
import * as _                                   from 'lodash';
import { isBefore, isAfter, parseISO, isEqual } from 'date-fns';
import ConstColumn                              from '../../constants/constant-column';
import ConstMessage                             from '../../constants/constant-message';
import Logger                                   from '../../helper/logger';
import LogService                               from '../../services/log-service';
import AutomationDataModel                      from '../../db/models/automation-data.model';
import BlabMondayService                        from '../blab-monday.service';

export default class WSUpdateTutorOffService {
  static async UpdateTutorOff(event, isAutomation = false, dbData?: AutomationDataModel) {
    const {
            userId,
            originalTriggerUuid,
            boardId,
            pulseId,
            pulseName,
            groupId,
            groupName,
            groupColor,
            isTopGroup,
            columnValues,
            app,
            type,
            triggerTime,
            subscriptionId,
            triggerUuid,
          }     = event;
    let logData = {
      board_id      : boardId,
      item_id       : pulseId,
      item_name     : pulseName,
      board_name    : CommonService.getBoardName(boardId),
      event_name    : EventName.NewWSTutorOff,
      event_data    : event,
      monday_item_id: 0,
    };

    try {
      if (!isAutomation) {
        const { mondayLog } = await LogService.StartLog(logData);
        dbData              = mondayLog;
      }
      if (dbData) dbData.event_status = true;
      const { date4, text1, text4 } = columnValues;

      if (date4?.date?.length) {
        const createdDate = parseISO(date4.date);
        // const queryETORApproved = await CommonService.replaceQuery(
        //   Query.ItemByColumnValues,
        //   BoardConstants.ETOR,
        //   ConstColumn.ETOR.RequestStatus,
        //   Constants.Approved,
        //   0,
        //   `(ids: [${ConstColumn.ETOR.DateRange}, ${ConstColumn.ETOR.RequestType}, ${ConstColumn.ETOR.EarlierLater}, ${ConstColumn.ETOR.FirstLastSession}, ${ConstColumn.ETOR.ReturnSession}])`,
        // );
        // const etorApproved = await CommonService.post(queryETORApproved);

        const columnETORApproved         = [
          { column_id: `${ConstColumn.ETOR.RequestStatus}`, column_values: [`${Constants.Approved}`] },
        ];
        const specificColumnETORApproved = [ConstColumn.ETOR.DateRange, ConstColumn.ETOR.RequestType, ConstColumn.ETOR.EarlierLater, ConstColumn.ETOR.FirstLastSession, ConstColumn.ETOR.ReturnSession, ConstColumn.ETOR.MondayUser];
        const etorApproved               = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.ETOR,
          columnETORApproved,
          specificColumnETORApproved);

        Logger.log(`ETOR Approved: ${etorApproved?.length}`);
        if (etorApproved?.length) {
          let i                  = 0;
          const etorApprovedDate = _.filter(etorApproved, (item) => {
            i++;
            const columnValue = JSON.parse(item?.column_values?.find((col) => col.id === ConstColumn.ETOR.DateRange)?.value);
            if (columnValue && columnValue?.from && columnValue?.to) {
              const fromDate = parseISO(columnValue.from);
              const toDate   = parseISO(columnValue.to);
              return (isBefore(fromDate, createdDate) || isEqual(fromDate, createdDate)) && (isAfter(toDate,
                createdDate) || isEqual(
                toDate,
                createdDate));
            }
          });
          Logger.log(`WS date in range ETOR Approved: ${etorApprovedDate?.length}`);
          if (etorApprovedDate?.length) {
            // const queryAllDaySessionWS = await CommonService.replaceQuery(
            //   Query.ItemByColumnValues,
            //   BoardConstants.WS,
            //   ConstColumn.WS.DateOfSession,
            //   date4.date,
            //   0,
            //   `(ids: [${ConstColumn.WS.DateOfSession}, ${ConstColumn.WS.Session}, ${ConstColumn.WS.Tutors}, ${ConstColumn.WS.ETORConnectBoard}, ${ConstColumn.WS.Attendance}])`,
            // );
            // const allDaySessionWS = await CommonService.post(queryAllDaySessionWS);

            const columnAllDaySessionWS         = [
              { column_id: `${ConstColumn.WS.DateOfSession}`, column_values: [`${date4.date}`] },
            ];
            const specificColumnAllDaySessionWS = [ConstColumn.WS.DateOfSession, ConstColumn.WS.Session, ConstColumn.WS.Tutors, ConstColumn.WS.ETORConnectBoard, ConstColumn.WS.Attendance];
            const allDaySessionWS               = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.WS,
              columnAllDaySessionWS,
              specificColumnAllDaySessionWS);

            Logger.log(`All WS session: ${allDaySessionWS?.length}`);
            if (allDaySessionWS?.length) {
              const allDaySessionsWSIds  = _.map(allDaySessionWS, (s) => s.id);
              const etorFullDayItems     = _.filter(etorApprovedDate, (s) => {
                const columnValue = s.column_values.find((col) => col.id === ConstColumn.ETOR.RequestType)?.text;
                return columnValue === Constants.FullDay;
              });
              // const etorFullDayItemsUser = _.map(etorFullDayItems, (rs: any) => _.filter(rs.column_values, (s: any) => s.id === ConstColumn.ETOR.MondayUser));
              const etorFullDayIds       = _.map(etorFullDayItems, (rs) => rs.id);
              const etorFullDayItemsUser = _.chain(etorFullDayItems)
                .flatMap('column_values')
                .filter({ 'id': 'lookup' })
                .map('display_value')
                .value();
              // Logger.log(`ETOR Fullday: ${etorFullDayIds?.length}`);

              const etorPartialLeaveEarlier = _.filter(etorApprovedDate, (s) => {
                const type         = s.column_values.find((col) => col.id === ConstColumn.ETOR.RequestType)?.text;
                const earlierLater = s.column_values.find((col) => col.id === ConstColumn.ETOR.EarlierLater)?.text;
                return type === Constants.PartialDay && earlierLater === Constants.LeaveEarlier;
              });

              // Logger.log(`ETOR Leave Earlier: ${etorPartialLeaveEarlier?.length}`);

              const etorPartialStartLater = _.filter(etorApprovedDate, (s) => {
                const type         = s.column_values.find((col) => col.id === ConstColumn.ETOR.RequestType)?.text;
                const earlierLater = s.column_values.find((col) => col.id === ConstColumn.ETOR.EarlierLater)?.text;
                return type === Constants.PartialDay && earlierLater === Constants.StartLater;
              });

              const etorPartialMiddle = _.filter(etorApprovedDate, (s) => {
                const type         = s.column_values.find((col) => col.id === ConstColumn.ETOR.RequestType)?.text;
                const earlierLater = s.column_values.find((col) => col.id === ConstColumn.ETOR.EarlierLater)?.text;
                return type === Constants.PartialDay && earlierLater === Constants.MiddleDay;
              });
              Logger.log(`Loop all WS session`);
              for (let i = 0; i < allDaySessionWS.length; i++) {
                const ws         = allDaySessionWS[i]?.column_values;
                const wsId       = allDaySessionWS[i]?.id;
                const attendance = ws?.length ? _.find(ws, (s) => s.id === ConstColumn.WS.Attendance)?.text : null;
                if (attendance && attendance !== Constants.SideWork) {
                  const sessionWS  = CommonService.sessionToNumber(_.find(ws,
                    (s) => s.id === ConstColumn.WS.DateOfSession)?.text);
                  const tutor      = _.find(ws, (s) => s.id === ConstColumn.WS.Tutors)?.text;
                  let notAvailable = !!etorFullDayItemsUser?.some(item => tutor.includes(item));

                  const leaveEarlierIds = etorPartialLeaveEarlier?.length
                    ? _.filter(etorPartialLeaveEarlier, (item) => {
                      const session  = CommonService.sessionToNumber(_.find(item,
                        (s) => s.id === ConstColumn.ETOR.FirstLastSession)?.text);
                      const etorUser = _.find(item, (s) => s.id === ConstColumn.ETOR.MondayUser);
                      notAvailable   = _.includes(tutor, etorUser) ? true : notAvailable;
                      return sessionWS >= session;
                    })
                    : [];

                  const startLaterIds = etorPartialStartLater?.length
                    ? _.filter(etorPartialStartLater, (item) => {
                      const session  = CommonService.sessionToNumber(_.find(item,
                        (s) => s.id === ConstColumn.ETOR.FirstLastSession)?.text);
                      const etorUser = _.find(item, (s) => s.id === ConstColumn.ETOR.MondayUser);
                      notAvailable   = _.includes(tutor, etorUser) ? true : notAvailable;
                      return sessionWS < session;
                    })
                    : [];

                  const middleIds  = etorPartialMiddle?.length
                    ? _.filter(etorPartialMiddle, (item) => {
                      const session       = CommonService.sessionToNumber(_.find(item,
                        (s) => s.id === ConstColumn.ETOR.FirstLastSession)?.text);
                      const returnSession = CommonService.sessionToNumber(_.find(item,
                        (s) => s.id === ConstColumn.ETOR.ReturnSession)?.text);
                      const etorUser      = _.find(item, (s) => s.id === ConstColumn.ETOR.MondayUser);
                      notAvailable        = _.includes(tutor, etorUser) ? true : notAvailable;
                      return sessionWS >= session && sessionWS < returnSession;
                    })
                    : [];
                  const connectIds = _.union(etorFullDayIds.map(Number),
                    leaveEarlierIds.map(Number),
                    startLaterIds.map(Number),
                    middleIds.map(Number));

                  const columnValues = {
                    connect_boards5: { item_ids: _.compact(connectIds) },
                    status79       : notAvailable ? Constants.NotAvailable : Constants.Clear,
                  };
                  const result       = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.WS,
                    wsId,
                    columnValues);

                  let logSubitemEror = {
                    board_id       : BoardConstants.WS,
                    board_name     : CommonService.getBoardName(BoardConstants.WS),
                    event_name     : EventName.NewWSTutorOff,
                    event_data     : columnValues,
                    parent_event_id: dbData?.event_id,
                    event_message  : '',
                    parent_item_id : dbData?.itemId,
                    monday_item_id : 0,
                    item_id        : wsId,
                  };

                  if (result?.errors?.length) {
                    const _msg = `Loop Error: ${wsId}|${JSON.stringify(columnValues)} ${result.errors[0]?.message}`;
                    LogService.SubitemErrorLog({ result, logSubitemEror, mondayItemId: dbData?.itemId, message: _msg });
                  } else if (result?.error_message?.length) {
                    const _msg = `Loop Error: ${wsId}|${JSON.stringify(columnValues)} ${result?.error_message}`;
                    LogService.SubitemErrorLog({ result, logSubitemEror, mondayItemId: dbData?.itemId, message: _msg });
                  }

                  if (i === 0 && !_.includes(allDaySessionsWSIds, pulseId)) {
                    await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.WS, pulseId, columnValues);
                  }
                }
              }

              await LogService.DoneLog({ dbData, result: null });
            } else {
              await LogService.Log({ message: ConstMessage.WSNotItemValid + date4.date, dbData });
            }
          } else {
            await LogService.Log({ message: ConstMessage.ETORNotItemValid, dbData });
          }
        }
      } else {
        await LogService.Log({ message: ConstMessage.DateOfSessionNull, dbData });
      }

      return { status: 200, message: Constants.Done };
    } catch (error) {
      if (!isAutomation) await LogService.ExceptionLog({
        dbData,
        error,
        message: `======${EventName.NewWSTutorOff} ${pulseId | pulseName} Exception=======`,
      });
      return { status: 500, message: error };
    } finally {
      Logger.log(`======END ${EventName.NewWSTutorOff} ${pulseId | pulseName}=======`);
    }
  }
}
