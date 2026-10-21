# Pan & Agua · V5: elaboraciones heredadas según el modo de elaboración

Aplicación web estática de formulación panadera. Conserva el recetario original, las familias de panes, las calculadoras de amasado y de mezcla de aguas, e incorpora **elaboraciones previas exclusivas de las variantes** y **planes transversales que combinan panes de distintas familias o independientes**.

## Instalación

No se requiere servidor de aplicación, conexión a Internet ni base de datos. Conserva juntos `index.html`, `styles.css`, `scripts.js`, `production.js`, `global-planner.js` y `excel-export.js`.

Puedes abrir `index.html` directamente, aunque recomendamos un servidor estático para la persistencia del navegador:

```bash
python -m http.server 8000
```

Después visita `http://localhost:8000`.

## Elaboraciones previas de cada variante

1. Abre una masa base y crea una variante, o abre una variante y pulsa **Editar**.
2. En **Ingredientes adicionales**, incorpora todos los ingredientes de la transformación, *incluida el agua que vaya a consumir cualquier escaldado*. Los porcentajes se refieren a la harina total de la fórmula.
3. En **Elaboraciones previas propias**, pulsa **+ Elaboración**, escribe su nombre (por ejemplo, *Escaldado de semillas*), añade una fila de ingrediente y otra de agua.
4. En la fila de ingrediente, selecciona uno de los adicionales y especifica qué porcentaje de ese ingrediente destinas a la elaboración, expresado sobre la harina de la receta. El botón **+ Agua** crea una fila de agua independiente (no un selector de ingredientes). Indica el porcentaje de hidratación y selecciona como referencia **todos los ingredientes de la elaboración** o **un ingrediente concreto**. La primera opción suma la harina y/u otros ingredientes de esa elaboración.
5. La cantidad de agua utilizada en una o varias elaboraciones **no puede superar el porcentaje de Agua declarado en los ingredientes adicionales** de la variante. El editor indica el consumo y el cálculo se bloquea si falta agua. Guarda la variante. Si seleccionas **Desde masa base**, sus pestañas muestran únicamente las elaboraciones **propias** que debes preparar aparte. En **Desde cero** también aparecen las elaboraciones heredadas (como masa madre o poolish).

**Ejemplo:** masa base con 100 % harina, 65 % agua, 2 % sal y 1 % levadura; variante con 20 % semillas + 20 % agua adicionales; escaldado de 20 % semillas con 100 % de agua sobre las semillas. Por cada 1.000 g de harina, se emplean 1.680 g de masa base y se prepara un escaldado de 400 g (200 g semillas y 200 g agua), para obtener 2.080 g de masa total. El agua del escaldado no se vuelve a mostrar como pendiente en la masa final.

**Límite físico deliberado:** una preelaboración propia no puede sustraer ingredientes de la masa base **ya mezclada**. Si necesitas elaborar una preparación con harina o agua adicionales, añádelas primero como ingredientes específicos de la variante. El editor admite cantidades sobre cualquier ingrediente adicional, incluida harina añadida como ingrediente, y porcentajes de agua sobre un ingrediente o sobre la suma de harina y demás ingredientes incorporados a la elaboración. El agua se añade siempre con su botón específico; no debe seleccionarse como otro ingrediente de esa elaboración. Las elaboraciones tradicionales de harina de la masa base deben definirse en la receta base o producir la variante **desde cero**.

## Planificación de producción desde fuera del recetario

1. En la navegación inferior, abre **Producción** (la planificación ya no pertenece a una receta concreta).
2. Crea un plan nuevo o selecciona uno de los existentes y ponle un nombre.
3. Añade cualquier pan del recetario: recetas independientes, masas base utilizadas como producto final y variantes de una o varias familias.
4. Indica **número de piezas** y **peso por pieza**. En cada variante decide si utilizarás su masa base compartida o si la harás *desde cero*.
5. La aplicación agrupa automáticamente las variantes que comparten una masa base en un solo amasado. Las recetas independientes conservan sus propias elaboraciones y no se mezclan accidentalmente con otras. Las variantes realizadas desde cero quedan fuera del amasado compartido.
6. Para cada amasado puedes indicar un **excedente sin asignar (g)**. El plan muestra el reparto, las elaboraciones previas de las bases, las de cada variante y el total de ingredientes sin duplicaciones.
7. Pulsa **Exportar plan completo a Excel (.xlsx)**.

Se admiten varios planes con nombres distintos. Los datos de los planes se guardan aparte de las fórmulas y persisten al recargar.

## Excel generado

El planificador produce siete hojas:

- **Producción:** lista de panes, piezas, pesos, modo de elaboración y masa base asignada, con fórmulas para los repartos de variantes.
- **Masas base:** ingredientes necesarios para cada amasado compartido, con descuentos de elaboraciones previas y excedentes.
- **Elaboraciones:** poolish, masas madre, escaldados y remojos, distinguiendo los amasados comunes de las elaboraciones exclusivas de cada variante.
- **Masas finales:** qué componentes se incorporan en cada etapa, con los descuentos aplicados.
- **Reparto:** ingredientes y preparaciones por pan.
- **Fórmulas:** composición completa de cada receta producida.
- **Ingredientes totales:** lista global de aprovisionamiento, sin sumar dos veces ingredientes ya incluidos en masas base o prefermentos.

**Aviso:** las hojas de detalle son una fotografía del plan al exportar. Si modificas piezas o pesos dentro de la hoja «Producción», se recalcularán sus celdas con fórmulas, pero **las hojas de preparación y compras no se regeneran automáticamente en Excel**. Para actualizar la producción completa, modifica el plan en la aplicación y vuelve a exportarlo.

## Compatibilidad y migración

- Las recetas existentes permanecen en `localStorage` bajo **`pan_v4`**, sin necesidad de migrarlas manualmente.
- Los planes familiares de V2 se conservan en `pan_production_v1`; al inicializar por primera vez la V3, sus filas seleccionadas se copian a un plan global si todavía no hay planes globales.
- Las variantes V3 que almacenaron agua como «Otro ingrediente» dentro de un escaldado se normalizan automáticamente si contienen sólidos de referencia, conservando exactamente los gramos de agua. Si faltan los sólidos, se conserva el registro sin convertirlo para que pueda corregirse manualmente.
- Los nuevos planes se almacenan en **`pan_global_plans_v1`**. Los datos de las recetas son independientes de los de producción.
- La importación JSON sigue aceptando recetas individuales, listas y paquetes de familias de V2. La importación de una familia antigua con plan incorpora sus filas a un plan global adicional, sin sobrescribir otros planes.
- La exportación JSON de familias y de recetas individuales se mantiene. Guarda copias fuera del navegador para proteger tus fórmulas: borrar los datos del sitio también borra su almacenamiento local.
- En una masa base, **Abrir planificador** te lleva al plan global para elegir libremente los panes. En una variante, **Añadir esta variante al plan** la incorpora directamente al plan actual. También puedes acceder desde la navegación principal.
- La eliminación de una masa base con variantes dependientes permanece bloqueada hasta resolver sus dependencias. Eliminar una receta retira sus filas de los planes sin alterar las demás.

## Estructura técnica

- `scripts.js`: editor original, motor de porcentajes panaderos y descuentos por elaboraciones, temperaturas.
- `production.js`: familias, variantes, calculadora de elaboraciones exclusivas y compatibilidad con planes antiguos.
- `global-planner.js`: planes globales, persistencia separada, agrupación de masas y pantalla de planificación.
- `excel-export.js`: serialización OpenXML y Excel de planes globales y legados.
- `index.html`, `styles.css`: interfaz móvil.
- `test.js`: pruebas de regresión y verificaciones de V4 (requiere `jsdom`).
- `test-browser.py`: 28 verificaciones en Chromium (Playwright), sin `jsdom`, de la interfaz de agua y sus cálculos.
- `ejemplo_recetas_v3.json`: conjunto de recetas importables con escaldado propio y pan independiente.
- `ejemplo_hidratacion_v4.json`: ejemplo nuevo de agua al 100 % respecto a la suma de semillas y harina añadida.
- `vista_hidratacion_v4.png`: captura del editor corregido en vista móvil.
- `ejemplo_produccion_global.xlsx`: muestra real de un plan multirreceta con elaboraciones previas.

## Pruebas

Si dispones de Node.js y puedes instalar las dependencias de desarrollo:

```bash
npm install
npm test
```

Las verificaciones adicionales en Chromium pueden ejecutarse con Playwright para Python instalado:

```bash
python test-browser.py
```

El código de producción **no necesita `jsdom`**. Se ha validado adicionalmente en Chromium mediante pruebas funcionales del motor, la navegación y el editor de variantes. Se generó y verificó el XLSX de ejemplo, incluida su estructura y los resultados numéricos. Los pesos son de masa antes del horneado, sin estimar mermas.

## Corrección V4: diferencia entre agua disponible y base de hidratación

En una variante, el agua de una elaboración previa es un **consumo** de la fila «Agua» de sus ingredientes adicionales. El **porcentaje que escribes en la elaboración** expresa una proporción respecto a los sólidos elegidos: puedes elegir un ingrediente o «Todos los ingredientes de la elaboración» (harinas y demás ingredientes añadidos a esa elaboración). Por ejemplo, 20 % semillas + 10 % harina, con 100 % de agua sobre todos: requiere 30 % de agua adicional en la receta. Si solo declaras 25 % de agua adicional, se muestra un error y no permite guardar. Las elaboraciones previas de la masa base siguen perteneciendo a la propia masa base. Los planes y el Excel usan exactamente el mismo cálculo.

## Cambio de visualización en V5

Al abrir una **variante** y seleccionar **Desde masa base**, la aplicación **no muestra** como elaboraciones pendientes las heredadas de la masa base: ya están incorporadas en la masa preparada. Solo aparecen las elaboraciones **exclusivas** de la variante (por ejemplo, el escaldado de semillas). Su pestaña Masa final conserva la masa base preparada y las adiciones necesarias.

Al seleccionar **Desde cero** aparecen tanto las elaboraciones heredadas como las propias, y la masa final vuelve a mostrar el proceso completo desde ingredientes. El motor interno conserva la formulación completa en ambos modos; solo cambian las instrucciones de elaboración.

En el **planificador global**, las elaboraciones de la masa base siguen apareciendo **una vez en el amasado común** si hay variantes que utilizan esa masa, pero nunca se presentan de nuevo como tareas de cada variante. Si una variante se elabora desde cero, sus elaboraciones heredadas aparecen dentro de su preparación individual. Esta diferencia se respeta en el Excel.

Las pruebas V5 de `test.js` cubren el cambio de modo, las pestañas, el editor, el Excel y la conservación de masa.
