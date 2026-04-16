import SDNextSessionService from './sd-next-session.service';
import logger               from '../../helper/logger';

export default class StudentDatabaseService {
  static async NextSession() {
    try {
      const isHoliday = await SDNextSessionService.PreRun();
      if (!isHoliday) {
        SDNextSessionService.Run();
      }
    } catch (error) {
      logger.log(`There was an unexpected system error [NextSession]: ${error}`);
      throw error;
    }
  }
}
