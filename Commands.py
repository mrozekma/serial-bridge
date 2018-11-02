import importlib
from collections import OrderedDict
from pathlib import Path
from typing import List

from Node import Node

commandList = None
def command(name):
    def wrap(fn):
        commandList.append(name)
        fn.sb_command = name
        return fn
    return wrap

def divider():
    commandList.append('-')

class Commands:
    def __init__(self, scriptName):
        global commandList
        commandList = []
        script = importlib.import_module(scriptName)
        self.commandList, commandList = commandList, None

        fns = [getattr(script, name) for name in dir(script)]
        self.commands = {fn.sb_command: fn for fn in fns if hasattr(fn, 'sb_command')}

        if len(set(self.commandList)) != len(self.commandList):
            raise ValueError("Duplicate command name")
        elif '-' in self.commands:
            raise ValueError("'-' is a reserved command name")

    def run(self, name, nodes: List[Node]):
        nodes = {node.name: node for node in nodes}

        class API:
            def send(self, nodeName, command):
                nodes[nodeName].webToSerial(command.encode())

            def sendln(self, nodeName, command = ''):
                self.send(nodeName, command + '\r\n')

        self.commands[name](API())

    def __iter__(self):
        yield from self.commandList

    def __contains__(self, name):
        return name in self.commands