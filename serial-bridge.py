import json
from pathlib import Path
from threading import Thread
import time

# from Device import Device
from jsmin import jsmin

import web
from Commands import Commands
from Node import Node

configFile = Path(__file__).parent / 'config.json'
config = json.loads(jsmin(configFile.read_text()))

webPort = config.get('web port', 80)
print("Opening serial ports")
devices = {device['name']: (
    [Node(node['name'], device['name'], node['com port'], node['baud rate'], node.get('byte size', 8), node.get('parity', 'none'), node.get('stop', 1), node['tcp port']) for node in device.get('nodes', [])],
    Commands(device['commands']) if 'commands' in device else None,
) for device in config.get('devices', [])}

for deviceName, (nodes, commands) in devices.items():
    if len({node.name for node in nodes}) != len(nodes):
        raise ValueError(f"Duplicate node names in {deviceName} device")

# TCP connections are received and handled on their own threads
print("Starting TCP listeners")
for (nodes, commands) in devices.values():
    for node in nodes:
        Thread(target = lambda: node.tcp.serve_forever(), daemon = True).start()

# Another thread listens for web connections
print("Starting webserver")
Thread(target = lambda: web.listen(webPort, devices), daemon = True).start()

# The main thread polls for serial traffic
print("Ready")
while True:
    for (nodes, commands) in devices.values():
        for node in nodes:
            node.poll()
    time.sleep(.0001)
