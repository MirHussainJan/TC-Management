import { Constants } from '../../constants/constant';
import logger from '../../helper/logger';
import WeeklySchedulingService from '../../services/weekly-scheduling/weekly-scheduling.service';

export async function UpdateTutorOff(event) {
  try {
    await WeeklySchedulingService.UpdateTutorOff(event);
    return { status: 200, message: Constants.Done };
  } catch (error) {
    logger.log(`There was an unexpected system error [UpdateTutorOff]: ${error}`);
    return { status: 500, message: 'Internal server error' };
  }
}
