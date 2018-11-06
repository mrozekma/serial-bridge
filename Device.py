from threading import Lock
from typing import List, Dict

from Commands import Commands
from Node import Node

class Device:
    def __init__(self, name: str, nodes: List[Node], commands: Commands, webConnectionHighlights: List[Dict[str, str]]):
        if len({node.name for node in nodes}) != len(nodes):
            raise ValueError(f"Duplicate node names in {name} device")

        self.name = name
        self.nodes = nodes
        self.commands = commands
        self.webConnectionHighlights = webConnectionHighlights
        self.serialConnected = True
        self.serialLock = Lock()

        for node in self.nodes:
            node.device = self

    def serialConnect(self):
        with self.serialLock:
            if self.serialConnected:
                raise ValueError("Already connected")
            for node in self.nodes:
                try:
                    node.connect()
                except Exception as e:
                    # Need to re-disconnect from all the nodes up till this one
                    for node2 in self.nodes:
                        if node == node2:
                            raise e
                        try:
                            node2.disconnect()
                        except Exception:
                            pass
            self.serialConnected = True

    def serialDisconnect(self):
        with self.serialLock:
            if not self.serialConnected:
                raise ValueError("Not connected")
            for node in self.nodes:
                node.disconnect()
            self.serialConnected = False
