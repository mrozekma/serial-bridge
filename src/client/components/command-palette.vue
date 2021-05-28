<template>
	<a-auto-complete v-model="search" auto-focus default-active-first-option default-open option-label-prop="" placeholder="Command" @select="select" @blur="blur">
		<a-input @keydown.esc="blur" />
		<template #dataSource>
			<a-select-option v-for="{ value, text } in filteredCommands" :key="value">
				<span v-if="typeof text === 'string'">{{ text }}</span>
				<template v-else v-for="(word, i) in text">
					<span v-if="typeof word === 'string'">{{ word }}</span>
					<template v-else>
						<i :class="word.icon"/>
						{{ word.text }}
					</template>
					<template v-if="i < text.length - 1">
						<i class="fal fa-angle-double-right separator"></i>
					</template>
				</template>
			</a-select-option>
		</template>
	</a-auto-complete>
</template>

<script lang="ts">
	import Vue from 'vue';

	import Fuse from 'fuse.js';

	interface AugmentedCommand extends Command {
		searchField: string;
	}

	import { rootDataComputeds } from '../root-data';
	import commandPalette, { Command } from '../command-palette';
	export default Vue.extend({
		computed: {
			...rootDataComputeds(),
			filteredCommands(): AugmentedCommand[] {
				return (this.search === '') ? this.commands : this.fuse.search(this.search).map(result => result.item);
			},
		},
		data() {
			const commands: AugmentedCommand[] = commandPalette.getCommands().map(command => ({
				...command,
				searchField: (typeof command.text === 'string') ? command.text : command.text.map(word => (typeof word === 'string') ? word : word.text).join(' '),
			}));
			return {
				commands,
				fuse: new Fuse(commands, {
					keys: [{
						name: 'value',
						weight: .25,
					}, {
						name: 'searchField',
						weight: 1.0,
					}],
					isCaseSensitive: false,
				}),
				search: '',
			};
		},
		methods: {
			select(cmd: string) {
				this.commands.find(command => command.value === cmd)?.handler?.();
				// this.commandsByValue.get(cmd)?.handler?.();
				this.blur();
			},
			blur() {
				this.$emit('close');
			},
		},
	});
</script>

<style lang="less" scoped>
	@width: 400px;
	@height: 32px;
	@navbarHeight: 48px;

	.ant-select {
		position: absolute;
		top: (@navbarHeight - @height) / 2;
		left: calc(50vw - (@width / 2));
		width: @width;
		height: @height;
	}

	i.separator {
		margin: 0 4px;
	}
</style>
