# Pan & Agua · Familias y planificador de producción

Ampliación de la aplicación web original, sin frameworks, servidores ni servicios externos. Contiene el recetario original, las calculadoras de temperatura de amasado y mezcla de agua, además de familias de recetas y planes de producción conjuntos.

## Abrir la aplicación

Mantén **todos los archivos** en la misma carpeta. Abre `index.html` con un navegador moderno. Para evitar las restricciones de almacenamiento de algunos navegadores cuando se abren archivos `file://`, es preferible servir la carpeta desde un servidor estático. Por ejemplo:

```bash
python -m http.server 8000
```

Después visita `http://localhost:8000`. También puedes desplegar el contenido como página estática.

## Recorrido de uso

1. En **Recetas > Nueva**, crea una receta normal para utilizarla como masa base. Configura sus harinas, ingredientes y elaboraciones previas (si procede).
2. Abre la masa base y pulsa **+ Nueva variante**. Introduce el nombre y los ingredientes adicionales (porcentajes *sobre el peso total de harina*, no sobre la masa base).
3. Guarda la variante. En su ficha podrás cambiar entre **Desde masa base** y **Desde cero**. En el primer modo, **Masa final** únicamente requiere masa base terminada y adiciones, sin repetir los prefermentos ya incorporados.
4. En la ficha de la masa base pulsa **Planificar producción**. Activa las variantes y escribe las piezas y los gramos de masa por pieza de cada una.
5. La aplicación calcula automáticamente los gramos de masa base necesarios, los prefermentos globales, el reparto entre variantes y los ingredientes totales para preparar. Si deseas preparar más masa base, introduce **Masa base adicional sin asignar (g)**.
6. Pulsa **Exportar producción a Excel (.xlsx)** para obtener un Excel de siete hojas. También puedes transferir la **masa base conjunta** a la calculadora de temperatura.

Los pesos son pesos de masa antes del horneado; no se aplica ninguna merma de fermentación u horneado.

## Excel

La exportación genera un fichero `.xlsx` válido y completo **sin dependencias externas ni conexión a Internet**. Contiene:

- **Producción:** piezas, pesos, harina equivalente, masa base y adiciones por variante, con fórmulas en las celdas del cálculo de reparto.
- **Masa base:** formulación, cantidades totales y descuentos por elaboraciones previas.
- **Elaboraciones:** ingredientes y cantidades de cada prefermento, escaldado, remojo, etc.
- **Masa final base:** ingredientes que se incorporan directamente después de preparar las elaboraciones previas.
- **Reparto:** masa base y adiciones de cada variante por separado.
- **Fórmulas:** composición completa de cada pan, con procedencia heredada o adicional.
- **Ingredientes totales:** lista consolidada de ingredientes necesarios para la producción, incluido el posible excedente de masa base.

**Importante:** las hojas de desglose son una *fotografía* de la producción en el momento de exportar. Puedes editar piezas/pesos en la hoja «Producción» y se recalculan sus totales de reparto, pero las otras hojas no se regeneran automáticamente en Excel. Para cambios globales definitivos, actualiza el plan en la aplicación y vuelve a exportarlo.

## Importación y exportación

Las recetas existentes siguen guardándose en `localStorage` con la clave original **`pan_v4`**. Los planes se guardan aparte en **`pan_production_v1`**.

- La exportación JSON ordinaria de una receta continúa existiendo.
- **Exportar familia JSON** descarga la masa base, todas sus variantes y el plan guardado en un paquete autocontenido.
- La función **Importar** acepta tanto recetas JSON individuales y arrays antiguos como las familias autocontenidas. En caso de conflicto de identificadores, remapea los registros importados, sin sobrescribir recetas existentes.
- El ejemplo `ejemplo_familia.json` incluye la masa blanca con cuatro variantes, prefermento opcional y tres producciones seleccionadas; se puede importar desde la aplicación.
- La eliminación de una masa base se bloquea mientras tenga variantes. Antes se deben eliminar las variantes.

**Se recomienda guardar regularmente una copia JSON de las familias importantes.** El almacenamiento local del navegador puede borrarse si se eliminan los datos del sitio o se cambia de dispositivo.

## Alcance y decisiones técnicas

- Cada variante tiene **una sola receta base**, a un nivel. No se permiten jerarquías recursivas.
- La variante **añade** ingredientes; no permite restar ingredientes de la masa base.
- Las elaboraciones previas pertenecen a la receta base y se heredan. En esta versión no se configuran elaboraciones previas propias de cada variante.
- En el cálculo de temperatura, la masa base se trata como un ingrediente compuesto; si una variante no tiene agua adicional, no se muestra la acción para calcular temperatura del agua de esa etapa.
- Los ingredientes adicionales que tienen exactamente el mismo nombre (ignorando mayúsculas/minúsculas) que un ingrediente heredado se consolidan en el resumen completo.
- La matemática utiliza todos los decimales, redondeando solamente al mostrar cantidades en pantalla. El Excel guarda los valores numéricos sin redondear.

## Arquitectura

- `index.html`: vistas, formularios y navegación.
- `styles.css`: estilos de la interfaz móvil.
- `scripts.js`: recetario, cálculo puro compartido, editor tradicional y herramientas de temperatura.
- `production.js`: familias, cálculos de variantes, producción conjunta, planificación, persistencia e importación/exportación JSON.
- `excel-export.js`: creación de Excel OpenXML (`.xlsx`) sin dependencias externas.
- `test.js`: pruebas clásicas y nuevas de regresión.

## Ejecutar las pruebas

Con Node.js moderno, en esta carpeta:

```bash
npm install
npm test
```

`jsdom` se utiliza únicamente en pruebas, no en la aplicación desplegada. La batería cubre fórmulas, prefermentos, herencia, masas compartidas, persistencia, validaciones y estructura Excel. También se probó la interfaz y descarga en Chromium, y la muestra exportada se abrió mediante un lector de hojas de cálculo.
