from socketserver import ThreadingTCPServer, BaseRequestHandler
import traceback
from typing import Set, Dict, Callable

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
    def __init__(self, comPort: str, baudrate: int, tcpPort: int, listener: Callable[['Node', str, bytes], None] = lambda node, source, data: None):
        self.clients: Set[TCPHandler] = set()
        self.listener = listener

        self.serial = Serial(comPort, baudrate, timeout = 0)
        self.tcp = TCPServer(self, tcpPort)

    def poll(self):
        if self.serial.in_waiting:
            self.serialToTcp(self.serial.read(1024))

    def serialToTcp(self, data: bytes):
        for client in self.clients:
            client.request.sendall(data)
        self.listener(self, 'serial', data)

    def tcpToSerial(self, data: bytes):
        self.serial.write(data)
        self.listener(self, 'tcp', data)
