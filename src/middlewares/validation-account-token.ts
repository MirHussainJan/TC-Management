import jwt     from 'jsonwebtoken';
import express from 'express';
// import AppManagementRepository from "../repository/app-management.repository";
declare global {
  namespace Express {
    interface Request {
      authenUser: {
        accountId: string,
        qToken: string,
      };
    }
  }
}
export default async function appValidationMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    console.log(req.headers);

    // const { accountId, token } = req.query
    const qAccountId = req?.params?.accountId;
    const qToken     = req?.params?.token;
    if (typeof qToken !== 'string') {
      res
        .status(401)
        .json({ status: false, message: 'Missing token' });
      return;
    }
    if (typeof qAccountId !== 'string') {
      res
        .status(401)
        .json({ status: false, message: 'Missing accountId' });
      return;
    }

    const { accountId } = jwt.verify(
      qToken,
      process.env.ACCOUNT_TOKEN_SECRET || 'TC-ACCOUNT-CUSTOMER',
    ) as any;
    if (accountId !== qAccountId) res.status(500).json({ status: false, message: 'Account not match' });
    req.authenUser = { accountId, qToken };
    next();
  } catch (err) {
    res
      .status(401)
      .json({ error: 'authentication error, could not verify credentials' });
  }
}
