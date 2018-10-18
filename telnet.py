import argparse
import socket
import sys
from threading import Thread

import readchar

from Message import Message

parser = argparse.ArgumentParser()
parser.add_argument('host')
parser.add_argument('-p', '--port', type = int, default = 7777)
parser.add_argument('-d', '--device', required = True)
parser.add_argument('--rw', '--write', action = 'store_true', dest = 'write')
args = parser.parse_args()

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.connect((args.host, args.port))
    def reader():
        for message in Message.iterFromSocket(sock):
            if message.isCommand('data') and message[0] == args.device:
                sys.stdout.write(message[1:].decode())
    Message('subscribe', args.device).send(sock)

    Thread(target = reader, daemon = True).start()
    while True:
        c = readchar.readchar()
        if c == '\003': # Ctrl+C
            break
        if args.write:
            Message('send', args.device, c).send(sock)
