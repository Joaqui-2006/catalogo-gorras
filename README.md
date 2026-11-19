# CatÃ¡logo digital â€“ Monarch Street

Sitio estÃ¡tico (HTML + CSS + Bootstrap 5 + JS) con panel de administrador (Decap CMS).

## Personalizar
- **NÃºmero de WhatsApp, marca, redes:** `js/config.js` (nÃºmero con indicativo, sin `+`; Colombia = `57...`).
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

## Panel de administrador (/admin)
Usa Sveltia CMS con el backend de GitHub (Netlify Git Gateway/Identity ya no está disponible).
1. Entra a `https://barrio-caps-catalogo.netlify.app/admin/` y pulsa *Sign in with token*.
2. Crea un token en GitHub: Settings → Developer settings → Personal access tokens → *Fine-grained*, solo para el repo `catalogo-gorras`, permiso **Contents: Read and write**.
3. Pega el token, agrega/edita gorras y sube fotos. Al guardar, se hace un commit en GitHub.
4. Para que el commit actualice el sitio, el repo debe estar conectado a Netlify (despliegue continuo).

Los visitantes ven el catálogo sin login; solo `/admin` requiere el token.
