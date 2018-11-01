import asyncio
import html
import json
import socket
import traceback
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from textwrap import dedent
from typing import Dict, List, Set

from slugify import slugify
import tornado.ioloop
from tornado.web import RequestHandler, StaticFileHandler
from tornado.websocket import WebSocketHandler

from Node import Node

devices: Dict[str, List[Node]] = {}
slugs: Dict[str, str] = {}
sockets: Dict[str, Set['WebsocketHandler']] = defaultdict(set) # {device name: {socket}}

@lru_cache()
def ipToName(ip):
    return socket.getfqdn(ip)

class UncachedHandler(RequestHandler):
    def compute_etag(self):
        return None

class VueHandler(UncachedHandler):
    def initialize(self, view, data = {}):
        self.view = view
        self.data = data

    def get(self):
        self.render()

    def render(self, data = {}):
        data = {
            'devices': sorted([{'name': value, 'slug': key} for key, value in slugs.items()], key=lambda e: e['name']),
            **self.data,
            **data,
        }

        self.write(dedent(f"""\
        <!DOCTYPE html>
        <html>
        <head>
        <title>Serial Bridge</title>
        <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico">
        <body>
        <div id="vue-root"></div>
        <link rel="stylesheet" href="/serial-bridge.css">
        <script src="/serial-bridge.js" data-view="{self.view}" data-data="{html.escape(json.dumps(data), True)}"></script>
        </body>
        </html>
        """))

class UncachedStaticFileHandler(UncachedHandler, StaticFileHandler):
    pass

class GenerateRegHandler(RequestHandler):
    def post(self):
        path = self.get_argument('telnet_path')
        self.write(dedent(f"""\
        Windows Registry Editor Version 5.00
        
        [HKEY_LOCAL_MACHINE\\SOFTWARE\\Classes\\telnet\\shell\\open\\command]
        @="\\"{path}\\" %l"
        
        """))
        self.set_header('Content-Type', 'application/octet-stream')
        self.set_header('Content-Disposition', 'attachment; filename=serial_bridge.reg')

class DeviceHandler(VueHandler):
    def initialize(self):
        super(DeviceHandler, self).initialize('device')
        
    def get(self, slug):
        if slug not in slugs:
            self.send_error(404)
            return
        device = slugs[slug]
        nodes = devices[device]
        self.render({
            'device': device,
            'nodes': [{'name': node.name, 'tcpPort': node.tcpPort} for node in nodes] + [{'name': node.name + ' 2', 'tcpPort': node.tcpPort} for node in nodes],
        })

class WebsocketHandler(WebSocketHandler):
    def open(self, slug):
        if slug not in slugs:
            self.write_error(404)
            return
        self.device = slugs[slug]

        print('ws open')
        sockets[self.device].add(self)
        asyncio.ensure_future(WebsocketHandler.sendConnectionInfo(self.device))

    def on_message(self, message):
        print('ws message: %s' % message)

    def on_close(self):
        print('ws close')
        sockets[self.device].remove(self)
        asyncio.ensure_future(WebsocketHandler.sendConnectionInfo(self.device))

    def send(self, data):
        self.write_message(json.dumps(data))

    @staticmethod
    def sendAll(deviceName, data):
        for socket in sockets[deviceName]:
            try:
                socket.send(data)
            except Exception:
                traceback.print_exc()

    @staticmethod
    async def sendConnectionInfo(deviceName):
        addrs = {handler.request.remote_ip for handler in sockets[deviceName]}
        names = sorted(ipToName(addr) for addr in addrs)
        WebsocketHandler.sendAll(deviceName, {'type': 'connections', 'data': names})

def listen(port: int, _devices: Dict[str, Node]):
    global devices, slugs
    devices = _devices
    slugs = {slugify(device): device for device in devices.keys()}

    if len(slugs) != len(devices):
        raise ValueError("Device names don't map to unique URL slugs")

    def onSerialData(node: Node, source: str, data: bytes):
        if source == 'serial':
            try:
                dataStr = data.decode()
            except Exception:
                traceback.print_exc()
                return

            WebsocketHandler.sendAll(node.deviceName, {'type': 'data', 'node': node.name, 'data': dataStr})

    for nodes in devices.values():
        for node in nodes:
             node.addListener(onSerialData)

    wwwDir = Path('web')
    handlers = [
        ('/', VueHandler, {'view': 'home'}),
        ('/(favicon.ico)', UncachedStaticFileHandler, {'path': wwwDir}),
        ('/generate-reg', GenerateRegHandler),
        ('/devices/([^/]+)', DeviceHandler),
        ('/(serial-bridge.(?:js|css|map))', UncachedStaticFileHandler, {'path': wwwDir / 'dist'}),
        ('/(fa-[^/]+)', StaticFileHandler, {'path': wwwDir / 'dist'}),
        ('/devices/([^/]+)/websocket', WebsocketHandler),
    ]

    asyncio.set_event_loop(asyncio.new_event_loop())
    app = tornado.web.Application(handlers)
    app.listen(port)
    tornado.ioloop.IOLoop.current().start()
