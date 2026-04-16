import logger from '../../helper/logger';
import CommonService from '../../services/common-service';
import * as ActNewSessionWS from '../actions/act-new-session-ws';

export async function UpdateTutorOff(req, res) {
  const { challenge, event } = req.body;

  try {
    if (challenge) return res.status(200).send({ challenge });

    if (event) {
      setTimeout(async () => {
        const { status, message } = await ActNewSessionWS.UpdateTutorOff(event);
      }, 60000);
    }
    return res.status(200).send(req.body);
  } catch (e) {
    logger.log(`There was an unexpected system error [UpdateTutorOff]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}
