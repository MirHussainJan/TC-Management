import logger from '../../helper/logger';
import * as actTAM from '../actions/act-tutor-available-master';

export async function RefreshTutorCount(req, res) {
  const { challenge, event } = req.body;

  try {
    if (challenge) return res.status(200).send({ challenge });

    if (event) {
      const { status, message } = await actTAM.RefreshTutorCount(event);
      return res.status(status).send({ message });
    }
  } catch (e) {
    logger.log(`There was an unexpected system error [UpdateTutorOff]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}
