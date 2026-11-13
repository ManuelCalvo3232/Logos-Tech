-- Envíos del formulario de contacto de Logos Tech.
-- Se aplica al arrancar la API (idempotente).

CREATE TABLE IF NOT EXISTS contactos (
  id          BIGSERIAL PRIMARY KEY,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  nombre      VARCHAR(120) NOT NULL,
  email       VARCHAR(254) NOT NULL,
  empresa     VARCHAR(120),
  motivo      VARCHAR(20) NOT NULL DEFAULT 'consulta',
  mensaje     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS contactos_creado_idx ON contactos (creado_en DESC);
