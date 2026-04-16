export default class MondayAppLogModel{
    event_id: string;
    board_id: number;
    item_id?: number;
    item_name?: string;
    board_name?: string;
    event_name: string;
    event_status: boolean;
    event_message?: string;
    event_data?: string;
    parent_event_id?: number;
    parent_item_id?: number;
    monday_item_id?: number;
}