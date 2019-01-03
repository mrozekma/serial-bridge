import json
from pathlib import Path
from threading import Thread
import time

# from Device import Device
from jsmin import jsmin

import web
from Commands import Commands
from Device import Device
from Node import Node

configFile = Path(__file__).parent / 'config.json'
config = json.loads(jsmin(configFile.read_text()))

webPort = config.get('web port', 80)
print("Opening serial ports")
devices = {device['name']: Device(
    device['name'],
    [Node(node['name'], node['com port'], node['baud rate'], node.get('byte size', 8), node.get('parity', 'none'), node.get('stop', 1), node['tcp port'], node.get('web links', None), node.get('web default visible', True), node.get('ssh', None)) for node in device.get('nodes', [])],
    Commands(device['commands']) if 'commands' in device else None,
    [highlight if isinstance(highlight, dict) else {'type': None, 'name': highlight} for highlight in device.get('web highlighted connections', [])],
) for device in config.get('devices', [])}

# TCP connections are received and handled on their own threads
print("Starting TCP listeners")
for device in devices.values():
    for node in device.nodes:
        Thread(target = lambda: node.tcp.serve_forever(), daemon = True).start()

# Another thread listens for web connections
print("Starting webserver")
Thread(target = lambda: web.listen(webPort, devices), daemon = True).start()

# The main thread polls for serial traffic
print("Ready")
while True:
    for device in devices.values():
        for node in device.nodes:
            node.poll()
    time.sleep(.0001)
