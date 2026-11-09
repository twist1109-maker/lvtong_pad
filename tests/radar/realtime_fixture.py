"""仅本机浏览器验收用：模拟Socket.IO位置/流程消息，不加载业务应用或设备。"""
import time
from flask import Flask
from flask_socketio import SocketIO, emit

app = Flask(__name__)
server = SocketIO(app, async_mode='threading', cors_allowed_origins='*')
distance = 35


def radar():
    return {'type': 'radar_distance', 'timestamp': int(time.time() * 1000),
            'data': {'distance': distance, 'mode': 1 if distance > 0 else 0,
                     'objectCount': 1 if distance > 0 else 0}}


@server.on('connect')
def connected():
    emit('message', radar())


@server.on('message')
def received(message):
    global distance
    if message['type'] == 'fixture_radar':
        distance = message['data']['distance']
        server.emit('message', radar())
    elif message['type'] == 'fixture_phase':
        kind = {'受理': 'booking_accepted', '驳回': 'booking_rejected', '重置': 'booking_reset'}[message['data']['phase']]
        server.emit('message', {'type': kind, 'timestamp': int(time.time() * 1000),
                               'data': {'vehicleHeight': 3, 'carHeadLength': 1.8, 'vehicleType': 'small', 'xrayEnabled': False}})


if __name__ == '__main__':
    server.run(app, host='127.0.0.1', port=5187, allow_unsafe_werkzeug=True)
