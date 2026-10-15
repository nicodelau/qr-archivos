# QR Archivos

Dashboard estático (GitHub Pages) para subir archivos y generar QRs permanentes.

- Sitio: https://nicodelau.github.io/qr-archivos/
- Los archivos se guardan en `files/` de este repo; el QR apunta a su URL de Pages y no vence mientras el repo exista.
- Todo lo subido es **público** (cualquiera con el link lo ve).

## Usuarios

El acceso es con usuario y contraseña. Como Pages no tiene backend, `users.json` guarda, por usuario,
un token fine-grained de GitHub cifrado con AES-256-GCM y una clave derivada de su contraseña (PBKDF2-SHA256, 600k iteraciones).
El navegador descifra el token al loguearse. Al ser `users.json` público, las contraseñas deben ser largas (mín. 12; usar "Generar").

Alta / cambio de contraseña: abrir `https://nicodelau.github.io/qr-archivos/#setup`, pegar el token
(fine-grained, **Contents: Read and write** sólo sobre este repo) y cargar usuarios. Los usuarios existentes que no se carguen se conservan.

Si el token vence o se revoca: generar uno nuevo y volver a cargar **todos** los usuarios en `#setup`.

Tests: `node --test lib.test.js`
