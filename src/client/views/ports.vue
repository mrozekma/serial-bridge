<template>
	<div>
		<sb-navbar/>
		<main>
			<h1>Ports</h1>
		</main>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	import SbNavbar from '../components/navbar.vue';
	export default Vue.extend({
		components: { SbNavbar },
	});
</script>
