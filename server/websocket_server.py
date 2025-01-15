import asyncio
import websockets
import json
import logging

logging.basicConfig(level=logging.INFO)

connected_clients = set()

async def send_data(websocket, path):
    """
    Maneja conexiones WebSocket y retransmite mensajes entre clientes conectados.
    """
    connected_clients.add(websocket)
    logging.info(f"Cliente conectado: {websocket.remote_address}")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                logging.info(f"Mensaje recibido de {websocket.remote_address}: {data}")
                
                # Retransmitir el mensaje a otros clientes
                for client in connected_clients:
                    if client != websocket:
                        try:
                            await client.send(message)
                        except websockets.exceptions.ConnectionClosed:
                            connected_clients.remove(client)
                            logging.warning(f"Cliente {client.remote_address} eliminado por desconexión.")
            except json.JSONDecodeError as e:
                logging.error(f"Error al decodificar JSON de {websocket.remote_address}: {e}")
                error_response = json.dumps({"error": "Formato JSON inválido"})
                await websocket.send(error_response)
            except Exception as e:
                logging.error(f"Error inesperado: {e}")
    except websockets.exceptions.ConnectionClosedOK:
        logging.info(f"Cliente desconectado: {websocket.remote_address}")
    except websockets.exceptions.ConnectionClosedError:
        logging.info(f"Cliente desconectado inesperadamente: {websocket.remote_address}")
    except Exception as e:
        logging.error(f"Error con el cliente {websocket.remote_address}: {e}")
    finally:
        connected_clients.remove(websocket)
        logging.info(f"Cliente eliminado: {websocket.remote_address}")

async def main():
    """
    Inicia el servidor WebSocket.
    """
    async with websockets.serve(send_data, "localhost", 5678, ping_timeout=20):  # Optional ping_timeout
        logging.info("Servidor WebSocket iniciado en ws://localhost:5678")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
