from socketserver import ThreadingTCPServer, BaseRequestHandler
import traceback
from typing import Set

from blinker import Signal
from serial import Serial

class TCPServer(ThreadingTCPServer):
    def __init__(self, node, tcpPort):
        super(TCPServer, self).__init__(('', tcpPort), TCPHandler)
        self.node = node

class TCPHandler(BaseRequestHandler):
    def setup(self):
        print(f"{self.server.node}: New connection from {self.client_address}")
        self.server.node.addClient(self)

    def handle(self):
        try:
            while True:
                inc = self.request.recv(1024)
                if inc:
                    print(inc)
                    try:
                        self.server.node.tcpToSerial(inc)
                    except Exception as e:
                        traceback.print_exc()
                else:
                    break
        except ConnectionResetError:
            print(f"{self.server.node}: Connection reset")

    def finish(self):
        print(f"{self.server.node}: Lost connection to {self.client_address}")
        self.server.node.removeClient(self)

class Node:
    def __init__(self, name: str, comPort: str, baudrate: int, byteSize: int, parity: str, stopBits: int, tcpPort: int, webTelnetLink: bool, webDefaultVisible: bool):
        if byteSize not in Serial.BYTESIZES:
            raise ValueError(f"Invalid byteSize: {byteSize}")
        elif parity[0].upper() not in Serial.PARITIES:
            raise ValueError(f"Invalid parity: {parity}")
        elif stopBits not in Serial.STOPBITS:
            raise ValueError(f"Invalid stopBits: {stopBits}")

        self.name = name
        self.device = None # Fixed up by the Device constructor
        self.tcpPort = tcpPort
        self.webTelnetLink = webTelnetLink
        self.webDefaultVisible = webDefaultVisible
        self.clients: Set[TCPHandler] = set()

        self.serialData = {'port': comPort, 'baudrate': baudrate, 'bytesize': byteSize, 'parity': parity[0].upper(), 'stopbits': stopBits, 'timeout': 0}
        self.tcp = TCPServer(self, tcpPort)
        self.connect()

        self.signals = {
            'connect': Signal(), # args: remote_addr: str
            'disconnect': Signal(), # args: remote_addr: str
            'data': Signal(), # args: source: str, data: bytes
        }

    def addClient(self, client: TCPHandler):
        self.clients.add(client)
        self.signals['connect'].send(self, remote_addr = client.client_address[0])

    def removeClient(self, client: TCPHandler):
        self.clients.remove(client)
        self.signals['disconnect'].send(self, remote_addr = client.client_address[0])

    def connect(self):
        self.serial = Serial(**self.serialData)

    def disconnect(self):
        self.serial = None

    def poll(self):
        if self.serial and self.serial.in_waiting:
            self.serialToTcp(self.serial.read(1024))

    def serialToTcp(self, data: bytes):
        for client in self.clients:
            try:
                client.request.sendall(data)
            except ConnectionResetError:
                print(f"{client}: Connection reset")
        self.signals['data'].send(self, source = 'serial', data = data)

    def tcpToSerial(self, data: bytes):
        if self.serial is None:
            return
        self.serial.write(data)
        self.signals['data'].send(self, source = 'tcp', data = data)

    def webToSerial(self, data: bytes):
        if self.serial is None:
            return
        self.serial.write(data)
        self.signals['data'].send(self, source = 'web', data = data)

    def __repr__(self):
        return f"{self.device.name}:{self.name}"