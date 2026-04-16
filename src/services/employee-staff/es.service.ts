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
import moment from 'moment';
import * as gDriveService from '../other-business/g-drive.service';
import * as gSheetService from '../other-business/g-sheet.service';

export default class ESService {
  static async ES19GenerateSchedule(event, isAutomation = false, dbData?: AutomationDataModel) {
    const { boardId, pulseId, pulseName, columnId, columnTitle, value } = event;
    let logData = {
      board_id: boardId,
      item_id: pulseId,
      item_name: pulseName,
      board_name: CommonService.getBoardName(boardId),
      event_name: EventName.ES19GenerateSchedule,
      event_data: event,
      monday_item_id: 0,
    };

    let result: any = null;
    try {
      Logger.log(`======START ${EventName.ES19GenerateSchedule} ${pulseId | pulseName}=======`);
      if (!isAutomation) {
        const { mondayLog } = await LogService.StartLog(logData);
        dbData = mondayLog;
      }
      if (dbData) dbData.event_status = true;
      if (pulseId) {
        const itemStaffSchedule = await BlabMondayService.GetItemById(pulseId);
        Logger.log(`======itemStaffSchedule ${itemStaffSchedule}=======`);
        if (itemStaffSchedule?.id > 0) {
          const employee = this.getColumnValuesById(itemStaffSchedule, ConstColumn.SS.Employee, 0);
          const employeeStatus = this.getColumnValuesById(itemStaffSchedule, ConstColumn.SS.EmployeeStatus, 2);
          const startingDateofSchedule = this.getColumnValuesById(itemStaffSchedule, ConstColumn.SS.StartingDateofSchedule, 0);
          const weekday = this.getColumnValuesById(itemStaffSchedule, ConstColumn.SS.WeekDay, 0);
          let etor: any = {};
          const columnToUpdate: any = {
            startHour: null,
            endHour: null,
          };

          if (startingDateofSchedule?.length && employee?.length && employeeStatus === Constants.ActiveEmployee) {
            const rules = [
              { column_id: 'name', compare_value: employee, operator: 'any_of' },
              { column_id: ConstColumn.ETOR.RequestStatus, compare_value: 'Approved', operator: 'contains_terms' },
            ];
            const etorColumnValues = [
              ConstColumn.ETOR.RequestStatus,
              ConstColumn.ETOR.DateRange,
              ConstColumn.ETOR.RequestType,
              ConstColumn.ETOR.EarlierLater,
              ConstColumn.ETOR.FirstLastSession,
              ConstColumn.ETOR.ReturnSession,
            ];
            const itemETOR = await BlabMondayService.getBoardItems(BoardConstants.ETOR, rules, ['any_of', 'contains_terms'], etorColumnValues);
            etor = _.filter(itemETOR, (item) =>
              _.some(item.column_values, (columnValue) => {
                const isMatchId = columnValue.id === ConstColumn.ETOR.DateRange;

                // Parse JSON từ columnValue.value
                let parsedValue;
                try {
                  parsedValue = JSON.parse(columnValue.value);
                } catch (error) {
                  console.error('JSON parse error:', error);
                  return false;
                }

                // Kiểm tra nếu parsedValue có đủ from và to
                if (!parsedValue?.from || !parsedValue?.to) {
                  return false;
                }

                const fromDate = moment(parsedValue.from);
                const toDate = moment(parsedValue.to);
                const scheduleDate = moment(startingDateofSchedule);

                return isMatchId && fromDate.isSameOrBefore(scheduleDate) && toDate.isSameOrAfter(scheduleDate);
              }),
            )?.[0];
          }

          const requestType = this.getColumnValuesById(etor, ConstColumn.ETOR.RequestType, 0);
          const earlierLater = this.getColumnValuesById(etor, ConstColumn.ETOR.EarlierLater, 0);
          const firstLastSession = this.getColumnValuesById(etor, ConstColumn.ETOR.FirstLastSession, 0);

          let setScheduleStaff: any = [];
          if (employee?.length) {
            const itemSetStaffSchedule = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.SubSetScheduleForStaff, [
              { column_id: ConstColumn.SSSFS.User, column_values: employee },
            ]);
            setScheduleStaff = _.filter(itemSetStaffSchedule, (item) => {
              const hasWeekdayStatus = item.column_values.some((column) => column.id === ConstColumn.SSSFS.Weekday && column.text === weekday);
              const hasNonTutorSchedule = item.column_values.some((column) => column.id === ConstColumn.SSSFS.Center && column.text !== 'Tutor Schedule');
              return hasWeekdayStatus && hasNonTutorSchedule;
            });
          }
          if (setScheduleStaff?.length) {
            const _startSetSchedule = this.getColumnValuesById(setScheduleStaff?.[0], ConstColumn.SSSFS.Start, 1);
            const _start = _startSetSchedule?.length ? JSON.parse(_startSetSchedule) : null;
            const _startHour = _start?.hour;
            const _startMinute = _start?.minute;

            const _endSetSchedule = this.getColumnValuesById(setScheduleStaff?.[0], ConstColumn.SSSFS.End, 1);
            const _end = _startSetSchedule?.length ? JSON.parse(_endSetSchedule) : null;
            const _endHour = _end?.hour;
            const _endMinute = _end?.minute;
            columnToUpdate.startHour = `${_startHour}:${_startMinute}`;
            columnToUpdate.endHour = `${_endHour}:${_endMinute}`;
          } else {
            const rulesWS = [
              { column_id: ConstColumn.WS.Tutors, compare_value: employee, operator: 'contains_text' },
              { column_id: ConstColumn.WS.Weekday, compare_value: weekday.slice(3), operator: 'contains_terms' },
            ];
            const itemWS = await BlabMondayService.getBoardItems(
              BoardConstants.WS,
              rulesWS,
              ['contains_text', 'contains_terms'],
              [ConstColumn.WS.DateOfSession, ConstColumn.WS.Session, ConstColumn.WS.Center, ConstColumn.WS.Weekday, ConstColumn.WS.TutorsOff],
            );
            const itemFilteredWS = _.filter(itemWS, (item) =>
              item.column_values.some((cl) => cl.id === ConstColumn.WS.TutorsOff && !cl.display_value?.includes(employee)),
            );
            if (itemFilteredWS?.length) {
              const minMax = this.findMinMaxTimes(itemFilteredWS);
              columnToUpdate.startHour = this.calculateStartHourAndMinute(minMax.minTime);
              columnToUpdate.endHour = this.calculateEndHourAndMinute(minMax.maxTime);
              columnToUpdate.center = itemFilteredWS[0].column_values.find((cl) => cl.id === ConstColumn.WS.Center)?.text;
            }
          }

          if (columnToUpdate.startHour && columnToUpdate.endHour) {
            columnToUpdate.totalHour = this.calculateTimeDifferenceInDecimal(columnToUpdate.startHour, columnToUpdate.endHour);
          }

          if (requestType === Constants.FullDay) {
            columnToUpdate.startHour = null;
            columnToUpdate.endHour = null;
          } else if (requestType === Constants.PartialDay) {
            if (earlierLater === Constants.StartLater) {
              columnToUpdate.startHour = firstLastSession;
            }
            if (earlierLater === Constants.LeaveEarlier) {
              columnToUpdate.endHour = firstLastSession;
            }
          }

          const columns: any = {
            [ConstColumn.SS.HourStart]: columnToUpdate.startHour?.length
              ? { hour: Number(columnToUpdate.startHour.split(':')[0]), minute: Number(columnToUpdate.startHour.split(':')[1]) }
              : null,
            [ConstColumn.SS.HourEnd]: columnToUpdate.endHour?.length
              ? { hour: Number(columnToUpdate.endHour.split(':')[0]), minute: Number(columnToUpdate.endHour.split(':')[1]) }
              : null,
            [ConstColumn.SS.Actions]: 'Publish',
            [ConstColumn.SS.TotalHours]: columnToUpdate.totalHour ?? null,
          };

          if (columnToUpdate.center?.length) columns[ConstColumn.SS.Center] = columnToUpdate.center;

          await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.StaffSchedule, pulseId, columns);
          Logger.log(`======ChangeMultipleColumnValues ${pulseId}|${pulseName}\n${JSON.stringify(columns)}=======`);
        } else {
          result = { msg: ConstMessage.ItemNotFound.replace('{0}', pulseId) };
        }
      } else {
        result = { msg: ConstMessage.PulseIdNull };
      }
      await LogService.DoneLog({ dbData, result });
      return { status: 200, message: Constants.Done };
    } catch (error) {
      if (!isAutomation)
        await LogService.ExceptionLog({
          dbData,
          error,
          message: `======${EventName.ES19GenerateSchedule} ${pulseId | pulseName} Exception=======`,
        });
      return { status: 500, message: error };
    } finally {
      Logger.log(`======END ${EventName.ES19GenerateSchedule} ${pulseId}|${pulseName}=======`);
    }
  }

  static calculateStartHourAndMinute(minTime: string) {
    if (!minTime || minTime.trim() === '') {
      return null;
    }

    const timeParts = minTime.split(':'); // Tách chuỗi theo dấu ":"
    let hour = parseInt(timeParts[0], 10); // Lấy giá trị giờ
    const minute = parseInt(timeParts[1], 10); // Lấy giá trị phút

    if (minute === 30) {
      return `${hour.toString().padStart(2, '0')}:15`;
    } else {
      hour -= 1; // Trừ 1 giờ nếu phút không phải 30
      return `${hour.toString().padStart(2, '0')}:45`;
    }
  }

  static calculateEndHourAndMinute(maxTime: string) {
    if (!maxTime || maxTime.trim() === '') {
      return null;
    }

    const timeParts = maxTime.split(':'); // Tách chuỗi theo dấu ":"
    let hour = parseInt(timeParts[0], 10); // Lấy giá trị giờ
    const minute = parseInt(timeParts[1], 10); // Lấy giá trị phút

    // Tính toán giờ
    if (hour > 0) {
      hour += 1; // Cộng thêm 1 giờ nếu giá trị giờ hợp lệ
    }

    // Tính toán phút
    const endMinute = minute === 30 ? 45 : 15;

    return `${hour.toString().padStart(2, '0')}:${endMinute?.toString().padStart(2, '0')}`;
  }

  static findMinMaxTimes(items) {
    // Lọc ra danh sách thời gian từ các item
    const times = items
      .map((item) => {
        const statusValue = item.column_values.find((cv) => cv.id === 'status');
        return statusValue?.text && moment(statusValue.text, 'HH:mm', true).isValid() ? statusValue.text : null;
      })
      .filter(Boolean) as string[]; // Loại bỏ các giá trị null

    // Tìm thời gian nhỏ nhất và lớn nhất
    const minTime = times.reduce((min, time) => (moment(time, 'HH:mm').isBefore(moment(min, 'HH:mm')) ? time : min));
    const maxTime = times.reduce((max, time) => (moment(time, 'HH:mm').isAfter(moment(max, 'HH:mm')) ? time : max));

    return { minTime, maxTime };
  }

  static calculateTimeDifferenceInDecimal(start: string, end: string): number {
    const startTime = moment(start, 'HH:mm'); // Chuyển start thành thời gian
    const endTime = moment(end, 'HH:mm'); // Chuyển end thành thời gian

    // Tính tổng số phút giữa start và end
    const durationMinutes = endTime.diff(startTime, 'minutes');

    // Chuyển số phút thành số giờ thập phân
    const hoursDecimal = durationMinutes / 60;

    return hoursDecimal;
  }

  static calculateTimeDifference(start: string, end: string): number {
    if (!start || !end) return 0;
    const startTime = moment(start, 'HH:mm a'); // Chuyển start thành thời gian
    const endTime = moment(end, 'HH:mm a'); // Chuyển end thành thời gian

    // Tính tổng số phút giữa start và end
    const durationMinutes = endTime.diff(startTime, 'minutes');

    // Chuyển số phút thành số giờ thập phân
    const hoursDecimal = durationMinutes / 60;

    return hoursDecimal;
  }

  private static getColumnValuesById(source, id, getValueType = 0) {
    const rs = source?.column_values?.filter((s) => s.id === id)?.[0];
    return (getValueType === 0 ? rs?.text || null : getValueType === 1 ? rs?.value || null : getValueType === 2 ? rs?.display_value || null : null) || null;
  }

  static async ES18StaffScheduleExportGS(event, isAutomation = false, dbData?: AutomationDataModel) {
    const { boardId, pulseId, pulseName, columnId, columnTitle, value } = event;
    let logData = {
      board_id: boardId,
      item_id: pulseId,
      item_name: pulseName,
      board_name: CommonService.getBoardName(boardId),
      event_name: EventName.ES18StaffScheduleExportGS,
      event_data: event,
      monday_item_id: 0,
    };

    try {
      Logger.log(`======START ${EventName.ES18StaffScheduleExportGS} ${pulseId | pulseName}=======`);
      if (!isAutomation) {
        const { mondayLog } = await LogService.StartLog(logData);
        dbData = mondayLog;
      }
      if (dbData) dbData.event_status = true;
      let result: any = null;
      if (pulseId) {
        const itemStaffSchedule = await BlabMondayService.GetItemById(pulseId);
        Logger.log(`======itemStaffSchedule ${itemStaffSchedule}=======`);
        if (itemStaffSchedule?.id > 0) {
          const startingDateofSchedule = this.getColumnValuesById(itemStaffSchedule, ConstColumn.SS.StartingDateofSchedule, 0);
          const exportSchedule = this.getColumnValuesById(itemStaffSchedule, ConstColumn.SS.ExportSchedule, 0);

          if (startingDateofSchedule?.length && exportSchedule == 'Start') {
            const fileCopied = await gDriveService.copyFile(
              Constants.ES18ExportGSTemplateFileId,
              itemStaffSchedule.name,
              Constants.ES18ExportGSFolder,
              'application/vnd.google-apps.spreadsheet',
            );
            const spredSheetId = fileCopied?.id;
            const listSheets = await gSheetService.getAllSheet(spredSheetId);
            const existed = listSheets?.some((s) => s.properties?.title === pulseName);
            if (existed) {
              result = { msg: 'Error - Name Exist' };

              const columns: any = {
                [ConstColumn.SS.ExportSchedule]: 'Error - Name Exist',
              };

              await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.StaffSchedule, pulseId, columns);
            } else if (listSheets?.length) {
              const templateSpreadSheetId = await gSheetService.getSheetIdByName(Constants.ES18ExportGSTemplateFileId, Constants.SheetNameTemplate);
              const rs = await gSheetService.copySheet(Constants.ES18ExportGSTemplateFileId, templateSpreadSheetId, spredSheetId);
              const copiedSheetId = rs?.data?.sheetId;
              if (copiedSheetId) {
                const sheetToUpdate = rs.data.title ?? Constants.SheetNameBlank;
                const startDate = parseInt(moment(startingDateofSchedule).format('d'));
                const monday = moment(startingDateofSchedule)
                  .add(startDate === 1 ? 0 : startDate > 1 ? 7 - 1 : 1, 'days')
                  .format('YYYY-MM-DD');
                const tuesday = moment(startingDateofSchedule)
                  .add(startDate === 2 ? 0 : startDate > 2 ? 7 - 2 : 2 - startDate, 'days')
                  .format('YYYY-MM-DD');
                const wednesday = moment(startingDateofSchedule)
                  .add(startDate === 3 ? 0 : startDate > 3 ? 7 - 3 : 3 - startDate, 'days')
                  .format('YYYY-MM-DD');
                const thursday = moment(startingDateofSchedule)
                  .add(startDate === 4 ? 0 : startDate > 4 ? 7 - 4 : 4 - startDate, 'days')
                  .format('YYYY-MM-DD');
                const saturday = moment(startingDateofSchedule)
                  .add(startDate === 6 ? 0 : startDate > 6 ? 7 - 6 : 6 - startDate, 'days')
                  .format('YYYY-MM-DD');

                const dataUE: any = [];
                const data: any = [];
                //Row 2
                dataUE.push(
                  {
                    range: `${sheetToUpdate}!C2:G2`,
                    majorDimension: 'ROWS',
                    values: [[monday]],
                  },
                  {
                    range: `${sheetToUpdate}!H2:L2`,
                    majorDimension: 'ROWS',
                    values: [[tuesday]],
                  },
                  {
                    range: `${sheetToUpdate}!M2:Q2`,
                    majorDimension: 'ROWS',
                    values: [[wednesday]],
                  },
                  {
                    range: `${sheetToUpdate}!R2:V2`,
                    majorDimension: 'ROWS',
                    values: [[thursday]],
                  },
                  {
                    range: `${sheetToUpdate}!W2:AA2`,
                    majorDimension: 'ROWS',
                    values: [[saturday]],
                  },
                );

                //Row 1
                data.push({
                  range: `${sheetToUpdate}!C1:I1`,
                  majorDimension: 'ROWS',
                  values: [[`Staff schedule for ${itemStaffSchedule.name}`]],
                });

                await gSheetService.updateSpreadSheetUserEnter(spredSheetId, dataUE);
                await gSheetService.updateMultipleRange(spredSheetId, data);
                const rules = [{ column_id: ConstColumn.SS.EmployeeDirectory, compare_value: 'null', operator: 'is_not_empty' }];
                const staffScheduleConnectBoard = await BlabMondayService.getBoardItems(BoardConstants.StaffSchedule, rules, ['is_not_empty']);

                if (staffScheduleConnectBoard?.length) {
                  let dataED: any = [];
                  let rowInserted: any = [];
                  let rowInsertedIndex = 5;
                  for (let i = 0; i < staffScheduleConnectBoard?.length + 1; i++) {
                    if (i === staffScheduleConnectBoard?.length) {
                      const dataTotal: any = [];
                      for (let j = 0; j < rowInserted.length; j++) {
                        const staffRow = rowInserted[j];
                        const actualRow = staffRow?.index;
                        dataTotal.push({
                          range: `${sheetToUpdate}!AB${actualRow}:AB${actualRow}`,
                          majorDimension: 'ROWS',
                          values: [[staffRow.totalHour]],
                        });
                      }
                      await gSheetService.updateSpreadSheetUserEnter(spredSheetId, dataTotal);
                      await gSheetService.deleteSheetById(spredSheetId, templateSpreadSheetId);
                      break;
                    }
                    const item = staffScheduleConnectBoard[i];
                    const position = this.getColumnValuesById(item, ConstColumn.SS.Position);
                    const positionMirror = this.getColumnValuesById(item, ConstColumn.SS.PositionMirror, 2);
                    const employeeStatus = this.getColumnValuesById(item, ConstColumn.SS.EmployeeStatus, 2);
                    const employeeDirectoryConnectBoard = this.getColumnValuesById(item, ConstColumn.SS.EmployeeDirectory, 1);
                    const center = this.getColumnValuesById(item, ConstColumn.SS.Center);
                    const note = this.getColumnValuesById(item, ConstColumn.SS.Note);
                    const hourStart = this.getColumnValuesById(item, ConstColumn.SS.HourStart);
                    const hourEnd = this.getColumnValuesById(item, ConstColumn.SS.HourEnd);
                    const employeeDirectoryId = employeeDirectoryConnectBoard?.length
                      ? JSON.parse(employeeDirectoryConnectBoard)?.linkedPulseIds?.[0]?.linkedPulseId
                      : null;
                    const weekDay = this.getColumnValuesById(item, ConstColumn.SS.WeekDay, 0);
                    const tutorInTraining = this.getColumnValuesById(item, ConstColumn.SS.TutorInTraining, 0) === 'Yes';
                    if (
                      item.name.startsWith('Kim Mullins') ||
                      position === 'Personal Assistant' ||
                      item.group?.title === 'Publish' ||
                      employeeStatus !== 'Active Employee' ||
                      employeeDirectoryId === null
                    ) {
                      continue;
                    }
                    const itemEmployeeDirectory = await BlabMondayService.GetItemById(employeeDirectoryId);
                    if (itemEmployeeDirectory?.id > 0) {
                      const employeeName = itemEmployeeDirectory.name.trim();
                      const rowSearched = await gSheetService.searchWithQuery(spredSheetId, sheetToUpdate, employeeName);
                      const scheduleData = {
                        monday: {
                          start: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.MondayStart, 0),
                          end: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.MondayEnd, 0),
                        },
                        tuesday: {
                          start: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.TuesdayStart, 0),
                          end: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.TuesdayEnd, 0),
                        },
                        wednesday: {
                          start: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.WednesdayStart, 0),
                          end: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.WednesdayEnd, 0),
                        },
                        thursday: {
                          start: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.ThursdayStart, 0),
                          end: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.ThursdayEnd, 0),
                        },
                        saturday: {
                          start: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.SaturdayStart, 0),
                          end: this.getColumnValuesById(itemEmployeeDirectory, ConstColumn.ED.SaturdayEnd, 0),
                        },
                      };
                      const _hourStart = hourStart?.split(':');
                      const _hourEnd = hourEnd?.split(':');
                      // const scheduleToWork = this.formatRange(_hourStart?.[0],_hourStart?.[1],_hourEnd?.[0],_hourEnd?.[1]);
                      const scheduleToWork =
                        hourStart?.length || hourEnd?.length
                          ? `${hourStart?.length ? hourStart : ''}${hourStart?.length && hourEnd?.length ? ' - ' : ''}${hourEnd?.length ? hourEnd : ''}`
                          : 'X';
                      const totalHour = this.calculateTimeDifference(hourStart, hourEnd) ?? 0;
                      if (rowSearched) {
                        const staffRow = rowInserted?.find((row) => row.name === employeeName);
                        const actualRow = staffRow?.index;
                        staffRow.totalHour += totalHour;
                        let rowData: any = [];
                        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'];
                        let nullis: any;
                        days.forEach((day) => {
                          if (weekDay.includes(day)) {
                            const dayLower = day.toLowerCase();
                            nullis = [];
                            rowData = [scheduleData[dayLower].start, scheduleToWork, scheduleData[dayLower].end, center, note];
                          }
                        });
                        const dataUpdate: any = [];
                        switch (weekDay) {
                          case '2. Tuesday':
                            dataUpdate.push({
                              range: `${sheetToUpdate}!H${actualRow}:L${actualRow}`,
                              majorDimension: 'ROWS',
                              values: [rowData],
                            });
                            break;
                          case '3. Wednesday':
                            dataUpdate.push({
                              range: `${sheetToUpdate}!M${actualRow}:Q${actualRow}`,
                              majorDimension: 'ROWS',
                              values: [rowData],
                            });
                            break;
                          case '4. Thursday':
                            dataUpdate.push({
                              range: `${sheetToUpdate}!R${actualRow}:V${actualRow}`,
                              majorDimension: 'ROWS',
                              values: [rowData],
                            });
                            break;
                          case '5. Saturday':
                            dataUpdate.push({
                              range: `${sheetToUpdate}!W${actualRow}:AA${actualRow}`,
                              majorDimension: 'ROWS',
                              values: [rowData],
                            });
                            break;
                        }

                        await gSheetService.updateSpreadSheetUserEnter(spredSheetId, dataUpdate);
                      } else {
                        const dataAdd: any = [];
                        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'];
                        days.forEach((day) => {
                          if (weekDay.includes(day)) {
                            const dayLower = day.toLowerCase();
                            const rowData = [
                              employeeName,
                              tutorInTraining ? 'Training' : positionMirror,
                              // ...Array(days.indexOf(day) * 6).fill(null),
                              scheduleData[dayLower].start,
                              scheduleToWork,
                              scheduleData[dayLower].end,
                              center,
                              note,
                            ];
                            dataAdd.push(rowData);
                          }
                        });
                        await gSheetService.addRow(spredSheetId, sheetToUpdate, dataAdd);
                        if (!rowInserted?.some((s) => s === employeeName)) {
                          rowInserted.push({
                            name: employeeName,
                            index: rowInsertedIndex,
                            totalHour,
                          });
                          rowInsertedIndex++;
                        }
                      }
                    }
                  }
                  await gSheetService.changeSheetName(spredSheetId, copiedSheetId, pulseName);
                }
              }

              result = { msg: 'Done' };
              const columns: any = {
                [ConstColumn.SS.ExportSchedule]: 'Done',
                [ConstColumn.SS.LinkToSchedule]: { url: fileCopied?.webViewLink, text: 'Link to Schedule' },
              };

              await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.StaffSchedule, pulseId, columns);
            }
          } else {
            result = { msg: `Start date of schedule is null or export schedule != start` };
            const columns: any = {
              [ConstColumn.SS.ExportSchedule]: 'Add Date and start ',
            };

            await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.StaffSchedule, pulseId, columns);
          }
        } else {
          result = { msg: `Item Staff Schedule not found ${pulseId}` };
        }
      } else {
        result = { msg: ConstMessage.PulseIdNull };
      }
      await LogService.DoneLog({ dbData, result });
      return { status: 200, message: Constants.Done };
    } catch (error) {
      if (!isAutomation)
        await LogService.ExceptionLog({
          dbData,
          error,
          message: `======${EventName.ES18StaffScheduleExportGS} ${pulseId | pulseName} Exception=======`,
        });
      return { status: 500, message: error };
    } finally {
      Logger.log(`======END ${EventName.ES18StaffScheduleExportGS} ${pulseId | pulseName}=======`);
    }
  }
  static formatTime(hour: string, minute: string): string {
    // Kiểm tra nếu không có giá trị hoặc giá trị <= 0
    if (!hour || parseInt(hour, 10) <= 0) {
      return 'X';
    }

    // Chuyển đổi số giờ để định dạng AM/PM
    const hourNumber = parseInt(hour, 10);
    const minuteFormatted = minute.length === 1 ? minute + '0' : minute;

    if (hourNumber <= 12) {
      return `${hour}:${minuteFormatted} am`;
    } else {
      return `${hourNumber - 12}:${minuteFormatted} pm`;
    }
  }

  static formatRange(startHour: string, startMinute: string, endHour: string, endMinute: string): string {
    if (!startHour || parseInt(startHour, 10) <= 0 || !endHour || parseInt(endHour, 10) <= 0) {
      return 'X';
    }

    const startFormatted = this.formatTime(startHour, startMinute);
    const endFormatted = this.formatTime(endHour, endMinute);

    return `${startFormatted} - ${endFormatted}`;
  }
}
