import { DataTypes, Sequelize } from 'sequelize';
import { TCConnectionString }   from '../../config/mysql';
import { DatabaseConst }        from '../../constants/constant';

const AccountTokenModel = TCConnectionString.define(
  DatabaseConst.monday_account_token,
  {
    id            : {
      type        : DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey  : true,
    },
    account_id    : {
      type     : DataTypes.STRING,
      allowNull: false,
    },
    token         : {
      type     : DataTypes.STRING,
      allowNull: false,
    },
    isLinkToMonday: {
      type        : DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    timestamps: false,
  },
);

export default AccountTokenModel;
