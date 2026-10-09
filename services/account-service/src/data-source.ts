import { DataSource } from 'typeorm';
import { Account } from './entity/account.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // schema is created by docker/postgres/01-schema.sql; set DB_SYNCHRONIZE=true to let TypeORM manage it instead
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  logging: false,
  entities: [Account],
});
