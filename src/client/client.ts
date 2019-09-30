import Vue from 'vue';

Vue.config.productionTip = false;

import Router from 'vue-router';
Vue.use(Router);

import Home from './views/home.vue';
const router = new Router({
	mode: 'history',
	routes: [{
		path: '/',
		name: 'home',
		component: Home,
	}],
});

import App from './app.vue';
new Vue({
	router,
	render: h => h(App),
}).$mount('#app');
