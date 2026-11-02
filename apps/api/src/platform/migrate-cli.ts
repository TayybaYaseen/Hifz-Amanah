// npm run db:migrate — applies pending migrations to DATABASE_URL.
import { createDb } from './db.ts';
import { migrate } from './migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const { db } = createDb({ connectionString: url, maxConnections: 1 });
try {
  const ran = await migrate(db);
  console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'No pending migrations');
} finally {
  await db.destroy();
}
