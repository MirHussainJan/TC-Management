import { BoardConstants, Constants, EventName } from '../../constants/constant';
import ConstColumn from '../../constants/constant-column';
import ConstMessage from '../../constants/constant-message';
import AutomationDataModel from '../../db/models/automation-data.model';
import Logger from '../../helper/logger';
import BlabMondayService from '../blab-monday.service';
import CommonService from '../common-service';
import LogService from '../log-service';

export default class SHLAddFamilySHLService {
  static async AddFamilySHL(eventData, isAutomation = false, dbData?: AutomationDataModel) {
    const { pulseId } = eventData;

    let logData = {
      board_id: BoardConstants.WS,
      item_id: pulseId,
      item_name: ' ',
      board_name: CommonService.getBoardName(BoardConstants.SHL),
      event_name: EventName.AddFamilySHL,
      event_data: eventData,
      monday_item_id: 0,
    };

    try {
      if (!isAutomation) {
        const { mondayLog } = await LogService.StartLog(logData);
        dbData = mondayLog;
      }
      Logger.log(`======START ${EventName.AddFamilySHL} ${pulseId}=======`);

      const allowedColumns = ['status55', 'date4', 'status', 'status7', 'status4', 'status1'];
      if (!allowedColumns.includes(eventData?.columnId)) {
        // Chờ 200s nếu không phải các column được phép
        await new Promise((resolve) => setTimeout(resolve, 200000));
      }

      let result: any = null;
      if (pulseId) {
        const itemSHL = await BlabMondayService.GetItemById(pulseId);
        if (itemSHL?.id > 0) {
          const name = itemSHL?.name || '';
          const familySHLItemId = this.getColumnValuesById(itemSHL, ConstColumn.SHL.FamilySHLItemId, 0);
          const tutorsAssigned = this.getColumnValuesById(itemSHL, ConstColumn.SHL.TutorsAssigned, 0);
          const date = this.getColumnValuesById(itemSHL, ConstColumn.SHL.Date, 0);
          const attendance = this.getColumnValuesById(itemSHL, ConstColumn.SHL.Attendance, 0);
          const session = this.getColumnValuesById(itemSHL, ConstColumn.SHL.Session, 0);
          const center = this.getColumnValuesById(itemSHL, ConstColumn.SHL.Center, 0);
          const hoursRemaining = this.getColumnValuesById(itemSHL, ConstColumn.SHL.HoursRemaining, 0);
          const adjustmentSession = this.getColumnValuesById(itemSHL, ConstColumn.SHL.AdjustmentSession, 0);
          const accountId = this.getColumnValuesById(itemSHL, ConstColumn.SHL.AccountID, 0);
          const studentId = this.getColumnValuesById(itemSHL, ConstColumn.SHL.StudentID, 0);
          const subject = this.getColumnValuesById(itemSHL, ConstColumn.SHL.Subject, 0);
          const grade = this.getColumnValuesById(itemSHL, ConstColumn.SHL.Grade, 0);
          const weekday = this.getColumnValuesById(itemSHL, ConstColumn.SHL.Weekday, 0);
          const adjustmentExplanation = this.getColumnValuesById(itemSHL, ConstColumn.SHL.AdjustmentExplanation, 0);
          const countedForInvoice = this.getColumnValuesById(itemSHL, ConstColumn.SHL.CountedForInvoice, 0);
          const sessionNumber = this.getColumnValuesById(itemSHL, ConstColumn.SHL.SessionNumber, 0);
          const sessionID = this.getColumnValuesById(itemSHL, ConstColumn.SHL.SessionID, 0);
          const studentName = this.getColumnValuesById(itemSHL, ConstColumn.SHL.StudentName, 0);
          const exportToFamilyGDrive = this.getColumnValuesById(itemSHL, ConstColumn.SHL.ExportToFamilyGDrive, 0);
          let isExistFamilySHLItem = false;
          if (familySHLItemId?.length) {
            const itemSHLFamily = await BlabMondayService.GetItemById(familySHLItemId);
            if (itemSHLFamily?.id > 0) {
              Logger.log(`Family SHL Item ID Existed: ${familySHLItemId}`);
              isExistFamilySHLItem = true;

              // Điều kiện cho accountId đặc biệt -> lấy ThirdPartyFunding
              let thirdPartyFunding = null;
              if (accountId === 'A-004508' || accountId === 'A-004520') {
                thirdPartyFunding = this.getColumnValuesById(itemSHL, ConstColumn.SHL.ThirdPartyFunding, 0);
              }

              // Tổng hợp thành object đúng format (keys theo template Make)
              const familySHLItemValues: any = {
                dropdown__1: tutorsAssigned ?? null,
                date4: date ?? null,
                status30: attendance ?? null,
                status: session ?? null,
                status7: center ?? null,
                numbers3: hoursRemaining ?? null,
                numbers: adjustmentSession ?? null,
                text7: accountId ?? null,
                text1: studentId ?? null,
                status4: subject ?? null,
                dropdown1: grade ?? null,
                status1: weekday ?? null,
                text2: adjustmentExplanation ?? null,
                status9: countedForInvoice ?? null,
                numbers72: sessionNumber ?? null,
                text4: sessionID ?? null,
                text: studentName ?? null,
                status__1: exportToFamilyGDrive ?? null,
              };

              if (thirdPartyFunding !== null) {
                familySHLItemValues.status1__1 = thirdPartyFunding;
              }

              const rsFamilyItemId = await BlabMondayService.ChangeMultipleColumnValues(itemSHLFamily.board.id, familySHLItemId, familySHLItemValues);

              const allUpdates = await BlabMondayService.getAllUpdates(itemSHL.id);
              if (allUpdates?.length) {
                //Create a single update from WS to SHL by joining all update bodies
                const combined = allUpdates?.data?.map((u) => u?.body || '');
                if (combined?.length) {
                  const combinedUpdates = combined.join('<br>========<br>');
                  await BlabMondayService.CreateUpdate(familySHLItemId, combinedUpdates);
                }
              }
              result = { msg: `Updated Family SHL Item by Item Existed: ${rsFamilyItemId?.data?.change_multiple_column_values?.id}|${itemSHLFamily.name}` };
            }
          }
          if (!isExistFamilySHLItem) {
            Logger.log(`Create new Family SHL Item from Item ID: ${pulseId}|${name}`);
            if (accountId) {
              const lstItemFD = await BlabMondayService.GetItemsPageByColumnValues(
                BoardConstants.FD,
                [{ column_id: `${ConstColumn.FD.AccountID}`, column_values: [accountId] }],
                [ConstColumn.FD.FamilySHLBoardId, ConstColumn.FD.FamilySHLBoardLink],
              );
              if (lstItemFD?.length) {
                const itemFD = lstItemFD[0];
                const familySHLBoardId = this.getColumnValuesById(itemFD, ConstColumn.FD.FamilySHLBoardId, 0);
                const familySHLBoardLink = itemFD.column_values?.find((cv) => cv.id === ConstColumn.FD.FamilySHLBoardLink)?.url || null;
                if (familySHLBoardId) {
                  Logger.log(`Family SHL Board ID from FD: ${familySHLBoardId}|${itemFD.name}`);
                  const familySHLBoard = await BlabMondayService.getBoardById(familySHLBoardId);
                  if (familySHLBoard?.id > 0) {
                    Logger.log(`Found Family SHL Board: ${familySHLBoardId}|${familySHLBoard.name}`);
                    await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.FD, itemFD.id, {
                      [ConstColumn.FD.FamilySHLBoardLink]: {
                        url: familySHLBoardLink || `https://tutoringclub-stjohns.monday.com/boards/${familySHLBoardId}`,
                        text: familySHLBoard.name,
                      },
                    });
                    const newestItemFD = await BlabMondayService.GetItemById(itemFD.id);
                    const newestFamilySHLBoardId = this.getColumnValuesById(newestItemFD, ConstColumn.FD.FamilySHLBoardId, 0);
                    if (newestFamilySHLBoardId) {
                      Logger.log(`Creating Family SHL Item on Board: ${newestFamilySHLBoardId}|${itemFD.name}`);
                      const familySHLItemValues = {
                        dropdown__1: tutorsAssigned ?? null,
                        date4: date ?? null,
                        status30: attendance ?? null,
                        status: session ?? null,
                        status7: center ?? null,
                        numbers3: hoursRemaining ?? null,
                        numbers: adjustmentSession ?? null,
                        text7: accountId ?? null,
                        text1: studentId ?? null,
                        status4: subject ?? null,
                        dropdown1: grade ?? null,
                        status1: weekday ?? null,
                        text2: adjustmentExplanation ?? null,
                        status9: countedForInvoice ?? null,
                        numbers72: sessionNumber ?? null,
                        text4: sessionID ?? null,
                        text: studentName ?? null,
                        status__1: exportToFamilyGDrive ?? null,
                      };
                      const createdItemID = await BlabMondayService.CreateItemWithValues(newestFamilySHLBoardId, name, familySHLItemValues);
                      if (createdItemID) {
                        Logger.log(`Created Family SHL Item: ${createdItemID}|${itemFD.name}`);
                        await BlabMondayService.ChangeSimpleColumnValue(BoardConstants.SHL, pulseId, ConstColumn.SHL.FamilySHLItemId, createdItemID);
                        const allUpdates = await BlabMondayService.getAllUpdates(itemSHL.id);
                        if (allUpdates?.length) {
                          //Create a single update from WS to SHL by joining all update bodies
                          const combined = allUpdates?.data?.map((u) => u?.body || '');
                          if (combined?.length) {
                            const combinedUpdates = combined.join('<br>========<br>');
                            await BlabMondayService.CreateUpdate(createdItemID, combinedUpdates);
                          }
                        }
                        result = { msg: `Created Family SHL Item: ${createdItemID}|${itemFD.name}` };
                      } else {
                        Logger.log(`Create Family SHL Item failed: ${newestFamilySHLBoardId}|${itemFD.name}`);
                        result = { msg: `Create Family SHL Item failed: ${newestFamilySHLBoardId}|${itemFD.name}` };
                      }
                    } else {
                      Logger.log(`Family SHL Board ID is missing on FD after update: ${itemFD.id}|${itemFD.name}`);
                      result = { msg: `Family SHL Board ID is missing on FD after update: ${itemFD.id}|${itemFD.name}` };
                    }
                  } else {
                    Logger.log(`Family SHL Board not found by ID from FD: ${familySHLBoardId}|${itemFD.name}`);
                    //duplicate board
                    const duplicateBoardId = await BlabMondayService.duplicateBoardWithStructure(familySHLBoardId, `${itemFD.name} - ${accountId}`, true);
                    if (duplicateBoardId) {
                      Logger.log(`Duplicated Family SHL Board: ${duplicateBoardId}|${itemFD.name} - ${accountId}`);
                      // Cập nhật lại link trên FD
                      const rs = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.FD, itemFD.id, {
                        [ConstColumn.FD.FamilySHLBoardId]: duplicateBoardId,
                        [ConstColumn.FD.FamilySHLBoardLink]: {
                          url: `https://tutoringclub-stjohns.monday.com/boards/${duplicateBoardId}`,
                          text: `${itemFD.name} - ${accountId}`,
                        },
                      });
                      Logger.log(`Updated Family SHL Board ID & Link on FD: ${rs?.data?.change_multiple_column_values?.id}|${itemFD.name} - ${accountId}`);

                      const newestItemFD = await BlabMondayService.GetItemById(itemFD.id);
                      const newestFamilySHLBoardId = this.getColumnValuesById(newestItemFD, ConstColumn.FD.FamilySHLBoardId, 0);
                      if (newestFamilySHLBoardId) {
                        const familySHLItemValues = {
                          dropdown__1: tutorsAssigned ?? null,
                          date4: date ?? null,
                          status30: attendance ?? null,
                          status: session ?? null,
                          status7: center ?? null,
                          numbers3: hoursRemaining ?? null,
                          numbers: adjustmentSession ?? null,
                          text7: accountId ?? null,
                          text1: studentId ?? null,
                          status4: subject ?? null,
                          dropdown1: grade ?? null,
                          status1: weekday ?? null,
                          text2: adjustmentExplanation ?? null,
                          status9: countedForInvoice ?? null,
                          numbers72: sessionNumber ?? null,
                          text4: sessionID ?? null,
                          text: studentName ?? null,
                          status__1: exportToFamilyGDrive ?? null,
                        };
                        const createdItemID = await BlabMondayService.CreateItemWithValues(newestFamilySHLBoardId, name, familySHLItemValues);
                        if (createdItemID) {
                          Logger.log(`Created Family SHL Item: ${createdItemID}|${itemFD.name}`);
                          await BlabMondayService.ChangeSimpleColumnValue(BoardConstants.SHL, pulseId, ConstColumn.SHL.FamilySHLItemId, createdItemID);
                          const allUpdates = await BlabMondayService.getAllUpdates(itemSHL.id);
                          if (allUpdates?.length) {
                            //Create a single update from WS to SHL by joining all update bodies
                            const combined = allUpdates?.data?.map((u) => u?.body || '');
                            if (combined?.length) {
                              const combinedUpdates = combined.join('<br>========<br>');
                              await BlabMondayService.CreateUpdate(createdItemID, combinedUpdates);
                            }
                          }
                          result = { msg: `Created Family SHL Item: ${createdItemID}|${itemFD.name}` };
                        } else {
                          Logger.log(`Create Family SHL Item failed: ${newestFamilySHLBoardId}|${itemFD.name}`);
                          result = { msg: `Create Family SHL Item failed: ${newestFamilySHLBoardId}|${itemFD.name}` };
                        }
                      } else {
                        Logger.log(`Family SHL Board ID is missing on FD after update: ${itemFD.id}|${itemFD.name}`);
                        result = { msg: `Family SHL Board ID is missing on FD after update: ${itemFD.id}|${itemFD.name}` };
                      }
                    } else {
                      Logger.log(`Duplicated Family SHL Board failed: ${familySHLBoardId}|${itemFD.name}`);
                      result = { msg: `Duplicated Family SHL Board failed: ${familySHLBoardId}|${itemFD.name}` };
                    }
                  }
                } else {
                  Logger.log(`Family SHL Board ID is missing on FD: ${accountId}|${itemFD.name}`);
                  result = { msg: `Family SHL Board ID is missing on FD: ${accountId}|${itemFD.name}` };
                }
              } else {
                Logger.log(`Item FD not found by Account ID: ${accountId}`);
                result = { msg: `Item FD not found by Account ID: ${accountId}` };
              }
            } else {
              Logger.log(`Account ID is missing ${pulseId}|${name}`);
              result = { msg: `Account ID is missing ${pulseId}|${name}` };
            }
          }
        } else {
          Logger.log(`Item SHL not found by Pulse ID: ${pulseId}`);
          result = { msg: ConstMessage.ItemNotFound.replace('{0}', pulseId) };
        }
      } else {
        result = { msg: ConstMessage.PulseIdNull };
      }
      await BlabMondayService.ChangeSimpleColumnValue(BoardConstants.SHL, pulseId, ConstColumn.SHL.ManualTrigger, Constants.Done);
      await LogService.DoneLog({ dbData, result: result });
    } catch (error) {
      if (!isAutomation)
        await LogService.ExceptionLog({
          dbData,
          error,
          message: `======${EventName.AddFamilySHL} ${pulseId} Exception=======`,
        });
      throw error;
    } finally {
      Logger.log(`======END ${EventName.AddFamilySHL} ${pulseId}=======`);
    }
  }

  private static getColumnValuesById(source, id, getValueType = 0) {
    const rs = source?.column_values?.filter((s) => s.id === id)?.[0];
    return (getValueType === 0 ? rs?.text || null : getValueType === 1 ? rs?.value || null : getValueType === 2 ? rs?.display_value || null : null) || null;
  }
}
