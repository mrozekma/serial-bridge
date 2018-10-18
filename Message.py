from typing import Union, Tuple, Optional, List


def toBytes(arg: Union[bytes, str]):
    return arg if isinstance(arg, bytes) else arg.encode()

class Message:
    def __init__(self, command: str, *payload: List[Union[bytes, str]]):
        self.command = command
        self.payload = b' '.join(toBytes(arg) for arg in payload)

    def isCommand(self, command: Union[bytes, str]):
        return toBytes(self.command) == toBytes(command)

    def hasPayload(self):
        return self.payload != b''

    def __getitem__(self, index: Union[int, slice]) -> Union[bytes, str]:
        if isinstance(index, int):
            return self.payload.split(b' ', index + 1)[index].decode()
        elif isinstance(index, slice):
            if index.stop is None and index.step is None:
                if index.start is None:
                    return self.payload
                else:
                    return self.payload.split(b' ', index.start)[index.start]
            else:
                raise ValueError("Bad slice")
        else:
            raise ValueError("Bad index")

    def __iter__(self):
        return iter(arg.decode() for arg in self.payload.split(b' '))

    def __len__(self):
        return len(self.payload)

    def encode(self):
        data = toBytes(self.command)
        if self.payload:
            data += b' ' + self.payload
        return str(len(data)).encode() + b' ' + data

    def send(self, sock):
        sock.sendall(self.encode())

    @staticmethod
    def decode(data: bytes) -> Tuple[Optional['Message'], bytes]:
        # Returns the first message in 'data', and the unconsumed bytes

        # Messages are of the form "<length> <payload>". Newlines outside of the payload are discarded
        data = data.lstrip(b'\r\n')
        if b' ' not in data:
            return None, data

        lenStr, data = data.split(b' ', 1)
        msgLen = int(lenStr)
        if msgLen > len(data):
            return None, data

        msgBytes = data[:msgLen]
        if b' ' in msgBytes:
            command, payload = msgBytes.split(b' ', 1)
        else:
            command, payload = msgBytes, b''

        return Message(command.decode(), payload), data[msgLen:]

    @staticmethod
    def iterFromSocket(sock):
        data = b''
        while True:
            # Read some data
            block = sock.recv(1024)
            if not block:
                return

            # Yield every message in 'data' so far
            message, data = Message.decode(data + block)
            while message:
                yield message
                message, data = Message.decode(data)
