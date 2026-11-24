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

- `data/store.json`: documentos, versiones, eventos, secuencias, catálogo, movimientos de stock, control de lotes importados y operaciones comerciales (`business`).
- `data/attachments/`: archivos comerciales originales, conservados por identificador.
- `data/images/`: imágenes de productos (archivos JSON con contenido comprimido).
- `data/customers.json`: directorio y estado de clientes. Se genera desde documentos existentes si aún no existe.
- `data/users.json`: perfiles y hashes de contraseña.

No eliminar esos archivos para actualizar el código. Para respaldo local integral, detener la API y copiar `data` a un lugar privado. Configuración permite descargar JSON de documentos, historial, clientes, catálogo y movimientos; no incluye imágenes, cuentas, hashes ni los adjuntos comerciales. Para restaurarlo manualmente, detener la API y respaldar los archivos actuales; actualizar los campos `{documents,events,counters,products,stockMovements,importBatches}` de `store.json` preservando `business` y la carpeta `attachments` del mismo respaldo integral. Conservar también la carpeta `images` y guardar el arreglo `customers` en `customers.json`. Para operaciones y binarios comerciales, usar el ZIP descrito al final de este documento. Los respaldos antiguos con `counter` también se leen y sus secuencias se derivan de los documentos. No hay importador visual.

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

Una empresa y equipo autorizado, con portal limitado por cliente. Los documentos se cargan en memoria; para grandes volúmenes añadir paginación e índices. La facturación sigue siendo interna: la integración con Defontana queda pendiente; no se emiten SII/DTE, folios tributarios, notas de crédito o débito. Incluye pagos parciales, anticipos y adjuntos comerciales. No incluye contabilidad general, migración SQL de Dolibarr ni envío automático de correo. Las fuentes estándar del PDF cubren Latin; otros alfabetos requieren una fuente Unicode.

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

## Órdenes de compra, servicios y cobranza

El menú incluye **Órdenes de compra**, **Servicios**, **Cobranza**, **Agenda** y **Portal de clientes**. Las operaciones nuevas requieren conexión al servidor; el trabajo sin conexión de cotizaciones y facturas en borrador conserva su funcionamiento anterior.

Flujo recomendado:

1. Registrar un cliente activo con RUT. El mismo RUT debe figurar en su cotización y factura para relacionarlas sin mezclar clientes.
2. Crear/enviar la cotización. Un cliente puede aceptar su versión vigente desde el portal indicando su nombre; la aceptación queda con fecha, responsable y versión en el historial. No se aceptan por portal cotizaciones vencidas.
3. Registrar la OC o recibirla del cliente mediante su portal. Se guardan número externo, fecha, monto total con IVA, entrega, estado, cotización y archivos. El número de OC es único por cliente, incluida la papelera. La comparación muestra diferencias de total y, al capturar líneas, cantidad, precio neto y descuento; las descripciones repetidas requieren revisión manual. No se extrae automáticamente información de PDFs mediante OCR.
4. Crear una OT desde la OC o directamente en Servicios. Completar alcance, exclusiones, lugar, responsable, fechas y estado. Incorporar documentos de contrato, informe técnico, horas/materiales, checklist, recepción conforme, estado de pago, garantía, HES y certificados laborales/F30-1. La presencia de una categoría no significa que sea obligatoria para todos los servicios.
5. Pasar un trabajo terminado a **Por recibir**. El cliente puede registrar recepción conforme con nombre, observaciones, fecha y versión. La OT pasa a Completado. Las actas no se sobrescriben; el historial conserva la evidencia. Modificar el alcance, título, lugar o fechas de un servicio completado lo vuelve a dejar Por recibir. La conformidad registrada no constituye firma electrónica avanzada.
6. Crear facturas internas desde el flujo existente o desde la OT. En **Cobranza → Asignar a OC / servicio**, indicar cuánto de la factura corresponde a cada operación. Una OC admite varias facturas y una factura puede distribuirse entre varias operaciones. Las asignaciones no pueden exceder la factura ni la OC, incluso con solicitudes concurrentes. Las facturas en borrador consumen disponibilidad asignada; las eliminadas o anuladas no suman al facturado. La OC debe estar aceptada antes de asignar facturas.
7. Registrar pagos parciales o anticipos. Los anticipos requieren una OC o servicio y pueden asignarse después a una factura del mismo cliente, conservando monto, fecha y comprobante. Las referencias de pago activas no se duplican y el servidor rechaza sobrepagos. Completar el saldo marca la factura Pagada; anular un pago recalcula el saldo y la devuelve a Emitida cuando corresponde. Los pagos anulados se conservan y no se reactivan. Facturas históricas Pagadas sin movimientos de este módulo se consideran saldadas; no se inventan abonos históricos.
8. Revisar los comprobantes que informen los clientes. Subir un comprobante no confirma dinero ni paga una factura. **Verificar y registrar pago** registra el dinero recibido y marca el comprobante Verificado. Si el pago se anula, su comprobante vuelve a Observado.

Los costos manuales se registran **netos, en CLP**. Los partes de horas y materiales aportan sus costos internos sin duplicarlos como costos manuales. El margen estimado distribuye el neto de las facturas asignadas y descuenta esos costos directos; no es utilidad contable ni incluye gastos generales o impuestos. Registrar materiales en un parte no vuelve a descontar inventario: el stock sigue controlado por las cotizaciones y facturas vinculadas a productos.

La Agenda reúne vencimientos de cotizaciones y cobros, entregas de OC, servicios pendientes, próximas mantenciones, garantías y documentos con vigencia. **Programar siguiente mantención** prepara una OT nueva y evita crear dos sucesoras del mismo servicio. Las recurrencias se programan desde ese botón; no hay un planificador externo que cree trabajos o envíe correos automáticamente.

Cotizaciones y facturas muestran vínculos a su OC/OT y sus respaldos. Los documentos comerciales cuentan con PDF interno, historial de versiones y papelera; los abonos se anulan mediante un movimiento auditado.

## Portal y archivos comerciales

Solo Admin genera enlaces privados con vigencia de 1 a 30 días. Se muestra el enlace completo al generarlo; el servidor guarda su hash, no el token original. Puede revocarse y un enlace revocado no se reactiva. El bloqueo/eliminación del cliente también impide acceder al portal. La URL debe corresponder a un servidor accesible para el cliente: `localhost` solo funciona en el equipo donde se ejecuta VGM.

El portal muestra únicamente cotizaciones enviadas, facturas y operaciones de ese cliente. Permite aceptar cotizaciones, subir OC, informar comprobantes y recibir servicios. Los costos, enlaces de otros clientes y documentos internos quedan excluidos. Para compartir un documento de servicio hay que activar **Compartir este documento con el cliente**; sus archivos también deben marcarse para portal. Se comprueba la pertenencia en cada descarga, incluidas las imágenes utilizadas al generar PDF. Los enlaces son accesos por posesión del enlace, no cuentas de cliente con contraseña.

Adjuntos: PDF, JPG, PNG, WebP, XLSX o DOCX de hasta 5 MB. Se valida extensión y cabecera, y se registra SHA-256 para comprobar integridad al descargar. No hay OCR, edición de archivos ni análisis antivirus integrado. Quitar un archivo conserva su contenido; puede recuperarse con **Ver archivos retirados**. Las confirmaciones de eliminación y las alertas usan los mismos modales animados, temas y progreso del resto del sistema.

En local, los registros, versiones y eventos viven en `data/store.json`, dentro de `business`; los archivos binarios en `data/attachments/<id>`. No borrar esos directorios al actualizar. En Firebase, se usan `businessRecords`, `businessEvents`, `businessBlobs/<id>/chunks` y `metadata/business-counters`, compartiendo el bloqueo transaccional `metadata/commerce-lock` con la facturación e inventario. Las nuevas colecciones continúan sin acceso directo del navegador; todas las acciones pasan por la API. La operación Firebase real requiere credenciales y comprobación en tu proyecto.

**Configuración → Descargar operaciones y adjuntos (ZIP)**, solo Admin, descarga `records.json`, `manifest.json` y los archivos comerciales, incluidos los retirados. Incluye documentos, eventos, catálogo y clientes; excluye cuentas, sesiones e imágenes del catálogo. El respaldo JSON anterior mantiene su alcance de documentos/clientes/catálogo y no incluye estos binarios. Para un respaldo integral local, detener la API y copiar toda la carpeta `data` a una ubicación privada.

El ZIP es un respaldo exportable, sin importador visual. Para restaurar localmente, detener la API y respaldar antes `data`; tomar los campos de `records.json` excepto `customers` para `store.json`, guardar `customers` como arreglo en `customers.json`, y copiar cada archivo `attachments/<id>/<nombre>` del ZIP a `data/attachments/<id>`. Conservar las cuentas, sesiones e imágenes del catálogo del respaldo integral correspondiente. No importar directamente estos JSON en Firestore.

Pruebas nuevas: límites de OC y pagos bajo concurrencia, idempotencia, saldos/anulación, verificación de comprobantes, aislamiento y revocación del portal, imágenes y adjuntos autorizados, costos netos, recurrencias y ZIP con CRC. Se ejecutan con datos temporales y no alteran `data` real.

## Roles y permisos de usuarios

En **Administración → Roles y permisos** puedes crear, duplicar y editar roles, escoger las vistas que pueden consultar y habilitar sus acciones: crear/adjuntar, editar, eliminar/recuperar, confirmar/cambiar estado, exportar/descargar y compartir. Primero se activa **Ver**; al desactivarlo también se quitan las acciones de esa vista. **Mi perfil** siempre está disponible para una cuenta activa.

Asigna el rol en **Administración → Usuarios**, tanto al crear una cuenta como desde el selector de cada usuario. Los cambios de un rol afectan a todas sus cuentas. **Admin** conserva acceso completo y no puede modificarse ni eliminarse; solo Admin administra usuarios, roles, enlaces privados y respaldos completos. El rol inicial **Usuario** mantiene los permisos anteriores para las cuentas existentes; se puede ajustar su matriz, pero no eliminarlo.

Para eliminar un rol personalizado primero hay que reasignar todos sus usuarios, incluidos los desactivados y enviados a papelera. Los roles eliminados se pueden recuperar desde **Ver roles eliminados**. Los cambios conservan versiones e historial, y una edición desactualizada solicita recargar para evitar sobrescribir cambios ajenos. Se mantienen las protecciones del acceso propio y del último administrador activo.

El menú y los controles se adaptan a los permisos. El servidor consulta el rol vigente en cada petición, comprueba las acciones y filtra documentos, clientes, productos, operaciones, adjuntos e historiales. Dashboard, Resumen y Agenda muestran información de los módulos permitidos; no conceden acceso adicional. Para elegir clientes o vincular cotizaciones, OC, OT o facturas, concede también **Ver** en esas secciones. Confirmar pagos requiere permisos de Cobranza; una recepción conforme requiere confirmar en Servicios. El portal privado de clientes mantiene sus propias comprobaciones de pertenencia y vigencia.

Con la aplicación abierta y conectada, los menús se actualizan al volver a la pestaña, ante una denegación o en un máximo de aproximadamente 20 segundos. La autorización del servidor cambia desde la siguiente petición. Sin conexión se usan los últimos permisos conocidos y se filtra la caché con ellos; cualquier guardado pendiente se vuelve a autorizar al sincronizar. Una revocación nueva necesita conexión para conocerse.

En modo local los roles y su historial se guardan en `data/roles.json`; consérvalo junto con `users.json` en el respaldo integral de `data`. Los ZIP comerciales no incluyen cuentas, sesiones ni roles. En Firebase se usan `roles`, `accessEvents` y `metadata/access-lock`; las asignaciones y eliminaciones se coordinan transaccionalmente. El navegador no accede directamente a estas colecciones. Las pruebas automatizadas de permisos se ejecutan en modo local; la conexión Firebase real necesita validarse con las credenciales del proyecto.
