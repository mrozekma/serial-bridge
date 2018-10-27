// import 'bootstrap/dist/css/bootstrap.css'; // First so style.less can override it
import './style.less';

import '@fortawesome/fontawesome-free'
import '@fortawesome/fontawesome-free/css/all.css'

var $ = require('jquery');
window.$ = $; // Make jQuery available in DevTools

import { Terminal } from 'xterm';
// import * as attach from 'xterm/lib/addons/attach/attach';
// Terminal.applyAddon(attach);
import * as fit from 'xterm/lib/addons/fit/fit';
Terminal.applyAddon(fit);

$(function() {
    var terminals = new Map();

    $('.term[data-name]').each(function() {
        var container = $(this);

        var term = new Terminal({
            disableStdin: true,
            scrollback: 5000,
        });
        terminals.set(container.data('name'), term);
        term.open($('.content', container)[0]);
        term.fit();
    }).css('visibility', 'visible');

    $('.term a.telnet-link').each(function() {
        var anchor = $(this);
        anchor.attr('href', 'telnet://' + window.location.hostname + ':' + anchor.data('port'));
    });

    var process_message = function(msg) {
        switch(msg.type) {
            case 'data':
                terminals.get(msg.node).write(msg.data);
                break;
        }
    };

    var connection_timer = null;
    var socket = null;
    var connect = function() {
        socket = new WebSocket(window.location.href.replace('http://', 'ws://') + '/websocket');
        socket.onopen = function () {
            console.log('Websocket open');
            $('body').addClass('connected');
            if (connection_timer) {
                clearInterval(connection_timer);
                connection_timer = null;
            }
        }
        socket.onmessage = function (e) {
            process_message(JSON.parse(e.data));
        }
        socket.onclose = function () {
            console.log('Websocket closed');
            $('body').removeClass('connected');
            connection_timer = setInterval(connect, 5000);
        }
    };
    connection_timer = setInterval(connect, 5000);
    connect();

    window.onunload = function () {
        if (socket != null) {
            socket.close();
        }
    };
});
