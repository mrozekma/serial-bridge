import './style.less';

var $ = require('jquery');

import { Terminal } from 'xterm';
import * as attach from 'xterm/lib/addons/attach/attach';
Terminal.applyAddon(attach);
import * as fit from 'xterm/lib/addons/fit/fit';
Terminal.applyAddon(fit);

$(function() {
    var term = new Terminal({
        disableStdin: true,
    });
    term.open($('.term')[0]);
    console.log(term);
    term.fit();

    var socket = new WebSocket('ws://' + window.location.host + '/websocket');
    console.log(socket);
    socket.onopen = function() {
        console.log('ws open');
    }
    socket.onmessage = function(e) {
        console.log(e.data);
    }
    socket.onclose = function() {
        console.log('ws close');
    }
    term.attach(socket);
});
