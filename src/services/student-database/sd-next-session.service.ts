import { BoardConstants, Constants, EventName } from '../../constants/constant';
import CommonService from '../common-service';
import LogService from '../log-service';
import ConstColumn from '../../constants/constant-column';
import * as _ from 'lodash';
import Logger from '../../helper/logger';
import BlabMondayService from '../blab-monday.service';
import { parseISO, isWithinInterval, isAfter, isSameDay } from 'date-fns';

export default class SDNextSessionService {
  static async PreRun() {
    const itemsClosedDate: any = await BlabMondayService.GetGroupListItem(
      BoardConstants.Calendars,
      [ConstColumn.Calendars.ClosedDate],
      [ConstColumn.Calendars.TimelineEvent],
    );
    if (!itemsClosedDate?.length) {
      return false;
    }
    const today = new Date();

    const isHoliday = _.some(itemsClosedDate, (item) => {
      const columnValue = item?.column_values?.[0];
      const { from, to } = JSON.parse(columnValue?.value);

      const fromDate = parseISO(from);
      const toDate = parseISO(to);

      return isWithinInterval(today, { start: fromDate, end: toDate });
    });

    return isHoliday;
  }

  static async Run() {
    Logger.log(`======START SD Next Session======`);
    try {
      const listItemsEntrySD = await BlabMondayService.GetGroupListItem(
        BoardConstants.SD,
        [ConstColumn.SD.NewEntry],
        [ConstColumn.SD.StudentID, ConstColumn.SD.HoursRemaining, ConstColumn.SD.Status, ConstColumn.SD.HourTriggerDate],
      );
      const listItemsActiveSD = await BlabMondayService.GetGroupListItem(
        BoardConstants.SD,
        [ConstColumn.SD.ActiveStudents],
        [ConstColumn.SD.StudentID, ConstColumn.SD.HoursRemaining, ConstColumn.SD.Status, ConstColumn.SD.HourTriggerDate],
      );

      const listItemsSD = _.concat(listItemsActiveSD, listItemsEntrySD);

      const listItemSDHaveStudentId = _.filter(listItemsSD, (item) =>
        item.column_values?.some((cv) => cv?.id === ConstColumn.SD.StudentID && cv?.text?.length),
      );

      if (listItemSDHaveStudentId?.length) {
        for (const { id, name, column_values } of listItemSDHaveStudentId) {
          let logData = {
            board_id: BoardConstants.SD,
            item_id: id,
            item_name: name,
            board_name: CommonService.getBoardName(BoardConstants.SD),
            event_name: EventName.SDNextSession,
            monday_item_id: 0,
          };
          const { mondayLog } = await LogService.StartLog(logData);
          let dbData = mondayLog;

          try {
            const studentId = column_values?.find((s) => s.id === ConstColumn.SD.StudentID)?.text;
            const hoursRemaining = column_values?.find((s) => s.id === ConstColumn.SD.HoursRemaining)?.display_value;
            const statusSD = column_values?.find((s) => s.id === ConstColumn.SD.Status)?.text;
            const hourTriggerDate = column_values?.find((s) => s.id === ConstColumn.SD.HourTriggerDate)?.display_value;
            const columns = [{ column_id: `${ConstColumn.WS.StudentId}`, column_values: [studentId] }];
            const currentDate = new Date();
            const itemsWS = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.WS, columns, [ConstColumn.WS.DateOfSession]);
            let value =
                hoursRemaining <= 0
                  ? hourTriggerDate?.length && (isAfter(currentDate, parseISO(hourTriggerDate)) || isSameDay(currentDate, parseISO(hourTriggerDate)))
                    ? Constants.Inactive
                    : statusSD
                  : statusSD,
              columnId = ConstColumn.SD.Status;

            if (itemsWS?.length) {
              const filteredItems = itemsWS.filter((item) => {
                const itemDate = parseISO(_.get(item, 'column_values[0].text'));
                return isAfter(itemDate, currentDate) || isSameDay(itemDate, currentDate);
              });
              value = _.minBy(filteredItems, (item) => parseISO(_.get(item, 'column_values[0].text')))?.column_values?.[0]?.text;
              // value    = _.minBy(itemsWS, item => new Date(_.get(item, 'column_values[0].text')))?.column_values?.[0]?.text;
              columnId = ConstColumn.SD.NextSession;
            }
            let result = null;
            if (value?.length && columnId?.length) {
              result = await BlabMondayService.ChangeSimpleColumnValue(BoardConstants.SD, id, columnId, value);
            }
            dbData.event_data = {
              columnId: columnId,
              value: value,
            };

            await LogService.DoneLog({ dbData, result });
          } catch (e) {
            await LogService.ExceptionLog({
              dbData,
              e,
              message: `======${EventName.SDNextSession}|${id}| Exception=======`,
            });
            throw e;
          }
        }
      } else {
        Logger.log(`Not found active student`);
      }
    } catch (e) {
      return { status: 500, message: e };
    } finally {
      Logger.log(`======END SD Next Session======`);
    }
  }
}
