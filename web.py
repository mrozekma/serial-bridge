import asyncio
import traceback
from pathlib import Path
from typing import Set

import tornado.ioloop
from tornado.web import RequestHandler, StaticFileHandler
from tornado.websocket import WebSocketHandler

'''
class StaticHandler(RequestHandler):
    def get(self, path: str):
        path = wwwDir / path
        if wwwDir not in path.absolute().parents:
            self.send_error(403)
            return
        elif not path.is_file():
            self.send_error(404)
            return
        self.write(path.read_bytes())

class IndexHandler(StaticHandler):
    def get(self):
        return super(IndexHandler, self).get('index.html')

class StaticHandler(RequestHandler):
    def initialize(self, path: Path):
        self.path = path

    def get(self):
        self.write(self.path.read_bytes())
'''

sockets: Set['WebsocketHandler'] = set()

class WebsocketHandler(WebSocketHandler):
    def open(self):
        print('ws open')
        sockets.add(self)

    def on_message(self, message):
        print('ws message: %s' % message)
        # self.write_message()

    def on_close(self):
        print('ws close')
        sockets.remove(self)

wwwDir = Path('web')
handlers = [
    # ('/static/(.+)', StaticHandler),
    # ('/', IndexHandler),
    # ('/', StaticHandler, {'path': wwwDir / 'index.html'}),
    # ('/serial-bridge.js', StaticHandler, {'path': wwwDir / 'dist' / 'serial-bridge.js', 'mime': 'text/javascript'}),
    # ('/serial-bridge.css', StaticHandler, {'path': wwwDir / 'dist' / 'serial-bridge.css', 'mime': 'text/css'}),

    ('/()', StaticFileHandler, {'path': wwwDir / 'index.html'}),
    ('/(serial-bridge.(?:js|css|map))', StaticFileHandler, {'path': wwwDir / 'dist'}),
    ('/xterm.css()', StaticFileHandler, {'path': wwwDir / 'node_modules' / 'xterm' / 'dist' / 'xterm.css'}), #TODO Can't figure out how to bundle this with everything else...
    ('/websocket', WebsocketHandler),
]

def listen(port: int):
    asyncio.set_event_loop(asyncio.new_event_loop())
    app = tornado.web.Application(handlers)
    app.listen(port)
    tornado.ioloop.IOLoop.current().start()

def push(data: bytes):
    print(data)
    for socket in sockets:
        try:
            socket.write_message(data)
        except Exception:
            traceback.print_exc()
