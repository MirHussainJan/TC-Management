import { Constants } from '../../constants/constant';
import logger from '../../helper/logger';
import MWSService from '../../services/ms-to-ws/mws.service';

export async function MWS34MSToWSSync(req, res, next) {
  const { challenge, event } = req.body;
  try {
    if (challenge) return res.status(200).send({ challenge });

    setTimeout(async () => {
      await MWSService.MWS34MSToWSSync(event);
    }, 10000);
    return res.status(200).send(req.body);
  } catch (error) {
    next(error);
  }
}
