import { DataTypes, Sequelize } from 'sequelize';
import { TCConnectionString }   from '../../config/mysql';
import { DatabaseConst }        from '../../constants/constant';

const AppLogModel = TCConnectionString.define(
  DatabaseConst.monday_app_log,
  {
    event_id            : {
      type        : DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey  : true,
    },
    board_id            : {
      type: DataTypes.BIGINT,
    },
    item_id             : {
      type     : DataTypes.BIGINT,
      allowNull: true,
    },
    item_name           : {
      type     : DataTypes.STRING,
      allowNull: true,
    },
    board_name          : {
      type     : DataTypes.STRING,
      allowNull: true,
    },
    event_name          : {
      type: DataTypes.STRING,
    },
    event_status        : {
      type        : DataTypes.BOOLEAN,
      defaultValue: false,
    },
    event_message       : {
      type     : DataTypes.STRING,
      allowNull: true,
    },
    event_data          : {
      type     : DataTypes.JSON,
      allowNull: true,
    },
    parent_event_id     : {
      type     : DataTypes.UUID,
      allowNull: true,
    },
    parent_item_id      : {
      type     : DataTypes.BIGINT,
      allowNull: true,
    },
    monday_item_id      : {
      type     : DataTypes.BIGINT,
      allowNull: true,
    },
    event_last_step     : {
      type     : DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: true,
    },
    event_last_step_data: {
      type     : DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    timestamps: false,
  },
);

export default AppLogModel;
