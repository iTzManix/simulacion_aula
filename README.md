# Aula en pausa

Simulador de ocupación y ventilación para una clase universitaria. El escenario inicial usa un aula de 10 × 10 × 3 m, 28 estudiantes, un docente y una clase de 90 minutos. Compara ventilación constante con un refuerzo de aire exterior entre los minutos 50 y 60.

## Ejecutar y publicar

Desde esta carpeta, ejecuta `python -m http.server 8000` y abre [la aplicación local](http://localhost:8000). Para publicar en GitHub Pages, coloca el contenido de esta carpeta en la raíz de un repositorio y elige esa rama y la carpeta `/` en **Settings → Pages**. La web usa HTML, CSS y JavaScript con rutas relativas. [Publicación desde una rama](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

El panel Aula 3D usa la misma solución exacta que la gráfica. La cortina representa la concentración estimada para todo el recinto. Las clases nuevas incluyen un docente. La escena muestra hasta 40 estudiantes y un docente, y el cálculo incluye a todos los ocupantes del escenario. La vista esquemática conserva las lecturas y la barra de tiempo cuando WebGL 2 no está disponible.

Los módulos de Three.js r187 y su licencia MIT están en `vendor/three-r187`. El sitio carga esos módulos al llegar al panel y los sirve desde GitHub Pages. [Versión r187 de Three.js](https://github.com/mrdoob/three.js/releases/tag/r187)

## Guardar en Supabase

1. En el SQL Editor del proyecto **Metodos**, ejecuta `supabase.sql`.
2. Copia la Project URL y la clave publicable `sb_publishable_…` de **Connect** a `config.mjs`. El código del navegador usa exclusivamente la clave publicable.
3. Pulsa **Compartir** y abre el enlace resultante en otro navegador. El enlace de Supabase tiene el formato `#escenario=…`. El guardado contiene solo los parámetros de la simulación. Cualquier persona con el enlace puede recuperar el escenario.

La tabla vive en un esquema privado. El rol sin sesión puede crear un escenario válido y leer uno por su UUID. El simulador recuerda el último escenario en el navegador. Cuando Supabase está sin configurar o no responde al guardado, **Compartir** genera un enlace que lleva los parámetros en la propia URL. [Claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys) · [Funciones SQL](https://supabase.com/docs/guides/database/functions)

## Modelo y comparación

El aula tiene volumen `V = largo × ancho × altura` en m³. Para `N` ocupantes, con emisión individual `e` en L/s, la generación es `g = 3 600 000 × N × e / V` en ppm/h. El balance es `C′(t) = g − k(C(t) − Cext)`, con `t` en horas, `k` en renovaciones de aire exterior por hora y `C(0) = C0`. El modelo supone aire bien mezclado y emisión y ventilación constantes dentro de cada tramo. [Balance de CO₂ del NIST](https://doi.org/10.6028/NIST.TN.2213)

Para `k > 0`, la solución por tramo es `Ceq + (Cinicio − Ceq) exp(−k Δt)`, con `Ceq = Cext + g/k`. En `Δt = 0` se obtiene `Cinicio`, y la derivada `−k(C − Ceq)` reproduce el balance. Para `k = 0`, la solución es `Cinicio + g Δt`. La concentración al final de cada tramo inicia el siguiente. Heun y RK4 recortan el último paso de cada tramo para aplicar el cambio de ventilación en el minuto correspondiente. Los errores absoluto y relativo se calculan contra la solución exacta con el paso elegido y con su mitad.

El cupo por CO₂ es el mayor número de estudiantes que deja el pico de la clase dentro de la meta, contando a los docentes en la emisión. La curva exacta es monótona dentro de cada tramo, así que se evalúan sus extremos. Si se conoce el número de plazas físicas de estudiantes, la web también muestra el menor de ambos valores. Cuando la ventilación base supera la meta, la web prueba inicios de pausa en minutos enteros, mantiene su duración y elige el que produce el menor pico. El horario de pausa, la ventilación y la meta inicial son supuestos para explorar. La fatiga, el foco y la recuperación se evaluarían en un piloto con mediciones separadas. [Estudio de pausas activas](https://doi.org/10.1177/00178969261420371) · [CO₂ y ventilación según ASHRAE](https://www.ashrae.org/about/position-documents)
