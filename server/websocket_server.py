import asyncio
import websockets
import json
import logging

logging.basicConfig(level=logging.INFO)

connected_clients = set()

async def send_data(websocket, path):
    connected_clients.add(websocket)
    logging.info(f"Client connected: {websocket.remote_address}")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                logging.info(f"Received message from {websocket.remote_address}: {data}")
                
                # Broadcast the message to other clients
                for client in connected_clients:
                    if client != websocket:
                        try:
                            await client.send(message)
                        except websockets.exceptions.ConnectionClosed:
                            connected_clients.remove(client)
                            logging.warning(f"Client {client.remote_address} removed due to disconnection.")
            except json.JSONDecodeError as e:
                logging.error(f"Error decoding JSON from {websocket.remote_address}: {e}")
                error_response = json.dumps({"error": "Invalid JSON format"})
                await websocket.send(error_response)
            except Exception as e:
                logging.error(f"Unexpected error: {e}")
    except websockets.exceptions.ConnectionClosedOK:
        logging.info(f"Client disconnected: {websocket.remote_address}")
    except websockets.exceptions.ConnectionClosedError:
        logging.info(f"Client unexpectedly disconnected: {websocket.remote_address}")
    except Exception as e:
        logging.error(f"Error with client {websocket.remote_address}: {e}")
    finally:
        connected_clients.remove(websocket)
        logging.info(f"Client removed: {websocket.remote_address}")

async def main():
    async with websockets.serve(send_data, "localhost", 5678, ping_timeout=20):  # Optional ping_timeout
        logging.info("WebSocket server started on ws://localhost:5678")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())