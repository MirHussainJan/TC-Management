import AppLogModel from '../db/models/monday-app-log';

class DatabaseService {
  static async UpdateAppLog(uid, status, lastStep, lastStepData, message = '') {
    await AppLogModel.update(
      {
        event_status        : status,
        event_message       : message,
        event_last_step     : lastStep,
        event_last_step_data: lastStepData,
      },
      {
        where: {
          event_id: uid,
        },
      },
    );
  }
}

export default DatabaseService;
