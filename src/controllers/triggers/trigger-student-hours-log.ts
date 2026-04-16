import logger from '../../helper/logger';
import CommonService from '../../services/common-service';
import * as ActStudentHoursLog from '../actions/act-student-hours-log';

//When item created Student Hours Log
export async function DeductHours(req, res) {
  const { challenge, event } = req.body;

  try {
    if (challenge) return res.status(200).send({ challenge });

    if (event) {
      setTimeout(async () => {
        const { status, message } = await ActStudentHoursLog.DeductHours(event);
      }, 40000);
    }
    return res.status(200).send(req.body);
  } catch (e) {
    logger.log(`There was an unexpected system error [DeductHours]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}

export async function AuditedRemainingHour(req, res) {
  const { challenge, event } = req.body;

  try {
    if (challenge) return res.status(200).send({ challenge });

    if (event) {
      const { status, message } = await ActStudentHoursLog.AuditedRemainingHour(event);
      return res.status(status).send({ message });
    }
    return res.status(200).send();
  } catch (e) {
    logger.log(`There was an unexpected system error [AuditedRemainingHour]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}

export async function AddFromWS(req, res) {
  const { challenge, event } = req.body;

  try {
    if (challenge) return res.status(200).send({ challenge });

    if (event) {
      const { status, message } = await ActStudentHoursLog.AddFromWS(event);
    }
    return res.status(200).send(req.body);
  } catch (e) {
    logger.log(`There was an unexpected system error [AddFromWS]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}

//When item created Student Hours Log
export async function AddFamilySHL(req, res) {
  const { challenge, event } = req.body;

  try {
    if (challenge) return res.status(200).send({ challenge });

    if (event) {
      const { status, message } = await ActStudentHoursLog.AddFamilySHL(event);
    }
    return res.status(200).send(req.body);
  } catch (e) {
    logger.log(`There was an unexpected system error [DeductHours]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}
