export default class AutomationDataModel {
  event_id: string;
  event_status: boolean  = true;
  event_message?: string = '';
  itemId       ?: number;
  event_data       ?: any;
  event_last_step?: number[];
  event_last_step_data?: any;
}
