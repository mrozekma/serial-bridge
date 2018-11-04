<template>
    <div class="root">
        <sb-navbar :device="device" :devices="devices" :connections="connections">
            <b-navbar-nav class="mr-auto">
                <b-nav-item-dropdown v-if="commands" text="Commands">
                    <template v-for="command in commands">
                        <b-dropdown-divider v-if="command.name == '-'"></b-dropdown-divider>
                        <b-dropdown-item v-else @click="run_command(command.name)"><i v-if="command.icon" :class="`fas fa-${command.icon}`"></i>{{ command.name }}</b-dropdown-item>
                    </template>
                </b-nav-item-dropdown>
                <b-nav-item v-if="log.start === null" @click="log_start">Logging</b-nav-item>
                <b-nav-item v-else class="running" @click="log_end">Logging</b-nav-item>
                <b-nav-item-dropdown text="Admin">
                    <b-dropdown-item @click="serial_disconnect"><i class="fas fa-network-wired"></i>Serial disconnect</b-dropdown-item>
                </b-nav-item-dropdown>
            </b-navbar-nav>
            <b-navbar-nav>
                <b-nav-item v-if="log.start !== null" v-b-tooltip.hover.bottomleft :title="`Logging since ${new Date(log.start).toLocaleString()}`" @click="log_end">
                    <i class="fas fa-edit"></i>
                </b-nav-item>
                <b-nav-item v-if="connections === null" class="disconnected">
                    <i class="fas fa-network-wired"></i>
                    Disconnected
                </b-nav-item>
                <b-nav-item v-else-if="connections.length > 0" v-b-tooltip.hover.bottomleft.html :title="'<b>Connections</b>:<br><br>' + connections.join('<br>')">
                    <i class="fas fa-network-wired"></i>
                    {{ connections.length }}
                </b-nav-item>
            </b-navbar-nav>
        </sb-navbar>
        <!-- It's important never to remove the .term elements from the DOM, since the xterms are attached. Instead a style dynamically hides them -->
        <div class="body" ref="body" :class="{hidden: !serial_connected}">
            <div v-for="node in nodes" :key="node.name" class="term" ref="term">
                <div class="title">
                    <div>
                        {{ node.name }}
                        <a v-if="node.show_telnet_link" class="telnet-link" :href="`telnet://${window.location.hostname}:${node.tcp_port}`"><i class="fas fa-external-link-alt"></i></a>
                    </div>
                </div>
                <div v-once class="content" ref="term-content" :data-name="node.name"></div>
            </div>
        </div>
        <sb-callout v-if="!serial_connected" type="danger" title="Disconnected">
            This device's serial ports have been disconnected from Serial Bridge. This is typically so someone can connect to those ports directly, but in the meantime they are inaccessible via TCP or this web interface.<br><br>
            <b-button variant="primary" @click="serial_connect">Reconnect ports</b-button>
        </sb-callout>
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

    import axios from 'axios';
    import saveAs from 'file-saver';
    import qs from 'qs';
    import JSZip from 'jszip';

    import Toasted from 'vue-toasted';
    Vue.use(Toasted, {position: 'bottom-center', iconPack: 'fontawesome'});

    import VuejsDialog from 'vuejs-dialog';
    // import VuejsDialogMixin from 'vuejs-dialog/dist/vuejs-dialog-mixin.min.js';
    import 'vuejs-dialog/dist/vuejs-dialog.min.css';
    Vue.use(VuejsDialog);

    import SbLogSave from '../components/sb-log-save';
    Vue.dialog.registerComponent('log-save', SbLogSave);

    import SbNavbar from '../components/sb-navbar';
    import SbCallout from '../components/sb-callout';
    export default {
        components: {SbNavbar, SbCallout},
        props: ['version_hash', 'device', 'devices', 'nodes', 'commands'],
        data: function() {
            return {
                connections: null,
                serial_connected: true,
                terminals: new Map(), // NB: Maps are not reactive
                log: {
                    start: null,
                    nodes: null,
                },
            };
        },
        mounted: function() {
            var self = this;

            document.title = `${this.device} - ${document.title}`;

            for(var container of this.$refs['term-content']) {
                var term = new Terminal({
                    disableStdin: true,
                    scrollback: 5000,
                });
                this.terminals.set(container.getAttribute('data-name'), term);
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
                for(var term of self.terminals.values()) {
                    term.fit();
                }
            };

            window.addEventListener('resize', sizeTerminals);
            sizeTerminals();

            var process_message = function(msg) {
                if(process.env.NODE_ENV == 'development') {
                    console.log(msg);
                } else if(self.version_hash != null && msg.version_hash != self.version_hash) {
                    self.version_hash = null; // This indicates that the version is out of date and the toast is already shown
                    Vue.toasted.show(
                        "A new version of Serial Bridge is available.",
                        {
                            duration: null,
                            'type': 'info',
                            'icon': 'sync-alt',
                            'action': {
                                text: 'Refresh',
                                onClick: function(e, toast) {
                                    window.location.reload(true);
                                },
                            },
                        }
                    );
                }

                switch(msg.type) {
                    case 'connections':
                        self.connections = msg.data;
                        break;
                    case 'serial-state':
                        self.serial_connected = msg.connected;
                        break;
                    case 'data':
                        self.terminals.get(msg.node).write(msg.data);
                        if(self.log.nodes != null) {
                            var logNode = self.log.nodes.get(msg.node);
                            logNode.fragments.push({when: Date.now() - self.log.start, data: msg.data});
                            logNode.size += msg.data.length;
                        }
                        break;
                }
            };

            var socket = null;
            var connect = function() {
                socket = new WebSocket('ws://' + window.location.host + window.location.pathname + '/websocket');
                socket.onopen = function () {
                    console.log('Websocket open');
                    self.connections = [];
                }
                socket.onmessage = function (e) {
                    process_message(JSON.parse(e.data));
                }
                socket.onclose = function () {
                    console.log('Websocket closed');
                    self.connections = null;
                    setTimeout(connect, 5000);
                }
            };
            connect();

            window.onunload = function () {
                socket.close();
            };
        },
        methods: {
            run_command: function(command) {
                var toast = Vue.toasted.show("Running...", {duration: null, type: 'info', icon: 'clock'});
                axios.post(window.location.origin + window.location.pathname + '/run-command', qs.stringify({command}))
                    .then(function(resp) {
                        toast.text('Done').goAway(1000);
                    })
                    .catch(function(err) {
                        toast.goAway(0);
                        console.error(err);
                    });
            },
            serial_connect: function() {
                axios.post(window.location.origin + window.location.pathname + '/serial-connection', qs.stringify({state: 'connect'}))
                    .then(function(resp) {
                        Vue.toasted.show("Serial ports connected", {duration: 2000, type: 'success', icon: 'check'});
                    })
                    .catch(function(err) {
                        Vue.toasted.show("Failed to connect serial ports", {duration: 5000, type: 'error', icon: 'exclamation-circle'});
                        console.error(err);
                    });
            },
            serial_disconnect: function() {
                var msg = (this.connections == null || this.connections.length < 2) ? '' : `There are ${this.connections.length} users on this device. `
                msg += "Are you sure you want to disconnect this device's serial ports? They will no longer be available over TCP or this web interface."
                Vue.dialog.confirm({title: 'Serial disconnect', body: msg}, {okText: 'Disconnect', cancelText: 'Cancel', type: 'hard', verification: this.device, backdropClose: true})
                    .then(function(dialog) {
                        axios.post(window.location.origin + window.location.pathname + '/serial-connection', qs.stringify({state: 'disconnect'}))
                            .then(function(resp) {
                                Vue.toasted.show("Serial ports disconnected", {duration: 2000, type: 'success', icon: 'check'});
                            })
                            .catch(function(err) {
                                Vue.toasted.show("Failed to disconnect serial ports", {duration: 5000, type: 'error', icon: 'exclamation-circle'});
                                console.error(err);
                            });
                });
            },
            log_start: function() {
                this.log.start = Date.now();
                this.log.nodes = new Map();
                for(let node of this.nodes) {
                    this.log.nodes.set(node.name, {size: 0, fragments: []});
                }
                Vue.toasted.show("Started logging", {duration: 2000, type: 'info', icon: 'edit'});
            },
            log_end: function() {
                var self = this;

                // These props get passed into the sb-log-save component. All the options passed in to the dialog
                // are copied to a separate object internally, so these props are wrapped in an extra object to make
                // sure the props object is shallow-copied and changes here are reflected there.
                var props = {
                    msg: 'Working...',
                    progress: 0,
                    total: 0,
                    enableSaveButtons: false,
                    enableStopButton: true,
                };
                for(let val of this.log.nodes.values()) {
                    props.total += val.size;
                }

                if(props.total == 0) {
                    // Nothing logged
                    this.log.start = null;
                    this.log.nodes = null;
                    return;
                }

                var zip = new JSZip();
                Vue.dialog.confirm("Test message", {view: 'log-save', backdropClose: true, remoteProps: {props}})
                    .then(function(resp) {
                        var {dialog, result} = resp.data;
                        if(result == 'save-stop' || result == 'stop') {
                            self.log.start = null;
                            self.log.nodes = null;
                        }
                        if(result == 'save-stop' || result == 'save-continue') {
                            props.msg = 'Downloading...';
                            props.enableSaveButtons = props.enableStopButton = false;
                            zip.generateAsync({type: 'blob'}).then(function (content) {
                                saveAs(content, 'log.zip');
                                dialog.close();
                                zip = null;
                            });
                        }
                    }).catch(() => {
                        zip = null;
                    });

                //TODO This doesn't work, the dialog doesn't update until the function is done. Not sure this is possible in Javascript without using a web worker.
                // I do at least wait a moment to make sure the dialog is visible, so the user knows something is happening (otherwise the dialog doesn't even pop up until the zip is ready)
                setTimeout(function() {
                    (async function() {
                        for(let [nodeName, node] of self.log.nodes) {
                            props.msg = `Processing ${nodeName}`;
                            var curData = '';
                            for(let fragment of node.fragments) {
                                if(zip == null) { // Aborted
                                    return false;
                                }
                                curData += fragment.data;
                                props.progress += fragment.data.length;
                                if(process.env.NODE_ENV == 'development') {
                                    console.log(`Processed ${nodeName} fragment (${props.progress} / ${props.total})`);
                                }
                                await self.$nextTick();
                            }
                            zip.file(`${nodeName}.txt`, curData);
                        }
                        return true;
                    })().then(function(res) {
                        if(res) {
                            props.msg = "Ready to download log data.";
                            props.progress = props.total; // Should already be true, but just in case
                            props.enableSaveButtons = true;
                        }
                    });
                }, 100);
            }
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

        &.hidden {
            display: none;
        }
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

    .root > .bd-callout {
        margin-left: 20px;
    }
</style>

<!-- This is unscoped because the navbar comes from a separate component and the scopes interact oddly -->
<style>
    .navbar-nav .nav-item.running a.nav-link {
        color: #f00;
    }
</style>