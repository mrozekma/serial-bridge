import Vue from 'vue';

Vue.config.productionTip = false;

import App from './app.vue';
import data, { rootDataUpdater } from './root-data';

new Vue({
	data,
	mounted: rootDataUpdater,
	render: h => h(App),
}).$mount('#app');
