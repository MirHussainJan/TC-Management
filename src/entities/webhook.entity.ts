import { Entity, Column } from 'typeorm';

@Entity()
export class WebhookEntity {
  @Column({ nullable: true })
  app_id?: number;

  @Column({ nullable: true })
  integration_id?: number;

  @Column({ nullable: true })
  subscription_id?: number;

  @Column({ nullable: true })
  url?: string;

  @Column({ nullable: true })
  account_id?: number;

  @Column({ nullable: true })
  user_id?: number;

  @Column({ nullable: true })
  board_id?: number;

  @Column({ nullable: true })
  options?: WebhookOptionEntity;
}

@Entity()
export class WebhookOptionEntity {
  @Column({ nullable: true })
  webhook_id?: number;

  @Column({ nullable: true })
  item_type?: any;

  @Column({ nullable: true })
  column_type?: number;

  @Column({ nullable: true })
  mirror_item_id?: number;
}

@Entity()
export class DateChangeDueDayEntity extends WebhookOptionEntity {
  @Column({ nullable: true })
  column_id?: string;

  @Column({ nullable: true })
  isDateChangeDueDay?: boolean;

  @Column({ nullable: true })
  month?: number;

  @Column({ nullable: true })
  week?: number;

  @Column({ nullable: true })
  day?: number;
}
