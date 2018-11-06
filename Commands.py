from functools import lru_cache
import importlib
from typing import List

from Node import Node

commandList = None
def command(name, icon = None):
    def wrap(fn):
        commandList.append(name)
        fn.sb_command = name
        fn.sb_command_icon = icon
        return fn
    return wrap

def divider():
    commandList.append('-')

class Commands:
    @staticmethod
    @lru_cache(maxsize = None)
    def loadCommands(moduleName):
        global commandList
        commandList = []
        script = importlib.import_module(moduleName)
        thisCommandList, commandList = commandList, None

        fns = [getattr(script, name) for name in dir(script)]
        commands = {fn.sb_command: fn for fn in fns if hasattr(fn, 'sb_command')}

        if len(set(thisCommandList)) != len(thisCommandList):
            raise ValueError("Duplicate command name")
        elif '-' in commands:
            raise ValueError("'-' is a reserved command name")

        return thisCommandList, commands

    def __init__(self, scriptName):
        self.commandList, self.commands = Commands.loadCommands(scriptName)

    def run(self, name, nodes: List[Node]):
        nodes = {node.name: node for node in nodes}

        class API:
            def send(self, nodeName, command):
                nodes[nodeName].webToSerial(command.encode())

            def sendln(self, nodeName, command = ''):
                self.send(nodeName, command + '\r\n')

        self.commands[name](API())

    def __iter__(self):
        for command in self.commandList:
            yield (command, None if command == '-' else self.commands[command].sb_command_icon)

    def __contains__(self, name):
        return name in self.commands