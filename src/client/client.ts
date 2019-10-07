import Vue from 'vue';

Vue.config.productionTip = false;

import Router from 'vue-router';
Vue.use(Router);

import HomeView from './views/home.vue';
import DeviceView from './views/device.vue';
const router = new Router({
	mode: 'history',
	routes: [{
		name: 'home',
		path: '/',
		component: HomeView,
	}, {
		name: 'device',
		path: '/devices/:device',
		component: DeviceView,
	}],
});

import App from './app.vue';
import data from './root-data';
new Vue({
	router,
	data,
	render: h => h(App),
}).$mount('#app');
