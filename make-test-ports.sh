#!/bin/bash

function makePort() {
	echo "$1 <-> $2"
	socat pty,raw,echo=1,link=$1 pty,raw,echo=1,link=$2 &
}

# Kill background processes on exit
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

for i in {0..9}; do
	makePort /tmp/ttyS100"$i"{a,b}
done

echo "Waiting..."
read
