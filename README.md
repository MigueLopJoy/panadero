# Pan & Agua v8 · Planificación guiada por familias y etapas

Esta versión amplía el recetario y el planificador global de V5 sin cambiar las claves de almacenamiento (`pan_v4` para recetas y `pan_global_plans_v1` para planes) ni requerir un servidor de aplicaciones.

## Niveles permitidos

El límite se ha interpretado según el ejemplo solicitado: **receta original → primera variante → variante de la variante → segunda derivación de la variante**. Es decir, tres enlaces de derivación y **dos niveles adicionales después de la primera variante**. Ejemplo:

1. Masa blanca original (100 % harina, 65 % agua, 2 % sal, 1 % levadura).
2. Masa de chapata (hereda la original y añade 10 % de agua).
3. Focaccia básica (hereda la chapata y añade 5 % de aceite).
4. Focaccia de aceitunas, queso o chorizo (heredan la focaccia y añaden sus tropezones).

Se bloquean ciclos, referencias inexistentes y nuevas derivaciones que excedan el límite. Las fórmulas siguen usando **porcentajes panaderos sobre la harina total**, no porcentajes del peso de la masa anterior. Los cambios de cualquier antecesor se propagan a sus descendientes.

## Utilización

Abre la ficha de una variante, por ejemplo **Masa de chapata**, y pulsa **+ Nueva variante de este pan**. En el editor verás la fórmula heredada de la chapata, incluida el agua procedente de su masa original. Añade el aceite necesario para crear **Focaccia básica**. En la ficha de esta última podrás crear más derivaciones: **Focaccia de queso**, **Focaccia de aceitunas**, etc. En el último nivel desaparece el botón para crear otra derivación.

Cada variante puede seguir incorporando **elaboraciones previas propias** (como un escaldado) a partir de sus **ingredientes adicionales**. No se sustraen ingredientes de una masa progenitora ya preparada. El agua de esas preparaciones debe declararse en los ingredientes propios del nivel y no puede superarlos. En modo **Desde masa anterior**, la ficha solo enseña las elaboraciones propias de esa transformación. En modo **Desde cero**, enseña también las elaboraciones de todos los antecesores.

## Planificador global

En **Producción**, selecciona panes de cualquier familia o panes independientes, número de piezas, peso y modo. El motor agrupa las necesidades **por cada etapa de la genealogía** y calcula el reparto de masa hacia las etapas descendientes. Si varias focaccias usan la misma masa de focaccia básica, esta se prepara conjuntamente una sola vez; la masa de chapata y la masa original también se agrupan según sus necesidades reales.

Se mantiene el **excedente opcional por etapa**: preparar 100 g adicionales de focaccia básica incrementa automáticamente los ingredientes y la masa de chapata necesarios para producir ese excedente. Los excedentes se registran sin alterar la fórmula ni el peso de los panes seleccionados.

La temperatura de amasado se puede calcular para cada etapa que incorpore agua nueva. En una transformación se considera la masa anterior como un ingrediente compuesto, no como ingredientes crudos que haya que incorporar de nuevo.

## Excel

La exportación global continúa generando siete hojas: **Producción**, **Masas base**, **Elaboraciones**, **Masas finales**, **Reparto**, **Fórmulas** e **Ingredientes totales**. Ahora la hoja de masas incluye también todas las etapas intermedias. Cada preelaboración aparece en su etapa real; el aprovisionamiento cuenta exclusivamente los ingredientes incorporados por primera vez en esa etapa. Las cantidades están expresadas en gramos, antes de pérdidas por horneado.

Las fórmulas de la hoja **Producción** recalculan sus propias celdas, pero las hojas de preparación y compras son una fotografía del cálculo en el momento de exportar. Si cambian piezas o pesos, vuelve a exportar el plan desde la aplicación.

## Importación y conservación de datos

Al exportar una receta con descendientes, o una variante que dependa de otros panes, se genera un **paquete de familia autocontenido**. Al importar se remapean los ID que coincidan con recetas existentes y se preservan las relaciones de todos los niveles. No se sobrescriben recetas previas. La eliminación de un padre con hijos directos continúa bloqueada.

Antes de actualizar, exporta una copia de seguridad de tus familias y mantén la aplicación en el mismo origen web para conservar el `localStorage` del navegador. Sustituye juntos `index.html`, `scripts.js`, `production.js`, `global-planner.js`, `excel-export.js` y `styles.css`.

## Pruebas y ejemplos

- `ejemplo_focaccias_multinivel.json`: familia completa importable con poolish original, chapata, focaccia básica, aceitunas (con escaldado), queso y chorizo.
- `ejemplo_produccion_focaccias.xlsx`: Excel exportado realmente desde el navegador usando una producción conjunta de 9.650 g.
- `test-browser.py`: pruebas funcionales en Chromium de la interfaz, el cálculo, la conservación de masa, el modo desde cero, la importación y Excel. **61 comprobaciones superadas** en el entorno de desarrollo (antes de las últimas revisiones menores).
- `test.js`: batería anterior de regresión, ampliable con `npm install && npm test` si dispones de `jsdom`. El código de producción no necesita dependencias Node.

Para ejecutar la aplicación en local:

```bash
python -m http.server 8000
```

Después abre `http://localhost:8000`. Para ejecutar las pruebas funcionales, instala Playwright para Python y Chromium, y ejecuta `python test-browser.py` (en una máquina donde se encuentre Chromium en `/usr/bin/chromium`).


## V7: selección múltiple en un paso

En la pestaña **Producción**, el control **Elige un pan para añadir...** ahora abre una lista de casillas de verificación. Marca tantos panes como desees y pulsa **Añadir** una sola vez. El botón permanece desactivado si no hay ninguno seleccionado. Los panes que ya forman parte del plan no vuelven a aparecer en la lista. Si desmarcas uno antes de confirmar, no se añade; cambiar de plan descarta la selección temporal no confirmada. Cerrar el desplegable sin añadir no cambia el plan.

La selección no afecta al cálculo ni al almacenamiento hasta que pulses **Añadir**. Se mantienen los modos por receta, las masas compartidas, las preelaboraciones y la exportación Excel de V6.


## V8: nueva guía de producción, análisis y decisiones de diseño

**Diagnóstico previo:** la V7 concatenaba en un mismo scroll todas las etapas y todos los panes. Además, al mostrar la masa final de una receta original usaba `summaryRows` (ingredientes sin descontar), por lo que no daba instrucciones operativas equivalentes a las del recetario. Las elaboraciones previas debían calcularse por separado y añadirse explícitamente a la masa final.

**Modelo y arquitectura aplicados:**

- Se mantiene intacta la base matemática `calculateRecipeFormula` → `calculateVariant` → `calculateGlobalProduction`, con las mismas claves de `localStorage` y el mismo esquema de recetas. No se migran datos por el rediseño.
- Se añade `planner-ui.js`, una capa de presentación que deriva familias y etapas de los resultados del cálculo global. `buildPlanPresentation(calc)` no altera recetas, planes ni almacenamiento.
- La navegación se separa en tres niveles: **familia**, **etapa de amasado** y **vista** (Ingredientes, Elaboraciones, Masa final, Reparto). Solo se visualiza una etapa y una vista cada vez, no una lista mezclada de todas las variantes.
- Un amasado compartido aparece **una sola vez** en su etapa. Una variante preparada desde cero aparece como **elaboración independiente** dentro de su familia, con sus elaboraciones heredadas, y no se mezcla con los ingredientes de una masa anterior.
- La selección y las cantidades del plan están en un panel plegable. El botón «Ver guía de elaboración» permite pasar directamente a las instrucciones y cerrar la edición sin perder datos.

**Reglas operativas:**

1. **Ingredientes**: materias primas de la etapa completa, *antes de descontar*. Para una transformación se muestra «Masa anterior» más ingredientes adicionales; su formulación química completa queda disponible en un desplegable informativo, no como nuevas pesadas.
2. **Elaboraciones**: un bloque por preelaboración de **esa etapa** con todos los ingredientes y la masa total. Las heredadas solo se muestran cuando se está elaborando desde cero; en un amasado compartido aparecen en la etapa donde se preparan.
3. **Masa final**: utiliza `finalRows` para descontar los ingredientes empleados en preelaboraciones, añade dichas preelaboraciones como ingredientes preparados e incorpora, si corresponde, la masa anterior ya mezclada. Esta vista incluye un balance legible.
4. **Reparto**: cantidades asignadas a panes terminados, transferencias a etapas hijas y excedentes. La suma debe igualar la masa preparada.
5. **Ingredientes totales**: pestaña separada con materias primas consolidadas de todo el plan, sin duplicar masas ni preelaboraciones.

**Invariantes exigidos antes de pintar una etapa:**

- `Σ ingredientes iniciales de la etapa = masa de la etapa`.
- `masa anterior + Σ ingredientes pendientes + Σ elaboraciones previas = masa de la etapa`.
- `Σ masa destinada a productos + Σ transferencia a etapas hijas + excedente = masa de la etapa`.
- El balance global sigue siendo `materias primas adquiridas = peso de panes + excedentes`.

Las comparaciones usan las cantidades internas no redondeadas, con una tolerancia de `0,00001 g` como en el resto de la aplicación. El redondeo a una décima se realiza solo para mostrar los resultados; por ello sumas visuales pueden diferir unas décimas del total.

**Excel:** se conserva la exportación XLSX con siete hojas y sus etapas, ingredientes, elaboraciones, amasados finales, reparto y aprovisionamiento. El libro exportado es una fotografía de la producción del momento: para cambiar cantidades hay que recalcular y exportar nuevamente desde la aplicación.

**Pruebas ejecutadas en Chromium:** `python test-browser.py` (75 comprobaciones preexistentes) y `python test-v8-ui.py` (37 comprobaciones nuevas), **112 comprobaciones satisfactorias** en total. Incluyen masas compartidas multinivel, poolish de origen, escaldados exclusivos, «desde cero», pan independiente, excedentes, conservación de masa, pestañas por familia, formularios plegables, persistencia y Excel realmente descargado con sus siete hojas. `test.js` permanece incluido, aunque su ejecución en Node requiere `npm install` para `jsdom` (el paquete no se encontraba en el caché npm de este entorno).

### Archivos modificados

- `global-planner.js`: delega únicamente la construcción visual a la nueva vista y valida resultados antes de mostrarlos.
- `planner-ui.js`: nuevo modelo de presentación, navegación e instrucciones de elaboración por etapa.
- `index.html`: carga del nuevo módulo y sección plegable de configuración.
- `styles.css`: estilos móviles para familias, etapas, subpestañas y fichas de trabajo.
- `test-browser.py`: carga también el módulo de presentación para las pruebas originales.
- `test-v8-ui.py`: pruebas end-to-end nuevas de las instrucciones y de la exportación.
- `ejemplo_plan_v8.xlsx` y capturas de pantalla: datos de una producción mixta validada para inspección.

### Cómo ejecutar

```bash
python -m http.server 8000
```

Desde la carpeta que contiene `index.html`, visita `http://localhost:8000`. Para ejecutar las pruebas del navegador requiere `playwright` y Chromium instalados; en otra máquina puede ser necesario cambiar la ruta a Chromium definida en los scripts de prueba.
