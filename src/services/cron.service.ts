import { EventName }            from '../constants/constant';
import AutomationDataModel      from '../db/models/automation-data.model';
import AppLogModel              from '../db/models/monday-app-log';
import Logger                   from '../helper/logger';
import RefreshTutorCountService from './tutors-availability-master/refresh-tutor-count.service';
import WSUpdateTutorOffService  from './weekly-scheduling/ws-update-tutor-off.service';
import SHLDeductHoursService    from './student-hours-log/shl-deduct-hours.service';
import QueueService             from './queue.service';
import { AppBaseService }       from './AppBaseService.service';
import { QueueName }            from '../constants/constant-queue';
import StudentDatabaseService   from './student-database/student-database.service';
import BoardAppLogModel         from '../db/models/monday-board-app-log';
import CommonService            from './common-service';
import BlabMondayService        from './blab-monday.service';

class CronService extends AppBaseService {

  static async checkBoardAppLog() {
    Logger.log(`======START CRON JOB checkBoardAppLog======`);
    console.log(`======START CRON JOB checkBoardAppLog======`);
    try {
      const currentBoardAppLogId = await CommonService.getBoardAppLogId();
      const itemCount            = await BlabMondayService.getBoardItemsCount(currentBoardAppLogId);
      Logger.log(`======Items count: ${itemCount}======`);
      console.log(`======Items count: ${itemCount}======`);
      const usingBoardId = await CommonService.checkBoardAppLogLimit(currentBoardAppLogId);
      let msg            = usingBoardId == currentBoardAppLogId ? `======No need to create new board======` : `======New Board App Log ID: ${usingBoardId}======`;
      Logger.log(msg);
      console.log(msg);
    } catch (error) {
      Logger.log(`======Cron job checkBoardAppLog Exception=======\n\r${error}`);
    } finally {
      Logger.log(`======FINISH CRON JOB checkBoardAppLog======`);
      console.log(`======FINISH CRON JOB checkBoardAppLog======`);
    }
  }

  static async CheckAppLog() {
    Logger.log(`======START CRON JOB CheckAppLog======`);
    console.log(`======START CRON JOB CheckAppLog======`);
    let event_name = '';
    try {
      const appLogs = await AppLogModel.findAll({
        raw  : true,
        where: {
          event_status: false,
        },
      });
      if (appLogs?.length) {
        Logger.log(`======CRON Found: ${appLogs?.length} errors======`);
        console.log(`======CRON Found: ${appLogs?.length} errors======`);
        Logger.log(`======RUNNING======`);
        console.log(`======RUNNING======`);
        for (let i = 0; i < appLogs.length; i++) {
          const errorLog: any = appLogs[i];
          if (errorLog?.event_id && errorLog?.event_data) {
            const dbData: AutomationDataModel = {
              event_id            : errorLog.event_id,
              event_status        : errorLog.event_status,
              event_message       : errorLog.event_message,
              itemId              : errorLog.monday_item_id,
              event_last_step     : errorLog.event_last_step,
              event_last_step_data: errorLog.event_last_step_data,
            };
            switch (errorLog.event_name) {
              case EventName.TutorCount:
                event_name = EventName.TutorCount;
                RefreshTutorCountService.RefreshTutorCount(errorLog.event_data, true, dbData);
                break;
              case EventName.NewWSTutorOff:
                event_name = EventName.NewWSTutorOff;
                WSUpdateTutorOffService.UpdateTutorOff(errorLog.event_data, true, dbData);
                break;
              case EventName.DeductHours:
                event_name = EventName.DeductHours;
                this.start(QueueName.SHLDeductHoursAuto);
                await QueueService.SendQueue(QueueName.SHLDeductHoursAuto, { eventData: errorLog.event_data, dbData });
                // SHLDeductHoursService.DeductHours(errorLog.event_data, true, dbData);
                break;
              case EventName.AuditedRemainingHour:
                event_name = EventName.AuditedRemainingHour;
                this.start(QueueName.SHLAuditedRemainingHourAuto);
                await QueueService.SendQueue(QueueName.SHLAuditedRemainingHourAuto, {
                  eventData: errorLog.event_data,
                  dbData,
                });
                break;
            }
          }
        }

        Logger.log(`======COMPLETED======`);
        console.log(`======COMPLETED======`);
      } else {
        Logger.log(`======CRON Found: ${appLogs?.length} errors======`);
        console.log(`======CRON Found: ${appLogs?.length} errors======`);
      }
    } catch (error) {
      Logger.log(`======Cron job ${event_name} Exception=======\n\r${error}`);
    } finally {
      Logger.log(`======FINISH CRON JOB CheckAppLog======`);
      console.log(`======FINISH CRON JOB CheckAppLog======`);
    }
  }

  static async RunOn10PMEST() {
    StudentDatabaseService.NextSession();
  }
}

export default CronService;
