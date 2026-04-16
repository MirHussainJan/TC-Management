import WSUpdateTutorOffService                  from '../weekly-scheduling/ws-update-tutor-off.service';
import jwt                                      from 'jsonwebtoken';
import dotenv                                   from 'dotenv';
import AccountTokenModel                        from '../../db/models/account-token.model';
import BlabMondayService                        from '../blab-monday.service';
import { BoardConstants, Constants, EventName } from '../../constants/constant';
import LogService                               from '../log-service';
import CommonService                            from '../common-service';

dotenv.config();

export default class GenerateAccountTokenService {

  static async generateAccountToken(accountInfos: any[]) {
    if (accountInfos?.length) {
      let logData = {};
      for (let i = 0; i < accountInfos.length; i++) {
        const accountInfo                 = accountInfos[i];
        let result: any                   = null;
        logData                           = {
          board_id      : BoardConstants.FD,
          item_id       : accountInfo.itemID,
          item_name     : accountInfo.accountName,
          board_name    : CommonService.getBoardName(BoardConstants.FD),
          event_name    : EventName.GenerateAccountToken,
          monday_item_id: 0,
        };
        const { mondayLog, mondayItemId } = await LogService.StartLog(logData);
        let dbData                        = mondayLog;

        const onDatabase: any = await AccountTokenModel.findOne({
          raw  : true,
          where: {
            account_id: accountInfo.accountId,
          },
        });
        let token             = onDatabase?.token;
        if (!token?.length) {
          token = await this.progressGenerate(accountInfo?.accountId);
        }
        if (token?.length) {
          let accountDb = onDatabase?.id;
          if (!onDatabase?.id) {
            const newDb = await AccountTokenModel.create({
              account_id: accountInfo.accountId,
              token     : token,
            });
            accountDb   = newDb?.getDataValue('id');
          }

          const dataShortLink = {
            dynamicLinkInfo: {
              domainUriPrefix: 'https://stjohns.page.link',
              link           : `${process.env.FE_URL}/shl/family-log?a=${accountInfo.accountId}&t=${token}`,
            },
            suffix         : {
              option: 'SHORT',
            },
          };
          let link            = `${process.env.FE_URL}/shl/family-log?a=${accountInfo.accountId}&t=${token}`;
          const firebaseApiKey = process.env.FIREBASE_DYNAMIC_LINKS_API_KEY || '';
          if (firebaseApiKey) {
            const shortLink = await CommonService.postTo(
              `https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${firebaseApiKey}`,
              dataShortLink,
            );
            link = shortLink?.length ? shortLink : link;
          }
          // let link = `${process.env.FE_URL}/shl/family-log?a=${accountInfo.accountId}&t=${token}`;
          if (link?.length) {
            const columnValues = {
              status60: Constants.Done,
              link63  : {
                url : link,
                text: `${accountInfo.accountName}`,
              },
            };
            if (!onDatabase?.isLinkToMonday) {
              const updateToMonday = await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.FD, accountInfo?.itemId, columnValues);
              if (updateToMonday?.data?.change_multiple_column_values?.id?.length > 0) {
                dbData.event_data = { accountId: accountInfo.accountId, token: token };
                await AccountTokenModel.update(
                  {
                    isLinkToMonday: true,
                  },
                  {
                    where: {
                      id: accountDb,
                    },
                  });
              } else {
                result = updateToMonday;
              }
            }
          }
        }
        await LogService.DoneLog({ dbData, result: result });
      }
    }
  }

  private static async progressGenerate(accountId) {
    try {
      const user   = {
        accountId: accountId,
        role     : 'customer',
        created  : new Date(),
      };
      const secret = process.env.ACCOUNT_TOKEN_SECRET || 'TC-ACCOUNT-CUSTOMER';
      return jwt.sign(user, secret);

    } catch (error) {
      throw error;
    }
  }
}
