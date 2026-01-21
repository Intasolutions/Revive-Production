import socketio
import os

# Create a Socket.IO server
# cors_allowed_origins='*' is important for development
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

@sio.event
async def connect(sid, environ):
    print(f"SocketIO Client Connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"SocketIO Client Disconnected: {sid}")

@sio.event
async def join_room(sid, room):
    print(f"SocketIO joining room: {room}")
    await sio.enter_room(sid, room)
