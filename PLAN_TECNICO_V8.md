# Plan técnico y verificación · Pan & Agua V8

## Objetivo

Convertir el planificador global de un volcado vertical de resultados en una guía operativa de preparación, conservando los cálculos y relaciones multinivel de V7.

## Auditoría previa

Archivos base: `scripts.js` (motor de receta independiente y pestañas), `production.js` (fórmulas y elaboraciones de variantes), `global-planner.js` (producción conjunta y persistencia), `excel-export.js` (exportación), `index.html`/`styles.css` (interfaz) y las pruebas `test-browser.py`/`test.js`.

Hallazgos:

1. El planificador antiguo utilizaba `summaryRows` para instruir el amasado de una raíz. Es correcto como lista de composición, pero incorrecto como instrucción tras reservar ingredientes para prefermentos.
2. El motor ya facilita los datos correctos (`summaryRows`, `elabCalcs`, `finalRows`, `stage`, `baseMass`, `groups`, `items`). El defecto principal era la organización, no el algoritmo.
3. El listado mezcla etapas compartidas y variantes finales, lo que favorece confundir cantidades informativas con ingredientes que realmente hay que añadir.
4. Una variante `scratch` no necesita masa progenitora preparada y debe ser una etapa independiente dentro de su genealogía.
5. El usuario puede necesitar conocer la composición completa del pan, pero esta no debe confundirse con la lista de ingredientes nuevos de una transformación.

## Diseño decidido antes de programar

### Capas

- **Datos y cálculo:** se conservan sin cambios el esquema de recetas `pan_v4`, planes `pan_global_plans_v1` y los motores matemáticos originales.
- **Modelo de presentación puro:** `buildPlanPresentation(calc)` agrupa los nodos de `calc.groups` según su receta raíz, incorpora las recetas `scratch` como lotes independientes y entrega fichas de etapa listas para pintar.
- **Navegación y presentación:** `renderPlanExperience` mantiene una sola familia, una sola etapa y una sola vista visibles. Controles: familia, etapa y `Ingredientes / Elaboraciones / Masa final / Reparto`.
- **Configuración:** el formulario para añadir panes y definir cantidades permanece intacto dentro de `<details>` plegable.
- **Exportación:** `globalProductionWorkbookData` mantiene las siete hojas existentes y el cálculo compartido.

### Contrato de contenido

| Vista | Qué representa | Qué NO se vuelve a contar |
|---|---|---|
| Ingredientes | Todos los componentes que entran a la etapa, incluido el bloque de masa anterior cuando existe | No se muestran por separado los ingredientes internos de la masa ya preparada |
| Elaboraciones | Cada preparación previa creada en esa etapa, con desglose y masa total | No se duplican preelaboraciones heredadas ya hechas en un amasado antecesor |
| Masa final | Ingredientes de `finalRows`, ya descontados, más las elaboraciones completas y masa anterior | No se añade dos veces agua, harina ni prefermentos |
| Reparto | Masa hacia productos, masas hijas y excedente | El traslado a una masa hija no es una nueva compra |

### Invariantes por etapa

- `sum(inputs.grams) = grams`.
- `sum(inherited.grams) + sum(pending.final) + sum(elabs.total) = grams`.
- `sum(allocations.grams) = grams`.

### Invariante global

`sum(ingredientRows.grams) = sum(items.totalMass) + sum(group.extra)`.

Las sumas utilizan precisión completa, tolerancia `1e-5` y formato de salida de una decimal.

## Secuencia de implementación completada

1. Auditoría y baseline de 75 pruebas en Chromium.
2. Extracción de capa de presentación nueva a `planner-ui.js`.
3. Sustitución de la concatenación vertical de resultados en `global-planner.js`.
4. Incorporación de navegación por familias, etapas y vistas, con panel de configuración plegable.
5. Añadidos detalles operativos: descuento de ingredientes, ficha de cada elaboración, masa anterior, sumatorios, distribución, excedentes y acceso a cálculo de agua de amasado.
6. Corrección de una incidencia descubierta en tests: una receta raíz independiente necesita formar parte de sus destinos de producción aunque su modo de elaboración sea `scratch`.
7. Ejecución de 75 pruebas previas + 37 específicas V8, validación de JavaScript y generación real del Excel desde Chromium.

## Pruebas realizadas

- Multi-generación: base → chapata → focaccia → sabores.
- Preparación compartida y `scratch` en el mismo plan.
- Raíces independientes junto a familias multinivel.
- Poolish heredado incluido en la etapa real y escaldado propio de una variante.
- Descuento explícito de agua y harina en masa final original.
- Elaboraciones propias visibles sin repetir las heredadas.
- Balances individuales y globales con excedentes en diferentes etapas.
- Selector de familia y etapas, paneles, cambios de vista y panel de edición plegable.
- Conservación exacta del JSON del plan al consultar o cambiar vistas.
- Exportación XLSX real de 7 hojas, ZIP OpenXML legible.
- No se detectaron excepciones JavaScript durante las pruebas de navegador.

**Resultado:** 75 + 37 = **112 comprobaciones satisfactorias**.

## Limitaciones de la verificación

- Se ejecutaron los dos scripts de Playwright en Chromium con HTML, estilos y scripts reales integrados en la página de pruebas. La ruta `http://127.0.0.1/...` está bloqueada por el entorno de ejecución, por lo que no se afirma haber validado aquí un despliegue localhost con recursos servidos por HTTP.
- El test de Node `test.js` requiere `jsdom`. No se encontraba en la caché npm y el modo de instalación offline no lo pudo obtener. Se conserva para ejecutarlo con `npm install && npm test` en un entorno con acceso a npm.
- La salida XLSX es una instantánea: editar sus celdas no recalcula automáticamente las otras hojas de preparación.

## Recomendación para desplegar

1. Exportar una copia de seguridad de recetas y familias en la versión anterior.
2. Sustituir juntos los seis archivos de ejecución: `index.html`, `scripts.js`, `production.js`, `global-planner.js`, `planner-ui.js`, `excel-export.js` y `styles.css` (siete archivos).
3. Mantener el mismo origen web para conservar el `localStorage`.
4. Probar primero una producción conocida con masa madre, una variante con escaldado y un pan independiente, comparando masa final y Excel con sus cálculos manuales.
