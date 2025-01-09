import { WebSocketManager } from './webSocketManager.js';

const MARGIN = { top: 20, right: 0, bottom: 30, left: 0 };
const HEIGHT = 400;

let zoomLevel = 100; // 100% corresponde a no aplicar zoom
let panPosition = 0; // Comenzando sin desplazamiento

function setupContainer() {
  const chartContainer = document.getElementById('chart');
  chartContainer.innerHTML = '';
  return chartContainer;
}

function setupSVG(chartContainer) {
  const width = chartContainer.clientWidth - MARGIN.left - MARGIN.right;
  const height = HEIGHT - MARGIN.top - MARGIN.bottom;
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('width', width + MARGIN.left + MARGIN.right)
    .attr('height', height + MARGIN.top + MARGIN.bottom);
  const g = svg
    .append('g')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
  return { width, height, svg, g };
}

function processData({ data_names: dataNames, data: rawData }) {
  if (!Array.isArray(rawData) || !Array.isArray(dataNames)) {
    throw new Error('Invalid data format');
  }

  return rawData.map((d) => {
    const datum = { name: d[0] };
    d[1].forEach((value, index) => {
      datum[dataNames[index]] = value;
    });
    return datum;
  });
}

function drawLineChart(
  data,
  selectedVariable,
  zoomFactor = 1,
  panPosition = 0
) {
  const chartContainer = setupContainer();
  const { width, height, svg, g } = setupSVG(chartContainer);
  const processedData = processData(data);

  // Asumiendo que zoomFactor afecta cuánto del inicio y final del dominio queremos mostrar
  // Calcula el rango total de los datos
  const xExtent = d3.extent(processedData, (d) => d.name);
  let maxPanRight = 1 - zoomFactor; // Ajusta según sea necesario
  panPosition = Math.min(Math.max(panPosition, 0), maxPanRight);

  let xRange = [
    xExtent[0] + (xExtent[1] - xExtent[0]) * panPosition,
    xExtent[0] + (xExtent[1] - xExtent[0]) * (zoomFactor + panPosition),
  ];

  // Asegurar que xRange no exceda los límites de los datos
  if (xRange[0] < xExtent[0]) xRange[0] = xExtent[0];
  if (xRange[1] > xExtent[1]) xRange[1] = xExtent[1];

  const { x, y, z } = setupScalesForChart(
    processedData,
    data.data_names,
    width,
    height,
    xRange // Asegúrate de que esta variable se pasa correctamente
  );

  drawLines(g, processedData, data.data_names, x, y, z, selectedVariable);
  drawAxes(g, x, y, width, height, 'Tiempo (ticks)');
  drawLegend(g, data.data_names, width, z, selectedVariable);
}

function drawLines(g, processedData, dataNames, x, y, z, selectedVariable) {
  dataNames.forEach((name, i) => {
    const line = d3
      .line()
      .x((d) => x(d.name))
      .y((d) => y(d[name]));

    g.append('path')
      .datum(processedData)
      .attr('id', 'line-' + name) // Asignar ID único
      .attr('fill', 'none')
      .attr('stroke', z(name))
      .attr('stroke-width', 1.5)
      .attr('d', line)
      .attr('opacity', selectedVariable && selectedVariable !== name ? 0 : 1);

    g.selectAll('.dot-' + name)
      .data(processedData)
      .enter()
      .append('circle') // Añade un círculo para cada punto de datos
      .attr('class', 'dot-' + name)
      .attr('cx', (d) => x(d.name))
      .attr('cy', (d) => y(d[name]))
      .attr('r', 4) // Puedes hacerlos pequeños o incluso invisibles con r=0
      .attr('fill', 'transparent') // Hace los puntos invisibles pero aún interactivos
      .on('mouseover', function (event, d) {
        d3.select('#tooltip')
          .style('visibility', 'visible')
          .style('left', event.pageX + 10 + 'px')
          .style('top', event.pageY - 10 + 'px')
          .html(`Ticks: ${d.name}<br>${name}: ${d[name]}`);
      })
      .on('mouseout', function () {
        d3.select('#tooltip').style('visibility', 'hidden');
      });
  });
}

function drawBarChart(data, selectedVariable) {
  const chartContainer = setupContainer();
  const { width, height, svg, g } = setupSVG(chartContainer);

  const tooltip = d3.select('#tooltip'); // Asegúrate de que el tooltip ya esté definido en tu HTML

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

  y.domain([0, d3.max(lastYValues)]);
  x0.domain([lastX]);
  x1.domain(variableNamesToShow).rangeRound([0, x0.bandwidth()]);

  const group = g.append('g').attr('transform', `translate(${x0(lastX)},0)`);

  group
    .selectAll('rect')
    .data(
      variableNamesToShow.map((name) => ({
        name,
        value: lastYValues[data.data_names.indexOf(name)],
      }))
    )
    .enter()
    .append('rect')
    .attr('class', 'bar') // Añade una clase para el estilo y selección
    .attr('x', (d) => x1(d.name))
    .attr('y', (d) => y(d.value))
    .attr('width', x1.bandwidth())
    .attr('height', (d) => height - y(d.value))
    .attr('fill', (d) => z(d.name))
    .on('mouseover', function (event, d) {
      // Resaltar la barra
      d3.select(this).attr('opacity', 0.7);

      // Mostrar tooltip
      tooltip
        .style('visibility', 'visible')
        .html(`Variable: ${d.name}<br>Valor: ${d.value}`)
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY + 10}px`);
    })
    .on('mousemove', function (event) {
      // Mover el tooltip con el mouse
      tooltip
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY + 10}px`);
    })
    .on('mouseout', function () {
      // Restaurar el estilo de la barra
      d3.select(this).attr('opacity', 1);

      // Ocultar tooltip
      tooltip.style('visibility', 'hidden');
    });

  drawAxes(g, x0, y, width, height, 'Tiempo (ticks)');
  drawLegend(g, variableNamesToShow, width, z);
}

function drawAreaChart(
  data,
  selectedVariable,
  zoomFactor = 1,
  panPosition = 0
) {
  const chartContainer = setupContainer();
  const { width, height, svg, g } = setupSVG(chartContainer);
  const processedData = processData(data);

  const xExtent = d3.extent(processedData, (d) => d.name);
  let maxPanRight = 1 - zoomFactor; // Ajusta según sea necesario
  panPosition = Math.min(Math.max(panPosition, 0), maxPanRight);

  let xRange = [
    xExtent[0] + (xExtent[1] - xExtent[0]) * panPosition,
    xExtent[0] + (xExtent[1] - xExtent[0]) * (zoomFactor + panPosition),
  ];

  // Asegurar que xRange no exceda los límites de los datos
  if (xRange[0] < xExtent[0]) xRange[0] = xExtent[0];
  if (xRange[1] > xExtent[1]) xRange[1] = xExtent[1];

  const { x, y, z } = setupScalesForChart(
    processedData,
    data.data_names,
    width,
    height,
    xRange // Asegúrate de que esta variable se pasa correctamente
  );
  drawStackedArea(g, processedData, data.data_names, x, y, z, selectedVariable);
  drawAxes(g, x, y, width, height, 'Tiempo (ticks)');
  drawLegend(
    g,
    selectedVariable ? [selectedVariable] : data.data_names,
    width,
    z
  );
}

function drawStackedArea(
  g,
  processedData,
  dataNames,
  x,
  y,
  z,
  selectedVariable
) {
  // Limpiar elementos previos para el redibujado
  g.selectAll('*').remove();

  const point = g
    .append('circle')
    .attr('fill', 'red') // Color rojo para el punto
    .attr('stroke', 'none')
    .attr('r', 5) // Radio del punto
    .style('visibility', 'hidden'); // Inicialmente oculto

  // Inicializar el tooltip
  const tooltip = d3.select('#tooltip');

  const effectiveDataNames = selectedVariable ? [selectedVariable] : dataNames;

  effectiveDataNames.forEach((name) => {
    const areaData = processedData.map((d) => ({
      name: d.name,
      value: d[name],
    }));

    // Crear y dibujar las áreas
    g.append('path')
      .datum(processedData)
      .attr('class', 'area area-' + name)
      .attr('fill', z(name))
      .attr(
        'd',
        d3
          .area()
          .x((d) => x(d.name))
          .y0(y(0))
          .y1((d) => y(d[name]))
      )
      .on('mouseover', function () {
        tooltip.style('visibility', 'visible');
      })

      .on('mousemove', function (event) {
        const x0 = x.invert(d3.pointer(event, this)[0]),
          bisect = d3.bisector((d) => d.name).left,
          idx = bisect(areaData, x0, 1),
          d0 = areaData[idx - 1],
          d1 = areaData[idx],
          d = x0 - d0.name > d1.name - x0 ? d1 : d0;

        // Actualizar el contenido y la posición del tooltip como antes
        tooltip
          .html(`Tick: ${d.name}<br>Variable: ${name}<br>Valor: ${d.value}`) // Asegúrate de ajustar según tu estructura de datos
          .style('top', event.pageY - 10 + 'px')
          .style('left', event.pageX + 10 + 'px');

        // Mueve el punto rojo a la posición del dato señalado
        point
          .style('visibility', 'visible') // Hazlo visible
          .attr('cx', x(d.name)) // Posición X basada en el tick (d.name)
          .attr('cy', y(d.value)) // Posición Y basada en el valor del dato
          .raise();
      })
      .on('mouseout', function () {
        tooltip.style('visibility', 'hidden');
        point.style('visibility', 'hidden'); // Oculta el punto cuando el mouse sale del gráfico
      });
  });
}

function drawLegend(g, dataNames, width, z, selectedVariable) {
  const legendData = selectedVariable ? [selectedVariable] : dataNames;
  const legend = g
    .append('g')
    .attr('font-family', 'sans-serif')
    .attr('font-size', 10)
    .attr('text-anchor', 'end')
    .selectAll('g')
    .data(legendData)
    .enter()
    .append('g')
    .attr('transform', (d, i) => `translate(0,${i * 20})`);

  legend
    .append('text')
    .attr('x', width - 24)
    .attr('y', 9.5)
    .attr('dy', '0.32em')
    .text((d) => d)
    .each(function (d, i) {
      const textWidth = this.getBBox().width;
      d3.select(this.parentNode)
        .insert('rect', 'text')
        .attr('x', width - 24 - textWidth - 5)
        .attr('y', 0)
        .attr('width', textWidth + 30)
        .attr('height', 20)
        .attr('fill', 'white');
    });

  legend
    .append('rect')
    .attr('x', width - 19)
    .attr('width', 19)
    .attr('height', 19)
    .attr('fill', (d) => z(d));
}

function drawAxes(
  g,
  xAxis,
  yAxis,
  width,
  height,
  xAxisLabel = '',
  yAxisLabel = ''
) {
  const xAxisGroup = g
    .append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xAxis));

  setBoldAxisText(xAxisGroup); // Aplicar estilo en negrita al eje X

  xAxisGroup
    .append('text')
    .attr('fill', '#000')
    .attr('y', 20)
    .attr('x', width / 2)
    .attr('dy', '0.71em')
    .attr('text-anchor', 'middle')
    .text(xAxisLabel);

  const yAxisG = g.append('g').call(d3.axisLeft(yAxis));

  setBoldAxisText(yAxisG); // Aplicar estilo en negrita al eje Y

  // Mover los valores numéricos del eje Y a la izquierda
  yAxisG.selectAll('.tick text').attr('transform', 'translate(30, 0)');

  if (yAxisLabel) {
    yAxisG
      .append('text')
      .attr('fill', '#000')
      .attr('transform', 'rotate(-90)')
      .attr('y', 6)
      .attr('dy', '0.71em')
      .attr('text-anchor', 'end')
      .text(yAxisLabel);
  }
}

function setBoldAxisText(axis) {
  axis.selectAll('.tick text').style('font-weight', 'bolder');
}

function setupScalesForChart(processedData, dataNames, width, height, xRange) {
  const x = d3
    .scaleLinear()
    .domain(xRange) // Usar xRange directamente aquí
    .range([0, width]);

  const y = d3
    .scaleLinear()
    .domain([
      0,
      d3.max(processedData, (d) =>
        Math.max(...dataNames.map((name) => d[name]))
      ),
    ])
    .range([height, 0]);

  // Asegúrate de que la escala z esté basada en todas las variables, no solo en las seleccionadas
  const z = d3.scaleOrdinal().domain(dataNames).range(d3.schemeCategory10);

  return { x, y, z };
}

let currentChartType = 'line'; // Establece el gráfico de líneas como predeterminado
let receivedData = [];
let selectedVariable = null; // Variable para mantener la variable seleccionada entre actualizaciones

function updateVariableOptions(dataNames) {
  const select = document.getElementById('variableSelect');

  const existingOptions = [...select.options].map((option) => option.value);
  const newOptions = ['all', ...dataNames];

  // Verificar si las opciones existentes son diferentes a las nuevas opciones
  const areOptionsDifferent =
    existingOptions.length !== newOptions.length ||
    existingOptions.some((value, index) => value !== newOptions[index]);

  if (areOptionsDifferent) {
    select.innerHTML = ''; // Limpiar las opciones existentes solo si hay un cambio

    // Añadir una opción para todas las variables
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Todas las Variables';
    select.appendChild(allOption);

    dataNames.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }
}

function updateControlsVisibility() {
  const zoomSlider = document.getElementById('zoom-slider');
  const panLeft = document.getElementById('pan-left');
  const panRight = document.getElementById('pan-right');

  // Establecer la visibilidad de los controles de zoom y desplazamiento
  if (currentChartType === 'line' || currentChartType === 'area') {
    zoomSlider.style.display = 'block';
    panLeft.style.display = 'inline-block';
    panRight.style.display = 'inline-block';
  } else {
    zoomSlider.style.display = 'none';
    panLeft.style.display = 'none';
    panRight.style.display = 'none';
  }
}

function updateChart(newData, isZoomUpdate = false) {
  if (newData && !isZoomUpdate) {
    receivedData = newData; // Actualizar la variable global
    updateVariableOptions(newData.data_names); // Actualizar las opciones del dropdown si hay datos nuevos
  }

  const zoomFactor = zoomLevel / 100;
  const chartContainer = document.getElementById('chart');

  // Limpiar el contenedor de gráficos
  chartContainer.innerHTML = '';

  // Verificar si hay datos recibidos para dibujar el gráfico
  if (receivedData && receivedData.length !== 0) {
    const formattedData = formatData(receivedData); // Formatear los datos según el formato deseado
    if (currentChartType === 'line') {
      drawLineChart(formattedData, selectedVariable, zoomFactor, panPosition); // Añade zoomFactor como un argumento aquí
    } else if (currentChartType === 'bar') {
      drawBarChart(formattedData, selectedVariable);
    } else if (currentChartType === 'area') {
      drawAreaChart(formattedData, selectedVariable, zoomFactor, panPosition);
    }
    updateControlsVisibility(); // Actualizar la visibilidad de los controles según el tipo de gráfico actual
  } else {
    // Mostrar mensaje de espera si no hay datos
    chartContainer.innerHTML = `
      <div class="text-center" style="width: 100%; height: 400px; display: flex; align-items: center; justify-content: center; flex-direction: column; background-color: #f8f9fa; border-radius: 5px;">
        <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #007bff;"></i>
        <p style="font-size: 18px; font-weight: bold; margin-top: 10px; color: #343a40;">Esperando datos de la simulación de Netlogo...</p>
      </div>
    `;
    updateControlsVisibility(); // Asegurarse de que los controles de zoom y pan estén ocultos
  }
}

function formatData(data) {
  const formattedData = { data: [], data_names: data['data_names'] };

  for (const entry of data['data']) {
    const x = entry[0];
    const yValues = entry[1];

    formattedData.data.push([x, yValues]);
  }

  return formattedData;
}

function startPanning(direction) {
  // Define el intervalo y la cantidad a panear por tick del intervalo
  const panAmount = direction === 'left' ? -0.01 : 0.01;
  const panInterval = setInterval(() => {
    panPosition = Math.max(
      Math.min(panPosition + panAmount, 1 - zoomLevel / 100),
      0
    );
    updateChart(receivedData, true);
  }, 100); // Ajusta el intervalo de tiempo según lo rápido que quieras que se mueva

  // Guarda el intervalo para poder detenerlo más tarde
  return panInterval;
}

function stopPanning(panInterval) {
  clearInterval(panInterval);
}

function convertDataToCSV(data) {
  let csvString = 'Ticks,' + data.data_names.join(',') + '\n';

  data.data.forEach(function (rowArray) {
    let row = rowArray.join(',');
    csvString += row + '\r\n';
  });

  return csvString;
}

function exportCSVFile(data) {
  const csvString = convertDataToCSV(data);
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'exported-data.csv');
  link.style.visibility = 'hidden';

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);
}

window.addEventListener('DOMContentLoaded', () => {
  // Inicializar WebSocketManager
  const webSocketManager = new WebSocketManager(
    'ws://127.0.0.1:5678/',
    (data) => {
      //console.log('Received data:', data);
      receivedData = data; // Actualizar la variable global
      updateVariableOptions(data.data_names); // Actualizar las opciones del dropdown
      updateChart(data);

      // Mostrar el dropdown cuando empiezan a llegar los datos
      document.getElementById('variableSelect').style.visibility = 'visible';
    }
  );

  // Actualiza la variable seleccionada y el gráfico cada vez que se selecciona una nueva variable
  document
    .getElementById('variableSelect')
    .addEventListener('change', (event) => {
      selectedVariable =
        event.target.value === 'all' ? null : event.target.value;
      updateChart(); // Redibuja el gráfico completo con la variable seleccionada
    });

  // Añadir controladores de eventos a los botones de gráficos
  document.querySelectorAll('.graph-button').forEach((button) => {
    button.addEventListener('click', (event) => {
      currentChartType = event.currentTarget.dataset.graphType;
      updateChart();
      updateControlsVisibility();
    });
  });

  document.getElementById('zoom-slider').addEventListener('input', function () {
    zoomLevel = this.value; // Actualiza zoomLevel con el valor actual del deslizador
    updateChart(receivedData, true); // Indica que es una actualización de zoom
  });

  let panInterval;

  document.getElementById('pan-left').addEventListener('mousedown', () => {
    panInterval = startPanning('left');
  });

  document.getElementById('pan-right').addEventListener('mousedown', () => {
    panInterval = startPanning('right');
  });

  // Para ambos botones, detén el paneo cuando se suelta el botón del mouse o se sale del botón
  ['mouseup', 'mouseleave'].forEach((event) => {
    document.getElementById('pan-left').addEventListener(event, () => {
      stopPanning(panInterval);
    });

    document.getElementById('pan-right').addEventListener(event, () => {
      stopPanning(panInterval);
    });
  });

  document.getElementById('export-btn').addEventListener('click', function () {
    exportCSVFile(receivedData); // Asume que `receivedData` es tu conjunto de datos actual
  });

  // Llama a updateChart() para cargar el gráfico de líneas o mostrar el mensaje de espera de datos
  updateChart();
});
