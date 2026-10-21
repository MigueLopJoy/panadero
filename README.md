# Pan & Agua v6 · Variantes de variantes y amasados encadenados

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
