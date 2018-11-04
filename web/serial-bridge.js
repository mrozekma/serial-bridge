import 'babel-polyfill';

import Vue from 'vue';
Vue.config.productionTip = false;

import 'bootstrap';
import BootstrapVue from 'bootstrap-vue';
Vue.use(BootstrapVue);
import 'bootstrap/dist/css/bootstrap.css';
import 'bootstrap-vue/dist/bootstrap-vue.css';

import './style.less';

import '@fortawesome/fontawesome-free';
import '@fortawesome/fontawesome-free/css/all.css';

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
        throw new Error(`Unrecognized view: ${document.currentScript.getAttribute('data-view')}`);
}

var ctor = Vue.extend(viewClass);
new ctor({
    el: '#vue-root',
    propsData: viewData,
});
