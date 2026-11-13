# Sitio estático de Logos Tech servido con nginx.
# Dokploy: build type "Dockerfile", puerto 80.
FROM nginx:1.27-alpine

# Copia solo el sitio (lo que no vaya al navegador queda afuera por .dockerignore)
COPY . /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
