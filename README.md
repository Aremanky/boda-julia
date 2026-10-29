# Web de la boda de Julia y Arturo

Todo lo necesario para ponerla en marcha en tu servidor: la web y un pequeño servidor en Node que guarda las confirmaciones. No hace falta instalar ninguna dependencia.

```
boda/
├── server.js            servidor (web + confirmaciones + panel)
├── public/              la web
│   ├── index.html       textos de la página
│   ├── js/config.js     ← ajustes: número de cuenta, canción, fotos
│   ├── musica/          ← aquí va cancion.mp3
│   ├── fotos/           las 10 fotos de «La precuela» (01.jpg … 10.jpg)
│   ├── img/             ilustración, mariposas, icono e imagen para compartir
│   └── fonts/           tipografía de los números
└── data/                se crea solo; aquí se guardan las respuestas
```

## Arrancarla

Necesitas Node.js 18 o superior.

```bash
cd boda
PORT=8080 ADMIN_PASSWORD='una-contraseña-larga' node server.js
```

- Web: `http://localhost:8080`
- Panel de los novios: `http://localhost:8080/admin` (usuario `novios`, contraseña la de `ADMIN_PASSWORD`). Desde ahí se ven los totales, las alergias, las canciones y se descarga todo para Excel.

Si alguien confirma dos veces con el mismo nombre y apellidos, el panel cuenta su última respuesta y marca la anterior.

### Como servicio (systemd)

`/etc/systemd/system/boda.service`:

```ini
[Unit]
Description=Web de la boda
After=network.target

[Service]
WorkingDirectory=/opt/boda
ExecStart=/usr/bin/node server.js
Environment=PORT=8080
Environment=ADMIN_PASSWORD=una-contraseña-larga
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now boda
```

(El usuario del servicio tiene que poder escribir en `/opt/boda/data`.)

### Con Docker

```bash
docker build -t boda .
docker run -d --name boda -p 8080:8080 -e ADMIN_PASSWORD='una-contraseña-larga' -v boda-data:/app/data --restart unless-stopped boda
```

### Publicarla con el túnel de Cloudflare

En el `config.yml` de cloudflared, añade una entrada antes de la regla final:

```yaml
ingress:
  - hostname: boda.tudominio.com
    service: http://localhost:8080
  - service: http_status:404
```

y crea el registro DNS: `cloudflared tunnel route dns <nombre-del-túnel> boda.tudominio.com`.

## Lo que falta por poner

| Qué | Dónde |
| --- | --- |
| La canción | `public/musica/cancion.mp3` (si no está, el botón de música no aparece) |
| Número de cuenta | `iban` en `public/js/config.js` |
| Puntos exactos del autobús | `public/index.html`, busca «EDITAR: cuando tengáis cerrados los puntos exactos del autobús» |
| Imagen al compartir por WhatsApp | en `public/index.html` cambia `og:image` por la dirección completa, p. ej. `https://boda.tudominio.com/img/compartir.jpg` |

Las fotos de «La precuela» ya van incluidas. Si queréis cambiar alguna, sustituid el archivo en `public/fotos/` con el mismo nombre (el orden está en `fotos/LEEME.txt`; mejor cuadradas).

Después de cambiar ficheros no hace falta reiniciar el servidor: basta con recargar la página.

## Copia de seguridad

Las respuestas están en `data/confirmaciones.jsonl` (una línea por persona). Copia ese archivo de vez en cuando.
