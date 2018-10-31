import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.css'

import './style.less';

import '@fortawesome/fontawesome-free'
import '@fortawesome/fontawesome-free/css/all.css'

import Vue from 'vue'
Vue.config.productionTip = false;

var viewName = document.currentScript.getAttribute('data-view');
var viewData = JSON.parse(document.currentScript.getAttribute('data-data'));

import HomeView from './views/home.vue';
import DeviceView from './views/device.vue';
var viewClass;
switch(viewName) {
    case 'home':
        viewClass = HomeView;
        break;
    case 'device':
        viewClass = DeviceView;
        break;
    default:
        console.error(`Unrecognized view: ${document.currentScript.getAttribute('data-view')}`);
        return;
}

var ctor = Vue.extend(viewClass);
new ctor({
    el: '#vue-root',
    propsData: viewData,
});
