"""仅回环Socket.IO反馈中继；不导入业务服务、数据库或任何设备。"""
from flask import Flask
from flask_socketio import SocketIO
app = Flask(__name__)
server = SocketIO(app, async_mode='threading', cors_allowed_origins='*')

@server.on('message')
def message(payload):
    if payload.get('type') == 'fixture_feedback':
        server.emit('message', {'type': 'plc_status', 'data': payload['data']})

server.run(app, host='127.0.0.1', port=5197, allow_unsafe_werkzeug=True)
