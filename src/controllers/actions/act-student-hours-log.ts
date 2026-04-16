import { Constants } from '../../constants/constant';
import logger from '../../helper/logger';
import StudentHoursLogService from '../../services/student-hours-log/student-hours-log.service';

export async function AddFromWS(event) {
  try {
    await StudentHoursLogService.AddFromWS(event);
    return { status: 200, message: Constants.Done };
  } catch (error) {
    logger.log(`There was an unexpected system error [AddFromWS]: ${error}`);
    return { status: 500, message: 'Internal server error' };
  }
}

export async function DeductHours(event) {
  try {
    await StudentHoursLogService.DeductHours(event);
    return { status: 200, message: Constants.Done };
  } catch (error) {
    logger.log(`There was an unexpected system error [DeductHours]: ${error}`);
    return { status: 500, message: 'Internal server error' };
  }
}

export async function AuditedRemainingHour(event) {
  try {
    await StudentHoursLogService.AuditedRemainingHour(event);
    return { status: 200, message: Constants.Done };
  } catch (error) {
    logger.log(`There was an unexpected system error [AuditedRemainingHour]: ${error}`);
    return { status: 500, message: 'Internal server error' };
  }
}

export async function AddFamilySHL(event) {
  try {
    await StudentHoursLogService.AddFamilySHL(event);
    return { status: 200, message: Constants.Done };
  } catch (error) {
    logger.log(`There was an unexpected system error [AddFamilySHL]: ${error}`);
    return { status: 500, message: 'Internal server error' };
  }
}
