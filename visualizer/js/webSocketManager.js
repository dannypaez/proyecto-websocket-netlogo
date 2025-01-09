// webSocketManager.js
export class WebSocketManager {
  
  constructor(url, onDataReceived) {
    this.url = url;
    this.onDataReceived = onDataReceived;
    this.reconnectInterval = 1000; // Intervalo inicial de reconexión en milisegundos
    this.maxReconnectInterval = 30000; // Intervalo máximo de reconexión
    this.initializeWebSocket();
  }

  initializeWebSocket() {
    this.websocket = new WebSocket(this.url);

    this.websocket.onopen = () => {
      console.log('WebSocket connection opened');
      // Restablecer el intervalo de reconexión al valor inicial
      this.reconnectInterval = 1000;
    };

    this.websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.websocket.onmessage = ({ data }) => {
      let receivedData;
    
      try {
        receivedData = JSON.parse(data); // Intentamos parsear los datos que llegan
        console.log('Raw received data:', receivedData); // Imprimimos los datos recibidos
      } catch (e) {
        console.error('Error parsing received data:', e);
        return;
      }
    
      let actualData;
    
      // Verificar si los datos vienen encapsulados en 'message'
      if (receivedData.message && typeof receivedData.message === 'string') {
        try {
          actualData = JSON.parse(receivedData.message); // Parsear el mensaje dentro de 'message'
          console.log('Parsed message data:', actualData); // Imprimir los datos parseados
        } catch (e) {
          console.error('Error parsing message data:', e);
          return;
        }
      } else {
        actualData = receivedData; // Si no están encapsulados, usamos los datos directamente
      }
    
      console.log('Final processed data:', actualData); // Verificar los datos finales antes de enviarlos
      this.onDataReceived(actualData); // Procesar los datos
    };

    this.websocket.onclose = (event) => {
      console.warn('WebSocket connection closed:', event);
      // Intentar reconectar
      this.reconnectWebSocket();
    };
  }

  reconnectWebSocket() {
    console.log(`Attempting to reconnect in ${this.reconnectInterval / 1000} seconds...`);
    setTimeout(() => {
      // Incrementar el intervalo de reconexión
      this.reconnectInterval = Math.min(this.reconnectInterval * 2, this.maxReconnectInterval);
      console.log('Reconnecting WebSocket...');
      this.initializeWebSocket();
    }, this.reconnectInterval);
  }

  // Verificar si está conectado
  isConnected() {
    return this.websocket.readyState === WebSocket.OPEN;
  }

  // Cerrar la conexión manualmente (si es necesario)
  closeConnection() {
    if (this.websocket) {
      this.websocket.close();
      console.log('WebSocket connection manually closed');
    }
  }
}
