import TCC10SMSClicksendSend from '../../services/tcc/tcc10-sms-clicksend-send';

export async function tcc10SMSClicksendSend(req, res, next) {
  const { challenge, event } = req.body;
  try {
    if (challenge) return res.status(200).send({ challenge });

    await TCC10SMSClicksendSend.tcc10SMSClicksendSend(event);
    return res.status(200).send(req.body);
  } catch (error) {
    next(error);
  }
}
