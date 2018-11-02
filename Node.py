from socketserver import ThreadingTCPServer, BaseRequestHandler
import traceback
from typing import Set, Callable

from serial import Serial

class TCPServer(ThreadingTCPServer):
    def __init__(self, device, tcpPort):
        super(TCPServer, self).__init__(('', tcpPort), TCPHandler)
        self.device = device

class TCPHandler(BaseRequestHandler):
    def setup(self):
        print(f"{self.server.device}: New connection from {self.client_address}")
        self.server.device.clients.add(self)

    def handle(self):
        while True:
            inc = self.request.recv(1024)
            if inc:
                print(inc)
                try:
                    self.server.device.tcpToSerial(inc)
                except Exception as e:
                    traceback.print_exc()
            else:
                break

    def finish(self):
        print(f"{self.server.device}: Lost connection to {self.client_address}")
        self.server.device.clients.remove(self)

class Node:
    def __init__(self, name: str, deviceName: str, comPort: str, baudrate: int, byteSize: int, parity: str, stopBits: int, tcpPort: int):
        if byteSize not in Serial.BYTESIZES:
            raise ValueError(f"Invalid byteSize: {byteSize}")
        elif parity[0].upper() not in Serial.PARITIES:
            raise ValueError(f"Invalid parity: {parity}")
        elif stopBits not in Serial.STOPBITS:
            raise ValueError(f"Invalid stopBits: {stopBits}")

        self.name = name
        self.deviceName = deviceName
        self.tcpPort = tcpPort
        self.clients: Set[TCPHandler] = set()
        self.listeners = []

        self.serial = Serial(comPort, baudrate, byteSize, parity[0].upper(), stopBits, timeout = 0)
        self.tcp = TCPServer(self, tcpPort)

    def addListener(self, listener: Callable[['Node', str, bytes], None]):
        self.listeners.append(listener)

    def poll(self):
        if self.serial.in_waiting:
            self.serialToTcp(self.serial.read(1024))

    def serialToTcp(self, data: bytes):
        for client in self.clients:
            client.request.sendall(data)
        for listener in self.listeners:
            listener(self, 'serial', data)

    def tcpToSerial(self, data: bytes):
        self.serial.write(data)
        for listener in self.listeners:
            listener(self, 'tcp', data)

    def webToSerial(self, data: bytes):
        self.serial.write(data)
        for listener in self.listeners:
            listener(self, 'web', data)

    def __repr__(self):
        return f"{self.deviceName}:{self.name}"