import axios                 from 'axios';
import ForwardWebhookService from '../../services/forward-webhook.service';

export async function forwardWebhook(req, res) {
  try {
    await ForwardWebhookService.ForwardWebhook({ destinationURL: req?.body?.destinationURL, event: req?.body?.event });
    return res.status(200).send({ result: true, message: `Sent` });
  } catch (error) {
    return res.status(500).send({ result: false, message: `Exception: ${error}` });
  }
}
