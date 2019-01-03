<template>
    <div class="root">
        <sb-navbar :device="device" :devices="devices" :connections="connections">
            <b-navbar-nav class="mr-auto">
                <b-nav-item-dropdown text="View">
                    <b-dropdown-item @click="reset_visibility"><i class="fas fa-minus-square"></i>Reset layout</b-dropdown-item>
                    <b-dropdown-item @click="reset_terms"><i class="fas fa-eraser"></i>Clear</b-dropdown-item>
                    <b-dropdown-item v-if="show_new_data" @click="show_new_data = false"><i class="fas fa-pause-circle"></i>Pause</b-dropdown-item>
                    <b-dropdown-item v-else @click="show_new_data = true"><i class="fas fa-play-circle"></i>Unpause</b-dropdown-item>
                    <b-dropdown-divider></b-dropdown-divider>
                    <b-dropdown-item v-for="node in nodes" @click="node_toggle_visibility(node)"><i class="fas" :class="node_is_visible(node) ? 'fa-check-square' : 'fa-square'"></i>{{ node.name }}</b-dropdown-item>
                </b-nav-item-dropdown>
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
                <sb-jenkins v-bind="jenkins" class="jenkins" @close="jenkins_close"></sb-jenkins>
            </b-navbar-nav>
            <b-navbar-nav>
                <b-nav-item v-if="!show_new_data" ref="pausedIcon" class="pause-icon" @click="show_new_data = !show_new_data">
                    <i class="fas fa-pause-circle"></i>
                    <b-tooltip :target="() => $refs.pausedIcon" placement="bottomleft">
                        <div>
                            <b>Output Paused</b><br>
                            Output during this<br>time is discarded.
                        </div>
                    </b-tooltip>
                </b-nav-item>
                <b-nav-item v-if="log.start !== null" v-b-tooltip.hover.bottomleft :title="`Logging since ${new Date(log.start).toLocaleString()}`" @click="log_end">
                    <i class="fas fa-edit"></i>
                </b-nav-item>
                <b-nav-item v-if="connections === null" class="disconnected">
                    <i class="fas fa-network-wired"></i>
                    Disconnected
                </b-nav-item>
                <b-nav-item v-else-if="connections.length > 0" ref="connectionsIcon" class="connections-icon" :class="{highlighted: connections.some(c => c.highlighted)}">
                    <i class="fas fa-network-wired"></i>
                    {{ connections.length }}
                    <b-tooltip :target="() => $refs.connectionsIcon" placement="bottomleft">
                        <div class="connections-tooltip">
                            <b>Connections</b>:
                            <div v-for="connection in connections" :class="{highlighted: connection.highlighted}"><i :class="{tcp: 'fas fa-terminal', web: 'fab fa-chrome'}[connection.type]"></i> {{ connection.name }}</div>
                        </div>
                    </b-tooltip>
                </b-nav-item>
            </b-navbar-nav>
        </sb-navbar>
        <!-- It's important never to remove the .term elements from the DOM, since the xterms are attached. Instead a style dynamically hides them -->
        <div class="body" ref="body" :class="{hidden: !serial_connected, odd: (nodes.filter(node_is_visible).length % 2 == 1)}" :style="layout_style">
            <div v-for="node in nodes" :key="node.name" class="term" :class="node_is_visible(node) ? null : 'hidden'" ref="term">
                <div class="title">
                    <div>
                        {{ node.name }}
                        <a v-for="link in Array.from(iter_node_links(node))" class="popup-link" :href="link.url" :title="link.title"><i :class="['fas', link.icon]"></i></a>
                    </div>
                </div>
                <div v-once class="content" ref="term-content" :data-name="node.name"></div>
            </div>
        </div>
        <template v-if="!serial_connected">
            <sb-callout type="danger" title="Disconnected">
                This device's serial ports have been disconnected from Serial Bridge. This is typically so someone can connect to those ports directly, but in the meantime they are inaccessible via TCP or this web interface.<br><br>
                <b-button variant="primary" @click="serial_connect">Reconnect ports</b-button>
            </sb-callout>
            <sb-callout type="info" title="Ports">
                For reference, this device uses the following serial ports:<br><br>
                <table class="com_ports">
                    <tr v-for="node in nodes"><td>{{ node.com_port }}</td><td>{{ node.name }}</td></tr>
                </table>
            </sb-callout>
        </template>
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

    const _ = require('lodash');

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
    import SbJenkins from '../components/sb-jenkins';
    export default {
        components: {SbNavbar, SbCallout, SbJenkins},
        props: ['version_hash', 'device', 'devices', 'nodes', 'commands'],
        computed: {
            layout_style: function() {
                return {
                    '--term-rows': this.layout.rows,
                    '--term-cols': this.layout.cols,
                    '--term-height': `${this.layout.height}px`,
                    '--term-width': `${this.layout.width}px`,
                };
            }
        },
        data: function() {
            return {
                connections: null,
                serial_connected: true,
                show_new_data: true,
                terminals: new Map(), // NB: Maps are not reactive
                layout: {
                    rows: 0,
                    cols: 0,
                    width: 0,
                    height: 0,
                },
                term_color: null,
                node_visibility: JSON.parse(localStorage.getItem('node_visibility')) || {},
                mounting: false,
                log: {
                    start: null,
                    nodes: null,
                },
                jenkins: {
                    build_name: null,
                    build_link: null,
                    stage: null,
                    task: null,
                    result: null,
                },
            };
        },
        watch: {
            connections: function() {this.term_color = this.compute_term_color();},
            show_new_data: function() {this.term_color = this.compute_term_color();},
            term_color: function(val) {
                const theme = val ? {background: val} : {};
                // Updating the terminal themes is a bit slow, so defer it until the menu has time to close or it gets stuck on screen
                setTimeout(() => {
                    for(const term of this.terminals.values()) {
                        console.log(term);
                        term.setOption('theme', theme);
                    }
                }, 0);
            },
            node_visibility: {
                handler: function(val) {
                    if(!_.isEmpty(val)) {
                        localStorage.setItem('node_visibility', JSON.stringify(val));
                    } else {
                        localStorage.removeItem('node_visibility');
                    }
                    this.size_terminals();
                },
                deep: true,
            },
        },
        beforeMount: function() {
            // This makes all the terminals visible during the initial render. Without this, invisible terminals are initialized with null dimensions,
            // and if they're later made visible, fit() calculates Infinity for the dimensions and crashes the browser.
            this.mounting = true;
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
            this.mounting = false;

            window.addEventListener('resize', this.size_terminals);
            // Wait for the next render so invisible terminals are actually hidden, then do the initial size
            this.$nextTick(this.size_terminals);

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
                    case 'jenkins':
                        if(msg.result === true || msg.result === false) {
                            self.jenkins.result = msg.result;
                            self.jenkins.stage = null;
                            self.jenkins.task = null;
                        } else {
                            self.jenkins.build_name = msg.build_name;
                            self.jenkins.build_link = msg.build_link;
                            self.jenkins.stage = msg.stage;
                            self.jenkins.task = msg.task;
                            self.jenkins.result = null;
                        }
                        break;
                    case 'data':
                        if(self.show_new_data) {
                            self.terminals.get(msg.node).write(msg.data);
                        }
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
            size_terminals: function() {
                this.layout.rows = 2;
                this.layout.cols = Math.ceil(this.nodes.filter(this.node_is_visible).length / this.layout.rows);

                // Figure out the height of each terminal, which is slightly complicated:
                // Total height available, minus 20px for body bottom padding, divided by the number of rows, rounded down to a multiple of 17px to fit xterm's line height, minus 17px for the lower terminal margin
                this.layout.height = Math.floor((this.$refs['body'].clientHeight - 20) / this.layout.rows);
                this.layout.height = this.layout.height - (this.layout.height % 17) - 17;

                // The term width is more straightforward -- just divide up the available space (body width - 40px padding)
                // This could be done in CSS as calc(25% - 5px), but if the percentage isn't an integer it can cause very minor rendering problems in the term titlebar
                this.layout.width = Math.floor((this.$refs['body'].clientWidth - 40) / this.layout.cols - 5);

                // Wait for the new layout to render
                this.$nextTick(function() {
                    // Fit the xterms to the containers
                    for(var term of this.terminals.values()) {
                        term.fit();
                    }
                });
            },
            compute_term_color: function() {
                return (this.connections === null) ? '#700' :
                       !this.show_new_data         ? '#007' :
                                                     null;
            },
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
            node_is_visible: function(node) {
                const vis = this.node_visibility[node.name];
                // See the comment in beforeMount() for the reason this.mounting makes all nodes visible
                return this.mounting ? true : (vis !== undefined) ? vis : node.default_visible;
            },
            iter_node_links: function*(node) {
                for(const link of node.links) {
                    switch(link.type) {
                        case 'telnet':
                            yield {
                                title: 'Telnet',
                                icon: 'fa-external-link-alt',
                                url: `telnet://${window.location.hostname}:${node.tcp_port}`,
                            };
                            break;
                        case 'raw':
                            yield {
                                title: 'Raw',
                                icon: 'fa-external-link-alt',
                                url: `putty:-raw ${window.location.hostname} -P ${node.tcp_port}`,
                            };
                            break;
                        case 'ssh':
                            const args = [link.host];
                            if(link.username) {args.push(`-l ${link.username}`);}
                            if(link.password) {args.push(`-pw ${link.password}`);}
                            yield {
                                title: 'SSH',
                                icon: 'fa-terminal',
                                url: `putty:-ssh ${args.join(' ')}`,
                            };
                            break;
                    }
                }
            },
            node_toggle_visibility: function(node) {
                this.$set(this.node_visibility, node.name, !this.node_is_visible(node));
            },
            reset_visibility: function() {
                this.node_visibility = {};
            },
            reset_terms: function() {
                for(const term of this.terminals.values()) {
                    term.reset();
                }
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
            },
            jenkins_close: function() {
                Object.keys(this.jenkins).forEach(k => this.jenkins[k] = null);
            },
        },
    }
</script>

<style lang="less" scoped>
    .root {
        height: 100%;
    }

    .connections-icon.highlighted > a {
        text-shadow: 0 0 3px #ff0;
    }
    .connections-tooltip i {
        width: 18px;
    }

    .body {
        display: grid;
        // The CSS variables here are attached to this element via a style attribute
        grid-template-columns: repeat(var(--term-cols), var(--term-width));
        grid-template-rows:  repeat(var(--term-rows), var(--term-height));
        grid-column-gap: 10px;
        grid-row-gap: 17px;
        height: calc(100% - 32px);
        padding: 20px;
    }

    .term {
        border: 3px solid #888;

        .title {
            width: 100%;
            height: 28px;
            border: 2px solid #000;
            background-image: linear-gradient(#555555, #888888);
            color: #fff;

            > div {
                padding: 0 4px;
            }

            a.popup-link {
                position: relative;
                top: -1px;
                float: right;
                color: #fff;
                i {
                    margin-left: 10px;
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

    .body.odd .term:first-child {
        grid-row-end: span 2;
    }

    .root > .bd-callout {
        margin-left: 20px;
        margin-right: 20px;
    }

    .hidden {
        display: none !important;
    }

    table.com_ports {
        td:first-child {
            font-weight: bold;
            padding-right: 10px;
        }
    }
</style>

<!-- This is unscoped because the navbar comes from a separate component and the scopes interact oddly -->
<style lang="less">
    .navbar-nav .nav-item.running a.nav-link {
        color: #f00;
    }

    .navbar-nav .jenkins {
        margin-left: 50px;

    }
</style>