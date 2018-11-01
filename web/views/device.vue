<template>
    <div class="root">
        <sb-navbar :device="device" :devices="devices" :connected="connected"></sb-navbar>
        <div class="body" ref="body">
            <div v-for="node in nodes" :key="node.name" class="term" ref="term">
                <div class="title">
                    <div>
                        {{ node.name }}
                        <a class="telnet-link" :href="`telnet://${window.location.hostname}:${node.tcpPort}`"><i class="fas fa-external-link-alt"></i></a>
                    </div>
                </div>
                <div v-once class="content" ref="term-content" :data-name="node.name"></div>
            </div>
        </div>
    </div>
</template>

<script>
    import Vue from 'vue';
    Vue.prototype.window = window;

    import { Terminal } from 'xterm';
    import 'xterm/dist/xterm.css';
    // import * as attach from 'xterm/lib/addons/attach/attach';
    // Terminal.applyAddon(attach);
    import * as fit from 'xterm/lib/addons/fit/fit';
    Terminal.applyAddon(fit);

    import SbNavbar from '../components/sb-navbar';
    export default {
        components: {
            'sb-navbar': SbNavbar,
        },
        props: ['device', 'devices', 'nodes'],
        data: function() {
            return {
                connected: false,
            };
        },
        mounted: function() {
            var self = this;
            var terminals = new Map();

            document.title = `${this.device} - ${document.title}`;

            for(var container of this.$refs['term-content']) {
                var term = new Terminal({
                    disableStdin: true,
                    scrollback: 5000,
                });
                terminals.set(container.getAttribute('data-name'), term);
                term.open(container);
            };

            var sizeTerminals = function() {
                // Figure out the height of each terminal, which is slightly complicated:
                // Total height available, minus 50px for margins and whatnot, divided by the number of rows (there's 3 terminals per row), rounded down to a multiple of 17px to fit xterm's line height
                var numRows = Math.ceil(self.$refs['term'].length / 3);
                var height = Math.floor((self.$refs['body'].clientHeight - 50) / numRows);
                height -= height % 17;
                for(var container of self.$refs['term']) {
                    container.style.height = `${height}px`;
                }

                // Fit the xterms to the containers
                for(var term of terminals.values()) {
                    term.fit();
                }
            };

            window.addEventListener('resize', sizeTerminals);
            sizeTerminals();

            var process_message = function(msg) {
                switch(msg.type) {
                    case 'data':
                        terminals.get(msg.node).write(msg.data);
                        break;
                }
            };

            var socket = null;
            var connect = function() {
                socket = new WebSocket(window.location.href.replace('http://', 'ws://') + '/websocket');
                socket.onopen = function () {
                    console.log('Websocket open');
                    self.connected = true;
                }
                socket.onmessage = function (e) {
                    process_message(JSON.parse(e.data));
                }
                socket.onclose = function () {
                    console.log('Websocket closed');
                    self.connected = false;
                    setTimeout(connect, 5000);
                }
            };
            connect();

            window.onunload = function () {
                socket.close();
            };
        },
    }
</script>

<style lang="less" scoped>
    .root {
        height: 100%;
    }

    .body {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-around;
        height: calc(100% - 32px);
        padding: 20px;
    }

    .term {
        border: 3px solid #888;
        margin-bottom: 10px;
        width: 33%;
        height: 17px * 3; // The real height is set in Javascript. I know, I'm embarrassed

        .title {
            width: 100%;
            height: 28px;
            border: 2px solid #000;
            background-image: linear-gradient(#555555, #888888);
            color: #fff;

            > div {
                padding: 0 4px;
            }

            a {
                position: relative;
                top: -1px;
                float: right;
                color: #fff;
                i {
                    font-size: .75em;
                }
            }
        }

        .content {
            height: calc(100% - 28px);
            box-sizing: border-box;
        }

        .content .xterm {
            width: 100%;
            height: 100%;
            padding: 5px;
        }
    }
</style>
