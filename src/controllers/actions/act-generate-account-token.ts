import StudentHoursLogService        from '../../services/student-hours-log/student-hours-log.service';
import { BoardConstants, Constants } from '../../constants/constant';
import logger                        from '../../helper/logger';
import BlabMondayService             from '../../services/blab-monday.service';
import ConstColumn                   from '../../constants/constant-column';
import _                             from 'lodash';
import GenerateAccountTokenService   from '../../services/other-business/generate-account-token.service';
import LogService                    from '../../services/log-service';
import Logger                        from '../../helper/logger';

export async function generateAccountToken({ accountId, event, isGenerateAll }: {
  accountId?: string,
  event?: any,
  isGenerateAll?: boolean
} = {}) {
  try {
    let allFD;
    const specificColumn = [ConstColumn.FD.AccountID, ConstColumn.FD.FamilyDashboard];
    if (isGenerateAll) {
      Logger.log(`======START generateAccountToken All======`);
      allFD = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.FD, [
        { column_id: `${ConstColumn.FD.FamilyStatus}`, column_values: [Constants.Active] },
      ], specificColumn);
    } else if (accountId?.length) {
      Logger.log(`======START generateAccountToken ${accountId}======`);
      allFD = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.FD, [
        { column_id: `${ConstColumn.FD.AccountID}`, column_values: [accountId] },
      ], specificColumn);
    } else if (event?.pulseId) {
      Logger.log(`======START generateAccountToken ${event.pulseId}======`);
      allFD = await BlabMondayService.GetItemById(event.pulseId, specificColumn, true);
    }
    if (allFD?.length) {
      let accountInfos = _.map(allFD, (item: any) => {
        const columnValues = _.keyBy(item.column_values, 'id');

        return {
          itemId     : item.id,
          accountName: item.name,
          accountId  : _.get(columnValues, `${ConstColumn.FD.AccountID}.text`, ''),
          accountLink: _.get(columnValues, `${ConstColumn.FD.FamilyDashboard}.text`, ''),
        };
      });
      if (accountInfos?.length) {
        accountInfos = _.filter(accountInfos, a => a?.accountId?.length);
        await GenerateAccountTokenService.generateAccountToken(accountInfos);
      }
    }
    return { status: 200, message: Constants.Done };
  } catch (error) {
    logger.log(`There was an unexpected system error [generateAccountToken]: ${error}`);
    return { status: 500, message: 'Internal server error' };
  }
}
