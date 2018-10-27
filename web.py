import asyncio
import json
import traceback
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Set

from slugify import slugify
import tornado.ioloop
from tornado.web import RequestHandler, StaticFileHandler
from tornado.websocket import WebSocketHandler

from Node import Node

devices: Dict[str, List[Node]] = {}
slugs: Dict[str, str] = {}
sockets: Dict[str, Set['WebsocketHandler']] = defaultdict(set) # {device name: {socket}}

class TemplateHandler(RequestHandler):
    def initialize(self, template, **args):
        self.template = template
        self.args = args

    def get(self, *, args = {}):
        self.render(str(self.template), **self.args, **args)

class DeviceHandler(TemplateHandler):
    def get(self, slug):
        if slug not in slugs:
            self.send_error(404)
            return
        device = slugs[slug]
        return super(DeviceHandler, self).get(args = {'nodes': devices[device]})

class WebsocketHandler(WebSocketHandler):
    def open(self, slug):
        if slug not in slugs:
            self.write_error(404)
            return
        self.device = slugs[slug]

        print('ws open')
        sockets[self.device].add(self)

    def on_message(self, message):
        print('ws message: %s' % message)

    def on_close(self):
        print('ws close')
        sockets[self.device].remove(self)
        # sockets.remove(self)

    def send(self, data):
        self.write_message(json.dumps(data))

def listen(port: int, _devices: Dict[str, Node]):
    global devices, slugs
    devices = _devices
    slugs = {slugify(device): device for device in devices.keys()}

    if len(slugs) != len(devices):
        raise ValueError("Device names don't map to unique URL slugs")

    def onSerialData(node: Node, source: str, data: bytes):
        if source != 'serial':
            return
        for socket in sockets[node.deviceName]:
            try:
                socket.send({'type': 'data', 'node': node.name, 'data': data.decode()})
            except Exception:
                traceback.print_exc()

    for nodes in devices.values():
        for node in nodes:
             node.addListener(onSerialData)

    wwwDir = Path('web')
    handlers = [
        ('/', TemplateHandler, {'template': wwwDir / 'index.html', 'deviceNames': sorted(devices.keys()), 'slugify': slugify}),
        ('/devices/([^/]+)', DeviceHandler, {'template': wwwDir / 'device.html'}),
        ('/(serial-bridge.(?:js|css|map))', StaticFileHandler, {'path': wwwDir / 'dist'}),
        ('/xterm.css()', StaticFileHandler, {'path': wwwDir / 'node_modules' / 'xterm' / 'dist' / 'xterm.css'}), # TODO Can't figure out how to bundle this with everything else...
        ('/(fa-[^/]+)', StaticFileHandler, {'path': wwwDir / 'dist'}),
        ('/devices/([^/]+)/websocket', WebsocketHandler),
    ]

    asyncio.set_event_loop(asyncio.new_event_loop())
    app = tornado.web.Application(handlers)
    app.listen(port)
    tornado.ioloop.IOLoop.current().start()
