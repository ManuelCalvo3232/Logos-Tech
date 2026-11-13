// Arranque del servidor: conecta a Postgres, aplica el esquema y levanta la app.
import pg from 'pg';
import { crearApp, migrar } from './app.js';

const puerto = Number(process.env.PORT) || 3000;

const config = {
  brevoApiKey: process.env.BREVO_API_KEY,
  notifyEmail: process.env.NOTIFY_EMAIL,
  mailFromEmail: process.env.MAIL_FROM_EMAIL,
  mailFromName: process.env.MAIL_FROM_NAME || 'Logos Tech',
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await migrar(pool);

const app = crearApp({ pool, config });
app.listen(puerto, () => console.log(`Logos Tech escuchando en el puerto ${puerto}`));

const cerrar = async () => {
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
