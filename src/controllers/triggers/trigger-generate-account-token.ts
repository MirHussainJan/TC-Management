import * as actGenerateAccountToken from '../actions/act-generate-account-token';
import logger                       from '../../helper/logger';
import AccountTokenModel            from '../../db/models/account-token.model';

export async function generateAccountToken(req, res) {
  const { challenge, event } = req.body;
  const accountId            = req?.query?.accountId;
  const generateAll          = req?.query?.generateAll;

  try {
    if (challenge) return res.status(200).send({ challenge });

    const { status, message } = await actGenerateAccountToken.generateAccountToken({
      accountId    : accountId || '',
      event        : event || {},
      isGenerateAll: generateAll,
    });
    return res.status(status).send({ message });
  } catch (e) {
    logger.log(`There was an unexpected system error [generateAccountToken]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}

export async function validateAccountToken(req, res, nex) {
  try {
    const { accountId, qToken } = req.authenUser;

    const db: any = await AccountTokenModel.findOne({ raw: true, where: { account_id: accountId, token: qToken } });
    if (db?.id) {
      return res.status(200).send({ status: true, message: db });
    } else {
      return res.status(500).send({ status: false, message: `Invalid account ${accountId}` });
    }
  } catch (err) {
    res
      .status(401)
      .json({ error: `Error [validateAccountToken]: ${err}` });
  }

}
