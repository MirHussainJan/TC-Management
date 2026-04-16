import { Constants } from '../../constants/constant';
import logger from '../../helper/logger';
import BlabMondayService from '../../services/blab-monday.service';
import * as _ from 'lodash';

export async function move(req, res, next) {
  try {
    const rules = [
      {
        column_id: 'text__1',
        compare_value: ['undefined'],
        operator: 'any_of',
      },
      {
        column_id: 'text7',
        compare_value: [null],
        operator: 'is_not_empty',
      },
      {
        column_id: 'name',
        compare_value: ['SIDE WORK'],
        operator: 'not_contains_text',
      },
    ];
    // const boardId = 7094024843;
    // const boards = [6409189141, 6409190203, 6409192628, 6409192947, 6409193277, 6409194131, 6409194872, 6409195706];
    const boards = [
      3617141983, 7094024843, 5562294065, 6697276417, 6409189141, 6409190203, 6409192628, 6409192947, 6409193277, 6409194131, 6409194872, 6409195706,
    ];
    for (let j = 0; j < boards.length; j++) {
      const boardId = boards[j];
      // let isNextBoard = false;
      // while (!isNextBoard) {
      const boardInfo = await BlabMondayService.getBoardItems(boardId, rules, ['is_not_empty', 'any_of', 'not_contains_text']);
      console.log(boardInfo?.length);
      for (let i = 0; i < boardInfo?.length; i++) {
        const element = boardInfo[i];
        // console.log(`item ${i} - ${element.id} - ${element.name}`);
        console.log(`item ${i} - ${element.id} - ${element.name}`);
        const column_values = element?.column_values;
        const dropdown__1 = column_values?.filter((s) => s.id === 'people')?.[0]?.text;
        const dropdown1 = column_values?.filter((s) => s.id === 'dropdown1')?.[0]?.text;
        const date4 = column_values?.filter((s) => s.id === 'date4')?.[0]?.text;
        const status30 = column_values?.filter((s) => s.id === 'status30')?.[0]?.text;
        const status = column_values?.filter((s) => s.id === 'status')?.[0]?.text;
        const status7 = column_values?.filter((s) => s.id === 'status7')?.[0]?.text;
        const numbers3 = column_values?.filter((s) => s.id === 'numbers3')?.[0]?.text;
        const numbers = column_values?.filter((s) => s.id === 'numbers')?.[0]?.text;
        const text7 = column_values?.filter((s) => s.id === 'text7')?.[0]?.text;
        const text1 = column_values?.filter((s) => s.id === 'text1')?.[0]?.text;
        const status4 = column_values?.filter((s) => s.id === 'status4')?.[0]?.text;
        const status1 = column_values?.filter((s) => s.id === 'status1')?.[0]?.text;
        const text2 = column_values?.filter((s) => s.id === 'text2')?.[0]?.text;
        const status9 = column_values?.filter((s) => s.id === 'status9')?.[0]?.text;
        const status55 = column_values?.filter((s) => s.id === 'status55')?.[0]?.text;
        const numbers72 = column_values?.filter((s) => s.id === 'numbers72')?.[0]?.text;
        const text4 = column_values?.filter((s) => s.id === 'text4')?.[0]?.text;
        const text = column_values?.filter((s) => s.id === 'text')?.[0]?.text;
        const status8 = column_values?.filter((s) => s.id === 'status8')?.[0]?.text;
        const status__1 = column_values?.filter((s) => s.id === 'status__1')?.[0]?.text;
        const searchFD = await BlabMondayService.GetItemsPageByColumnValues(3183366173, [{ column_id: `text8`, column_values: text7 }], ['text9__1']);
        if (!searchFD?.length) {
          console.log(`item ${i} - ${element.id} - ${element.name} - no FD`);
          BlabMondayService.ChangeSimpleColumnValue(boardId, element.id, 'status2__1', 'No');
          continue;
        } else {
          const familySHL = searchFD?.[0]?.column_values?.[0]?.text;
          if (familySHL?.length) {
            const columns = {
              dropdown__1: dropdown__1,
              date4: date4,
              status30: status30,
              status: status,
              status7: status7,
              numbers3: numbers3,
              numbers: numbers,
              text7: text7,
              text1: text1,
              status4: status4,
              dropdown1: dropdown1,
              status1: status1,
              text2: text2,
              status9: status9,
              numbers72: numbers72,
              text4: text4,
              text: text,
              status__1: status__1,
            };
            const createdItemId = await BlabMondayService.CreateItemWithValues(familySHL, element.name, columns);
            BlabMondayService.ChangeSimpleColumnValue(boardId, element.id, 'text__1', createdItemId);
            console.log(`item ${i} - ${element.id} - ${element.name} - created: ${createdItemId}`);
          }
        }
      }
      // if (boardInfo?.length < 3000) isNextBoard = true;
      // }
    }

    return { status: 200, message: Constants.Done };
  } catch (error) {
    logger.log(`There was an unexpected system error [move]: ${error}`);
    console.error(`There was an unexpected system error [move]: ${error}`);
    return { status: 500, message: 'Internal server error' };
  }
}
