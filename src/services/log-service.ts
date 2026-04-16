import { Constants }       from '../constants/constant';
import ConstMessage        from '../constants/constant-message';
import AppLogModel         from '../db/models/monday-app-log';
import Logger              from '../helper/logger';
import CommonService       from './common-service';
import DatabaseService     from './database-service';
import AutomationDataModel from '../db/models/automation-data.model';

class LogService {
  static async StartLog(logData) {
    const { board_id, item_id, item_name, board_name, event_name, event_data, monday_item_id } = logData;

    Logger.log(`======${event_name} ${item_id}|${item_name}=======`);

    const mondayItemId     = await CommonService.createMondayAppLog(logData);
    logData.monday_item_id = mondayItemId;

    const rsAppLog = await AppLogModel.create(logData);
    const appLogId = rsAppLog?.getDataValue('event_id');

    let mondayLog: AutomationDataModel = {
      event_id    : appLogId,
      event_status: true,
      itemId      : mondayItemId,
      event_message: '',
    };
    Logger.log(`Log Monday Id: ${mondayItemId}\n\rApp Log Id: ${appLogId}`);

    return { mondayItemId, appLogId, mondayLog };
  }

  static async Log(data) {
    const { message, dbData } = data;
    Logger.log(`===${message}===`);
    dbData.event_message = message;

    await CommonService.updateMondayAppLog(dbData);
    await DatabaseService.UpdateAppLog(dbData.event_id, true, dbData.event_last_step, dbData.event_last_step_data, message);
  }

  static async DoneLog(data) {
    const { dbData, result } = data;
    if (result?.errors?.length) {
      Logger.log(result.errors[0]?.message);
      dbData.event_message = result.errors[0]?.message;
      dbData.event_status  = false;
      await CommonService.updateMondayAppLog(dbData);
      await DatabaseService.UpdateAppLog(dbData.event_id, false, dbData.event_last_step, dbData.event_last_step_data, dbData.event_message);
    } else if (result?.error_message?.length) {
      Logger.log(result.error_message);
      dbData.event_message = result.error_message;
      dbData.event_status  = false;
      await CommonService.updateMondayAppLog(dbData);
      await DatabaseService.UpdateAppLog(dbData.event_id, false, dbData.event_last_step, dbData.event_last_step_data, dbData.event_message);
    } else {
      Logger.log(`===DONE===`);
      const msg            = result?.msg?.length ? result.msg : Constants.Done;
      dbData.event_message = msg;
      dbData.event_status  = true;
      await CommonService.updateMondayAppLog(dbData);
      await DatabaseService.UpdateAppLog(dbData.event_id, true, dbData.event_last_step, dbData.event_last_step_data, msg);
    }
  }

  static async ExceptionLog(data) {
    const { dbData, error, message } = data;
    if (dbData) {
      dbData.event_status  = false;
      dbData.event_message = ConstMessage.Exception + error;
      await CommonService.updateMondayAppLog(dbData);
      await DatabaseService.UpdateAppLog(dbData.event_id, false, dbData.event_last_step, dbData.event_last_step_data, ConstMessage.Exception + error);
      Logger.log(`======${message} Exception=======`);
    }
  }

  static async SubitemErrorLog(data) {
    const { result, logSubitemEror, mondayItemId, message } = data;
    let parentItem                                          = { isSubitem: true, parentId: mondayItemId };
    if (result?.errors?.length) {
      Logger.log(message);
      logSubitemEror.event_message  = result.errors[0]?.message;
      const subId                   = await CommonService.createMondayAppLog(logSubitemEror, parentItem);
      logSubitemEror.monday_item_id = subId;
      await AppLogModel.create(logSubitemEror);
    } else if (result?.error_message?.length) {
      Logger.log(message);
      logSubitemEror.event_message  = result.error_message;
      const subId                   = await CommonService.createMondayAppLog(logSubitemEror, parentItem);
      logSubitemEror.monday_item_id = subId;
      await AppLogModel.create(logSubitemEror);
    }
  }
}

export default LogService;
