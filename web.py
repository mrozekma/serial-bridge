import asyncio
import hashlib
import html
import io
import json
import socket
import traceback
import zipfile
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from textwrap import dedent
from typing import Dict

from slugify import slugify
import tornado.ioloop
from tornado.platform.asyncio import AnyThreadEventLoopPolicy
from tornado.web import RequestHandler, StaticFileHandler
from tornado.websocket import WebSocketHandler

from Device import Device
from Node import Node

devices: Dict[str, Device] = {}
slugs: Dict[str, str] = {}

wwwDir = Path('web')

# The version hash is calculated once on boot, even though technically static files are loaded from disk on each request.
# (In other words, editing files on disk without reloading the server in production won't change the version hash)
m = hashlib.sha256()
for path in (wwwDir / 'dist').iterdir():
    m.update(path.name.encode())
    m.update(b"|")
    m.update(path.read_bytes())
    m.update(b"|")
versionHash = m.hexdigest()

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
            'devices': sorted([{'name': value, 'slug': key} for key, value in slugs.items()], key = lambda e: e['name']),
            'version_hash': versionHash,
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
    defaultPuttyPath = r'C:\Program Files (x86)\PuTTY\putty.exe'
    batFile = f"""\
    @echo off
    rem Expects to be invoked via a link of the form "putty:-raw HOST -P PORT", which is also what will be passed in as command-line arguments
    set args=%*
    rem The browser encodes spaces as %20
    setlocal enabledelayedexpansion
    set decoded=!args:%%20= !
    
    if "%decoded:~0,6%" == "putty:" (
        start "PuTTY" "{defaultPuttyPath}" %decoded:~6%
    ) else (
        echo Unexpected arguments
    )
    """

    def post(self):
        path = self.get_argument('app_path')
        parentStr = path[:path.rfind('\\')] if '\\' in path else 'C:\\'

        fileFormat = lambda s: dedent(s).replace('\n', '\r\n')
        slashEscape = lambda s: s.replace('\\', '\\\\')

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as zip:
            zip.writestr('README.txt', fileFormat(f"""\
                To support telnet links, run telnet.reg.
                To support raw and SSH links in Putty, extract putty.bat to {parentStr} and run putty.reg.
            """))
            zip.writestr('telnet.reg', fileFormat(f"""\
                Windows Registry Editor Version 5.00
                
                [HKEY_LOCAL_MACHINE\\SOFTWARE\\Classes\\telnet\\shell\\open\\command]
                @="\\"{slashEscape(path)}\\" %l"
                
            """))
            zip.writestr('putty.reg', fileFormat(f"""\
                Windows Registry Editor Version 5.00
                
                [HKEY_CLASSES_ROOT\\putty]
                "URL Protocol"=""
                
                [HKEY_CLASSES_ROOT\\putty\\shell]
                
                [HKEY_CLASSES_ROOT\\putty\\shell\\open]
                
                [HKEY_CLASSES_ROOT\\putty\\shell\\open\\command]
                @="\\"{slashEscape(parentStr)}\\\\putty.bat\\" %1"
                
            """.replace('\n', '\r\n')))
            zip.writestr('putty.bat', fileFormat(self.batFile.replace(self.defaultPuttyPath, path)))

        self.write(buf.getvalue())
        self.set_header('Content-Type', 'application/octet-stream')
        self.set_header('Content-Disposition', 'attachment; filename=serial_bridge.zip')

class DeviceHandler(VueHandler):
    def initialize(self):
        super(DeviceHandler, self).initialize('device')
        
    def get(self, slug):
        if slug not in slugs:
            self.send_error(404)
            return
        device = devices[slugs[slug]]
        self.render({
            'device': device.name,
            'nodes': [{'name': node.name, 'tcp_port': node.tcpPort, 'com_port': node.serialData['port'], 'links': node.getWebLinkInfo(), 'default_visible': node.webDefaultVisible} for node in device.nodes],
            'commands': [{'name': name, 'icon': icon} for (name, icon) in device.commands] if device.commands else None,
        })

class WebsocketHandler(WebSocketHandler):
    def open(self, slug):
        if slug not in slugs:
            self.write_error(404)
            return
        self.device = devices[slugs[slug]]

        print('ws open')
        self.device.websockets.add(self)
        WebsocketHandler.sendConnectionInfo(self.device)
        self.send({'type': 'serial-state', 'connected': self.device.serialConnected})
        self.send({'type': 'jenkins', 'now': int(datetime.now().timestamp() * 1000), **self.device.jenkins.toDict()})

    def on_message(self, message):
        print('ws message: %s' % message)

    def on_close(self):
        print('ws close')
        self.device.websockets.remove(self)
        WebsocketHandler.sendConnectionInfo(self.device)

    def send(self, data):
        self.write_message(json.dumps({'version_hash': versionHash, **data}))

    @staticmethod
    def sendAll(device, data):
        for socket in device.websockets:
            try:
                socket.send(data)
            except Exception:
                traceback.print_exc()

    @staticmethod
    def sendConnectionInfo(device: Device):
        def isHighlighted(type, addr, name):
            return any(highlight['type'] in (None, type) and highlight['name'] in (addr, name) for highlight in device.webConnectionHighlights)

        tcpAddrs = {client.client_address[0] for node in device.nodes for client in node.clients}
        webAddrs = {handler.request.remote_ip for handler in device.websockets}

        names = [{'type': 'tcp', 'name': ipToName(addr), 'highlighted': isHighlighted('tcp', addr, ipToName(addr))} for addr in tcpAddrs] \
              + [{'type': 'web', 'name': ipToName(addr), 'highlighted': isHighlighted('web', addr, ipToName(addr))} for addr in webAddrs]
        WebsocketHandler.sendAll(device, {'type': 'connections', 'data': sorted(names, key = lambda e: e['name'])})

class CommandHandler(RequestHandler):
    def post(self, slug):
        if slug not in slugs:
            self.send_error(404)
            return
        device = devices[slugs[slug]]

        name = self.get_argument('command')
        if name not in device.commands:
            self.send_error(403)
            return

        device.commands.run(name, device.nodes)

class SerialConnectionHandler(RequestHandler):
    def post(self, slug):
        if slug not in slugs:
            self.send_error(404)
            return
        device = devices[slugs[slug]]

        state = self.get_argument('state')
        if state == 'connect':
            device.serialConnect()
        elif state == 'disconnect':
            device.serialDisconnect()
        else:
            raise ValueError(f"Bad state: {state}")

        WebsocketHandler.sendAll(device, {'type': 'serial-state', 'connected': device.serialConnected})

class JenkinsInfo:
    def __init__(self):
        self.clear()

    def clear(self):
        self.buildName = None
        self.buildLink = None
        self.buildStart = None
        self.stages = []
        self.tasks = []

    def updateBuild(self, buildName, buildLink):
        self.buildName = buildName
        self.buildLink = buildLink
        self.buildStart = datetime.now()
        self.stages = []
        self.tasks = []

    def pushStage(self, stage):
        self.checkBuild()
        self.stages.append((stage, datetime.now()))

    def popStage(self):
        if self.stages:
            self.stages.pop()

    def pushTask(self, task):
        self.checkBuild()
        self.tasks.append((task, datetime.now()))

    def popTask(self):
        if self.tasks:
            self.tasks.pop()

    def checkBuild(self):
        if self.buildName is None:
            raise RuntimeError("Can't push stage or task without an active build")

    def toDict(self):
        stage = self.stages[-1] if self.stages else None
        task = self.tasks[-1] if self.tasks else None
        return {
            'build': {'name': self.buildName, 'link': self.buildLink, 'start': int(self.buildStart.timestamp() * 1000)} if self.buildName else None,
            'stage': {'name': stage[0], 'start': int(stage[1].timestamp() * 1000)} if stage else None,
            'task': {'name': task[0], 'start': int(task[1].timestamp() * 1000)} if task else None,
        }

class JenkinsHandler(RequestHandler):
    def post(self, action):
        data = json.loads(self.request.body)
        device = devices[data['device']]
        if action == 'build-start':
            device.jenkins.updateBuild(data['build_name'], data['build_link'])
        elif action == 'build-stop':
            device.jenkins.clear()
            WebsocketHandler.sendAll(device, {'type': 'jenkins', 'action': 'build-stop', 'result': data['result']})
            return
        elif action == 'stage-push':
            device.jenkins.pushStage(data['stage'])
        elif action == 'stage-pop':
            device.jenkins.popStage()
        elif action == 'task-push':
            device.jenkins.pushTask(data['task'])
        elif action == 'task-pop':
            device.jenkins.popTask()
        else:
            self.send_error(404)
            return

        WebsocketHandler.sendAll(device, {'type': 'jenkins', 'action': action, 'now': int(datetime.now().timestamp() * 1000), **device.jenkins.toDict()})

def listen(port: int, _devices: Dict[str, Device]):
    global devices, slugs
    devices = _devices
    slugs = {slugify(device): device for device in devices.keys()}

    if len(slugs) != len(devices):
        raise ValueError("Device names don't map to unique URL slugs")

    def onTcpConnectDisconnect(node: Node, remote_addr: str):
        WebsocketHandler.sendConnectionInfo(node.device)

    def onSerialData(node: Node, source: str, data: bytes):
        if source == 'serial':
            try:
                dataStr = data.decode()
            except Exception:
                traceback.print_exc()
                return

            WebsocketHandler.sendAll(node.device, {'type': 'data', 'node': node.name, 'data': dataStr})

    for device in devices.values():
        device.websockets = set()
        device.jenkins = JenkinsInfo()

        for node in device.nodes:
            node.signals['connect'].connect(onTcpConnectDisconnect)
            node.signals['disconnect'].connect(onTcpConnectDisconnect)
            node.signals['data'].connect(onSerialData)

    handlers = [
        ('/', VueHandler, {'view': 'home', 'data': {'bat': GenerateRegHandler.batFile, 'defaultPuttyPath': GenerateRegHandler.defaultPuttyPath}}),
        ('/(favicon.ico)', UncachedStaticFileHandler, {'path': wwwDir}),
        ('/generate-reg', GenerateRegHandler),
        ('/devices/([^/]+)', DeviceHandler),
        ('/(serial-bridge.(?:js|css|map))', UncachedStaticFileHandler, {'path': wwwDir / 'dist'}),
        ('/(bootstrap.css.map)', UncachedStaticFileHandler, {'path': wwwDir / 'node_modules' / 'bootstrap' / 'dist' / 'css'}),
        ('/(fa-[^/]+)', StaticFileHandler, {'path': wwwDir / 'dist'}),
        ('/devices/([^/]+)/websocket', WebsocketHandler),
        ('/devices/([^/]+)/run-command', CommandHandler),
        ('/devices/([^/]+)/serial-connection', SerialConnectionHandler),
        ('/jenkins/(.+)', JenkinsHandler),
    ]

    asyncio.set_event_loop_policy(AnyThreadEventLoopPolicy())
    app = tornado.web.Application(handlers)
    app.listen(port)
    tornado.ioloop.IOLoop.current().start()
