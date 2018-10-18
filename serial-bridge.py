import traceback

from serial import Serial
from socketserver import BaseRequestHandler, ThreadingTCPServer
from threading import Thread

from Message import Message

devices = {}
clients = []

class TCPServer(ThreadingTCPServer):
    pass

class TCPHandler(BaseRequestHandler):
    def setup(self):
        print(f"setup: {self.server} -- {self.client_address} -- {self.request}")
        clients.append(self)
        self.subscriptions = set()

    def handle(self):
        print(f"handle: {self.server} -- {self.client_address} -- {self.request}")
        recvBuf = b''
        try:
            while True:
                inc = self.request.recv(1024)
                if inc:
                    message, recvBuf = Message.decode(recvBuf + inc)
                    while message is not None:
                        self.processMessage(message)
                        message, recvBuf = Message.decode(recvBuf)
                else:
                    break
        except Exception as e:
            traceback.print_exc()
            self.send('disconnect', str(e))

    def finish(self):
        print(f"finish: {self.server} -- {self.client_address} -- {self.request}")
        clients.remove(self)

    def processMessage(self, message: Message):
        if message.isCommand('subscribe'):
            if message.hasPayload():
                names = {name for name in message}
                self.subscriptions = names & set(devices)
                self.send('meta', f"Subscribed to {', '.join(names)}")
            else:
                # Subscribe to everything
                self.subscriptions = set(devices)
                self.send('meta', "Subscribed to all ports")
        elif message.isCommand('unsubscribe'):
            if message.hasPayload():
                names = {name for name in message}
                self.subscriptions -= names
                self.send('meta', f"Unsubscribed from {', '.join(names)}")
            else:
                # Unsubscribe from everything
                self.subscriptions = set()
                self.send('meta', "Unsubscribed from all ports")
        elif message.isCommand('send'):
            name = message[0]
            if name in devices:
                devices[name].write(message[1:])
            else:
                self.send('meta', f"Unknown device `{name}'")

    def send(self, type, data):
        if not isinstance(type, bytes):
            type = type.encode()
        if not isinstance(data, bytes):
            data = data.encode()
        message = type + b' ' + data
        print(f"{self.request} -> {message.decode()}")
        self.request.sendall(str(len(message)).encode() + b' ' + message + b'\r\n')

    def onSerialData(self, deviceName, data):
        if deviceName in self.subscriptions:
            self.send('data', b"%s %s" % (deviceName.encode(), data))

tcpServer = TCPServer(('', 10000), TCPHandler)
tcpThread = Thread(target = lambda: tcpServer.serve_forever(), daemon = True)
tcpThread.start()

devices['foo'] = Serial('COM1', 9600, timeout = 0)
devices['bar'] = Serial('COM3', 9600, timeout = 0)
devices['baz'] = Serial('COM5', 9600, timeout = 0)

while True:
    for name, device in devices.items():
        if device.in_waiting:
            data = device.read(1024)
            for client in clients:
                client.onSerialData(name, data)
