import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import request from 'supertest';
import { crearApp, migrar, validarContacto } from '../app.js';

async function preparar() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  await migrar(pool);
  const enviados = [];
  const app = crearApp({
    pool,
    config: {},
    enviarAviso: async (contacto) => { enviados.push(contacto); },
  });
  return { app, pool, enviados };
}

const valido = {
  nombre: 'Ana Pérez',
  email: 'ana@example.com',
  empresa: 'Taller Test',
  mensaje: 'Queremos un sistema para nuestro taller mecánico.',
};

test('validarContacto rechaza datos incompletos', () => {
  const { errores } = validarContacto({ nombre: 'A', email: 'malo', mensaje: 'corto' });
  assert.ok(errores.nombre);
  assert.ok(errores.email);
  assert.ok(errores.mensaje);
  assert.equal(errores.empresa, undefined);
});

test('salud responde ok', async () => {
  const { app } = await preparar();
  const res = await request(app).get('/api/salud');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('envío inválido responde 400 y no guarda', async () => {
  const { app, pool } = await preparar();
  const res = await request(app).post('/api/contacto').send({ nombre: '', email: 'x', mensaje: 'hola' });
  assert.equal(res.status, 400);
  assert.ok(res.body.errores.email);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM contactos');
  assert.equal(rows[0].n, 0);
});

test('envío válido responde 201, guarda y dispara el aviso', async () => {
  const { app, pool, enviados } = await preparar();
  const res = await request(app).post('/api/contacto').send(valido);
  assert.equal(res.status, 201);
  const { rows } = await pool.query('SELECT nombre, email, empresa, mensaje FROM contactos');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'ana@example.com');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].nombre, 'Ana Pérez');
});

test('el campo trampa website no guarda nada', async () => {
  const { app, pool } = await preparar();
  const res = await request(app).post('/api/contacto').send({ ...valido, website: 'http://spam.test' });
  assert.equal(res.status, 201);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM contactos');
  assert.equal(rows[0].n, 0);
});

test('las páginas estáticas responden 200', async () => {
  const { app } = await preparar();
  for (const ruta of ['/', '/contacto/', '/trabajos/', '/assets/styles.css']) {
    const res = await request(app).get(ruta);
    assert.equal(res.status, 200, ruta);
  }
});

test('una postulación se guarda con su motivo', async () => {
  const { app, pool, enviados } = await preparar();
  const res = await request(app).post('/api/contacto').send({ ...valido, motivo: 'postulacion' });
  assert.equal(res.status, 201);
  const { rows } = await pool.query('SELECT motivo FROM contactos');
  assert.equal(rows[0].motivo, 'postulacion');
  assert.equal(enviados[0].motivo, 'postulacion');
});

test('un motivo desconocido cae en consulta', async () => {
  const { app, pool } = await preparar();
  await request(app).post('/api/contacto').send({ ...valido, motivo: 'otra-cosa' });
  const { rows } = await pool.query('SELECT motivo FROM contactos');
  assert.equal(rows[0].motivo, 'consulta');
});
