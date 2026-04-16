import { AppBaseService } from './AppBaseService.service';
import * as _ from 'lodash';

//Using monday.com api 2023-10
class BlabMondayService extends AppBaseService {
  static async GetItemById(itemId, specificColumn: any[] = [], getArray: boolean = false, getItemUpdate = false, getSubitem = false) {
    let column_values = `column_values(ids:){
            id
            type
            text
            value
        }`;
    let update = getItemUpdate ? 'updates(limit:1){ body updated_at assets{ public_url name } }' : '';
    let subitem = getSubitem ? `` : '';
    // column_values = specificColumn?.length ? column_values.replace('(ids:)', `(ids:${specificColumn.join(',')})`) : column_values.replace('(ids:)', '');
    const query = `query{
            items(ids: ${itemId}){
                id
                name
                board{id}
                ${update}
                column_values(ids: ${JSON.stringify(specificColumn)}){
                    id
                    type
                    text
                    value
                    ... on MirrorValue{
                      display_value
                    }
                }
    					subitems{
                id
                name
                board{id}
                column_values{
                    id
                    type
                    text
                    value
                    ... on MirrorValue{
                      display_value
                    }
                }
              }
            }
        }`;
    const rs = await this.post(query);
    return getArray ? rs?.data?.items : rs?.data?.items?.[0];
  }

  static async GetItemsPageByColumnValues(boardId: number, columns: any, specificColumn: any = [], cursor: any = null, items: any = [], getSubitem = false) {
    const subitem = `subitems{
      id
      name
      column_values{
        id
        text
        value
        ... on MirrorValue {
          display_value
        }
      }
    }`;
    let query = !cursor?.length
      ? `{
      items_page_by_column_values(
        board_id: ${boardId}
        limit: 500
        columns: ${JSON.stringify(columns)}
      ) {
        cursor
        items {
          id
          name
        group{
        id
        title
        }
          column_values(ids: ${JSON.stringify(specificColumn)}) {
            id
            type
            text
            value
            ... on MirrorValue {
              display_value
            }
          }
          ${getSubitem ? subitem : ''}
        }
      }
    }`
      : `{next_items_page(limit:500, cursor: "${cursor}") {
      cursor
      items {
        id
        name
        group{
        id
        title
        }
        column_values(ids: ${JSON.stringify(specificColumn)}) {
          id
          type
          text
          value
          ... on MirrorValue {
            display_value
          }
        }
        ${getSubitem ? subitem : ''}
      }
    }}
    `;
    // query = specificColumn?.length ? query.replace('ids:', `ids:${JSON.stringify(specificColumn)}`) : query.replace('(ids:)', '');
    query = query.replace(/"column_id"/g, 'column_id').replace(/"column_values"/g, 'column_values');
    const rs = await this.post(query);

    // items = rs?.data?.items_page_by_column_values?.items?.length
    //   ? items?.length
    //     ? _.concat(items, rs.data.items_page_by_column_values.items)
    //     : rs.data.items_page_by_column_values.items
    //   : items;
    items = cursor
      ? rs?.data?.next_items_page?.items?.length
        ? items?.length
          ? _.concat(items, rs.data?.next_items_page.items)
          : rs.data?.next_items_page.items
        : items
      : rs?.data?.items_page_by_column_values?.items?.length
        ? items?.length
          ? _.concat(items, rs.data?.items_page_by_column_values.items)
          : rs.data?.items_page_by_column_values.items
        : items;
    // if (rs?.data?.items_page_by_column_values?.cursor) await this.GetItemsPageByColumnValues(boardId,
    //   null,
    //   specificColumn,
    //   rs.data.items_page_by_column_values.cursor,
    //   items);

    // return items;
    let _cursor = cursor?.length ? rs?.data?.next_items_page?.cursor : rs?.data?.items_page_by_column_values?.cursor;
    if (_cursor?.length) {
      items = await this.GetItemsPageByColumnValues(boardId, columns, specificColumn, _cursor, items);
    }

    return items;
  }

  static async ChangeSimpleColumnValue(boardId, itemId, columnId, value) {
    const query = `mutation {
      change_simple_column_value(
        board_id: ${boardId}
        item_id: ${itemId}
        column_id: "${columnId}"
        value: "${value}"
        create_labels_if_missing: true
      ) {
        id
      }
    }`;

    const rs = await this.post(query);

    return rs;
  }

  static async ChangeMultipleColumnValues(boardId, itemId, columnValues) {
    const query = `mutation {
      change_multiple_column_values(
        board_id: ${boardId}
        item_id: ${itemId}
        column_values: ${JSON.stringify(JSON.stringify(columnValues))}
        create_labels_if_missing:true
      ) {
        id
      }
    }`;

    const rs = await this.post(query);

    return rs;
  }

  static async CreateItemWithValues(boardId: number, itemName: any, columnValues: any) {
    const query = `mutation {
    create_item (board_id: ${boardId}, item_name: "${itemName?.replaceAll('"', '\\"')}", column_values: ${JSON.stringify(
      JSON.stringify(columnValues),
    )}, create_labels_if_missing: true) {
      id
    }
  }`;
    const rs = await this.post(query);
    return rs?.data?.create_item?.id;
  }

  static async CreateSubitemWithValues(parentItemId: number, subitemName: string, columnValues: any) {
    const query = `mutation {
    create_subitem (parent_item_id: ${parentItemId}, create_labels_if_missing: true, item_name: "${subitemName}", column_values: ${JSON.stringify(JSON.stringify(columnValues))}) {
      id
    }
  }`;
    const rs = await this.post(query);

    return rs?.data?.create_subitem?.id;
  }

  static async GetBoardListGroup(boardId: number, specificGroup: any[] = []) {
    const query = `{
    boards(ids: [${boardId}]) {
      id
      name
      groups(ids: ${JSON.stringify(specificGroup)}) {
        id
        title
      }
    }
  }`;
    const rs = await this.post(query);

    return rs;
  }

  static async GetGroupListItem(boardId: number, specificGroup: any[] = [], columnValues: any[] = []) {
    const query = `{
    boards(ids: [${boardId}]) {
      id
      name
      groups(ids: ${JSON.stringify(specificGroup)}) {
        id
        title
        items_page(
        limit: 500
        ) {
          cursor
          items {
            id
            name
            column_values(ids: ${JSON.stringify(columnValues)}) {
              id
              text
              value
              ...on MirrorValue {
                display_value
              }
            }
              subitems{
      id
      name
      column_values{
        id
        text
        value
        ... on MirrorValue {
          display_value
        }
      }
    }
          }
        }
      }
    }
  }`;
    const rs = await this.post(query);

    return rs?.data?.boards?.[0]?.groups || [];
  }

  static async getBoardItemsCount(boardId: number) {
    const query = `{
  boards(ids: ${Number(boardId)}){
    items_count
  }
}`;
    const rs = await this.post(query);

    return rs?.data.boards?.[0]?.items_count;
  }

  static async duplicateBoard(boardId: number) {
    const boardName = 'App Service Log';
    const query = `mutation{
  duplicate_board(board_id: ${Number(boardId)},duplicate_type: duplicate_board_with_structure, board_name: ${JSON.stringify(boardName)},
    keep_subscribers:true ){
    board{
      id
    }
  }
}`;
    const rs = await this.post(query);
    return rs?.data?.duplicate_board?.board?.id;
  }

  static async renameBoard(boardId: number) {
    const boardName = '[Archive] App Service Log';
    const query = `mutation {
  update_board(
    board_id: ${Number(boardId)}
    board_attribute: name
    new_value: ${JSON.stringify(boardName)}
  )
}`;
    const rs = await this.post(query);

    return rs?.data?.update_board;
  }

  static async getItemsIdOnly(boardId: number, cursor = null, items = []) {
    let query = `{
      boards(ids: ${boardId}) {
        items_page(cursor: ${cursor ? '"' + cursor + '"' : null}, limit: 500) {
          cursor
          items {
            id
          }
        }
      }
    }`;
    const rs = await this.post(query);

    items = rs?.data?.boards?.[0]?.items_page?.items?.length
      ? items?.length
        ? _.union(items, rs?.data?.boards?.[0]?.items_page?.items)
        : rs?.data?.boards?.[0]?.items_page?.items
      : items;
    if (rs?.data?.boards?.[0]?.items_page?.cursor) await this.getItemsIdOnly(boardId, rs?.data?.boards?.[0]?.items_page?.cursor, items);

    return items;
  }

  static async getBoardItems(
    boardId,
    rules: any = [],
    specialValues: any = [],
    specificColumn: any[] = [],
    cursor: any = null,
    items: any = [],
    getSubitem = false,
    specificSubitem: any[] = [],
  ) {
    const subitem = `subitems{
      id
      name
      column_values${specificSubitem?.length ? `(ids: ${JSON.stringify(specificSubitem)})` : ' '}{
        id
        text
        value
        ... on MirrorValue {
          display_value
        }
      }
    }`;
    const query = !cursor?.length
      ? `{
            boards(ids: ${boardId}) {
              items_page(limit:500${rules?.length ? ', query_params: {rules:' + this.stringifyWithoutQuotesInFieldNames(rules, specialValues) + '}' : ''}) {
                cursor
                items {
                  id
                  name
                  group{
                    title
                  }
                  column_values${specificColumn?.length ? `(ids: ${JSON.stringify(specificColumn)})` : ''} {
                    id
                    text
                    type
                    value
                    ... on MirrorValue {
                      display_value
                    }
                  }
                  ${getSubitem ? subitem : ''}
                }
              }
            }
          }`
      : `{
        next_items_page(limit:500${cursor?.length ? `, cursor: "${cursor}"` : ''}) {
          cursor
          items {
            id
            name
            column_values${specificColumn?.length ? `(ids: ${JSON.stringify(specificColumn)})` : ''} {
              id
              text
              type
              value
              ... on MirrorValue {
                display_value
              }
            }
            ${getSubitem ? subitem : ''}
          }
        }
      }
          `;

    const rs = await this.post(query);
    // return rs?.data?.boards?.[0]?.items_page.items;
    items = !cursor?.length
      ? rs?.data?.boards?.[0]?.items_page.items?.length
        ? items?.length
          ? _.concat(items, rs.data.boards[0].items_page.items)
          : rs.data.boards[0].items_page.items
        : items
      : rs?.data?.next_items_page?.items?.length
        ? items?.length
          ? _.concat(items, rs?.data?.next_items_page.items)
          : rs.data.next_items_page.items
        : items;

    let _cursor = cursor?.length ? rs?.data?.next_items_page?.cursor : rs?.data?.boards?.[0]?.items_page?.cursor;
    if (_cursor?.length) {
      items = await this.getBoardItems(boardId, rules, specialValues, specificColumn, _cursor, items, getSubitem, specificSubitem);
    }

    return items;
  }

  static stringifyWithoutQuotesInFieldNames(obj, specialValues = []) {
    let result = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'string') {
        return value.replace(/"/g, '\\"'); // Thay thế tất cả các dấu ngoặc kép trong giá trị bằng dấu ngoặc kép escape (\")
      }
      return value;
    });

    specialValues.forEach((value) => {
      const regex = new RegExp(`"${value}"`, 'g');
      result = result.replace(regex, value);
    });
    // Loại bỏ dấu ngoặc kép từ tên trường (field name)
    result = result.replace(/"([^"]+)":/g, '$1:');

    return result;
  }

  static async getWorkspaceBoards(workspaceId: number) {
    let query = `{
      boards(workspace_ids:${workspaceId}, limit: 1500){
        name
        id
      }
    }`;
    const rs = await this.post(query);

    return rs?.data?.boards;
  }

  static async CreateUpdate(itemId, body) {
    const query = `mutation{
      create_update(item_id: ${itemId},body:"${body}"){
        id
      }
    }`;

    const rs = await this.post(query);

    return rs?.data?.create_update?.id;
  }
  static async getAssetsByUpdateId(updateId) {
    const query = `query{
      updates(ids:${updateId}){
        assets{
          public_url
          name
        }
      }
    }`;
    const rs = await this.post(query);
    return rs?.data?.updates?.[0]?.assets;
  }

  static async getAllUpdates(itemId) {
    const query = `{
  items(ids:${itemId}){
    updates(limit:250){
      body
    }
  }
}`;

    const rs = await this.post(query);

    return rs?.data?.items?.[0]?.updates;
  }

  static async getBoardById(boardId) {
    const query = `{
  boards(ids: ${boardId}) {
    id
    name
  }}`;
    const rs = await this.post(query);
    return rs?.data?.boards?.[0];
  }

  static async duplicateBoardWithStructure(duplicateBoardId, boardName, keepSubscripbers = true) {
    const query = `mutation {
  duplicate_board(
    board_id: ${duplicateBoardId}
    board_name: "${boardName}"
    duplicate_type: duplicate_board_with_structure
    keep_subscribers: ${keepSubscripbers}
  ){
        board{
      id
    }
    }
}`;
    const rs = await this.post(query);
    return rs?.data?.duplicate_board?.board?.id;
  }

  static async GetUsersByEmail(email) {
    const query = `{
      users (emails: ["${email}"]) {
        id
        name
      }
    }`;
    const rs = await this.post(query);
    return rs?.data?.users?.[0];
  }
}

export default BlabMondayService;
