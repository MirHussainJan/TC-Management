import { Constants } from '../../constants/constant';
import logger from '../../helper/logger';
import TutorAvailableMasterService from '../../services/tutors-availability-master/tutor-available-master.service';

export async function RefreshTutorCount(event) {
  try {
    await TutorAvailableMasterService.RefreshTutorCount(event);
    return { status: 200, message: Constants.Done };
  } catch (error) {
    logger.log(`There was an unexpected system error [RefreshTutorCount]: ${error}`);
    return { status: 500, message: 'Internal server error' };
  }
}
