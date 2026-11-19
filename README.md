# Catálogo digital – BARRIO CAPS

Sitio estático (HTML + CSS + Bootstrap 5 + JS) con panel de administrador (Decap CMS).

## Personalizar
- **Número de WhatsApp, marca, redes:** `js/config.js` (número con indicativo, sin `+`; Colombia = `57...`).
- **Productos y fotos:** desde el panel `/admin` (ver abajo). Los datos quedan en `content/products.json` y las fotos en `assets/img/`.
- **Foto del banner:** guarda `assets/img/hero.jpg`.

## Probar en local
```
npx.cmd http-server . -p 8000 -c-1
```
Abre http://localhost:8000

Para probar el panel en local (sin login), en otra terminal:
```
npx.cmd decap-server
```
y abre http://localhost:8000/admin/

## Publicar con panel de administrador (Netlify + GitHub)
1. Sube la carpeta a un repositorio de GitHub (rama `main`).
2. En Netlify: *Add new site → Import from Git* y elige el repositorio (sin comando de build; directorio de publicación `.`).
3. En el sitio de Netlify: *Site configuration → Identity → Enable Identity*.
   - *Registration preferences* → **Invite only**.
   - *Services → Git Gateway → Enable*.
4. *Identity → Invite users*: invita el correo del administrador y acepta el correo de invitación.
5. El administrador entra a `https://TU-SITIO.netlify.app/admin/`, inicia sesión, agrega/edita gorras y sube fotos. Al pulsar *Publicar*, el sitio se actualiza solo en ~1 minuto.

Los visitantes ven el catálogo sin login; solo `/admin` lo requiere.
