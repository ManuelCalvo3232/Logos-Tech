// App Express de Logos Tech: sirve el sitio estático y recibe el formulario de contacto.
// Separada del arranque (server.js) para poder probarla con una base en memoria.
import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const SCHEMA_PATH = path.join(__dirname, 'db', 'schema.sql');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Valida y normaliza el envío. Devuelve { errores, datos }.
export function validarContacto(entrada) {
  const errores = {};
  const limpiar = (v) => (typeof v === 'string' ? v.trim() : '');

  const nombre = limpiar(entrada.nombre);
  const email = limpiar(entrada.email).toLowerCase();
  const empresa = limpiar(entrada.empresa);
  const mensaje = limpiar(entrada.mensaje);

  if (nombre.length < 2 || nombre.length > 120) errores.nombre = 'Ingresá tu nombre (entre 2 y 120 caracteres).';
  if (email.length > 254 || !EMAIL_RE.test(email)) errores.email = 'Ingresá un email válido.';
  if (empresa.length > 120) errores.empresa = 'El nombre de la empresa es demasiado largo.';
  if (mensaje.length < 10 || mensaje.length > 3000) errores.mensaje = 'Contanos tu proyecto (entre 10 y 3000 caracteres).';

  return { errores, datos: { nombre, email, empresa: empresa || null, mensaje } };
}

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Manda el aviso por Brevo. Si no hay configuración, lo deja registrado y no falla el envío.
export async function enviarAvisoBrevo(contacto, config) {
  if (!config.brevoApiKey || !config.notifyEmail || !config.mailFromEmail) {
    console.warn('Mail no enviado: faltan BREVO_API_KEY, NOTIFY_EMAIL o MAIL_FROM_EMAIL.');
    return;
  }
  const html = `
    <h2>Nueva consulta desde la web</h2>
    <p><strong>Nombre:</strong> ${escapar(contacto.nombre)}</p>
    <p><strong>Email:</strong> ${escapar(contacto.email)}</p>
    <p><strong>Empresa:</strong> ${escapar(contacto.empresa ?? '-')}</p>
    <p><strong>Mensaje:</strong></p>
    <p style="white-space:pre-line">${escapar(contacto.mensaje)}</p>
    <p style="color:#5B6B7F">Envío #${contacto.id}</p>`;

  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: config.mailFromName, email: config.mailFromEmail },
      to: [{ email: config.notifyEmail }],
      replyTo: { email: contacto.email, name: contacto.nombre },
      subject: `Nueva consulta de ${contacto.nombre}`,
      htmlContent: html,
    }),
  });
  if (!respuesta.ok) throw new Error(`Brevo respondió ${respuesta.status}`);
}

export function crearApp({ pool, config, enviarAviso = enviarAvisoBrevo }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás del proxy de Dokploy
  app.use(express.json({ limit: '10kb' }));

  const limiteContacto = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { ok: false, error: 'Recibimos muchos envíos desde tu conexión. Probá de nuevo en unos minutos.' },
  });

  app.get('/api/salud', (_req, res) => res.json({ ok: true }));

  app.post('/api/contacto', limiteContacto, async (req, res) => {
    // Campo trampa: si un bot lo completa, respondemos OK sin guardar nada
    if (typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
      return res.status(201).json({ ok: true });
    }

    const { errores, datos } = validarContacto(req.body ?? {});
    if (Object.keys(errores).length > 0) {
      return res.status(400).json({ ok: false, errores });
    }

    try {
      const { rows } = await pool.query(
        'INSERT INTO contactos (nombre, email, empresa, mensaje) VALUES ($1, $2, $3, $4) RETURNING id, creado_en',
        [datos.nombre, datos.email, datos.empresa, datos.mensaje],
      );
      const guardado = { ...datos, id: rows[0].id };

      // El mail no bloquea la respuesta: si falla, queda en el log y el envío sigue guardado
      enviarAviso(guardado, config).catch((err) => console.error('Error al enviar el aviso:', err.message));

      return res.status(201).json({ ok: true });
    } catch (err) {
      console.error('Error al guardar el contacto:', err.message);
      return res.status(500).json({ ok: false, error: 'No pudimos guardar tu mensaje. Probá de nuevo más tarde.' });
    }
  });

  app.use(express.static(PUBLIC_DIR));

  return app;
}

// Crea la tabla si no existe. Divide por ';' porque el schema no tiene punto y coma dentro de textos.
export async function migrar(pool) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const sentencias = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of sentencias) await pool.query(s);
}
