import { WebSocketManager } from "./webSocketManager.js";

// Márgenes y alto fijo para el gráfico
const MARGIN = { top: 20, right: 0, bottom: 30, left: 0 };
const HEIGHT = 400;

let zoomLevel = 100; // 100% = sin zoom
let panPosition = 0; // Valor entre 0 y 1 para el paneo
let currentChartType = "line"; // Tipo de gráfico actual
let receivedData = []; // Datos recibidos vía WebSocket
let selectedVariable = null; // Variable filtrada (null = todas)

// Definimos aquí la variable "tooltip", pero la inicializamos dentro de DOMContentLoaded
let tooltip;

// Configura el contenedor del SVG (limpia contenido previo)
function setupContainer() {
  const chartContainer = document.getElementById("chart");
  chartContainer.innerHTML = "";
  return chartContainer;
}

// Crea el SVG y el grupo <g> con márgenes
function setupSVG(chartContainer) {
  // Tomar el ancho actual del contenedor
  const width = chartContainer.clientWidth - MARGIN.left - MARGIN.right;
  const height = HEIGHT - MARGIN.top - MARGIN.bottom;

  // Crear SVG
  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("width", width + MARGIN.left + MARGIN.right)
    .attr("height", height + MARGIN.top + MARGIN.bottom);

  // Crear grupo <g> desplazado por márgenes
  const g = svg
    .append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  return { width, height, svg, g };
}

// Convierte { data_names, data } en array de objetos [{ name, var1, var2, ... }, ...]
function processData({ data_names: dataNames, data: rawData }) {
  if (!Array.isArray(rawData) || !Array.isArray(dataNames)) {
    throw new Error("Invalid data format");
  }
  return rawData.map((d) => {
    const datum = { name: d[0] };
    d[1].forEach((value, index) => {
      datum[dataNames[index]] = value;
    });
    return datum;
  });
}

// Configura las escalas x, y y la escala de colores z
function setupScalesForChart(processedData, dataNames, width, height, xRange) {
  const x = d3.scaleLinear().domain(xRange).range([0, width]);

  const y = d3
    .scaleLinear()
    .domain([
      0,
      d3.max(processedData, (d) =>
        Math.max(...dataNames.map((name) => d[name]))
      ),
    ])
    .nice()
    .range([height, 0]);

  const z = d3.scaleOrdinal().domain(dataNames).range(d3.schemeCategory10);

  return { x, y, z };
}

// Dibuja ejes x e y, con etiquetas opcionales
function drawAxes(
  g,
  xAxis,
  yAxis,
  width,
  height,
  xAxisLabel = "",
  yAxisLabel = ""
) {
  // Eje X en la parte inferior
  const xAxisGroup = g
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xAxis));

  setBoldAxisText(xAxisGroup);

  if (xAxisLabel) {
    xAxisGroup
      .append("text")
      .attr("fill", "#000")
      .attr("y", 20)
      .attr("x", width / 2)
      .attr("dy", "0.71em")
      .attr("text-anchor", "middle")
      .text(xAxisLabel);
  }

  // Eje Y a la izquierda
  const yAxisG = g.append("g").call(d3.axisLeft(yAxis));
  setBoldAxisText(yAxisG);
  yAxisG.selectAll(".tick text").attr("transform", "translate(30, 0)");

  if (yAxisLabel) {
    yAxisG
      .append("text")
      .attr("fill", "#000")
      .attr("transform", "rotate(-90)")
      .attr("y", 6)
      .attr("dy", "0.71em")
      .attr("text-anchor", "end")
      .text(yAxisLabel);
  }
}

// Aplica negrita a las etiquetas de ticks de un eje
function setBoldAxisText(axis) {
  axis.selectAll(".tick text").style("font-weight", "bolder");
}

// Dibuja la leyenda en la esquina superior derecha
function drawLegend(g, dataNames, width, z, selectedVariable) {
  const legendData = selectedVariable ? [selectedVariable] : dataNames;

  const legend = g
    .append("g")
    .attr("font-family", "sans-serif")
    .attr("font-size", 10)
    .attr("text-anchor", "end")
    .selectAll("g")
    .data(legendData)
    .enter()
    .append("g")
    .attr("transform", (d, i) => `translate(0,${i * 20})`);

  legend
    .append("text")
    .attr("x", width - 24)
    .attr("y", 9.5)
    .attr("dy", "0.32em")
    .text((d) => d)
    .each(function () {
      const textWidth = this.getBBox().width;
      d3.select(this.parentNode)
        .insert("rect", "text")
        .attr("x", width - 24 - textWidth - 5)
        .attr("y", 0)
        .attr("width", textWidth + 30)
        .attr("height", 20)
        .attr("fill", "white");
    });

  legend
    .append("rect")
    .attr("x", width - 19)
    .attr("width", 19)
    .attr("height", 19)
    .attr("fill", (d) => z(d));
}

// Dibuja un gráfico de líneas con puntos interactivos
function drawLines(g, processedData, dataNames, x, y, z, selectedVariable) {
  dataNames.forEach((name) => {
    const line = d3
      .line()
      .x((d) => x(d.name))
      .y((d) => y(d[name]));

    // Dibujar la línea (queda igual)
    g.append("path")
      .datum(processedData)
      .attr("id", "line-" + name)
      .attr("fill", "none")
      .attr("stroke", z(name))
      .attr("stroke-width", 1.5)
      .attr("d", line)
      .attr("opacity", selectedVariable && selectedVariable !== name ? 0 : 1);

    // Dibujar círculos “invisibles” que capturan eventos
    g.selectAll(".dot-" + name)
      .data(processedData)
      .enter()
      .append("circle")
      .attr("class", "dot-" + name)
      .attr("cx", (d) => x(d.name))
      .attr("cy", (d) => y(d[name]))
      .attr("r", 4)
      // EN LUGAR DE fill: "transparent", usamos un color con opacidad 0:
      .attr("fill", z(name))
      .attr("fill-opacity", 0)
      // Aseguramos que reciba eventos aun siendo invisible:
      .style("pointer-events", "all")
      // Evento para mostrar tooltip
      .on("mouseover", function (event, d) {
        tooltip
          .classed("visible", true)
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px")
          .html(`Ticks: ${d.name}<br>${name}: ${d[name].toFixed(2)}`);
      })
      // Para que el tooltip siga al cursor
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      // Al salir, ocultamos el tooltip
      .on("mouseout", function () {
        tooltip.classed("visible", false);
      });
  });
}
// Dibuja un gráfico de barras mostrando la última entrada
function drawBarChart(data, selectedVariable) {
  const chartContainer = setupContainer();
  const { width, height, svg, g } = setupSVG(chartContainer);

  const tooltipLocal = d3.select("#tooltip"); // misma referencia

  const x0 = d3.scaleBand().rangeRound([0, width]).paddingInner(0.1);
  const x1 = d3.scaleBand().padding(0.05);
  const y = d3.scaleLinear().rangeRound([height, 0]);
  const z = d3
    .scaleOrdinal()
    .domain(data.data_names)
    .range(d3.schemeCategory10);

  const lastDataEntry = data.data[data.data.length - 1];
  if (!lastDataEntry) return;

  const lastX = lastDataEntry[0];
  const lastYValues = lastDataEntry[1];
  const variableNamesToShow = selectedVariable
    ? [selectedVariable]
    : data.data_names;

  y.domain([0, d3.max(lastYValues)]).nice();
  x0.domain([lastX]);
  x1.domain(variableNamesToShow).rangeRound([0, x0.bandwidth()]);

  const group = g.append("g").attr("transform", `translate(${x0(lastX)},0)`);

  group
    .selectAll("rect")
    .data(
      variableNamesToShow.map((name) => ({
        name,
        value: lastYValues[data.data_names.indexOf(name)],
      }))
    )
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => x1(d.name))
    .attr("y", (d) => y(d.value))
    .attr("width", x1.bandwidth())
    .attr("height", (d) => height - y(d.value))
    .attr("fill", (d) => z(d.name))
    .on("mouseover", function (event, d) {
      d3.select(this).attr("opacity", 0.7);

      tooltipLocal
        .classed("visible", true)
        .html(`Variable: ${d.name}<br>Valor: ${d.value.toFixed(2)}`)
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY + 10}px`);
    })
    .on("mousemove", function (event) {
      tooltipLocal
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY + 10}px`);
    })
    .on("mouseout", function () {
      d3.select(this).attr("opacity", 1);
      tooltipLocal.classed("visible", false);
    });

  drawAxes(g, x0, y, width, height, "Tiempo (ticks)");
  drawLegend(g, variableNamesToShow, width, z);
}

// Dibuja un gráfico de área apilada con tooltip y punto móvil
function drawStackedArea(
  g,
  processedData,
  dataNames,
  x,
  y,
  z,
  selectedVariable
) {
  g.selectAll("*").remove();

  const point = g
    .append("circle")
    .attr("fill", "red")
    .attr("stroke", "none")
    .attr("r", 5)
    .style("visibility", "hidden");

  const areaTooltip = d3.select("#tooltip");
  const effectiveDataNames = selectedVariable ? [selectedVariable] : dataNames;

  effectiveDataNames.forEach((name) => {
    const areaData = processedData.map((d) => ({
      name: d.name,
      value: d[name],
    }));

    g.append("path")
      .datum(processedData)
      .attr("class", "area area-" + name)
      .attr("fill", z(name))
      .attr(
        "d",
        d3
          .area()
          .x((d) => x(d.name))
          .y0(y(0))
          .y1((d) => y(d[name]))
      )
      .on("mouseover", () => {
        areaTooltip.classed("visible", true);
      })
      .on("mousemove", function (event) {
        const x0 = x.invert(d3.pointer(event, this)[0]),
          bisect = d3.bisector((d) => d.name).left,
          idx = bisect(areaData, x0, 1),
          d0 = areaData[idx - 1],
          d1 = areaData[idx],
          d = !d0 || (d1 && x0 - d0.name > d1.name - x0) ? d1 : d0;

        areaTooltip
          .html(
            `Tick: ${d.name}<br>Variable: ${name}<br>Valor: ${d.value.toFixed(
              2
            )}`
          )
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 10}px`);

        point
          .style("visibility", "visible")
          .attr("cx", x(d.name))
          .attr("cy", y(d.value))
          .raise();
      })
      .on("mouseout", () => {
        areaTooltip.classed("visible", false);
        point.style("visibility", "hidden");
      });
  });
}

// Dibuja gráfico de líneas con zoom/pan
function drawLineChart(
  data,
  selectedVariable,
  zoomFactor = 1,
  panPosition = 0
) {
  const chartContainer = setupContainer();
  const { width, height, svg, g } = setupSVG(chartContainer);
  const processedData = processData(data);

  // Extremos en X
  const xExtent = d3.extent(processedData, (d) => d.name);
  let maxPanRight = 1 - zoomFactor;
  panPosition = Math.min(Math.max(panPosition, 0), maxPanRight);

  let xRange = [
    xExtent[0] + (xExtent[1] - xExtent[0]) * panPosition,
    xExtent[0] + (xExtent[1] - xExtent[0]) * (zoomFactor + panPosition),
  ];

  if (xRange[0] < xExtent[0]) xRange[0] = xExtent[0];
  if (xRange[1] > xExtent[1]) xRange[1] = xExtent[1];

  const { x, y, z } = setupScalesForChart(
    processedData,
    data.data_names,
    width,
    height,
    xRange
  );

  drawLines(g, processedData, data.data_names, x, y, z, selectedVariable);
  drawAxes(g, x, y, width, height, "Tiempo (ticks)");
  drawLegend(g, data.data_names, width, z, selectedVariable);
}

// Actualiza las opciones del selector de variable
function updateVariableOptions(dataNames) {
  const select = document.getElementById("variableSelect");
  if (!select) return;

  const existingOptions = [...select.options].map((option) => option.value);
  const newOptions = ["all", ...dataNames];

  const areOptionsDifferent =
    existingOptions.length !== newOptions.length ||
    existingOptions.some((value, index) => value !== newOptions[index]);

  if (areOptionsDifferent) {
    select.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "Todas las Variables";
    select.appendChild(allOption);

    dataNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }
}

// Muestra u oculta controles de zoom/pan según tipo de gráfico
function updateControlsVisibility() {
  const zoomSlider = document.getElementById("zoom-slider");
  const panLeft = document.getElementById("pan-left");
  const panRight = document.getElementById("pan-right");

  if (currentChartType === "line" || currentChartType === "area") {
    zoomSlider.style.display = "block";
    panLeft.style.display = "inline-block";
    panRight.style.display = "inline-block";
  } else {
    zoomSlider.style.display = "none";
    panLeft.style.display = "none";
    panRight.style.display = "none";
  }
}

// Convierte datos a CSV
function convertDataToCSV(data) {
  let csvString = "Ticks," + data.data_names.join(",") + "\n";
  data.data.forEach(function (rowArray) {
    let row = rowArray.join(",");
    csvString += row + "\r\n";
  });
  return csvString;
}

// Genera y descarga archivo CSV
function exportCSVFile(data) {
  const csvString = convertDataToCSV(data);
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "exported-data.csv");
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Actualiza el gráfico: si newData no es nulo y no es actualización de zoom, reemplaza receivedData
function updateChart(newData = null, isZoomUpdate = false) {
  if (newData && !isZoomUpdate) {
    receivedData = newData;
    updateVariableOptions(newData.data_names);
    const select = document.getElementById("variableSelect");
    if (select) select.style.visibility = "visible";
  }

  const zoomFactor = zoomLevel / 100;
  const chartContainer = document.getElementById("chart");
  chartContainer.innerHTML = "";

  if (receivedData && receivedData.length !== 0) {
    const formattedData = formatData(receivedData);
    if (currentChartType === "line") {
      drawLineChart(formattedData, selectedVariable, zoomFactor, panPosition);
    } else if (currentChartType === "bar") {
      drawBarChart(formattedData, selectedVariable);
    } else if (currentChartType === "area") {
      // Para área, reutilizamos funciones de setup y dibujo
      const container = setupContainer();
      const { width, height, svg, g } = setupSVG(chartContainer);
      const processedData = processData(formattedData);
      const xExtent = d3.extent(processedData, (d) => d.name);
      const { x, y, z } = setupScalesForChart(
        processedData,
        formattedData.data_names,
        width,
        height,
        xExtent
      );
      drawStackedArea(
        g,
        processedData,
        formattedData.data_names,
        x,
        y,
        z,
        selectedVariable
      );
      drawAxes(g, x, y, width, height, "Tiempo (ticks)");
      drawLegend(
        g,
        selectedVariable ? [selectedVariable] : formattedData.data_names,
        width,
        z
      );
    }
    updateControlsVisibility();
  } else {
    chartContainer.innerHTML = `
      <div class="text-center d-flex flex-column justify-content-center align-items-center" style="width: 100%; height: 400px; background-color: #e9ecef; border-radius: 0.5rem;">
        <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #0d6efd;"></i>
        <p class="mt-3 mb-0 fw-semibold" style="color: #495057;">Esperando datos de NetLogo...</p>
      </div>
    `;
    updateControlsVisibility();
  }
}

// Convierte formato raw recibido en formato { data, data_names }
function formatData(data) {
  const formattedData = { data: [], data_names: data["data_names"] };
  for (const entry of data["data"]) {
    const x = entry[0];
    const yValues = entry[1];
    formattedData.data.push([x, yValues]);
  }
  return formattedData;
}

// Inicia paneo; devuelve ID de intervalo
function startPanning(direction) {
  const panAmount = direction === "left" ? -0.01 : 0.01;
  const panInterval = setInterval(() => {
    panPosition = Math.max(
      Math.min(panPosition + panAmount, 1 - zoomLevel / 100),
      0
    );
    updateChart(receivedData, true);
  }, 100);
  return panInterval;
}

// Detiene paneo
function stopPanning(panInterval) {
  clearInterval(panInterval);
}

// Cuando el DOM esté listo, inicializamos WebSocket y eventos
window.addEventListener("DOMContentLoaded", () => {
  // Aseguramos que exista el <div id="tooltip"> antes de seleccionarlo
  tooltip = d3.select("#tooltip");

  const webSocketManager = new WebSocketManager(
    "ws://127.0.0.1:5678/",
    (data) => {
      receivedData = data;
      updateVariableOptions(data.data_names);
      updateChart(data);
    }
  );

  // Evento para el selector de variable
  const variableSelect = document.getElementById("variableSelect");
  if (variableSelect) {
    variableSelect.addEventListener("change", (event) => {
      selectedVariable =
        event.target.value === "all" ? null : event.target.value;
      updateChart();
    });
  }

  // Botones de selección de gráfico
  document.querySelectorAll(".graph-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      currentChartType = event.currentTarget.dataset.graphType;
      updateChart();
      updateControlsVisibility();
    });
  });

  // Control de Zoom
  document.getElementById("zoom-slider").addEventListener("input", function () {
    zoomLevel = this.value;
    updateChart(receivedData, true);
  });

  // Panning
  let panInterval;
  document.getElementById("pan-left").addEventListener("mousedown", () => {
    panInterval = startPanning("left");
  });
  document.getElementById("pan-right").addEventListener("mousedown", () => {
    panInterval = startPanning("right");
  });
  ["mouseup", "mouseleave"].forEach((eventName) => {
    document.getElementById("pan-left").addEventListener(eventName, () => {
      stopPanning(panInterval);
    });
    document.getElementById("pan-right").addEventListener(eventName, () => {
      stopPanning(panInterval);
    });
  });

  // Exportar CSV
  document.getElementById("export-btn").addEventListener("click", function () {
    exportCSVFile(receivedData);
  });

  // Dibujar inicialmente (esperando datos)
  updateChart();
});
