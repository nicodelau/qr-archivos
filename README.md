# QR Archivos

App estática (GitHub Pages) para subir archivos y generar un QR permanente.

- Los archivos se guardan en `files/` de este repo vía la API de GitHub.
- El QR apunta a `https://nicodelau.github.io/qr-archivos/files/<archivo>`: no vence mientras el repo exista.
- Para subir se necesita un token fine-grained con permiso **Contents: Read and write** sólo sobre este repo. Se guarda en el `localStorage` del navegador, nunca en el código.

Tests: `node --test lib.test.js`
