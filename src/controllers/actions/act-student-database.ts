import { Constants }          from '../../constants/constant';
import logger                 from '../../helper/logger';
import StudentDatabaseService from '../../services/student-database/student-database.service';

export async function NextSession() {
  try {
    await StudentDatabaseService.NextSession();
    return { status: 200, message: Constants.Done };
  } catch (error) {
    logger.log(`There was an unexpected system error [UpdateTutorOff]: ${error}`);
    return { status: 500, message: 'Internal server error' };
  }
}
