import { DataTypes, Sequelize } from 'sequelize';
import { TCConnectionString } from '../../config/mysql';
import { DatabaseConst } from '../../constants/constant';

const BoardAppLogModel = TCConnectionString.define(
  DatabaseConst.monday_board_app_log,
  {
    id          : {
      type        : DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey  : true,
    },
    board_id    : {
      type: DataTypes.BIGINT,
    },
    old_board_id: {
      type: DataTypes.BIGINT,
    },
    board_active: {
      type: DataTypes.BOOLEAN,
    },
  },
  {
    timestamps: false,
  },
);

export default BoardAppLogModel;
