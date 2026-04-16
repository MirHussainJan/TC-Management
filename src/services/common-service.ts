import _                                        from 'lodash';
import { BoardConstants, BoardList, Constants } from '../constants/constant';
import dotenv                                   from 'dotenv';
import AutomationDataModel                      from '../db/models/automation-data.model';
import BlabMondayService                        from './blab-monday.service';
import AppLogModel                              from '../db/models/monday-app-log';
import BoardAppLogModel                         from '../db/models/monday-board-app-log';
import axios                                    from 'axios';

dotenv.config();

class CommonService {
  static sessionToNumber(session) {
    return _.includes(session, ':') ? _.parseInt(_.replace(session, ':', '.')) : 0;
  }

  static getBoardName(boardId): string {
    return _.find(BoardList, (s) => s.boardId === boardId)?.boardName;
  }

  static async createMondayAppLog(data, subitem = { isSubitem: false, parentId: 0 }): Promise<number> {
    const { board_id, item_id, item_name, board_name, event_name, event_data } = data;
    const { isSubitem, parentId } = subitem;
    // const queryCreate = isSubitem ? ConstQuery.CreateSubitemWithValues : ConstQuery.CreateItemWithValues;
    // const itemId = isSubitem ? parentId : item_id;
    const columnValue: any = !isSubitem
      ? {
          board_id: _.toString(board_id),
          text2: board_name,
          item_id: _.toString(item_id),
          text20: item_name,
          text5: event_name,
          long_text: JSON.stringify(event_data),
          parent_item_id: parentId,
        }
      : {
          board_id: _.toString(board_id),
          text9: board_name,
          item_id: _.toString(item_id),
          text4: item_name,
          text_1: event_name,
          long_text: JSON.stringify(event_data),
        };
    // const query = await this.replaceQuery(queryCreate, BoardConstants.MondayAppLog, '', JSON.stringify(JSON.stringify(columnValue)), itemId, '', item_name);

    const currentBoardAppLogId = await this.getBoardAppLogId();
    const usingBoardId = await this.checkBoardAppLogLimit(currentBoardAppLogId);
    const result = isSubitem
      ? await BlabMondayService.CreateSubitemWithValues(parentId, item_name, columnValue)
      : await BlabMondayService.CreateItemWithValues(usingBoardId, item_name, columnValue);

    return result ? _.parseInt(result) : 0;
  }

  static async updateMondayAppLog(data: AutomationDataModel) {
    // const { event_id, event_status, itemId, event_message } = data;
    let columnValue: any = {
      text: data.event_id,
      status_1: data.event_status ? Constants.Done : Constants.Error,
      text0: data.event_message,
    };
    if (data?.event_data) {
      columnValue.long_text = JSON.stringify(data?.event_data);
    }
    // const query = await this.replaceQuery(
    //   ConstQuery.ChangeMultipleColumnValues,
    //   BoardConstants.MondayAppLog,
    //   '',
    //   JSON.stringify(JSON.stringify(columnValue)),
    //   data.itemId,
    // );
    //
    // const result = await this.post(query);

    const currentBoardAppLogId = await this.getBoardAppLogId();

    const result = await BlabMondayService.ChangeMultipleColumnValues(currentBoardAppLogId, data.itemId, columnValue);

    return result;
  }

  static async getUserIdFromPeopleColumn(columnValues) {
    if (columnValues?.value?.length && columnValues?.value !== '{}') {
      const tutorJson = JSON.parse(columnValues.value);
      if (tutorJson?.personsAndTeams?.length) {
        return _.map(tutorJson.personsAndTeams, (s) => s.id);
      }
    }
    return [];
  }

  static async getBoardListGroups(boardId, specificGroup: any[] = []) {
    // const queryListGroup = await CommonService.replaceQuery(ConstQuery.GetListGroups, boardId, '', '', 0, '', '', `(ids: [${specificGroup}])`);
    // const listGroup = await CommonService.post(queryListGroup);

    const listGroup = await BlabMondayService.GetBoardListGroup(boardId, specificGroup);

    // if (listGroup?.data?.boards?.[0]?.groups?.length) {
    //   if (specificGroup.length) {
    //     return _.find(listGroup.data.boards[0].groups, (s) => s.id === specificGroup);
    //   }
    // }

    return listGroup?.data?.boards?.[0]?.groups;
  }

  static async getBoardAppLogId() {
    const appLogs: any = await BoardAppLogModel.findOne({
      raw: true,
      where: {
        board_active: true,
      },
    });
    return appLogs?.board_id;
  }

  static async checkBoardAppLogLimit(currentBoardAppLogId) {
    let boardId = currentBoardAppLogId;
    const rs = await BlabMondayService.getBoardItemsCount(currentBoardAppLogId);
    if (rs >= 9950) {
      boardId = await this.duplicateBoard(currentBoardAppLogId);
      if (boardId > 0 && boardId != currentBoardAppLogId) {
        await BoardAppLogModel.update(
          {
            board_id: boardId,
            old_board_id: currentBoardAppLogId,
          },
          {
            where: {
              board_id: currentBoardAppLogId,
            },
          },
        );
      }
    }
    return boardId;
  }

  static async duplicateBoard(currentBoardAppLogId) {
    const rs = await BlabMondayService.duplicateBoard(currentBoardAppLogId);
    if (rs > 0) {
      await BlabMondayService.renameBoard(currentBoardAppLogId);
    }
    return rs;
  }

  static async postTo(url: string, data: {}) {
    try {
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response?.data?.shortLink;
    } catch (error) {
      throw error;
    }
  }
}

export default CommonService;
