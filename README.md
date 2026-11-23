# VGM · Herramientas y soluciones

Aplicación React + TypeScript, Node.js/Express y Firebase/Firestore, con modo local para trabajar y probar en el equipo. Implementación propia inspirada en los flujos comerciales de [Dolibarr](https://github.com/Dolibarr/dolibarr), no una conversión completa del ERP. No incluye código PHP ni recursos de Dolibarr (GPL-3.0-or-later).

## Iniciar

Doble clic en **Iniciar-VGM.cmd**, o:

```powershell
cd C:\Users\ronal\Desktop\Gestor-cotizaciones-vgm
npm install
npm run dev
```

Abre la dirección que muestra Vite (normalmente http://localhost:5173). Node.js 22.12+ o posterior compatible. Si ya tienes una instancia abierta, detenla con Ctrl+C antes de iniciar otra. El puerto de la API es `PORT` (3001 por defecto); Vite usa el mismo valor para sus solicitudes.

### Cuenta local inicial

- Correo: **admin@vgm.local**
- Contraseña: **Vgm12345!**

Sin verificación por correo. Las contraseñas se guardan con scrypt, las sesiones usan cookies HttpOnly y duran hasta 12 horas. Reiniciar la API cierra las sesiones locales. `LOCAL_ADMIN_PASSWORD` modifica la contraseña inicial solamente si aún no existe `data/users.json`. Este acceso de prueba solo se usa en modo local; el servidor escucha en 127.0.0.1 y rechaza `NODE_ENV=production` con almacenamiento local.

## Funciones

- Identidad VGM mostaza, gris y blanco, logo y favicon. Título de pestaña VGM.
- Tema claro, oscuro o del sistema, guardado por navegador.
- Transiciones de vistas, modales centrados y animaciones al guardar. Toasts con barra de cierre automático. Respeta movimiento reducido del sistema.
- Crear cotizaciones exclusivamente desde Cotizaciones, y facturas desde Facturas.
- Crear, editar borradores, duplicar, eliminar con motivo, recuperar documentos y recuperar contenido de versiones anteriores.
- Correlativos independientes: COT-000001, COT-000002… y FAC-000001, FAC-000002… Solo crear, duplicar o convertir a factura consume un número. Editar, cambiar estados y recuperar conservan el correlativo. Documentos existentes mantienen su número y cada serie continúa desde el máximo; los saltos antiguos no se renumeran.
- Cálculos CLP, descuentos por línea e impuesto configurable, con redondeo por línea a pesos enteros.
- Estados mediante botones. Cotización: Borrador → Enviada → Aceptada / Rechazada. Enviada o rechazada pueden volver a borrador. Factura: Borrador → Emitida → Pagada / Anulada.
- Una cotización aceptada puede generar una factura; se evita la conversión duplicada. En el detalle de ambos documentos se muestra su vínculo.
- Historial compacto agrupado por cotización, con factura asociada, detalle de líneas y pestaña de cambios (incluye los de su factura). Facturas independientes tienen su propia entrada. Cada cambio conserva responsable, fecha, antes/después y versión.
- PDF, Excel XLSX, Word DOCX e impresión del detalle. Exportadores cargados bajo demanda.
- Clientes: crear/editar empresas, formato incremental de RUT, aviso de dígito verificador, búsqueda y autocompletado de clientes registrados. No hay consulta externa de razón social.
- Bloquear/activar clientes. Los bloqueados o eliminados no pueden usarse para nuevas cotizaciones, facturas ni conversiones; sus documentos históricos siguen disponibles.
- Eliminar clientes de forma recuperable. Filtro Eliminados para recuperarlos; al recuperar quedan bloqueados y puedes activarlos. Las cotizaciones y facturas no se borran.
- Mi perfil: nombre, correo local, teléfono y cargo. El correo de Firebase se cambia en Authentication.
- Administración: crear cuentas, asignar rol administrador/miembro, activar/desactivar. Solo los administradores acceden a esta API. No permite cambiar tu propio acceso ni dejar la plataforma sin administrador.

## Datos y respaldo

Modo local:

- `data/store.json`: documentos, versiones, eventos, secuencias, catálogo, movimientos de stock y control de lotes importados.
- `data/images/`: imágenes de productos (archivos JSON con contenido comprimido).
- `data/customers.json`: directorio y estado de clientes. Se genera desde documentos existentes si aún no existe.
- `data/users.json`: perfiles y hashes de contraseña.

No eliminar esos archivos para actualizar el código. Para respaldo local integral, detener la API y copiar `data` a un lugar privado. Configuración permite descargar JSON de documentos, historial, clientes, catálogo y movimientos; no incluye imágenes, cuentas ni hashes. Para restaurarlo manualmente, detener la API, respaldar los archivos actuales, guardar `{documents,events,counters,products,stockMovements,importBatches}` en `store.json` y conservar la carpeta `images` del mismo respaldo y el arreglo `customers` en `customers.json`. Los respaldos antiguos con `counter` también se leen y sus secuencias se derivan de los documentos. No hay importador visual.

Los documentos conservan una copia de los datos del cliente; editar o eliminar el cliente no modifica documentos anteriores. Se rechazan ediciones basadas en versiones antiguas para evitar pérdida de cambios.

## Firebase

1. Crea un proyecto Firebase y una base Firestore.
2. Activa Authentication → correo/contraseña; crea el primer usuario administrador.
3. Registra una app web y completa `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` y `VITE_FIREBASE_APP_ID` en `.env`.
4. Configura `STORAGE_MODE=firebase`, `FIREBASE_PROJECT_ID`, `ALLOWED_UIDS` y `ADMIN_UIDS` con el UID del administrador inicial. Si `ADMIN_UIDS` está vacío, se usa `ALLOWED_UIDS` para el rol inicial. Después, administra las cuentas desde la plataforma; los roles persistidos en `users` prevalecen.
5. Para la API local, `GOOGLE_APPLICATION_CREDENTIALS` debe apuntar a una cuenta de servicio fuera del repositorio. En hosting de Google usa una identidad de servicio y Application Default Credentials. Nunca colocar claves privadas en variables `VITE_*`.
6. Publica `firestore.rules` (consola o `firebase deploy --only firestore:rules --project TU_PROYECTO`). El acceso directo desde navegador está cerrado; la API valida token y rol.
7. Reinicia e inicia sesión. No se exige verificación de correo ni se envían invitaciones automáticas.

Colecciones: `documents`, `events`, `customers`, `users`, `products`, `stockMovements`, `inventoryImports`, `images` y secuencias `metadata/sequence-quote`, `metadata/sequence-invoice`. Las transacciones guardan documento + evento + correlativo + existencias conjuntamente, serializadas por `metadata/commerce-lock`. No se migran automáticamente archivos locales a Firestore. El acceso Firebase real requiere tus credenciales y debe verificarse en tu proyecto.

El historial no sustituye un respaldo independiente: un administrador de la base puede modificar datos. Configura exportaciones/retención de Google Cloud para producción.

## Pruebas y compilación

```powershell
npm test
npm run build
npm start
```

`npm start` sirve la compilación y API en http://localhost:3001. Producción requiere Firebase y HTTPS, bajo el mismo origen. No usar Vite dev como servidor público. Las pruebas cubren cálculos, edición concurrente, secuencias, migración de números, estados, papelera, conversión, exportaciones, RUT, sesiones, roles, perfiles, bloqueo/eliminación de clientes y conservación de documentos.

## Alcance

Una empresa y equipo autorizado. Los documentos se cargan en memoria; para grandes volúmenes añadir paginación. Facturas internas: no incluye SII/DTE, folios tributarios, firma electrónica, pagos parciales ni notas de crédito. No incluye contabilidad, migración SQL de Dolibarr, adjuntos, correo automático ni consulta de empresas por RUT a un proveedor externo. Las fuentes estándar del PDF cubren Latin; otros alfabetos requieren una fuente Unicode.

## Estructura

`src/`: componentes React y exportadores. `shared/`: modelos/validación. `server/`: API, cuentas y persistencia. `tests/`: pruebas. `public/`: logos suministrados. `.env.example`: configuración.

## PDF comercial VGM

Diseño A4 con logo, mostaza, gris y blanco; datos del cliente, fechas, filas con imágenes proporcionadas y totales. Encabezado de tabla y marca se repiten en páginas adicionales, con numeración y condiciones completas. La marca queda guardada en cada nueva línea seleccionada del catálogo. Documentos anteriores sin marca muestran “No informada”; al editar y guardar se completa desde catálogo si existe. Una imagen faltante se indica en el PDF sin impedir descargar el resto del documento.

## Productos, servicios e inventario

- Menú **Productos**: crear, editar, copiar, eliminar de forma recuperable, recuperar y consultar movimientos con responsable y fecha. El código es único, también en la papelera. Copiar inicia stock en cero para no inventar existencias.
- Productos con código, descripción, categoría, marca, precio neto, stock físico e imagen opcional. Servicios sin stock. Los ajustes manuales requieren motivo; el stock no puede quedar por debajo de lo reservado.
- Imágenes por clic o arrastre: JPG/PNG/WebP originales hasta 5 MB, reducidas a 1000 px y hasta 400 KB. Se conservan en el servidor local o colección Firestore `images`; no requiere un bucket. El detalle y el historial muestran la imagen guardada en la línea. El PDF incluye fotos ajustadas, código, marca, cantidades, precio original, descuento porcentual y por unidad, precio con descuento y total de línea. Word y Excel conservan el detalle textual.
- La descripción del editor busca por nombre, código, marca o categoría. Doble clic, botón **Usar** o Enter incorporan el producto. Puedes crear varios desde el modal **Crear producto y agregar** sin perder el borrador. Los productos quedan en el catálogo aunque canceles la cotización.
- Cada línea muestra el stock disponible, la reserva prevista y el remanente, sumando líneas repetidas. Guardar vuelve a comprobar las existencias en el servidor.
- Los documentos antiguos y las líneas manuales no se vinculan automáticamente: selecciona el producto del catálogo para activar control de stock.

### Cuándo cambia el stock

| Acción                                               | Resultado                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Guardar cotización o factura en borrador             | Reserva unidades y reduce disponible; no cambia stock físico                    |
| Editar cantidades, quitar líneas o recuperar versión | Ajusta la diferencia de reservas, de forma atómica                              |
| Rechazar o eliminar cotización                       | Libera sus reservas                                                             |
| Volver de rechazada a borrador o recuperar documento | Reintenta reservar; falla completo si falta stock                               |
| Convertir cotización aceptada a factura              | Transfiere la reserva sin duplicarla                                            |
| Emitir factura                                       | Descuenta stock físico y libera su reserva                                      |
| Marcar factura pagada                                | No vuelve a descontar                                                           |
| Anular o eliminar factura                            | Devuelve su stock; la cotización de origen no vuelve a reservar automáticamente |

**Disponible = físico − reservado.** Después de convertir, la factura es la responsable de esas existencias, aunque se elimine la cotización de origen. No se permite eliminar un producto que tenga reservas. Las operaciones concurrentes se serializan: dos cotizaciones no pueden reservar las mismas unidades. En modo local ejecuta una sola instancia de la API contra la misma carpeta de datos. Firestore usa transacciones con reintentos y un bloqueo compartido; la lectura completa del catálogo/documentos se debe reemplazar por índices y lecturas acotadas para una operación de gran volumen.

### Carga masiva Excel

Usa **Plantilla Excel**, completa la hoja **Productos** y selecciona **Importar Excel**. Implementado con `xlsx-js-style`, encabezados azul pastel, negrita y bordes negros marcados. Hasta 500 filas por archivo .xlsx de 5 MB. Códigos nuevos exclusivamente; no reemplaza productos ni stock existentes. No admite fórmulas. Los ejemplos están en la hoja Instrucciones y no se importan.

La vista previa valida campos, códigos duplicados y servicios con stock incorrecto. La tarjeta muestra spinner, porcentaje y barra. Se guardan lotes atómicos de 25 productos: un error conserva los lotes confirmados y permite reintentar desde el último, sin duplicados. Las imágenes se agregan después desde el formulario.

Las pruebas de inventario incluyen concurrencia, cantidades repetidas, rechazo, recuperación, eliminación, cambios de versión, facturación sin doble descuento, servicios, lotes atómicos y reintentos. Las pruebas Excel comprueban estilos y validación; la API comprueba acceso e imágenes. Las pruebas usan datos temporales y no modifican la carpeta real `data`.

## Dashboard, usuarios y apariencia

Dashboard usa Recharts, con filtros por fecha del documento, evolución mensual, estados, clientes e ítems principales, cobranza y catálogo. Excluye eliminados y pendientes. Facturado incluye solo Emitida/Pagada; no suma cotizaciones más facturas. Pagada describe el estado actual, no la fecha del pago. Inventario y clientes muestran la situación actual independientemente del período.

Administración > Usuarios permite editar nombre, correo local, teléfono y cargo. Los roles visibles son Usuario y Admin (internamente member/admin por compatibilidad). El correo Firebase se administra en Authentication. Configuración > Color del menú ofrece 12 colores independientes del tema Claro/Oscuro/Sistema; se guardan en el navegador.

## Consulta RUT gratuita

Consultar RUT está disponible en el editor de documentos y en Clientes. Revisa primero el directorio; después consulta https://sre.cl/api/company_info desde el servidor con token_publico. SRE publica 200 consultas diarias, sin garantizar disponibilidad del cupo público. Al verificar el 21/09/2026 devolvió 403 por cupo agotado. No requiere registro ni clave SII. Opcional: SRE_API_TOKEN en .env del servidor si dispones de otro token; nunca usar VITE_ para esta clave.

La consulta externa ofrece razón social; SRE retiró la dirección completa. Solo se reutiliza dirección/correo/teléfono del directorio propio. Se muestra una vista previa y Completar campos vacíos conserva cualquier dato ya escrito. Si no encuentra datos, falla la conexión o se agota el cupo, puedes escribir manualmente. Los resultados encontrados se guardan en caché del servidor durante 24 horas; no se crea un cliente hasta guardar el formulario. Fuente y límites: https://www.sre.cl/.

## Trabajo sin conexión

Para poder reabrir sin servidor utiliza la compilación: npm run build y después npm start. Abre la aplicación e inicia sesión conectado al menos una vez para guardar la aplicación y sus datos en el navegador. El servidor debe servirse por HTTPS o localhost para activar el service worker. Vite de desarrollo no instala el service worker.

Sin conexión puedes crear y editar cotizaciones y facturas en borrador, con pendientes conservados en IndexedDB por cuenta. El servidor confirma stock y correlativos al sincronizar. Los conflictos requieren comparar y elegir versión; las copias descartadas se archivan en el respaldo de pendientes. Si la sesión vence, ingresa de nuevo con la misma cuenta. No borres los datos del sitio mientras tengas cambios pendientes. Catálogo, clientes, administración, estados y eliminación requieren conexión. Conectado significa acceso al servidor VGM; no indica que un proveedor externo esté disponible. Las consultas RUT externas requieren red, y la búsqueda local puede usar el directorio previamente cargado.

## Archivo de productos y papelera por módulo

Productos > Archivar oculta el artículo del catálogo activo y del selector de cotizaciones. Conserva stock e historial; no modifica documentos anteriores. Usa el filtro Archivados y Desarchivar para volver a ofrecerlo. El registro de movimientos conserva el responsable y las acciones de archivo/desarchivo.

Papelera separa Cotizaciones, Facturas, Productos, Clientes y Usuarios, con búsqueda y restauración. Usuarios solo es visible para Admin. Al eliminar un usuario se desactiva su acceso, sin borrar documentos ni historial; al restaurarlo continúa desactivado hasta que Admin active su acceso. No se puede eliminar el usuario actual ni quitar al último administrador activo. Clientes se restauran bloqueados hasta su activación; productos conservan su condición de archivado al recuperarse. Los documentos se recuperan con las validaciones de stock existentes.

## Sesión y recordar credenciales

La sesión local usa cookie HttpOnly de 30 días y tokens aleatorios; el servidor guarda solamente el hash del token en data/sessions.json para mantener el acceso tras reinicios. Firebase utiliza persistencia local. Salir revoca la sesión local, cierra Firebase y elimina el perfil activo de la caché; los borradores pendientes permanecen separados por cuenta. Si sales sin conexión, la revocación del servidor queda pendiente y se intenta antes de la siguiente petición autenticada.

Recordar credenciales conserva correo y preferencia. La contraseña se ofrece al gestor de contraseñas del navegador mediante Credential Management cuando está disponible, además de los campos estándar de autocompletado. No se guarda la contraseña en localStorage/IndexedDB. El navegador decide si muestra el aviso y autocompleta; requiere guardar/autorizar allí las credenciales. Después de Salir no hay ingreso automático: debe pulsarse Ingresar. Desmarcar la opción borra el correo recordado por VGM; las claves ya guardadas se administran en el navegador.
