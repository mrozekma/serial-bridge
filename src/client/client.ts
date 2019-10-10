import Vue from 'vue';

Vue.config.productionTip = false;

import App from './app.vue';
import data from './root-data';
new Vue({
	data,
	render: h => h(App),
}).$mount('#app');
